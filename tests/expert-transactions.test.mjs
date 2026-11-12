import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runExpertTransactionProbe } from "../scripts/validate-expert-transactions.mjs";
import { reservationCase } from "../assets/expert-lesson-fixtures.mjs";

const content = readFileSync(new URL("../docs/lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md", import.meta.url), "utf8");

test("actual local transactions retain standing enrollment and rollback/replay/release exactly one new seat", () => {
  assert.deepEqual(runExpertTransactionProbe(), {
    initialSeats: 29, confirmedSeats: 28, releasedSeats: 29, dispatches: 2, localEnrollments: 2, receipts: 1,
  });
});

test("published reservation identities match the tested independent new learner intent", () => {
  const block = /<!-- example: reservation-intent -->\s*```json\s*([\s\S]*?)```/.exec(content);
  assert.ok(block);
  assert.deepEqual(JSON.parse(block[1]), reservationCase);
  assert.ok(content.includes("learner-7"));
  assert.ok(content.includes("enrollment-42"));
  assert.ok(content.includes("29 → 28"));
  assert.ok(content.includes("28 → 29"));
});

test("local atomicity, workflow compensation and replicated agreement are distinct teaching boundaries", () => {
  for (const phrase of [
    "outside the SQLite transaction", "not a definitive", "global ACID", "in-doubt",
    "Prepared resources", "An inbox committed separately", "not a command",
  ]) {
    assert.ok(content.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
  assert.ok(content.includes("CONSENSUS-AND-COORDINATION.md"));
  assert.ok(content.includes("OUTBOX-INBOX-AND-WORKFLOWS.md"));
});

test("transaction practice answers are native HTML and references remain reachable", () => {
  const answers = [...content.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 6);
  for (const [, body] of answers) {
    assert.ok(body.includes("<summary>"));
    assert.ok(body.includes("<p>"));
    assert.ok(!body.includes("```"));
    assert.ok(!body.includes("**"));
  }
  for (const path of ["../07-GUIDED-EXPERT-DESIGN.md", "../08-EXPERT-API-DESIGN.md", "../CONTENT-CORRECTIONS.md", "../COURSE-CONTENT-MAP.md"]) {
    assert.ok(content.includes(`](${path})`));
  }
});
