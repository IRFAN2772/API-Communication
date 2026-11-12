import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { expertReadingDestinations, mapExpertHeadings } from "../assets/expert-reading-map.mjs";
import { expertCourse, expertEnrollment, partitionCase, tenantCase } from "../assets/expert-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("all 258 expert source headings retain exact original text/line and accessible destinations", () => {
  const source = read("docs/08-EXPERT-API-DESIGN.md");
  const mapped = mapExpertHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "08-EXPERT-API-DESIGN.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/08-EXPERT-API-DESIGN.md");
    assert.ok(existsSync(new URL(item.recommended, root)));
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`));
  }
});

test("the actual module bodies, not the mismatched quick reference, determine branch destinations", () => {
  const headings = mapExpertHeadings(read("docs/08-EXPERT-API-DESIGN.md"));
  const family = prefix => headings.find(heading => heading.text.startsWith(prefix))?.family;
  assert.equal(family("Phase 7.1 —"), "contracts");
  assert.equal(family("Phase 7.2 —"), "contracts");
  assert.equal(family("Phase 7.3 —"), "regions");
  assert.equal(family("Phase 7.4 —"), "reliability");
  assert.equal(family("Phase 7.5 —"), "transactions");
  assert.equal(family("Phase 7.6 —"), "reliability");
  assert.equal(family("Phase 7.7 — CAP"), "regions");
  assert.equal(family("Phase 7.8 — Consensus"), "consensus");
  assert.equal(family("Phase 7.9 — API Monetisation"), "tenancy");
  assert.equal(family("Phase 7.10 — How Staff"), "tenancy");
});

test("all six full expert branches are linked from the core, library and original-source routes", () => {
  const core = read("docs/07-GUIDED-EXPERT-DESIGN.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(core.includes("](08-EXPERT-API-DESIGN.md)"));
  for (const branch of expertReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = branch.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`));
    assert.ok(library.includes(`](${relative})`));
    assert.ok(read(branch.path).includes("](../07-GUIDED-EXPERT-DESIGN.md)"));
    assert.ok(read(branch.path).includes("](../08-EXPERT-API-DESIGN.md)"));
  }
});

test("current records, future last-seat scenario and storage tenancy remain explicitly different", () => {
  assert.deepEqual(expertCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.equal(expertEnrollment.id, "enrollment-42");
  assert.equal(expertEnrollment.learnerId, "learner-7");
  assert.equal(partitionCase.initialSeats, 1);
  assert.ok(!partitionCase.learners.includes(expertEnrollment.learnerId));
  assert.equal(tenantCase.enrollment.tenantId, "org-a");
  assert.ok(!("tenantId" in expertEnrollment));
});
