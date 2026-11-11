import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { mapRealtimeHeadings, realtimeReadingDestinations } from "../assets/realtime-reading-map.mjs";
import { progressEvents, realtimeCourse, completionEvent, pushHint } from "../assets/realtime-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("all original real-time headings retain their exact source and recommended destination", () => {
  const source = read("docs/04-REALTIME-COMMUNICATION.md");
  const mapped = mapRealtimeHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "04-REALTIME-COMMUNICATION.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/04-REALTIME-COMMUNICATION.md");
    assert.ok(existsSync(new URL(item.recommended, root)), item.recommended);
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`));
  }
});

test("live updates, callbacks, background work, push and media remain distinct topic families", () => {
  const mapped = mapRealtimeHeadings(read("docs/04-REALTIME-COMMUNICATION.md"));
  const familyFor = title => mapped.find(item => item.text === title)?.family;
  assert.equal(familyFor("2. Polling"), "updates");
  assert.equal(familyFor("8. Webhooks"), "webhooks");
  assert.equal(familyFor("17.1 Batch Processing"), "background");
  assert.equal(familyFor("4.1.8. Device Token"), "push");
  assert.equal(familyFor("4.2.9. TURN Server"), "media");
});

test("every related lesson is reachable from the main journey, original reference and topic library", () => {
  const core = read("docs/04-GUIDED-REALTIME.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(core.includes("](04-REALTIME-COMMUNICATION.md)"));
  for (const destination of realtimeReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = destination.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`));
    assert.ok(library.includes(`](${relative})`));
    assert.ok(read(destination.path).includes("](../04-GUIDED-REALTIME.md)"));
    assert.ok(read(destination.path).includes("](../04-REALTIME-COMMUNICATION.md)"));
  }
});

test("progress, completion and push fixtures use one course but do not conflate their outcomes", () => {
  assert.equal(realtimeCourse.id, "course-101");
  assert.equal(realtimeCourse.seats, 30);
  assert.deepEqual(progressEvents.map(event => event.data.percentComplete), [20, 40]);
  assert.deepEqual(progressEvents.map(event => event.id), ["progress-20", "progress-40"]);
  assert.equal(completionEvent.type, "course.completed");
  assert.equal(completionEvent.id, "completion-42");
  assert.equal(pushHint.eventId, completionEvent.id);
  assert.equal(pushHint.courseId, realtimeCourse.id);
  assert.ok(!Object.hasOwn(pushHint, "learnerId"));
});
