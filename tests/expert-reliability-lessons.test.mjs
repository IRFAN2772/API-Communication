import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reliabilityWindow,
  burnWindow,
  latencySamplesMs,
  fanoutBudget,
} from "../assets/expert-lesson-fixtures.mjs";

const content = readFileSync(new URL("../docs/lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md", import.meta.url), "utf8");

function example(name) {
  const blocks = [...content.matchAll(new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``, "g"))];
  assert.equal(blocks.length, 1, name);
  return JSON.parse(blocks[0][1]);
}

test("published SLO and burn fixtures describe distinct calculations", () => {
  const window = example("slo-window");
  assert.deepEqual(window, reliabilityWindow);
  assert.equal(window.target, 999 / 1000);
  const allowedBad = Math.floor(window.eligibleRequests / 1000);
  assert.equal(allowedBad, 1000);
  assert.equal((window.eligibleRequests - window.badRequests) / window.eligibleRequests, 0.998);
  assert.equal(window.badRequests / allowedBad, 2);

  const burn = example("burn-window");
  assert.deepEqual(burn, burnWindow);
  assert.equal(burn.target, 999 / 1000);
  assert.equal(burn.badRequests * 1000 / burn.eligibleRequests, 5);
  assert.equal(burn.minutes, 5);
  assert.match(content, /200%/);
  assert.match(content, /5× burn rate/);
  assert.match(content, /rolling 30-day window ending at the evaluation/);
  assert.match(content, /same eligibility and outcome definitions/);
  assert.doesNotMatch(content, /calendar window|monthly budget/i);
});

test("published samples give mean and nearest-rank percentiles", () => {
  const { groups } = example("latency-samples");
  assert.deepEqual(groups, [
    { count: 94, latencyMs: 50 },
    { count: 4, latencyMs: 200 },
    { count: 2, latencyMs: 1000 },
  ]);
  const samples = groups.flatMap(({ count, latencyMs }) => Array(count).fill(latencyMs)).sort((a, b) => a - b);
  assert.deepEqual(samples, latencySamplesMs);
  assert.equal(samples.length, 100);
  assert.equal(samples.reduce((a, b) => a + b, 0) / samples.length, 75);
  const nearestRank = p => samples[Math.ceil(p * samples.length) - 1];
  assert.equal(nearestRank(0.5), 50);
  assert.equal(nearestRank(0.95), 200);
  assert.equal(nearestRank(0.99), 1000);
});

test("fixed fanout durations have different serial and parallel paths", () => {
  const b = example("fanout-budget");
  assert.deepEqual(b, fanoutBudget);
  const fixed = b.edgeMs + b.identityMs + b.composeMs + b.returnMs;
  assert.equal(fixed + b.courseMs + b.enrollmentMs + b.recommendationsMs, 820);
  assert.equal(fixed + Math.max(b.courseMs, b.enrollmentMs, b.recommendationsMs), 500);
  assert.equal(b.overallMs, 800);
  assert.match(content, /not the sum or maximum of measured p99s/);
  assert.match(content, /not rollback/);
});

test("JSON examples, answers and lesson references are usable", () => {
  for (const [, block] of content.matchAll(/```json\s*([\s\S]*?)```/g)) JSON.parse(block);
  const answers = [...content.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 6);
  for (const [, body] of answers) {
    assert.match(body, /<summary>[\s\S]*<\/summary>/);
    assert.match(body, /<p>[\s\S]*<\/p>/);
    assert.doesNotMatch(body, /```|\*\*/);
  }
  for (const path of [
    "../07-GUIDED-EXPERT-DESIGN.md", "../08-EXPERT-API-DESIGN.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md",
    "../../assets/expert-lesson-fixtures.mjs", "TENANCY-USAGE-AND-GOVERNANCE.md",
  ]) assert.ok(content.includes(`](${path})`), path);
});
