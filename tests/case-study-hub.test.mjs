import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hub = read("docs/GUIDED-CASE-STUDIES.md");

test("case practice is a transfer method, not a mandatory stack or mastery certificate", () => {
  const text = hub.toLowerCase().replace(/\s+/g, " ");
  for (const phrase of ["not another numbered", "not verified descriptions", "not a technology", "not a distributed safety proof", "No page count"]) {
    assert.ok(text.includes(phrase.toLowerCase()), phrase);
  }
  assert.ok(hub.includes('id="case-method"'));
  assert.ok(hub.includes("GUIDED-SENIOR-DESIGN.md"));
});
test("capstone questions distinguish state, network attempts, authority and irreversible effects", () => {
  for (const phrase of ["physical trip", "server's acceptance", "candidate", "Uploaded hours", "control path", "authoritative", "changed", "unknown"]) {
    assert.ok(hub.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
  assert.ok(hub.includes("43,200,000"));
  assert.ok(hub.includes("2,880,000"));
});
test("capstone predictions and other-system branches have accessible closed HTML answers", () => {
  for (const path of ["docs/GUIDED-CASE-STUDIES.md", "docs/lessons/CASE-STUDY-TRANSFERS.md"]) {
    const content = read(path);
    const answers = [...content.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
    assert.ok(answers.length >= 7);
    for (const [, body] of answers) {
      assert.ok(body.includes("<summary>") && body.includes("<p>"));
      assert.ok(!body.includes("```") && !body.includes("**"));
    }
    assert.ok(!content.includes("<iframe") && !content.includes("<script"));
  }
});
