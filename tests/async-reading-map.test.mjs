import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { asyncReadingDestinations, mapAsyncHeadings } from "../assets/async-reading-map.mjs";
import {
  asyncCourse, asyncEnrollment, completionFact, emailCommand, projectionEvents, aggregateId,
} from "../assets/async-lesson-fixtures.mjs";
import { completionEvent } from "../assets/realtime-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every original async heading retains its exact source and reading destination", () => {
  const source = read("docs/05-ASYNC-APIS.md");
  const mapped = mapAsyncHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "05-ASYNC-APIS.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/05-ASYNC-APIS.md");
    assert.ok(existsSync(new URL(item.recommended, root)));
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`));
  }
});

test("broker guarantees, event models and workflow patterns remain separate topics", () => {
  const mapped = mapAsyncHeadings(read("docs/05-ASYNC-APIS.md"));
  const familyFor = title => mapped.find(item => item.text === title)?.family;
  assert.equal(familyFor("Why Message Queues Exist"), "fundamentals");
  assert.equal(familyFor("12. Dead Letter Queue (DLQ)"), "brokers");
  assert.equal(familyFor("14. Replay"), "brokers");
  assert.equal(familyFor("Event Sourcing"), "models");
  assert.equal(familyFor("CQRS"), "models");
  assert.equal(familyFor("Outbox Pattern"), "workflows");
  assert.equal(familyFor("Saga Pattern"), "workflows");
});

test("all standalone lessons are reachable from the journey and topic library", () => {
  const core = read("docs/05-GUIDED-ASYNC.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(core.includes("](05-ASYNC-APIS.md)"));
  for (const destination of asyncReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = destination.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`));
    assert.ok(library.includes(`](${relative})`));
    assert.ok(read(destination.path).includes("](../05-GUIDED-ASYNC.md)"));
    assert.ok(read(destination.path).includes("](../05-ASYNC-APIS.md)"));
  }
});

test("canonical completion remains intact while commands and an alternative versioned history are distinct", () => {
  assert.deepEqual(completionFact, completionEvent);
  assert.equal(asyncCourse.seats, 29);
  assert.equal(asyncEnrollment, "enrollment-42");
  assert.equal(emailCommand.type, "SendCompletionEmail");
  assert.equal(emailCommand.completionId, completionFact.id);
  assert.notEqual(emailCommand.id, completionFact.id);
  assert.deepEqual(projectionEvents.map(event => event.version), [1, 2, 3]);
  assert.ok(projectionEvents.every(event => event.aggregateId === aggregateId));
  assert.equal(new Set(projectionEvents.map(event => event.id)).size, 3);
});
