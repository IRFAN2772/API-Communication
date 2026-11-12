import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  seniorCourse, seniorEnrollment, seniorCompletion, seniorEmailCommand, seniorCertificateCommand,
} from "../assets/senior-lesson-fixtures.mjs";
import { seniorReadingDestinations } from "../assets/senior-reading-map.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const guide = read("docs/GUIDED-SENIOR-DESIGN.md");
const names = ["requirements", "baseline", "estimates", "contracts", "freshness", "work", "partitions", "review"];

function section(name) {
  const start = guide.indexOf(`<span id="senior-${name}"></span>`);
  assert.notEqual(start, -1, name);
  const end = guide.indexOf('<span id="senior-', start + 1);
  return guide.slice(start, end < 0 ? undefined : end);
}

test("the companion follows eight requirement-led decisions, not a phase or ladder", () => {
  assert.ok(guide.split("\n").length >= 500 && guide.split("\n").length <= 651);
  const anchors = [...guide.matchAll(/<span id="senior-([^"]+)"><\/span>/g)].map(match => match[1]);
  assert.deepEqual(anchors, names);
  assert.match(guide, /not Phase 8/i);
  for (const name of names) {
    const text = section(name);
    for (const label of ["Problem", "Simple baseline", "Worked example", "Changed requirement", "Failure", "Options and costs", "Prediction"]) {
      assert.ok(text.includes(`**${label}.**`), `${name}: ${label}`);
    }
    assert.match(text, /<details class="learning-answer">/);
  }
});

test("disclosures are native, initially closed and contain only supported HTML", () => {
  const details = [...guide.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.ok(details.length >= names.length);
  assert.equal((guide.match(/<details\b/g) ?? []).length, details.length);
  for (const [, attributes, body] of details) {
    assert.equal(attributes.trim(), 'class="learning-answer"');
    assert.match(body, /^\s*<summary>[^<]+<\/summary>\s*(?:<p>[\s\S]*?<\/p>\s*)+$/);
    assert.doesNotMatch(body, /`|\*\*|\[[^\]]+\]\([^)]+\)/);
    for (const tag of body.matchAll(/<\/?([a-z][\w-]*)(?:\s[^>]*)?>/gi)) {
      assert.ok(["summary", "p", "strong", "code"].includes(tag[1]), tag[0]);
    }
  }
  assert.doesNotMatch(guide, /<script\b|<iframe\b/i);
});

test("fixture state and existing seven-operation boundary stay explicit", () => {
  assert.deepEqual(seniorCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.deepEqual(seniorEnrollment, { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  assert.deepEqual(seniorCompletion, {
    id: "completion-42", type: "course.completed",
    data: { courseId: "course-101", learnerId: "learner-7" },
  });
  const json = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  assert.deepEqual(json[0], seniorCourse);
  const openapi = JSON.parse(read("docs/contracts/course_api.openapi.json"));
  const operations = Object.values(openapi.paths).flatMap(path => Object.keys(path).filter(key => /^(get|post|put|patch|delete)$/i.test(key)));
  assert.equal(operations.length, 7);
  assert.match(guide, /Private enrollment reads,[\s\S]*progress reads and dashboard operations[\s\S]*outside that seven-operation contract/i);
  assert.match(guide, /40% is not completion/i);
  assert.match(section("baseline"), /does not.*(?:change|grant)|neither grants enrollment nor changes the seats/i);
  assert.match(section("work"), /outbox record atomically/i);
  assert.match(section("work"), /commands[\s\S]*not[\s\S]*completion fact/i);
  assert.match(section("work"), /cannot\s+guarantee exactly-once external effects/i);
  assert.equal(seniorEmailCommand.type, "SendCompletionEmail");
  assert.equal(seniorCertificateCommand.type, "IssueCertificate");
  assert.ok(section("work").includes(seniorEmailCommand.id));
  assert.ok(section("work").includes(seniorCertificateCommand.id));
  assert.match(section("work"), /rather than completing learner-7 again/);
});

test("choices are evidence-led with recovery and a minimal reviewed design", () => {
  assert.match(section("contracts"), /REST aggregate and GraphQL/i);
  assert.match(section("baseline"), /gRPC is an optional alternative/i);
  assert.match(section("contracts"), /LMS is the caller; our SOAP adapter provides/i);
  for (const option of ["polling", "SSE", "WebSocket", "replay", "snapshot"]) {
    assert.ok(section("freshness").toLowerCase().includes(option.toLowerCase()), option);
  }
  assert.match(section("partitions"), /fence the source and catch up/i);
  for (const category of ["Requirements", "Invariants", "Validation evidence", "Residual risk"]) {
    assert.ok(section("review").includes(category), category);
  }
  assert.match(section("review"), /REST backend ------ transactional database/);
});

test("all local guide destinations exist, including complete related branches", () => {
  const base = new URL("../docs/GUIDED-SENIOR-DESIGN.md", import.meta.url);
  for (const [, target] of guide.matchAll(/\]\(([^)]+)\)/g)) {
    const [path, fragment] = target.split("#");
    const url = path ? new URL(path, base) : base;
    assert.ok(existsSync(url), target);
    if (fragment && url.href === base.href) assert.ok(guide.includes(`id="${fragment}"`), target);
  }
  for (const { id, path } of seniorReadingDestinations) {
    if (id === "journey") continue;
    assert.ok(guide.includes(`](${path.replace(/^docs\//, "")})`), path);
  }
  for (const path of [
    "00-GUIDED-FUNDAMENTALS.md", "06-GUIDED-ARCHITECTURE.md", "07-GUIDED-EXPERT-DESIGN.md",
    "07-SENIOR-DESIGN-GUIDE.md", "09-SYSTEM-DESIGN-CASE-STUDIES.md",
    "COURSE-CONTENT-MAP.md", "CONTENT-CORRECTIONS.md",
    "../assets/senior-lesson-fixtures.mjs", "../assets/senior-reading-map.mjs",
  ]) assert.ok(guide.includes(`](${path})`), path);
});
