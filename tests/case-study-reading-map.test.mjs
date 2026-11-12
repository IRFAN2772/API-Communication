import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { caseStudyDestinations, mapCaseStudyHeadings } from "../assets/case-study-reading-map.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("all 90 original case headings preserve exact source and an accessible complete destination", () => {
  const source = read("docs/09-SYSTEM-DESIGN-CASE-STUDIES.md");
  const mapped = mapCaseStudyHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "09-SYSTEM-DESIGN-CASE-STUDIES.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const heading of mapped) {
    assert.equal(heading.source, "docs/09-SYSTEM-DESIGN-CASE-STUDIES.md");
    assert.ok(existsSync(new URL(heading.recommended, root)));
    if (heading.anchor) assert.ok(read(heading.recommended).includes(`id="${heading.anchor}"`));
  }
});
test("the six case domains are separate from the reusable method and other-system transfers", () => {
  const mapped = mapCaseStudyHeadings(read("docs/09-SYSTEM-DESIGN-CASE-STUDIES.md"));
  const family = prefix => mapped.find(heading => heading.text.startsWith(prefix))?.family;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(number => family(`Case Study ${number}:`)),
    ["messaging", "photos", "playback", "dispatch", "fanout", "uploads"]);
  assert.equal(family("How Other Systems Map"), "transfers");
  assert.equal(family("The Meta Pattern"), "method");
  assert.equal(family("The Journey is Complete"), "method");
});
test("all seven substantive branches remain linked from the hub and complete topic library", () => {
  const hub = read("docs/GUIDED-CASE-STUDIES.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(hub.includes("](09-SYSTEM-DESIGN-CASE-STUDIES.md)"));
  for (const branch of caseStudyDestinations.filter(destination => destination.id !== "method")) {
    const relative = branch.path.slice("docs/".length);
    assert.ok(hub.includes(`](${relative})`) || hub.includes(`](${relative}#`), relative);
    assert.ok(library.includes(`](${relative})`) || library.includes(`](${relative}#`), relative);
    assert.ok(read(branch.path).includes("](../GUIDED-CASE-STUDIES.md)"));
    assert.ok(read(branch.path).includes("](../09-SYSTEM-DESIGN-CASE-STUDIES.md)") ||
      read(branch.path).includes("](../09-SYSTEM-DESIGN-CASE-STUDIES.md#"));
  }
});
test("the four other systems have individually signposted complete transfer sections", () => {
  const mapped = mapCaseStudyHeadings(read("docs/09-SYSTEM-DESIGN-CASE-STUDIES.md"));
  for (const [title, anchor] of [
    ["Amazon / Amazon Prime", "transfer-amazon"], ["LinkedIn", "transfer-linkedin"],
    ["Snapchat", "transfer-snapchat"], ["JioHotstar (Indian Streaming)", "transfer-live-sports"],
  ]) {
    assert.equal(mapped.find(heading => heading.text === title)?.anchor, anchor);
    assert.ok(read("docs/GUIDED-CASE-STUDIES.md").includes(`CASE-STUDY-TRANSFERS.md#${anchor}`));
  }
});
