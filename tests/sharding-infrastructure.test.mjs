import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  shardCase, seniorCourse, seniorEnrollment, seniorCompletion,
} from "../assets/senior-lesson-fixtures.mjs";

const lessonURL = new URL("../docs/lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md", import.meta.url);
const content = readFileSync(lessonURL, "utf8");

function example(name) {
  const blocks = [...content.matchAll(new RegExp(
    `<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``, "g",
  ))];
  assert.equal(blocks.length, 1, name);
  return JSON.parse(blocks[0][1]);
}

// This finite, in-memory teaching model is not a distributed migration protocol.
function migrationModel(c) {
  const source = {
    name: c.source, epoch: c.initialEpoch, enabled: true,
    row: { version: c.initialRecordVersion, label: c.initialLabel },
    tail: [], watermark: 0,
  };
  const target = { name: c.target, epoch: null, enabled: false, copying: true, row: null, watermark: 0 };
  let finalWatermark = null;
  let route = { owner: source.name, epoch: source.epoch };

  function write(shard, epoch, expectedVersion, label) {
    if (!shard.enabled || epoch !== shard.epoch) return false;
    if (shard.row.version !== expectedVersion) return false;
    shard.row = { version: expectedVersion + 1, label };
    if (shard === source) {
      source.watermark += 1;
      source.tail.push({ watermark: source.watermark, row: { ...shard.row } });
    }
    return true;
  }
  function copy(row) {
    if (!target.copying || target.enabled) return false;
    if (target.row && row.version < target.row.version) return false;
    if (target.row && row.version === target.row.version) {
      if (row.label !== target.row.label) throw new Error("conflicting version");
      return true;
    }
    target.row = { ...row };
    return true;
  }
  function fenceSource() {
    source.enabled = false;
    finalWatermark = source.watermark;
  }
  function catchUp() {
    if (finalWatermark === null) throw new Error("source not fenced");
    for (const change of source.tail.filter(item => item.watermark > target.watermark)) {
      if (change.watermark !== target.watermark + 1 || !copy(change.row)) {
        throw new Error("tail gap or rejected copy");
      }
      target.watermark = change.watermark;
    }
  }
  function promote() {
    if (finalWatermark === null || source.enabled ||
        target.watermark !== finalWatermark ||
        !target.row || target.row.version !== source.row.version ||
        target.row.label !== source.row.label) return false;
    target.copying = false;
    target.epoch = c.nextEpoch;
    target.enabled = true;
    return true;
  }
  function publish() {
    if (!target.enabled || target.epoch !== c.nextEpoch || source.enabled) {
      throw new Error("target not established");
    }
    route = { owner: target.name, epoch: target.epoch };
  }
  return { source, target, write, copy, fenceSource, catchUp, promote, publish, get route() { return route; } };
}

function cacheKey({ tenantId, courseId, epoch, version }) {
  return JSON.stringify(["metadata", tenantId, courseId, epoch, version]);
}

test("published migration case and course baseline match the shared fixtures", () => {
  assert.deepEqual(example("shard-migration-case"), shardCase);
  assert.deepEqual(seniorCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.deepEqual(seniorEnrollment, { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  assert.equal(seniorCompletion.id, "completion-42");
  assert.equal(seniorCompletion.type, "course.completed");
  assert.deepEqual(seniorCompletion.data, { courseId: "course-101", learnerId: "learner-7" });
  assert.equal(shardCase.nextRecordVersion, shardCase.initialRecordVersion + 1);
  assert.equal(shardCase.nextEpoch, shardCase.initialEpoch + 1);
  assert.equal(shardCase.initialLabel, "daily");
  assert.equal(shardCase.changedLabel, "weekly");
});

test("concurrent update blocks early promotion; fencing precedes tail and epoch-8 route", () => {
  const c = example("shard-migration-case");
  const m = migrationModel(c);
  assert.deepEqual(m.route, { owner: "shard-a", epoch: 7 });
  assert.equal(m.copy({ ...m.source.row }), true);
  assert.equal(m.write(m.target, 8, 1, "wrong"), false);
  assert.equal(m.write(m.source, 7, 1, "weekly"), true);
  assert.deepEqual(m.source.row, { version: 2, label: "weekly" });
  assert.deepEqual(m.target.row, { version: 1, label: "daily" });
  assert.equal(m.promote(), false);
  assert.throws(() => m.catchUp(), /source not fenced/);
  assert.throws(() => m.publish(), /target not established/);
  m.fenceSource();
  assert.equal(m.write(m.source, 7, 2, "stale"), false);
  assert.equal(m.promote(), false);
  m.catchUp();
  assert.deepEqual(m.target.row, { version: 2, label: "weekly" });
  assert.equal(m.promote(), true);
  assert.deepEqual(m.route, { owner: "shard-a", epoch: 7 });
  m.publish();
  assert.deepEqual(m.route, { owner: "shard-b", epoch: 8 });
  assert.equal(m.write(m.target, 7, 2, "old epoch"), false);
  assert.equal(m.write(m.target, 8, 1, "old version"), false);
  assert.equal(m.write(m.target, 8, 2, "monthly"), true);
  assert.deepEqual(m.target.row, { version: 3, label: "monthly" });
  assert.equal(m.write(m.source, 7, 2, "old owner"), false);
});

test("old backfill cannot overwrite newer copy before or after promotion", () => {
  const c = shardCase;
  const m = migrationModel(c);
  assert.equal(m.copy({ version: 1, label: "daily" }), true);
  assert.equal(m.write(m.source, 7, 1, "weekly"), true);
  m.fenceSource();
  m.catchUp();
  assert.equal(m.copy({ version: 1, label: "daily" }), false);
  assert.deepEqual(m.target.row, { version: 2, label: "weekly" });
  assert.equal(m.copy({ version: 2, label: "weekly" }), true);
  assert.throws(() => m.copy({ version: 2, label: "daily" }), /conflicting version/);
  assert.equal(m.promote(), true);
  assert.equal(m.copy({ version: 1, label: "daily" }), false);
  assert.deepEqual(m.target.row, { version: 2, label: "weekly" });
});

test("a missing tail entry blocks activation instead of guessing current state", () => {
  const m = migrationModel(shardCase);
  m.copy({ ...m.source.row });
  assert.equal(m.write(m.source, 7, 1, "weekly"), true);
  m.fenceSource();
  m.source.tail.length = 0;
  m.catchUp();
  assert.equal(m.promote(), false);
  assert.throws(() => m.publish(), /target not established/);
});

test("cache key scopes tenant, resource, ownership and record version without delimiter collisions", () => {
  const base = { tenantId: shardCase.tenantId, courseId: shardCase.courseId, epoch: 8, version: 2 };
  const key = cacheKey(base);
  for (const changed of [
    { tenantId: "org-b" }, { courseId: "course-102" }, { epoch: 7 }, { version: 1 },
  ]) assert.notEqual(cacheKey({ ...base, ...changed }), key);
  assert.notEqual(
    cacheKey({ ...base, tenantId: "org-a:course", courseId: "101" }),
    cacheKey({ ...base, tenantId: "org-a", courseId: "course:101" }),
  );
  assert.notEqual(cacheKey({ ...base, version: 1 }), key);
  assert.match(content, /stale pointer can still select version 1/);
  assert.match(content, /does not make an external cache and\s+database dual write atomic/);
});

test("lesson has valid JSON, native closed answers, and requested references", () => {
  for (const [, block] of content.matchAll(/```json\s*([\s\S]*?)```/g)) JSON.parse(block);
  const answers = [...content.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 8);
  assert.equal((content.match(/<details\b/g) || []).length, answers.length);
  for (const [, body] of answers) {
    assert.match(body, /<summary>[\s\S]*?<\/summary>/);
    assert.match(body, /<p>[\s\S]*?<\/p>/);
    assert.doesNotMatch(body, /```|\*\*/);
  }
  const required = [
    "../GUIDED-SENIOR-DESIGN.md", "../07-SENIOR-DESIGN-GUIDE.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md",
    "../../assets/senior-lesson-fixtures.mjs", "GATEWAYS-BFFS-AND-LOAD-BALANCING.md",
    "BROKERS-DELIVERY-AND-RECOVERY.md", "TENANCY-USAGE-AND-GOVERNANCE.md",
    "CONSENSUS-AND-COORDINATION.md", "REST-COLLECTIONS-AND-CACHING.md",
    "GRAPHQL-COST-CACHING-AND-EVOLUTION.md", "GRPC-LIFECYCLE-AND-OPERATIONS.md",
    "REALTIME-RECOVERY-AND-FLOW.md", "EVENT-MODELS-AND-PROJECTIONS.md",
  ];
  for (const path of required) {
    assert.ok(content.includes(`](${path})`), path);
    // The companion guide belongs to separate work and may not exist yet.
    if (path !== "../GUIDED-SENIOR-DESIGN.md") assert.ok(existsSync(new URL(path, lessonURL)), path);
  }
  assert.match(content, /not a new HTTP field/);
  assert.match(content, /not a deployed cache, database/);
});

test("correction candidates quote the cited original lines exactly", () => {
  const lines = readFileSync(new URL("../docs/07-SENIOR-DESIGN-GUIDE.md", import.meta.url), "utf8").split("\n");
  for (const [line, quote] of [
    [1593, "Shard by:"],
    [1641, "Wrong partition key can destroy ordering guarantees."],
    [1739, "WebSocket is not usually cached."],
    [1771, "Easy:"],
    [1898, "Otherwise events may arrive out of order."],
    [2636, "Not ideal for:"],
    [2638, "long-term replayable event log"],
  ]) {
    assert.ok(lines[line - 1].includes(quote), `source line ${line}`);
    assert.ok(content.includes(`“${quote}”`), `lesson quote ${line}`);
  }
});
