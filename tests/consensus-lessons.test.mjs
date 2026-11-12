import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { partitionCase, expertCourse, expertEnrollment } from "../assets/expert-lesson-fixtures.mjs";

const content = readFileSync(new URL("../docs/lessons/CONSENSUS-AND-COORDINATION.md", import.meta.url), "utf8");

function subsets(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  return [
    ...subsets(items.slice(1), size - 1).map(rest => [items[0], ...rest]),
    ...subsets(items.slice(1), size),
  ];
}

test("the published quorum case is the illustrative fixed-membership scenario", () => {
  const match = /<!-- example: quorum-case -->\s*```json\s*([\s\S]*?)```/.exec(content);
  assert.ok(match);
  const example = JSON.parse(match[1]);
  assert.deepEqual(example, { replicas: ["A", "B", "C"], reachable: ["A", "B"], term: 12, requiredVotes: 2 });
  assert.deepEqual(example.replicas, partitionCase.replicas);
  assert.equal(example.term, partitionCase.term);
  assert.equal(example.requiredVotes, Math.floor(example.replicas.length / 2) + 1);
  assert.ok(example.reachable.length >= example.requiredVotes);
  assert.equal(expertCourse.seats, 29);
  assert.equal(expertEnrollment.id, "enrollment-42");
  assert.equal(expertEnrollment.learnerId, "learner-7");
  assert.match(content, /independent hypothetical snapshot/i);
  assert.match(content, /illustrative model/i);
});

test("every fixed 3-node or 5-node majority intersects, while a minority cannot form one", () => {
  for (const count of [3, 5]) {
    const nodes = Array.from({ length: count }, (_, index) => index);
    const majority = Math.floor(count / 2) + 1;
    const quorums = subsets(nodes, majority);
    assert.equal(majority, count === 3 ? 2 : 3);
    for (const left of quorums) {
      for (const right of quorums) assert.ok(left.some(node => right.includes(node)));
    }
    assert.ok(count - majority < majority);
  }
  assert.match(content, /Intersection provides a path for evidence/);
  assert.match(content, /does not,[\s\n]+alone/);
});

test("an illustrative atomic resource rejects an old fence after a newer fence", () => {
  // This single synchronous operation models atomic check + mutation; it is not a distributed protocol.
  let resource = { highest: 0, value: "initial" };
  function atomicApply(token, value) {
    if (token < resource.highest) return false;
    resource = { highest: token, value };
    return true;
  }
  assert.equal(atomicApply(11, "old before fence"), true);
  assert.equal(atomicApply(12, "new owner"), true);
  assert.equal(atomicApply(11, "stale overwrite"), false);
  assert.deepEqual(resource, { highest: 12, value: "new owner" });
  assert.match(content, /atomically compares the token/);
  assert.match(content, /before the resource has seen the newer token/);
  assert.match(content, /not a production protocol implementation/);
});

test("elections, commit, retries, Paxos and external effects are explicitly bounded", () => {
  for (const phrase of [
    "at most one vote per term", "log freshness", "current term", "not that the",
    "deduplication", "non-Byzantine", "fsync", "prepare", "promises", "accept",
    "Multi-Paxos", "Zab", "observers", "clock drift", "idempotency",
    "membership changes", "minority",
  ]) assert.ok(content.toLowerCase().includes(phrase.toLowerCase()), phrase);
});

test("JSON examples parse, practice answers use native HTML, and core navigation is present", () => {
  const blocks = [...content.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  assert.ok(blocks.length);
  for (const [, json] of blocks) assert.doesNotThrow(() => JSON.parse(json));
  const answers = [...content.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 6);
  for (const [, body] of answers) {
    assert.match(body, /<summary>[\s\S]*<\/summary>/);
    assert.match(body, /<p>[\s\S]*<\/p>/);
    assert.doesNotMatch(body, /```|\*\*|^\s*[-#] /m);
  }
  for (const link of [
    "../07-GUIDED-EXPERT-DESIGN.md", "../08-EXPERT-API-DESIGN.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md",
    "REGIONS-AND-CONSISTENCY.md", "DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md",
  ]) assert.ok(content.includes(`](${link})`), link);
});
