import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  asyncCourse, asyncLearner, asyncEnrollment, completionFact, emailCommand,
  certificateCommand, aggregateId, projectionEvents, queueBudget,
  classicConsumerGroup,
} from "../assets/async-lesson-fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const guidePath = resolve(root, "docs/05-GUIDED-ASYNC.md");
const guide = readFileSync(guidePath, "utf8");
const fenced = language => [...guide.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)]
  .filter(match => match[1] === language).map(match => match[2]);
const json = fenced("json").map(JSON.parse);
const branches = [
  "lessons/BROKERS-DELIVERY-AND-RECOVERY.md",
  "lessons/OUTBOX-INBOX-AND-WORKFLOWS.md",
  "lessons/EVENT-MODELS-AND-PROJECTIONS.md",
];

test("the guided route has seven explicit steps, closed answers and library links", () => {
  const ids = ["async-choice", "async-message", "async-publication", "async-delivery",
    "async-consumers", "async-capacity", "async-next"];
  for (const id of ids) {
    assert.equal(guide.split(`<span id="${id}"></span>`).length - 1, 1, id);
    assert.ok(guide.includes(`](#${id})`), id);
  }
  assert.equal((guide.match(/^## Step \d — /gm) ?? []).length, 7);
  const details = [...guide.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.equal(details.length, 7);
  for (const [, body] of details) {
    assert.match(body, /^\s*<summary>[\s\S]+<\/summary>\s*<p>[\s\S]+<\/p>\s*$/);
    assert.doesNotMatch(body, /```/);
  }
  for (const branch of branches) assert.ok(guide.includes(`](${branch})`), branch);
  for (const [, target] of guide.matchAll(/\]\(([^)]+)\)/g)) {
    if (target.startsWith("#") || branches.includes(target)) continue;
    assert.ok(existsSync(resolve(dirname(guidePath), target)), target);
  }
  assert.match(guide, /174 headings/);
  const original = readFileSync(resolve(root, "docs/05-ASYNC-APIS.md"), "utf8");
  assert.equal((original.match(/^#{1,4} /gm) ?? []).length, 174);
  assert.ok(fenced("text").length <= 2);
  assert.doesNotMatch(guide, /<script\b|<details[^>]*\bopen(?:\s|>)/i);
});

test("all JSON examples parse and match the canonical fact, commands and versions", () => {
  assert.deepEqual(asyncCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.equal(asyncLearner, "learner-7");
  assert.equal(asyncEnrollment, "enrollment-42");
  assert.deepEqual(completionFact, {
    id: "completion-42", type: "course.completed",
    data: { courseId: "course-101", learnerId: "learner-7" },
  });
  assert.deepEqual(emailCommand, {
    id: "email-completion-42", type: "SendCompletionEmail", completionId: "completion-42",
    courseId: "course-101", learnerId: "learner-7",
  });
  assert.deepEqual(certificateCommand, {
    id: "certificate-completion-42", type: "IssueCertificate", completionId: "completion-42",
    courseId: "course-101", learnerId: "learner-7",
  });
  assert.deepEqual(json, [completionFact, emailCommand, certificateCommand, projectionEvents]);
  assert.deepEqual(Object.keys(completionFact), ["id", "type", "data"]);
  assert.deepEqual(Object.keys(completionFact.data), ["courseId", "learnerId"]);
  assert.equal(aggregateId, "learner-7/course-101/enrollment-42");
  assert.deepEqual(projectionEvents.map(event => event.version), [1, 2, 3]);
  assert.deepEqual(projectionEvents.map(event => event.type),
    ["course.progress-recorded", "course.progress-recorded", "course.completed"]);
  assert.deepEqual(projectionEvents.slice(0, 2).map(event => event.data.percentComplete), [20, 40]);
  assert.ok(projectionEvents.every(event => event.aggregateId === aggregateId));
  assert.notEqual(emailCommand.id, completionFact.id);
  assert.notEqual(certificateCommand.id, emailCommand.id);
});

test("the completion response excerpt describes a committed completion, not a finished email", () => {
  const [http] = fenced("http");
  assert.match(http, /^POST \/courses\/course-101\/completions\n/);
  assert.match(http, /HTTP\/1\.1 201 Created/);
  const body = JSON.parse(http.trim().split("\n").at(-1));
  assert.deepEqual(body, { id: completionFact.id, status: "completed", emailStatus: "pending" });
  assert.doesNotMatch(http, /Content-Length/i);
  assert.match(guide, /202 Accepted/);
  assert.match(guide, /`queued`, `running`, `failed`, and `completed`/);
});

test("fixed-rate queue budget computes growth and recovery including new arrivals", () => {
  assert.deepEqual(queueBudget, {
    arrivalsPerSecond: 10, processingPerSecond: 4, overloadSeconds: 60,
    recoveryArrivalsPerSecond: 2,
  });
  const backlog = (queueBudget.arrivalsPerSecond - queueBudget.processingPerSecond)
    * queueBudget.overloadSeconds;
  const drainRate = queueBudget.processingPerSecond - queueBudget.recoveryArrivalsPerSecond;
  assert.equal(backlog, 360);
  assert.equal(drainRate, 2);
  assert.equal(backlog / drainRate, 180);
  assert.equal(backlog + (queueBudget.recoveryArrivalsPerSecond
    - queueBudget.processingPerSecond) * 90, 180);
  assert.match(guide, /360 queued/);
  assert.match(guide, /180 seconds to drain/);
});

test("classic group assignment and independent positions remain bounded", () => {
  assert.deepEqual(classicConsumerGroup, { partitions: 2, consumers: 3 });
  const assign = ({ partitions, consumers }) => Array.from(
    { length: consumers }, (_, consumer) =>
      Array.from({ length: partitions }, (_, partition) => partition)
        .filter(partition => partition % consumers === consumer),
  );
  assert.deepEqual(assign(classicConsumerGroup), [[0], [1], []]);
  const partitionLog = [completionFact, { ...completionFact, id: "completion-43" }];
  const groupOffsets = { certificates: 1, analytics: 0 };
  assert.deepEqual(partitionLog.slice(groupOffsets.certificates).map(item => item.id),
    ["completion-43"]);
  assert.deepEqual(partitionLog.slice(groupOffsets.analytics).map(item => item.id),
    ["completion-42", "completion-43"]);
  assert.equal(groupOffsets.certificates, 1, "other group progress does not change this position");
  const retentionStart = 1;
  assert.ok(groupOffsets.analytics < retentionStart, "expired history needs another recovery path");
});

test("pure aggregate projection validates versions without triggering email on replay", () => {
  function project(events) {
    const state = { version: 0, progress: null, completed: false, emailsSent: 0 };
    for (const event of events) {
      if (event.aggregateId !== aggregateId || event.version !== state.version + 1)
        throw new Error("scope or version gap");
      if (event.type === "course.progress-recorded") state.progress = event.data.percentComplete;
      if (event.type === "course.completed") state.completed = true;
      state.version = event.version;
    }
    return state;
  }
  assert.deepEqual(project(projectionEvents.slice(0, 2)),
    { version: 2, progress: 40, completed: false, emailsSent: 0 });
  assert.deepEqual(project(projectionEvents),
    { version: 3, progress: 40, completed: true, emailsSent: 0 });
  assert.deepEqual(project(projectionEvents), project(projectionEvents), "rebuild is pure");
  assert.throws(() => project([projectionEvents[0], projectionEvents[2]]), /version gap/);
  assert.throws(() => project([projectionEvents[0], projectionEvents[0]]), /version gap/);
  assert.throws(() => project([{ ...projectionEvents[0], aggregateId: "other" }]), /scope/);
});

test("a producer-stable ID allows separate local consumer effects to ignore duplicate deliveries", () => {
  const receipts = new Set();
  const effects = [];
  function applyLocal(consumer, event, deliveryTag) {
    const key = `${consumer}:${event.id}`;
    if (receipts.has(key)) return false;
    receipts.add(key);
    effects.push({ consumer, event: event.id, deliveryTag });
    return true;
  }
  assert.equal(applyLocal("certificate", completionFact, "attempt-1"), true);
  assert.equal(applyLocal("certificate", completionFact, "attempt-2"), false);
  assert.equal(applyLocal("analytics", completionFact, "attempt-3"), true);
  assert.equal(effects.length, 2);
  assert.deepEqual(effects.map(effect => effect.event), ["completion-42", "completion-42"]);
  // This in-memory model checks deduplication scope, not database atomicity or email delivery.
});
