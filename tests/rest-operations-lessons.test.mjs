import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const paths = [
  "docs/lessons/REST-AUTH-AND-EVOLUTION.md",
  "docs/lessons/REST-RELIABILITY-AND-OPERATIONS.md",
];
const read = path => readFileSync(new URL(path, root), "utf8");
const [auth, operations] = paths.map(read);
const jsonExamples = text => [...text.matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map(match => JSON.parse(match[1]));

test("course compatibility examples preserve exact fields and expose the old enum failure", () => {
  const [before, additive, newEnum] = jsonExamples(auth);
  assert.deepEqual(before, {
    id: "course-101", title: "API Fundamentals", seats: 30, status: "open",
  });
  assert.deepEqual(additive, { ...before, description: "An introduction" });
  assert.deepEqual(newEnum, { ...before, status: "waitlist" });

  const oldClient = course => {
    if (!["open", "closed"].includes(course.status)) throw new Error("unknown status");
    return `${course.title}: ${course.seats}`;
  };
  assert.equal(oldClient(before), "API Fundamentals: 30");
  assert.equal(oldClient(additive), "API Fundamentals: 30");
  assert.throws(() => oldClient(newEnum), /unknown status/);
});

test("role policy separates own enrollment from an administrator edit", () => {
  for (const row of [
    "| Authenticated learner-7 | Create own enrollment in course-101, if eligible and a seat remains | Allow |",
    "| Authenticated learner-7 | Create an enrollment for another learner | Deny |",
    "| Authenticated learner-7 | Edit course-101 title or seats | Deny |",
    "| Authorized course administrator | Edit course-101 title or seats | Allow, subject to validation |",
    "| Authenticated user without the administrator grant | Edit course-101 | Deny |",
  ]) assert.ok(auth.includes(row), row);
  assert.match(auth, /derives `learner-7` from verified authentication/);
  assert.match(auth, /subject to validation/);
  assert.match(auth, /required scope and current object\/action authorization/);
});

test("lost enrollment response replays the exact fixture and preserves the seat invariant", () => {
  const [result] = jsonExamples(operations);
  assert.deepEqual(result, {
    id: "enrollment-42", courseId: "course-101", learnerId: "learner-7",
  });
  for (const doc of [auth, operations]) {
    assert.match(doc, /POST \/courses\/course-101\/enrollments HTTP\/1\.1/);
    assert.match(doc, /Idempotency-Key: enroll-7-a/);
    assert.match(doc, /Content-Length: 0/);
  }
  // This small model checks the lesson's stated contract, not production code.
  const state = { seats: { "course-101": 30, "course-102": 20 }, records: new Map() };
  const enroll = (learner, course, key) => {
    const scopedKey = JSON.stringify([learner, "enrollment", key]);
    const fingerprint = JSON.stringify([learner, course]);
    const previous = state.records.get(scopedKey);
    if (previous) return previous.fingerprint === fingerprint ? previous.result : 409;
    state.seats[course]--;
    state.records.set(scopedKey, { fingerprint, result });
    return result;
  };
  assert.deepEqual(enroll("learner-7", "course-101", "enroll-7-a"), result);
  assert.deepEqual(enroll("learner-7", "course-101", "enroll-7-a"), result);
  assert.equal(enroll("learner-7", "course-102", "enroll-7-a"), 409);
  assert.deepEqual(state.seats, { "course-101": 29, "course-102": 20 });
  assert.match(operations, /enrollment operation family, not to an individual course/);
  assert.match(operations, /POST \/courses\/course-102\/enrollments[\s\S]*returns `409`/);
  assert.match(operations, /unique\s+claim[\s\S]*seat availability check[\s\S]*completed result/);
  assert.match(operations, /matching concurrent request[\s\S]*in-progress response/);
  assert.match(operations, /retention[\s\S]*retry horizon/i);
});

test("the documented deadline, retry, and capacity examples calculate correctly", () => {
  const canRetry = (endedAt, delay) => 1000 - endedAt - delay >= 200;
  assert.equal(canRetry(400, 100), true);
  assert.equal(canRetry(850, 100), false);
  assert.equal(100 * 3 * 1.2, 360);
  assert.ok(360 > 300);
  for (const statement of [
    "first attempt times out\nat 400 ms",
    "delay of 100 ms leaves 500 ms",
    "first attempt ends at 850 ms",
    "leaves only 50 ms",
    "360 attempts/second",
    "300 attempts/second",
  ]) assert.ok(operations.includes(statement), statement);
  assert.match(operations, /403 immediately/);
  assert.match(operations, /A permission denial is not normally transient/);
});

test("all predictions use closed native HTML with safe answer content", () => {
  for (const path of paths) {
    const doc = read(path);
    const blocks = [...doc.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
    assert.ok(blocks.length >= 8, path);
    assert.equal((doc.match(/<details\b/g) ?? []).length, blocks.length, path);
    assert.equal((doc.match(/<\/details>/g) ?? []).length, blocks.length, path);
    for (const [, body] of blocks) {
      assert.match(body, /^\s*<summary>Predict:[^<]+<\/summary>\s*<p>[^<]+<\/p>\s*$/);
      assert.doesNotMatch(body, /`|\[[^\]]+\]\(|\*\*|<script\b/i);
    }
  }
});

test("all local lesson links resolve and each page points to the required branches", () => {
  for (const path of paths) {
    const doc = read(path);
    for (const link of [
      "REST-HTTP-CONTRACTS.md", "REST-COLLECTIONS-AND-CACHING.md",
      "../01-GUIDED-REST.md", "../01-REST-APIS.md",
      "../00-GUIDED-FUNDAMENTALS.md", "../COURSE-CONTENT-MAP.md",
      "../CONTENT-CORRECTIONS.md",
    ]) assert.ok(doc.includes(`](${link})`), `${path}: ${link}`);
    for (const [, target] of doc.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(target)) continue;
      const file = target.split("#")[0];
      assert.ok(existsSync(new URL(file, new URL(path, root))), `${path}: ${target}`);
    }
  }
});
