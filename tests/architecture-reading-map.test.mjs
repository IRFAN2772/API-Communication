import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { architectureReadingDestinations, mapArchitectureHeadings } from "../assets/architecture-reading-map.mjs";
import { architectureCourse, enrollmentResponse, catalogueResponse } from "../assets/architecture-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every original architecture heading retains its exact source and reading destination", () => {
  const source = read("docs/06-API-ARCHITECTURE.md");
  const mapped = mapArchitectureHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "06-API-ARCHITECTURE.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/06-API-ARCHITECTURE.md");
    assert.ok(existsSync(new URL(item.recommended, root)));
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`));
  }
});

test("edge, service network, contract and capacity topics remain distinct explanations", () => {
  const mapped = mapArchitectureHeadings(read("docs/06-API-ARCHITECTURE.md"));
  const familyFor = title => mapped.find(item => item.text === title)?.family;
  assert.equal(familyFor("Phase 6.1 — API Gateway Deep Dive (Zero → Hero)"), "edge");
  assert.equal(familyFor("Phase 6.2 — Backend For Frontend (BFF) — Zero → Hero"), "edge");
  assert.equal(familyFor("Phase 6.3 — Load Balancers (Zero → Hero)"), "edge");
  assert.equal(familyFor("Phase 6.4 — Service Mesh (Zero → Hero)"), "mesh");
  assert.equal(familyFor("Phase 6.5 — OpenAPI & Swagger (Zero → Hero)"), "contract");
  assert.equal(familyFor("Phase 6.6 — Backpressure & Flow Control (Zero → Hero)"), "capacity");
  assert.equal(familyFor("Phase 6 Completion ✅"), "next");
});

test("all related architecture lessons and the raw contract remain discoverable", () => {
  const core = read("docs/06-GUIDED-ARCHITECTURE.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(core.includes("](06-API-ARCHITECTURE.md)"));
  assert.ok(core.includes("](contracts/course_api.openapi.json)"));
  for (const destination of architectureReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = destination.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`));
    assert.ok(library.includes(`](${relative})`));
    assert.ok(read(destination.path).includes("](../06-GUIDED-ARCHITECTURE.md)"));
    assert.ok(read(destination.path).includes("](../06-API-ARCHITECTURE.md)"));
  }
});

test("architecture examples keep the existing course and response contract", () => {
  assert.deepEqual(architectureCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.deepEqual(enrollmentResponse, { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  assert.equal(catalogueResponse.courses[0].seats, 29);
  assert.equal(catalogueResponse.courses[1].title, "REST Studio");
  const contract = JSON.parse(read("docs/contracts/course_api.openapi.json"));
  assert.equal(contract.openapi, "3.1.0");
  assert.ok(contract.info.title && contract.info.version);
  assert.ok(contract.paths["/courses/{courseId}/enrollments"].post.security);
});
