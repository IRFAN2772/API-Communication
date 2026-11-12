import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { seniorReadingDestinations, mapSeniorHeadings } from "../assets/senior-reading-map.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every senior source heading retains its exact source line and complete reading destination", () => {
  const source = read("docs/07-SENIOR-DESIGN-GUIDE.md");
  const mapped = mapSeniorHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "07-SENIOR-DESIGN-GUIDE.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const heading of mapped) {
    assert.equal(heading.source, "docs/07-SENIOR-DESIGN-GUIDE.md");
    assert.ok(existsSync(new URL(heading.recommended, root)));
    if (heading.anchor) assert.ok(read(heading.recommended).includes(`id="${heading.anchor}"`));
  }
});

test("original protocol, contract and infrastructure families stay distinct and substantive", () => {
  const headings = mapSeniorHeadings(read("docs/07-SENIOR-DESIGN-GUIDE.md"));
  const family = prefix => headings.find(heading => heading.text.startsWith(prefix))?.family;
  assert.equal(family("4. Estimation"), "estimates");
  assert.equal(family("5. Beginner"), "rest");
  assert.equal(family("6. Intermediate"), "graphql");
  assert.equal(family("7. Advanced"), "rpc");
  assert.equal(family("12. SOAP"), "soap");
  assert.equal(family("15.2 GraphQL"), "graphql");
  assert.equal(family("15.3 gRPC"), "rpc");
  assert.equal(family("16. Sharding"), "partitions");
  assert.equal(family("21.5 Webhook"), "webhooks");
  assert.equal(family("25. The Outbox"), "outbox");
  assert.equal(family("28. Redis"), "partitions");
});

test("three new full branches and the complete original are linked from the companion and library", () => {
  const core = read("docs/GUIDED-SENIOR-DESIGN.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(core.includes("](07-SENIOR-DESIGN-GUIDE.md)"));
  for (const branch of [
    "REQUIREMENTS-AND-ESTIMATION.md", "SOAP-XML-AND-ENTERPRISE-CONTRACTS.md",
    "SHARDING-CACHING-AND-INFRASTRUCTURE.md",
  ]) {
    assert.ok(core.includes(`](lessons/${branch})`));
    assert.ok(library.includes(`](lessons/${branch})`));
    assert.ok(read(`docs/lessons/${branch}`).includes("](../GUIDED-SENIOR-DESIGN.md)"));
    assert.ok(read(`docs/lessons/${branch}`).includes("](../07-SENIOR-DESIGN-GUIDE.md)"));
  }
});

test("SOAP is a complete one-operation contract, not a missing or renamed REST reference", () => {
  for (const path of ["docs/contracts/course_api.xsd", "docs/contracts/course_api.wsdl"]) {
    assert.ok(existsSync(new URL(path, root)));
  }
  const soap = read("docs/lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md");
  assert.ok(soap.includes("](../contracts/course_api.xsd)"));
  assert.ok(soap.includes("](../contracts/course_api.wsdl)"));
  const destinations = new Set(seniorReadingDestinations.map(destination => destination.path));
  assert.ok(destinations.has("docs/lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md"));
  assert.ok(destinations.has("docs/01-GUIDED-REST.md"));
});
