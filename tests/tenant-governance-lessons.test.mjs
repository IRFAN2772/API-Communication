import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { tenantCase } from "../assets/expert-lesson-fixtures.mjs";

const content = readFileSync(new URL("../docs/lessons/TENANCY-USAGE-AND-GOVERNANCE.md", import.meta.url), "utf8");

function example(name) {
  const blocks = [...content.matchAll(new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``, "g"))];
  assert.equal(blocks.length, 1, name);
  return JSON.parse(blocks[0][1]);
}

// These are local teaching models, not authentication or billing integrations.
function canRead({ principal, selectedTenant, memberships, record, grants = [] }) {
  return memberships.includes(selectedTenant)
    && selectedTenant === record.tenantId
    && (principal === record.learnerId || grants.some(g =>
      g.principal === principal && g.tenantId === selectedTenant && g.action === "read" && g.id === record.id));
}

function recordUsage(ledger, event) {
  const key = JSON.stringify([event.tenantId, event.id]);
  const existing = ledger.get(key);
  if (existing !== undefined) {
    if (!isDeepStrictEqual(existing, event)) throw new Error("conflicting replay");
    return false;
  }
  ledger.set(key, structuredClone(event));
  return true;
}

test("published tenant record matches the fixture and enforces modeled scope and ownership", () => {
  const record = example("tenant-record");
  assert.deepEqual(record, tenantCase.enrollment);
  const owner = { principal: tenantCase.verifiedLearner, selectedTenant: tenantCase.verifiedTenant, memberships: [tenantCase.verifiedTenant], record };
  assert.equal(canRead(owner), true);
  assert.equal(canRead({ ...owner, selectedTenant: tenantCase.foreignTenant }), false);
  assert.equal(canRead({ ...owner, memberships: [] }), false);
  assert.equal(canRead({ ...owner, principal: "learner-8" }), false);
  assert.equal(canRead({ ...owner, principal: "instructor-1", grants: [
    { principal: "instructor-1", tenantId: "org-a", action: "read", id: record.id },
  ] }), true);
  assert.equal(canRead({ ...owner, principal: "instructor-1", grants: [
    { principal: "instructor-1", tenantId: "org-b", action: "read", id: record.id },
  ] }), false);
});

test("published usage is deduplicated by tenant and logical event with bound operation semantics", () => {
  const event = example("usage-event");
  assert.deepEqual(event, tenantCase.usageEvent);
  const ledger = new Map();
  assert.equal(recordUsage(ledger, event), true);
  assert.equal(recordUsage(ledger, { ...event }), false);
  assert.equal([...ledger.values()].reduce((a, b) => a + b.units, 0), 3);
  assert.throws(() => recordUsage(ledger, { ...event, units: 4 }), /conflicting replay/);
  assert.throws(() => recordUsage(ledger, { ...event, source: "different" }), /conflicting replay/);
  assert.equal(recordUsage(ledger, { ...event, tenantId: tenantCase.foreignTenant }), true);
  assert.throws(() => recordUsage(ledger, { ...event, operation: "catalogue.export" }), /conflicting replay/);
  assert.equal(ledger.size, 2);
  assert.ok(content.includes("(tenant_id, event_id)"));
});

test("JSON examples, native answers and reference links remain valid", () => {
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
    "../../assets/expert-lesson-fixtures.mjs", "RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md",
  ]) assert.ok(content.includes(`](${path})`), path);
  assert.match(content, /course stays entirely free/);
  assert.match(content, /finite deduplication retention period/);
  assert.match(content, /not proof of security/);
});
