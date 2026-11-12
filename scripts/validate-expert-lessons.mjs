import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer, get } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  expertCourse, proposedCourseRepresentation, partitionCase, reliabilityWindow, burnWindow,
  latencySamplesMs, fanoutBudget, tenantCase,
} from "../assets/expert-lesson-fixtures.mjs";

const require = process.argv[2]
  ? createRequire(pathToFileURL(resolve(process.argv[2], "package.json")))
  : createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function example(page, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<!-- example: ${escaped} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``).exec(read(page));
  assert.ok(match, `${page}: missing published example ${name}`);
  return JSON.parse(match[1]);
}

const contractsPage = "docs/lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md";
const current = example(contractsPage, "current-course-response");
const proposed = example(contractsPage, "proposed-course-response");
const interaction = example(contractsPage, "consumer-interaction");
assert.deepEqual(current, expertCourse);
assert.deepEqual(proposed, proposedCourseRepresentation);
assert.equal(interaction.request.method, "GET");
assert.equal(interaction.request.path, "/courses/course-101");
assert.equal(interaction.response.status, 200);
assert.deepEqual(interaction.response.body, current);
const contract = JSON.parse(read("docs/contracts/course_api.openapi.json"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const oldSchema = contract.components.schemas.Course;
const newSchema = structuredClone(oldSchema);
newSchema.properties.summary = { type: "string", minLength: 1 };
const oldClient = ajv.compile(oldSchema);
const newClient = ajv.compile(newSchema);
assert.ok(oldClient(current));
assert.ok(!oldClient(proposed), "The old closed output schema must reject the additive field");
assert.ok(newClient(proposed));
assert.ok(newClient(current), "Optional proposal still accepts old output");

const providerBodies = [current, proposed, { id: current.id, seats: current.seats }, { ...current, seats: 30 }];
let bodyIndex = 0;
const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== interaction.request.path) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "No teaching fixture for this operation" }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(providerBodies[bodyIndex]));
});
server.requestTimeout = 1000;
await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
try {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}${interaction.request.path}`;
  const requestCourse = () => new Promise((resolveResponse, rejectResponse) => {
    const request = get(url, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", rejectResponse);
      response.on("end", () => {
        try {
          assert.equal(response.statusCode, 200);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          assert.equal(body.id, current.id);
          assert.equal(body.title, current.title);
          assert.equal(body.seats, current.seats);
          resolveResponse({ id: body.id, title: body.title, seats: body.seats });
        } catch (error) {
          rejectResponse(error);
        }
      });
    });
    request.setTimeout(1000, () => request.destroy(new Error("Local teaching provider timed out")));
    request.on("error", rejectResponse);
  });
  assert.deepEqual(await requestCourse(), current);
  bodyIndex = 1;
  assert.deepEqual(await requestCourse(), current);
  bodyIndex = 2;
  await assert.rejects(requestCourse, { name: "AssertionError" });
  bodyIndex = 3;
  assert.ok(oldClient(providerBodies[bodyIndex]), "Structural schema acceptance need not satisfy the consumer's exact fixture expectation");
  await assert.rejects(requestCourse, { name: "AssertionError" });
} finally {
  await new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
}

const operationsPage = "docs/lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md";
assert.deepEqual(example(operationsPage, "slo-window"), reliabilityWindow);
assert.deepEqual(example(operationsPage, "burn-window"), burnWindow);
const groups = example(operationsPage, "latency-samples").groups;
const samples = groups.flatMap(group => Array(group.count).fill(group.latencyMs));
assert.deepEqual(samples, latencySamplesMs);
assert.equal(samples.length, 100);
const sorted = [...samples].sort((a, b) => a - b);
const rank = quantile => sorted[Math.ceil(quantile * sorted.length) - 1];
assert.equal(samples.reduce((sum, value) => sum + value, 0) / samples.length, 75);
assert.equal(rank(0.5), 50);
assert.equal(rank(0.95), 200);
assert.equal(rank(0.99), 1000);
assert.equal(reliabilityWindow.target, 999 / 1000);
const allowedBad = Math.floor(reliabilityWindow.eligibleRequests / 1000);
assert.equal(allowedBad, 1000);
assert.equal(reliabilityWindow.badRequests / allowedBad, 2);
assert.equal(100 * (1 - reliabilityWindow.badRequests / reliabilityWindow.eligibleRequests), 99.8);
assert.equal(burnWindow.badRequests * 1000 / burnWindow.eligibleRequests, 5);
const budget = example(operationsPage, "fanout-budget");
assert.deepEqual(budget, fanoutBudget);
const overhead = budget.edgeMs + budget.identityMs + budget.composeMs + budget.returnMs;
assert.equal(overhead + budget.courseMs + budget.enrollmentMs + budget.recommendationsMs, 820);
assert.equal(overhead + Math.max(budget.courseMs, budget.enrollmentMs, budget.recommendationsMs), 500);
assert.ok(500 <= budget.overallMs && 820 > budget.overallMs);

assert.deepEqual(example("docs/lessons/REGIONS-AND-CONSISTENCY.md", "partition-snapshot"), partitionCase);
const quorum = example("docs/lessons/CONSENSUS-AND-COORDINATION.md", "quorum-case");
assert.deepEqual(quorum.replicas, partitionCase.replicas);
assert.equal(quorum.term, partitionCase.term);
assert.equal(quorum.requiredVotes, Math.floor(quorum.replicas.length / 2) + 1);
assert.equal(new Set(quorum.reachable).size, 2);

const tenancyPage = "docs/lessons/TENANCY-USAGE-AND-GOVERNANCE.md";
assert.deepEqual(example(tenancyPage, "tenant-record"), tenantCase.enrollment);
const usage = example(tenancyPage, "usage-event");
assert.deepEqual(usage, tenantCase.usageEvent);
const db = new DatabaseSync(":memory:");
try {
  db.exec(`
    CREATE TABLE tenant_enrollments (tenant_id TEXT NOT NULL, id TEXT NOT NULL, learner_id TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
    CREATE TABLE usage (tenant_id TEXT NOT NULL, event_id TEXT NOT NULL, operation TEXT NOT NULL, units INTEGER NOT NULL CHECK (units > 0), PRIMARY KEY (tenant_id, event_id));
  `);
  db.prepare("INSERT INTO tenant_enrollments VALUES (?, ?, ?)").run(
    tenantCase.enrollment.tenantId, tenantCase.enrollment.id, tenantCase.enrollment.learnerId);
  db.prepare("INSERT INTO tenant_enrollments VALUES (?, ?, ?)").run(
    tenantCase.foreignTenant, tenantCase.enrollment.id, tenantCase.verifiedLearner);
  assert.ok(db.prepare("SELECT id FROM tenant_enrollments WHERE tenant_id = ?").get(tenantCase.foreignTenant));
  function authorizedRead(untrustedTenant) {
    if (untrustedTenant !== tenantCase.verifiedTenant) throw new Error("Tenant selection not authorized in the verified context");
    return db.prepare("SELECT * FROM tenant_enrollments WHERE tenant_id = ? AND id = ? AND learner_id = ?")
      .get(tenantCase.verifiedTenant, tenantCase.enrollment.id, tenantCase.verifiedLearner);
  }
  assert.ok(authorizedRead(tenantCase.verifiedTenant));
  assert.throws(() => authorizedRead(tenantCase.foreignTenant), /not authorized/);
  function recordUsage(event, failBeforeCommit = false) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = db.prepare("SELECT operation, units FROM usage WHERE tenant_id = ? AND event_id = ?").get(event.tenantId, event.id);
      if (previous) {
        if (previous.operation !== event.operation || previous.units !== event.units) throw new Error("Conflicting usage identity");
      } else {
        db.prepare("INSERT INTO usage VALUES (?, ?, ?, ?)").run(event.tenantId, event.id, event.operation, event.units);
      }
      if (failBeforeCommit) throw new Error("Injected usage commit failure");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  assert.throws(() => recordUsage(usage, true), /Injected/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM usage").get().n, 0);
  recordUsage(usage);
  recordUsage({ ...usage });
  assert.equal(db.prepare("SELECT sum(units) AS n FROM usage WHERE tenant_id = ?").get(tenantCase.verifiedTenant).n, 3);
  assert.throws(() => recordUsage({ ...usage, units: 4 }), /Conflicting/);
  assert.throws(() => recordUsage({ ...usage, operation: "catalogue.export" }), /Conflicting/);
  assert.equal(db.prepare("SELECT sum(units) AS n FROM usage").get().n, 3);
  recordUsage({ ...usage, tenantId: tenantCase.foreignTenant, units: 2 });
  assert.equal(db.prepare("SELECT sum(units) AS n FROM usage WHERE tenant_id = ?").get(tenantCase.verifiedTenant).n, 3);
  assert.equal(db.prepare("SELECT sum(units) AS n FROM usage WHERE tenant_id = ?").get(tenantCase.foreignTenant).n, 2);
} finally {
  db.close();
}

console.log("Passed published old/new JSON Schema compatibility and four actual local HTTP consumer/provider fixture cases.");
console.log("Passed exact latency ranks/budgets, error/burn budgets, shared partition/quorum examples and actual SQLite tenant/usage rollback and deduplication.");
console.log("This is not Pact framework/provider verification, a production auth implementation, consensus proof, or a live distributed deployment.");
