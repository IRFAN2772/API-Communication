import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  expertCourse, expertEnrollment, partitionCase, reliabilityWindow, burnWindow,
} from "../assets/expert-lesson-fixtures.mjs";
import { expertReadingDestinations } from "../assets/expert-reading-map.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const guide = read("docs/07-GUIDED-EXPERT-DESIGN.md");
const source = read("docs/08-EXPERT-API-DESIGN.md").split("\n");
const names = ["baseline", "evolution", "observe", "distance", "atomicity", "coordination", "tenancy", "next"];

function section(name) {
  const start = guide.indexOf(`<span id="expert-${name}"></span>`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = guide.indexOf('<span id="expert-', start + 1);
  return guide.slice(start, end < 0 ? undefined : end);
}

test("the guide presents eight ordered, theory-first decisions", () => {
  const lines = guide.split("\n").length;
  assert.ok(lines >= 500 && lines <= 651, `length ${lines}`);
  const positions = names.map(name => guide.indexOf(`<span id="expert-${name}"></span>`));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.equal(new Set(positions).size, names.length);
  for (const name of names) {
    const text = section(name);
    for (const phrase of ["**Problem.**", "**Simple baseline.**", "**Changed requirement.**", "**Limitation.**", "**Alternatives and tradeoffs.**"]) {
      assert.ok(text.includes(phrase), `${name}: missing ${phrase}`);
    }
    assert.match(text, /<details class="learning-answer">/);
  }
  assert.ok(positions[2] < positions[3]);
});

test("answers use closed native details and HTML, not markdown", () => {
  const details = [...guide.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.ok(details.length >= names.length);
  assert.equal((guide.match(/<details\b/g) ?? []).length, details.length);
  for (const [, attributes, body] of details) {
    assert.equal(attributes.trim(), 'class="learning-answer"');
    assert.match(body, /^\s*<summary>[\s\S]+?<\/summary>\s*<p>[\s\S]+<\/p>\s*$/);
    assert.doesNotMatch(body, /`|\*\*|\[[^\]]+\]\([^)]+\)/);
  }
  assert.doesNotMatch(guide, /<script\b|<iframe\b/i);
});

test("the common state and independent hypothetical match the fixtures", () => {
  assert.deepEqual(expertCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.deepEqual(expertEnrollment, { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  const json = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  assert.deepEqual(json[0], expertCourse);
  assert.match(section("distance"), /independent last-seat partition thought experiment/i);
  assert.equal(partitionCase.initialSeats, 1);
  assert.deepEqual(partitionCase.learners, ["learner-8", "learner-9"]);
  assert.match(section("distance"), /not.*current 29-seat state/i);
  assert.match(section("distance"), /PARTITION\*\* isolates C\s+from the mutually reachable A and B/);
  assert.match(section("distance"), /A independently accepts learner 8 and isolated C accepts learner 9/);
  assert.match(section("distance"), /if A and B\s+form a valid majority[\s\S]*isolated C must refuse or wait/);
  assert.match(section("coordination"), /A and B may commit an allocation while isolated C cannot/);
  assert.match(section("coordination"), /C must not accept a write just because it still\s+believes it is leader/);
  assert.match(section("coordination"), /majority protocol C alone lacks a\s+quorum/);
  assert.match(section("baseline"), /does not create an enrollment/i);
  const atomicity = section("atomicity");
  assert.match(atomicity, /our seat reservation\s+`reservation-8`/i);
  assert.match(atomicity, /29 → 28/);
  assert.match(atomicity, /verified grant finalizes[\s\S]*without a second decrement/i);
  assert.match(atomicity, /definitive rejection releases the hold once[\s\S]*28 → 29/i);
  assert.match(atomicity, /timeout is an unknown outcome[\s\S]*keep the hold/i);
});

test("reliability math and bounded claims follow the fixtures", () => {
  const { eligibleRequests, badRequests, target } = reliabilityWindow;
  assert.equal((eligibleRequests - badRequests) / eligibleRequests, 0.998);
  assert.ok(badRequests > eligibleRequests * (1 - target));
  assert.ok(Math.abs((burnWindow.badRequests / burnWindow.eligibleRequests) / (1 - burnWindow.target) - 5) < 1e-10);
  assert.match(section("atomicity"), /does not guarantee exactly-once external effects/i);
  assert.match(section("coordination"), /majority\s+must communicate for progress/i);
  assert.match(section("coordination"), /does not automatically make all\s+transactions serializable/i);
  assert.match(section("tenancy"), /original free course is not being charged/i);
});

test("source navigation and branch links preserve the actual roadmap", () => {
  const quick = ["Consensus & Coordination", "API Observability & Distributed Tracing", "Chaos Engineering & Resilience Testing", "Platform Thinking & API Governance"];
  const headings = ["CAP Theorem & Consistency Models", "Consensus, Raft, Paxos & Leader Election", "API Monetisation & Multi-Tenant Architecture", "How Staff Engineers Think During System Design"];
  quick.forEach((value, index) => assert.ok(source[16 + index].includes(value)));
  [4497, 5020, 5721, 6350].forEach((line, index) => assert.ok(source[line - 1].includes(headings[index])));
  assert.match(guide, /quick reference lines 17–20/);
  assert.match(guide, /tracing and resilience experiments/i);
  for (const { path } of expertReadingDestinations.filter(item => item.id !== "baseline")) {
    assert.ok(guide.includes(`(${path.replace(/^docs\//, "")})`), path);
  }
  for (const path of ["08-EXPERT-API-DESIGN.md", "../README.md", "CONTENT-CORRECTIONS.md", "../assets/expert-lesson-fixtures.mjs", "07-SENIOR-DESIGN-GUIDE.md", "09-SYSTEM-DESIGN-CASE-STUDIES.md"]) {
    assert.ok(guide.includes(`(${path})`), path);
  }
});
