import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fanoutCase } from "../assets/case-study-fixtures.mjs";

const lessonURL = new URL("../docs/lessons/CASE-TWITTER-TIMELINES.md", import.meta.url);
const lesson = readFileSync(lessonURL, "utf8");

function fixture() {
  const marker = "<!-- example: fanout-case -->";
  assert.equal(lesson.split(marker).length, 2);
  const match = lesson.split(marker)[1].match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE posts(id TEXT PRIMARY KEY, author TEXT NOT NULL, body TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0, private INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE requests(author TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL,
      fingerprint TEXT NOT NULL, post TEXT NOT NULL, PRIMARY KEY(author, operation, key));
    CREATE TABLE outbox(event TEXT PRIMARY KEY, post TEXT NOT NULL UNIQUE);
    CREATE TABLE inbox(consumer TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(consumer, event));
    CREATE TABLE jobs(post TEXT NOT NULL, recipient TEXT NOT NULL, PRIMARY KEY(post, recipient));
    CREATE TABLE entries(post TEXT NOT NULL, recipient TEXT NOT NULL, PRIMARY KEY(post, recipient));
    CREATE TABLE follows(reader TEXT NOT NULL, author TEXT NOT NULL, PRIMARY KEY(reader, author));
    CREATE TABLE blocks(blocker TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY(blocker, blocked));
  `);
  return db;
}

function createPost(db, author, key, post, body, crash = false) {
  const fingerprint = JSON.stringify([post, body]);
  db.exec("BEGIN");
  try {
    const old = db.prepare("SELECT * FROM requests WHERE author = ? AND operation = 'post' AND key = ?")
      .get(author, key);
    if (old) {
      db.exec("COMMIT");
      return old.fingerprint === fingerprint ? "accepted" : "conflict";
    }
    if (db.prepare("SELECT 1 FROM posts WHERE id = ?").get(post)) {
      db.exec("ROLLBACK");
      return "conflict";
    }
    db.prepare("INSERT INTO posts(id, author, body) VALUES (?, ?, ?)").run(post, author, body);
    db.prepare("INSERT INTO requests VALUES (?, 'post', ?, ?, ?)").run(author, key, fingerprint, post);
    db.prepare("INSERT INTO outbox VALUES (?, ?)").run(`created:${post}`, post);
    if (crash) throw new Error("simulated crash");
    db.exec("COMMIT");
    return "accepted";
  } catch (error) {
    db.exec("ROLLBACK");
    if (crash) return "failed";
    throw error;
  }
}

function receive(db, event, post, recipients, crash = false) {
  db.exec("BEGIN");
  try {
    const receipt = db.prepare("INSERT OR IGNORE INTO inbox VALUES ('fanout', ?)").run(event);
    if (receipt.changes) {
      const insert = db.prepare("INSERT OR IGNORE INTO jobs VALUES (?, ?)");
      for (const recipient of recipients) insert.run(post, recipient);
    }
    if (crash) throw new Error("simulated crash");
    db.exec("COMMIT");
    return Boolean(receipt.changes);
  } catch (error) {
    db.exec("ROLLBACK");
    if (crash) return false;
    throw error;
  }
}

function allowed(db, recipient, post, authorityAvailable = true) {
  if (!authorityAvailable) return false;
  return Boolean(db.prepare(`SELECT 1 FROM entries e JOIN posts p ON p.id = e.post
    WHERE e.recipient = ? AND e.post = ? AND p.deleted = 0
      AND (p.author = e.recipient OR p.private = 0 OR EXISTS
        (SELECT 1 FROM follows f WHERE f.reader = e.recipient AND f.author = p.author))
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
        (b.blocker = p.author AND b.blocked = e.recipient)
        OR (b.blocker = e.recipient AND b.blocked = p.author))`).get(recipient, post));
}

test("exact shared fixture, JSON, navigation and native answers", () => {
  assert.deepEqual(fixture(), fanoutCase);
  for (const match of lesson.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) JSON.parse(match[1]);
  for (const match of lesson.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
    assert.ok(existsSync(new URL(match[1], lessonURL)), `missing ${match[1]}`);
  }
  const answers = [...lesson.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 5);
  for (const [, body] of answers) assert.match(body, /^\s*<summary>[\s\S]*<\/summary>\s*<p>[\s\S]*<\/p>\s*$/);
});

test("logical fanout arithmetic is not a capacity measurement", () => {
  assert.equal(fanoutCase.ordinaryFollowers * fanoutCase.postsPerSecond, 60);
  assert.equal(fanoutCase.broadcasterFollowers * fanoutCase.postsPerSecond, 20_000_000);
  assert.match(lesson, /not[\s\S]*?measured capacity benchmark/i);
  assert.match(lesson, /not a claim\s+about actual tweet rates/i);
});

test("post, scoped idempotency record and outbox commit together", () => {
  const db = database();
  const { authorId, requestKey, postId } = fanoutCase;
  assert.equal(createPost(db, authorId, requestKey, postId, "hello", true), "failed");
  for (const table of ["posts", "requests", "outbox"]) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  }
  assert.equal(createPost(db, authorId, requestKey, postId, "hello"), "accepted");
  assert.equal(createPost(db, authorId, requestKey, postId, "hello"), "accepted");
  assert.equal(createPost(db, authorId, requestKey, postId, "changed"), "conflict");
  assert.equal(createPost(db, "author-2", requestKey, "post-102", "hello"), "accepted");
  assert.equal(db.prepare("SELECT count(*) AS n FROM posts").get().n, 2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM outbox").get().n, 2);
  db.close();
});

test("duplicate events and work retain one job and entry per post and recipient", () => {
  const db = database();
  const { authorId, requestKey, postId, recipients } = fanoutCase;
  createPost(db, authorId, requestKey, postId, "hello");
  assert.equal(receive(db, "event-1", postId, recipients, true), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM inbox").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM jobs").get().n, 0);
  assert.equal(receive(db, "event-1", postId, recipients), true);
  assert.equal(receive(db, "event-1", postId, recipients), false);
  assert.equal(receive(db, "event-2", postId, recipients), true);
  const write = db.prepare("INSERT OR IGNORE INTO entries VALUES (?, ?)");
  for (const reader of recipients) {
    write.run(postId, reader);
    write.run(postId, reader);
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM jobs").get().n, 3);
  assert.equal(db.prepare("SELECT count(*) AS n FROM entries").get().n, 3);
  db.close();
});

test("stale entries are filtered by current policy and fail closed", () => {
  const db = database();
  const { authorId, requestKey, postId, recipients } = fanoutCase;
  createPost(db, authorId, requestKey, postId, "hello");
  db.prepare("INSERT INTO entries VALUES (?, ?)").run(postId, recipients[0]);
  db.prepare("INSERT INTO follows VALUES (?, ?)").run(recipients[0], authorId);
  assert.equal(allowed(db, recipients[0], postId), true);
  assert.equal(allowed(db, recipients[0], postId, false), false);
  db.prepare("DELETE FROM follows").run();
  assert.equal(allowed(db, recipients[0], postId), false);
  db.prepare("INSERT INTO follows VALUES (?, ?)").run(recipients[0], authorId);
  db.prepare("INSERT INTO blocks VALUES (?, ?)").run(authorId, recipients[0]);
  assert.equal(allowed(db, recipients[0], postId), false);
  db.prepare("DELETE FROM blocks").run();
  db.prepare("UPDATE posts SET deleted = 1").run();
  assert.equal(allowed(db, recipients[0], postId), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM entries").get().n, 1);
  db.close();
});

test("hybrid merge uses stable IDs and publication keys, not completion order", () => {
  const pushed = [{ id: "b", time: 10 }, { id: "c", time: 9 }];
  const pulled = [{ id: "a", time: 10 }, { id: "b", time: 10 }, { id: "d", time: 11 }];
  const snapshot = 10;
  const byId = new Map([...pushed, ...pulled].filter(p => p.time <= snapshot).map(p => [p.id, p]));
  const merged = [...byId.values()].sort((a, b) => b.time - a.time || b.id.localeCompare(a.id));
  assert.deepEqual(merged.map(p => p.id), ["b", "a", "c"]);
  const last = merged[0];
  const next = merged.filter(p => p.time < last.time || (p.time === last.time && p.id < last.id));
  assert.deepEqual(next.map(p => p.id), ["a", "c"]);
});
