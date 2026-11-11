import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chapters, collectHeadings } from "../assets/course-coverage.mjs";
import { mapRpcHeadings, rpcReadingDestinations } from "../assets/rpc-reading-map.mjs";
import { rpcCourses, enrollmentReply, progressUpdates, rpcCallShapes } from "../assets/rpc-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("all original RPC headings retain their exact source and recommended reading destination", () => {
  const source = read("docs/03-RPC-AND-GRPC.md");
  const mapped = mapRpcHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "03-RPC-AND-GRPC.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/03-RPC-AND-GRPC.md");
    assert.ok(existsSync(new URL(item.recommended, root)), item.recommended);
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`));
  }
});

test("protocol contracts and remote lifecycle topics map to substantive independent lessons", () => {
  const mapped = mapRpcHeadings(read("docs/03-RPC-AND-GRPC.md"));
  const familyFor = text => mapped.find(item => item.text === text)?.family;
  assert.equal(familyFor("Chapter 2 — What is RPC?"), "choice");
  assert.equal(familyFor("Chapter 6 — Service Contract"), "wire");
  assert.equal(familyFor("Chapter 8 — Protocol Buffers (Proto)"), "wire");
  assert.equal(familyFor("24. Deadlines: Very Important"), "lifecycle");
  assert.equal(familyFor("26. Load Balancing gRPC"), "lifecycle");
});

test("new branches, source contract and original reference are reachable from the journey", () => {
  const core = read("docs/03-GUIDED-RPC-AND-GRPC.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  assert.ok(core.includes("](03-RPC-AND-GRPC.md)"));
  assert.ok(core.includes("](contracts/course_api.proto)"));
  for (const destination of rpcReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = destination.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`));
    assert.ok(library.includes(`](${relative})`));
    assert.ok(read(destination.path).includes("](../03-GUIDED-RPC-AND-GRPC.md)"));
    assert.ok(read(destination.path).includes("](../03-RPC-AND-GRPC.md)"));
  }
});

test("RPC fixtures preserve the same course, enrollment, event IDs and four interaction shapes", () => {
  assert.equal(rpcCourses[0].title, "API Fundamentals");
  assert.equal(enrollmentReply.course.seats, rpcCourses[0].seats - 1);
  assert.equal(enrollmentReply.enrollment.id, "enrollment-42");
  assert.deepEqual(progressUpdates.map(event => event.percentComplete), [20, 40]);
  assert.equal(new Set(progressUpdates.map(event => event.eventId)).size, 2);
  assert.deepEqual(new Set(rpcCallShapes.map(shape => `${shape.requestStream}/${shape.responseStream}`)),
    new Set(["false/false", "false/true", "true/false", "true/true"]));
});
