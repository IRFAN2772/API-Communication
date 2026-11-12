import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expertCourse, expertEnrollment, partitionCase } from "../assets/expert-lesson-fixtures.mjs";

const content = readFileSync(new URL("../docs/lessons/REGIONS-AND-CONSISTENCY.md", import.meta.url), "utf8");

function example(name) {
  const match = new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``).exec(content);
  assert.ok(match, `missing example ${name}`);
  return JSON.parse(match[1]);
}

function subsets(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  return [
    ...subsets(items.slice(1), size - 1).map(rest => [items[0], ...rest]),
    ...subsets(items.slice(1), size),
  ];
}

test("the independent partition example exactly matches its fixture, not the current course", () => {
  assert.deepEqual(example("partition-snapshot"), partitionCase);
  assert.deepEqual(expertCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.deepEqual(expertEnrollment, { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  assert.match(content, /independent hypothetical snapshot/i);
  assert.match(content, /not a new enrollment for `learner-7`/i);
});

test("fixed 2-of-3 read and write quorums intersect; 1-of-3 reads can miss a write", () => {
  const replicas = partitionCase.replicas;
  const pairs = subsets(replicas, 2);
  assert.equal(pairs.length, 3);
  for (const read of pairs) {
    for (const write of pairs) {
      assert.ok(read.some(replica => write.includes(replica)));
    }
  }
  assert.ok(subsets(replicas, 1).some(read => pairs.some(write => !read.some(node => write.includes(node)))));
  assert.match(content, /Intersection alone does \*\*not\*\* establish linearizability/);
});

test("the lesson states the traffic, recovery, consistency and failure boundaries", () => {
  for (const phrase of [
    "recursive resolver", "TTL", "does not promote a data replica", "Recovery time objective",
    "Recovery point objective", "unknown", "linearizability", "non-failed node",
    "non-error response", "Read-your-writes", "Monotonic reads", "Concurrent writes",
    "Membership changes", "configuration", "independent hypothetical snapshot",
  ]) {
    assert.ok(content.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
  assert.match(content, /Mumbai's API becomes unhealthy or possibly isolated/);
  assert.match(content, /Virginia's asynchronous database replica is behind/);
  assert.match(content, /Routing clients to\s+Virginia does not make its copy current or transfer write authority/);
  assert.match(content, /documented no-seat business outcome[\s\S]*HTTP 409[\s\S]*HTTP 503 because the node cannot coordinate/);
  assert.match(content, /A\/B majority:[\s\S]*C minority:/);
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
    "CONSENSUS-AND-COORDINATION.md", "DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md",
  ]) assert.ok(content.includes(`](${link})`), link);
});
