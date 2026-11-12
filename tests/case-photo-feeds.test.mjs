import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { photoCase } from "../assets/case-study-fixtures.mjs";

const lessonURL = new URL("../docs/lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA.md", import.meta.url);
const lesson = readFileSync(lessonURL, "utf8");

function fixture() {
  const marker = "<!-- example: photo-case -->";
  assert.equal(lesson.split(marker).length, 2);
  const match = lesson.split(marker)[1].match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE posts(id TEXT PRIMARY KEY, author TEXT NOT NULL, generation INTEGER NOT NULL,
      state TEXT NOT NULL, visibility TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sources(post TEXT NOT NULL, generation INTEGER NOT NULL, object_key TEXT NOT NULL,
      size INTEGER NOT NULL, checksum TEXT NOT NULL, valid INTEGER NOT NULL,
      PRIMARY KEY(post, generation));
    CREATE TABLE required(name TEXT PRIMARY KEY);
    CREATE TABLE variants(post TEXT NOT NULL, generation INTEGER NOT NULL, name TEXT NOT NULL,
      confirmed INTEGER NOT NULL, PRIMARY KEY(post, generation, name));
    CREATE TABLE inbox(consumer TEXT NOT NULL, event TEXT NOT NULL, post TEXT NOT NULL,
      generation INTEGER NOT NULL, PRIMARY KEY(consumer, event, post, generation));
    CREATE TABLE outbox(post TEXT NOT NULL, generation INTEGER NOT NULL,
      PRIMARY KEY(post, generation));
    CREATE TABLE follows(reader TEXT NOT NULL, author TEXT NOT NULL, PRIMARY KEY(reader, author));
    CREATE TABLE blocks(blocker TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY(blocker, blocked));
    CREATE TABLE candidates(reader TEXT NOT NULL, post TEXT NOT NULL, PRIMARY KEY(reader, post));
    CREATE TABLE likes(reader TEXT NOT NULL, post TEXT NOT NULL, PRIMARY KEY(reader, post));
  `);
  db.prepare("INSERT INTO posts VALUES (?, ?, ?, 'DRAFT', 'private', 0)")
    .run(photoCase.photoId, photoCase.authorId, photoCase.sourceVersion);
  for (const name of photoCase.requiredVariants) db.prepare("INSERT INTO required VALUES (?)").run(name);
  return db;
}

// Registry entries represent observed test vectors, not real storage or media decoding.
function validateSource(db, observed, expected) {
  const p = db.prepare("SELECT * FROM posts WHERE id = ?").get(photoCase.photoId);
  const valid = observed.exists && observed.key === photoCase.sourceObject &&
    observed.generation === p.generation && observed.size > 0 && observed.size <= expected.maxSize &&
    observed.checksum === expected.checksum && observed.mediaValid === true;
  if (!valid) {
    db.prepare("UPDATE posts SET state = 'FAILED' WHERE id = ?").run(p.id);
    return false;
  }
  db.prepare("INSERT INTO sources VALUES (?, ?, ?, ?, ?, 1)")
    .run(p.id, p.generation, observed.key, observed.size, observed.checksum);
  db.prepare("UPDATE posts SET state = 'PROCESSING' WHERE id = ?").run(p.id);
  return true;
}

function confirmVariant(db, generation, name, exists) {
  if (!exists) return false;
  const p = db.prepare("SELECT * FROM posts WHERE id = ?").get(photoCase.photoId);
  if (p.generation !== generation || p.state !== "PROCESSING") return false;
  if (!db.prepare("SELECT name FROM required WHERE name = ?").get(name)) return false;
  db.prepare("INSERT OR IGNORE INTO variants VALUES (?, ?, ?, 1)").run(p.id, generation, name);
  return true;
}

function processCallback(db, event, generation, name, exists, crash = false) {
  db.exec("BEGIN");
  try {
    const receipt = db.prepare("INSERT OR IGNORE INTO inbox VALUES (?, ?, ?, ?)")
      .run("processor", event, photoCase.photoId, generation);
    if (receipt.changes && !confirmVariant(db, generation, name, exists)) {
      db.exec("ROLLBACK");
      return false;
    }
    if (crash) throw new Error("simulated crash");
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    if (crash) return false;
    throw error;
  }
}

function finalize(db, generation, failBeforeCommit = false) {
  db.exec("BEGIN");
  try {
    const updated = db.prepare(`UPDATE posts SET state = 'PUBLISHED'
      WHERE id = ? AND generation = ? AND state = 'PROCESSING'
      AND EXISTS (SELECT 1 FROM sources s WHERE s.post = posts.id
        AND s.generation = posts.generation AND s.valid = 1)
      AND NOT EXISTS (SELECT 1 FROM required r WHERE NOT EXISTS
        (SELECT 1 FROM variants v WHERE v.post = posts.id AND v.generation = posts.generation
         AND v.name = r.name AND v.confirmed = 1))`).run(photoCase.photoId, generation);
    if (!updated.changes) { db.exec("ROLLBACK"); return false; }
    db.prepare("INSERT INTO outbox VALUES (?, ?)").run(photoCase.photoId, generation);
    if (failBeforeCommit) throw new Error("simulated crash");
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    if (failBeforeCommit) return false;
    throw error;
  }
}

function allowed(db, reader, available = true) {
  if (!available) return false;
  return Boolean(db.prepare(`SELECT 1 FROM candidates c JOIN posts p ON p.id = c.post
    WHERE c.reader = ? AND p.state = 'PUBLISHED' AND p.deleted = 0
      AND (p.author = c.reader OR p.visibility = 'public'
        OR EXISTS (SELECT 1 FROM follows f WHERE f.reader = c.reader AND f.author = p.author))
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
        (b.blocker = p.author AND b.blocked = c.reader)
        OR (b.blocker = c.reader AND b.blocked = p.author))`).get(reader));
}

const observed = { exists: true, key: photoCase.sourceObject, generation: 1, size: 100,
  checksum: "sha256-test-vector", mediaValid: true };
const expected = { maxSize: 200, checksum: "sha256-test-vector" };

test("fixture, JSON, navigation and native answers are valid", () => {
  assert.deepEqual(fixture(), photoCase);
  for (const match of lesson.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) JSON.parse(match[1]);
  for (const match of lesson.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
    assert.ok(existsSync(new URL(match[1], lessonURL)), `missing ${match[1]}`);
  }
  const answers = [...lesson.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 5);
  for (const [, body] of answers) assert.match(body, /^\s*<summary>[\s\S]*<\/summary>\s*<p>[\s\S]*<\/p>\s*$/);
  assert.match(lesson, /not.*real JPEG decoder or object store/i);
});

test("source validation and all confirmed required variants gate atomic publication", () => {
  const db = database();
  assert.equal(validateSource(db, { ...observed, checksum: "wrong" }, expected), false);
  assert.equal(db.prepare("SELECT state FROM posts").get().state, "FAILED");
  assert.equal(finalize(db, 1), false);
  db.prepare("UPDATE posts SET state = 'DRAFT'").run();
  assert.equal(validateSource(db, observed, expected), true);
  assert.equal(confirmVariant(db, 1, "thumbnail", true), true);
  assert.equal(confirmVariant(db, 1, "display", false), false);
  assert.equal(finalize(db, 1), false);
  assert.equal(confirmVariant(db, 1, "display", true), true);
  assert.equal(finalize(db, 1, true), false);
  assert.equal(db.prepare("SELECT state FROM posts").get().state, "PROCESSING");
  assert.equal(db.prepare("SELECT count(*) AS n FROM outbox").get().n, 0);
  assert.equal(finalize(db, 1), true);
  assert.equal(finalize(db, 1), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM outbox").get().n, 1);
  db.close();
});

test("registry rejects missing, wrong-key, wrong-generation, oversized and invalid media vectors", () => {
  for (const change of [{ exists: false }, { key: "unexpected" }, { generation: 2 },
    { size: 201 }, { size: 0 }, { mediaValid: false }]) {
    const db = database();
    assert.equal(validateSource(db, { ...observed, ...change }, expected), false);
    assert.equal(db.prepare("SELECT state FROM posts").get().state, "FAILED");
    assert.equal(db.prepare("SELECT count(*) AS n FROM sources").get().n, 0);
    db.close();
  }
});

test("receipt deduplication is scoped to generation; stale output cannot finalize a replacement", () => {
  const db = database();
  assert.equal(validateSource(db, observed, expected), true);
  assert.equal(processCallback(db, "event-1", 1, "thumbnail", true, true), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM inbox").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM variants").get().n, 0);
  assert.equal(processCallback(db, "event-1", 1, "thumbnail", true), true);
  assert.equal(processCallback(db, "event-1", 1, "thumbnail", true), true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM inbox").get().n, 1);
  db.prepare("UPDATE posts SET generation = 2, state = 'PROCESSING'").run();
  assert.equal(processCallback(db, "event-2", 1, "display", true), false);
  assert.equal(processCallback(db, "event-1", 2, "display", true), true);
  assert.equal(finalize(db, 1), false);
  assert.equal(finalize(db, 2), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM inbox").get().n, 2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM variants WHERE generation = 2").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM variants WHERE generation = 1 AND name = 'display'").get().n, 0);
  db.close();
});

test("stale candidates cannot bypass current follow, block, delete or authority checks", () => {
  const db = database();
  db.prepare("UPDATE posts SET state = 'PUBLISHED'").run();
  db.prepare("INSERT INTO candidates VALUES (?, ?)").run("reader-1", photoCase.photoId);
  db.prepare("INSERT INTO follows VALUES (?, ?)").run("reader-1", photoCase.authorId);
  assert.equal(allowed(db, "reader-1"), true);
  assert.equal(allowed(db, "reader-1", false), false);
  db.prepare("DELETE FROM follows").run();
  assert.equal(allowed(db, "reader-1"), false);
  db.prepare("INSERT INTO follows VALUES (?, ?)").run("reader-1", photoCase.authorId);
  db.prepare("INSERT INTO blocks VALUES (?, ?)").run(photoCase.authorId, "reader-1");
  assert.equal(allowed(db, "reader-1"), false);
  db.prepare("DELETE FROM blocks").run();
  db.prepare("UPDATE posts SET deleted = 1").run();
  assert.equal(allowed(db, "reader-1"), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM candidates").get().n, 1);
  db.close();
});

test("authorized PUT-like retries retain one relationship per user and post", () => {
  const db = database();
  db.prepare("UPDATE posts SET state = 'PUBLISHED'").run();
  db.prepare("INSERT INTO candidates VALUES (?, ?)").run("reader-1", photoCase.photoId);
  db.prepare("INSERT INTO follows VALUES (?, ?)").run("reader-1", photoCase.authorId);
  const put = () => allowed(db, "reader-1") &&
    Boolean(db.prepare("INSERT OR IGNORE INTO likes VALUES (?, ?)").run("reader-1", photoCase.photoId));
  assert.equal(put(), true);
  assert.equal(put(), true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM likes").get().n, 1);
  db.prepare("DELETE FROM follows").run();
  assert.equal(put(), false);
  db.close();
});
