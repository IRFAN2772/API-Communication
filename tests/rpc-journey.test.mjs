import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rpcCourses, courseRequest, enrollmentRequest, enrollmentReply,
  progressUpdates, rpcCallShapes,
} from "../assets/rpc-lesson-fixtures.mjs";

const lesson = readFileSync(new URL("../docs/03-GUIDED-RPC-AND-GRPC.md", import.meta.url), "utf8");
const proto = readFileSync(new URL("../docs/contracts/course_api.proto", import.meta.url), "utf8");
const fences = [...lesson.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
  .map(([, language, body]) => ({ language, body }));
const json = fences.filter(block => block.language === "json").map(block => JSON.parse(block.body));
const camel = name => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const messages = new Map([...proto.matchAll(/message\s+(\w+)\s*\{([^}]*)\}/g)].map(([, name, body]) => [
  name,
  [...body.matchAll(/(?:optional\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)\s*;/g)]
    .map(([, type, field, number]) => ({ type, field: camel(field), number: Number(number) })),
]));
const methods = [...proto.matchAll(/service\s+(\w+)\s*\{([^}]*)\}/g)].flatMap(([, service, body]) =>
  [...body.matchAll(/rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)\s*;/g)]
    .map(([, method, requestStream, request, responseStream, response]) => ({
      service, method, requestStream: Boolean(requestStream), responseStream: Boolean(responseStream), request, response,
    })));

function checkMessage(name, value) {
  assert.ok(messages.has(name), name);
  assert.ok(value && typeof value === "object" && !Array.isArray(value), name);
  const fields = messages.get(name);
  for (const [key, item] of Object.entries(value)) {
    const field = fields.find(candidate => candidate.field === key);
    assert.ok(field, `${name}.${key} is in the shared proto`);
    if (field.type === "string") assert.equal(typeof item, "string", `${name}.${key}`);
    else if (field.type === "int32") {
      assert.ok(Number.isInteger(item) && item >= -2147483648 && item <= 2147483647, `${name}.${key}`);
    } else checkMessage(field.type, item);
  }
}

function fieldNumber(message, field) {
  return messages.get(message).find(candidate => candidate.field === field).number;
}

function encodeVarint(number) {
  const bytes = [];
  do {
    const next = number & 0x7f;
    number = Math.floor(number / 128);
    bytes.push(next | (number ? 0x80 : 0));
  } while (number);
  return Buffer.from(bytes);
}

function encodeFixture(message, value) {
  const chunks = [];
  for (const field of messages.get(message)) {
    if (!Object.hasOwn(value, field.field)) continue;
    const item = value[field.field];
    if (field.type === "string") {
      const bytes = Buffer.from(item, "utf8");
      chunks.push(encodeVarint(field.number * 8 + 2), encodeVarint(bytes.length), bytes);
    } else if (field.type === "int32") {
      assert.ok(item >= 0, "fixture encoder only supports nonnegative int32 values");
      chunks.push(encodeVarint(field.number * 8), encodeVarint(item));
    } else throw new Error(`Unsupported fixture field type: ${field.type}`);
  }
  return Buffer.concat(chunks);
}

function frame(bytes) {
  const prefix = Buffer.alloc(5);
  prefix.writeUInt32BE(bytes.length, 1);
  return Buffer.concat([prefix, bytes]);
}

function splitFrames(bytes) {
  const frames = [];
  for (let offset = 0; offset < bytes.length;) {
    assert.ok(offset + 5 <= bytes.length, "complete prefix");
    assert.equal(bytes[offset], 0, "uncompressed fixture");
    const length = bytes.readUInt32BE(offset + 1);
    assert.ok(offset + 5 + length <= bytes.length, "complete message");
    frames.push(bytes.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
  }
  return frames;
}

const section = (start, end) => lesson.slice(lesson.indexOf(start), end ? lesson.indexOf(end) : undefined);

test("journey has seven stable routes and linked original and branches", () => {
  const ids = ["rpc-choice", "rpc-contract", "rpc-wire", "rpc-lifecycle", "rpc-streaming", "rpc-operations", "rpc-next"];
  assert.equal((lesson.match(/^## Step [1-7] — /gm) ?? []).length, 7);
  assert.ok(lesson.split("\n").length >= 450 && lesson.split("\n").length <= 600);
  for (const id of ids) {
    assert.equal((lesson.match(new RegExp(`<span id="${id}"></span>`, "g")) ?? []).length, 1, id);
    assert.ok(lesson.includes(`](#${id})`), id);
  }
  for (const path of ["01-GUIDED-REST.md", "02-GUIDED-GRAPHQL.md", "03-RPC-AND-GRPC.md",
    "04-REALTIME-COMMUNICATION.md", "COURSE-CONTENT-MAP.md", "CONTENT-CORRECTIONS.md",
    "contracts/course_api.proto", "lessons/GRPC-PROTOBUF-AND-EVOLUTION.md", "lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md"]) {
    assert.ok(lesson.includes(`](${path})`), path);
  }
  assert.doesNotMatch(lesson, /\]\(03-RPC-AND-GRPC\.md#/);
  const route = section("## Route through the original reference", '<span id="rpc-choice">');
  for (const topic of ["history", "local vs remote", "service contracts", "HTTP/1.1", "HTTP/2", "field numbers",
    "client/server stubs", "unary", "server, client, bidirectional", "WebSocket", "polyglot", "deadlines", "load balancing", "observability"]) {
    assert.ok(route.includes(topic), topic);
  }
});

test("message renderings have only fields and types in the actual shared proto", () => {
  assert.equal((lesson.match(/^```/gm) ?? []).length, fences.length * 2);
  assert.deepEqual(new Set(fences.map(block => block.language)), new Set(["text", "json"]));
  assert.match(lesson, /diagnostic renderings[\s\S]*?not raw gRPC wire payloads/);
  const types = ["GetCourseRequest", "Course", "Course", "EnrollRequest", "EnrollReply", "Course",
    "ProgressUpdate", "ProgressUpdate", "ProgressSummary", "ClassroomMessage", "ClassroomMessage"];
  assert.equal(json.length, types.length);
  json.forEach((value, index) => checkMessage(types[index], value));
  assert.deepEqual(json[0], courseRequest);
  assert.deepEqual(json.slice(1, 3), rpcCourses);
  assert.deepEqual(json[3], enrollmentRequest);
  assert.deepEqual(json[4], enrollmentReply);
  assert.deepEqual(json[5], enrollmentReply.course);
  assert.deepEqual(json.slice(6, 8), progressUpdates);
  assert.deepEqual(json[8], { acceptedCount: 2, lastPercent: 40 });
  assert.deepEqual(json.slice(9), [
    { courseId: "course-101", messageId: "message-1", text: "Ready for class" },
    { courseId: "course-101", messageId: "message-2", text: "Welcome" },
  ]);
  assert.equal(rpcCourses[0].seats - 1, enrollmentReply.course.seats);
  assert.equal(rpcCourses[1].seats, 20);
  assert.match(lesson, /Explicit reset[\s\S]*?course-101 to 30 available seats and no enrollment/);
});

test("the four streaming shapes and enrollment match the canonical service", () => {
  assert.deepEqual(methods.map(({ service, method, requestStream, responseStream }) =>
    ({ service, method, requestStream, responseStream })), rpcCallShapes);
  assert.deepEqual(methods.map(({ request, response }) => [request, response]), [
    ["GetCourseRequest", "Course"], ["EnrollRequest", "EnrollReply"],
    ["GetCourseRequest", "ProgressUpdate"], ["ProgressUpdate", "ProgressSummary"],
    ["ClassroomMessage", "ClassroomMessage"],
  ]);
  for (const shape of rpcCallShapes) assert.ok(lesson.includes(`\`${shape.service}.${shape.method}\``));
  assert.match(lesson, /Each direction preserves its own message order[\s\S]*?no global/);
  assert.match(lesson, /no inherent per-message ACK/);
  assert.match(lesson, /Neither replay nor\s+resume is automatic/);
  assert.match(lesson, /gRPC-Web[\s\S]*?not\s+native client or bidirectional streaming/);
});

test("request bytes and progress message framing follow field numbers, not DATA frame counts", () => {
  assert.equal(fieldNumber("GetCourseRequest", "courseId"), 1);
  assert.equal(fieldNumber("Course", "seats"), 3);
  assert.equal(fieldNumber("ProgressUpdate", "percentComplete"), 2);
  const request = encodeFixture("GetCourseRequest", courseRequest);
  assert.equal(request.toString("hex"), "0a0a636f757273652d313031");
  assert.equal(request.length, 12);
  const requestFrame = frame(request);
  assert.equal(requestFrame.subarray(0, 5).toString("hex"), "000000000c");
  assert.equal(requestFrame.length, 17);
  assert.deepEqual(splitFrames(requestFrame), [request]);
  const events = progressUpdates.map(update => encodeFixture("ProgressUpdate", update));
  assert.deepEqual(splitFrames(Buffer.concat(events.map(frame))), events);
  assert.equal(events.length, 2);
  assert.throws(() => splitFrames(requestFrame.subarray(0, 8)), /complete message/);
  assert.match(lesson, /not necessarily\s+two HTTP\/2 DATA frames/);
  assert.match(lesson, /Binary serialization is not itself compression/);
  assert.match(lesson, /HTTP status and gRPC status\s+are distinct/);
});

test("deadline scenario models an unknown result and scoped same-intent retry", () => {
  const start = rpcCourses[0].seats;
  const durable = new Map();
  let seats = start;
  function enroll(caller, operation, request) {
    const key = `${caller}:${operation}:${request.idempotencyKey}`;
    const fingerprint = request.courseId;
    if (durable.has(key)) {
      const prior = durable.get(key);
      if (prior.fingerprint !== fingerprint) throw new Error("conflicting intent");
      return prior.reply;
    }
    seats -= 1;
    const reply = { ...enrollmentReply, course: { ...enrollmentReply.course, seats } };
    durable.set(key, { fingerprint, reply });
    return reply;
  }
  enroll("learner-7", "Enroll", enrollmentRequest); // Commit; response is lost.
  const clientStatus = "DEADLINE_EXCEEDED";
  assert.equal(clientStatus, "DEADLINE_EXCEEDED");
  assert.equal(seats, 29);
  assert.deepEqual(enroll("learner-7", "Enroll", enrollmentRequest), enrollmentReply);
  assert.equal(seats, 29);
  assert.throws(() => enroll("learner-7", "Enroll", { ...enrollmentRequest, courseId: "course-102" }), /conflicting intent/);
  assert.match(lesson, /deadline is not a protobuf message field/);
  assert.match(lesson, /client outcome\s+is \*\*unknown\*\*/);
  assert.match(lesson, /scopes keys by authenticated caller and operation[\s\S]*?`course_id` in a request fingerprint/);
  assert.match(lesson, /Cancellation\s+is cooperative[\s\S]*?does not roll back/);
  assert.match(lesson, /does not make\s+external emails or payments exactly once/);
  assert.equal(500 - 150, 350);
  assert.match(lesson, /500 ms[\s\S]*?150 ms[\s\S]*?350 ms/);
});

test("choice, operating constraints and transfer use reasoning checkpoints", () => {
  const answers = [...lesson.matchAll(/<details class="learning-answer">\n([\s\S]*?)\n<\/details>/g)].map(match => match[1]);
  assert.equal(answers.length, 7);
  assert.equal((lesson.match(/<details\b[^>]*>/g) ?? []).length, answers.length);
  for (const answer of answers) {
    assert.match(answer, /<summary>Predict:[\s\S]*?<\/summary>/);
    assert.match(answer, /<p><strong>Reasoning:<\/strong>[\s\S]*?<\/p>/);
    assert.doesNotMatch(answer, /```/);
  }
  for (const pattern of [
    /already an independently deployed\s+service/, /not justify splitting\s+an otherwise healthy monolith/,
    /RPC is a broad idea and predates REST/, /REST is a valid\s+internal service interface/,
    /keep REST/, /Public gRPC APIs are possible/, /book loan/, /strongly typed message does not grant permission/,
    /one retry layer/, /backoff with jitter/, /Layer 7 proxy/, /remaining budget/,
    /not as an upgrade rung/,
  ]) assert.match(lesson, pattern);
  assert.ok(lesson.includes("](04-GUIDED-REALTIME.md)"));
  assert.ok(lesson.includes("](04-REALTIME-COMMUNICATION.md)"));
});
