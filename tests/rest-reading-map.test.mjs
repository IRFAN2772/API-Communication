import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { collectHeadings, chapters } from "../assets/course-coverage.mjs";
import { mapRestHeadings, restReadingDestinations } from "../assets/rest-reading-map.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every original REST heading keeps its exact source and has a reading destination", () => {
  const source = read("docs/01-REST-APIS.md");
  const mapped = mapRestHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "01-REST-APIS.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/01-REST-APIS.md");
    assert.ok(existsSync(new URL(item.recommended, root)), item.recommended);
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`), item.anchor);
  }
});

test("topic destinations follow the original context rather than a keyword-only upgrade ladder", () => {
  const mapped = mapRestHeadings(read("docs/01-REST-APIS.md"));
  const familyFor = title => mapped.find(item => item.text === title)?.family;
  assert.equal(familyFor("Chapter 1: Anatomy of an HTTP Request"), "messages");
  assert.equal(familyFor("Chapter 6: Pagination"), "collections");
  assert.equal(familyFor("Chapter 2: Idempotency"), "reliability");
  assert.equal(familyFor("ETag"), "collections");
  assert.equal(familyFor("Chapter 3: Authentication"), "auth");
  assert.equal(familyFor("Chapter 9: Observability"), "operations");
  assert.equal(familyFor("Did GraphQL Replace REST?"), "data-shape");
  assert.equal(familyFor("Chapter 2: URLs in REST"), "resources");
});

test("every substantive branch is reachable from the new core and the complete topic library", () => {
  const core = read("docs/01-GUIDED-REST.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  for (const destination of restReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = destination.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`), relative);
    assert.ok(library.includes(`](${relative})`), relative);
    const branch = read(destination.path);
    assert.ok(branch.includes("](../01-GUIDED-REST.md)"), destination.path);
    assert.ok(branch.includes("](../01-REST-APIS.md)"), destination.path);
  }
});
