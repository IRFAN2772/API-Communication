import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  rpcCourses, courseRequest, enrollmentRequest, enrollmentReply, progressUpdates, rpcCallShapes,
} from "../assets/rpc-lesson-fixtures.mjs";

const require = createRequire(import.meta.url);
const protobuf = require(process.argv[2] ? resolve(process.argv[2]) : "protobufjs");
const definition = readFileSync(new URL("../docs/contracts/course_api.proto", import.meta.url), "utf8");
const root = protobuf.parse(definition).root.resolveAll();
const lookup = name => root.lookupType(`learning.v1.${name}`);
const plain = (type, message) => type.toObject(message, { defaults: false });

for (const shape of rpcCallShapes) {
  const method = root.lookupService(`learning.v1.${shape.service}`).methods[shape.method];
  assert.ok(method, `${shape.service}.${shape.method}`);
  assert.equal(Boolean(method.requestStream), shape.requestStream);
  assert.equal(Boolean(method.responseStream), shape.responseStream);
}

const fixtures = [
  ["GetCourseRequest", courseRequest],
  ["Course", rpcCourses[0]],
  ["Course", rpcCourses[1]],
  ["EnrollRequest", enrollmentRequest],
  ["EnrollReply", enrollmentReply],
  ...progressUpdates.map(update => ["ProgressUpdate", update]),
  ["ProgressSummary", { acceptedCount: 2, lastPercent: 40 }],
  ["ClassroomMessage", { courseId: "course-101", messageId: "message-1", text: "Ready for class" }],
];
for (const [name, object] of fixtures) {
  const type = lookup(name);
  assert.equal(type.verify(object), null, name);
  const bytes = type.encode(type.create(object)).finish();
  assert.deepEqual(plain(type, type.decode(bytes)), object, `${name} binary round-trip`);
}

const requestType = lookup("GetCourseRequest");
const requestBytes = Buffer.from(requestType.encode(courseRequest).finish());
assert.equal(Buffer.byteLength(courseRequest.courseId), 10);
assert.equal(requestBytes.toString("hex"), "0a0a636f757273652d313031");
assert.equal(requestBytes.length, 12);

function frame(payload) {
  const prefix = Buffer.alloc(5);
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
}
function unframe(bytes) {
  if (bytes.length < 5 || bytes[0] !== 0 || bytes.readUInt32BE(1) !== bytes.length - 5) {
    throw new Error("Expected one complete uncompressed gRPC message");
  }
  return bytes.subarray(5);
}
const requestFrame = frame(requestBytes);
assert.equal(requestFrame.subarray(0, 5).toString("hex"), "000000000c");
assert.equal(requestFrame.length, 17);
assert.deepEqual(unframe(requestFrame), requestBytes);
assert.throws(() => unframe(requestFrame.subarray(0, 8)));
assert.throws(() => unframe(Buffer.from([1, 0, 0, 0, 0])));

const courseType = lookup("Course");
assert.equal(courseType.fields.seats.id, 3);
assert.equal((courseType.fields.seats.id << 3) | 0, 0x18);
assert.equal(courseType.verify({ ...rpcCourses[0], seats: -1 }), null,
  "A valid signed int32 is not automatically a valid available-seat count");
const absent = Buffer.from(courseType.encode(rpcCourses[0]).finish());
const empty = Buffer.from(courseType.encode({ ...rpcCourses[0], description: "" }).finish());
assert.equal(empty.length, absent.length + 2);
assert.equal(empty.subarray(-2).toString("hex"), "2200");
assert.equal(Object.hasOwn(courseType.decode(absent), "description"), false);
assert.equal(Object.hasOwn(courseType.decode(empty), "description"), true);

const oldRoot = protobuf.parse('syntax = "proto3"; message Course { string id = 1; string title = 2; int32 seats = 3; }').root.resolveAll();
const oldCourse = oldRoot.lookupType("Course");
const extended = courseType.encode({ ...rpcCourses[0], description: "Preview course" }).finish();
assert.deepEqual(plain(oldCourse, oldCourse.decode(extended)), rpcCourses[0],
  "The old reader can interpret its known fields in this additive binary example");

assert.equal(enrollmentReply.course.seats, rpcCourses[0].seats - 1);
assert.equal(enrollmentReply.enrollment.id, "enrollment-42");
assert.deepEqual(progressUpdates.map(update => update.percentComplete), [20, 40]);
const streamFrames = progressUpdates.map(update => frame(Buffer.from(lookup("ProgressUpdate").encode(update).finish())));
assert.deepEqual(streamFrames.map(bytes => plain(lookup("ProgressUpdate"), lookup("ProgressUpdate").decode(unframe(bytes)))), progressUpdates);

const pages = [
  "docs/03-GUIDED-RPC-AND-GRPC.md",
  "docs/lessons/GRPC-PROTOBUF-AND-EVOLUTION.md",
  "docs/lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md",
];
let definitions = 1;
for (const page of pages) {
  const content = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  for (const [, source] of content.matchAll(/```(?:proto|protobuf)\n([\s\S]*?)```/g)) {
    protobuf.parse(source).root.resolveAll();
    definitions++;
  }
}
console.log(`Protobuf.js: ${definitions} complete definitions parsed and resolved.`);
console.log("Passed: five RPC method shapes, canonical binary round-trips, exact 12-byte request/17-byte gRPC message, presence, additive-reader compatibility and 20/40 event frames.");
console.log("This validates teaching contracts and bytes, not a live gRPC transport, durable enrollment or production cancellation/retry behavior.");
