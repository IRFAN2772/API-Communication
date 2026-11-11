import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { courseRequest, enrollmentReply, enrollmentRequest, progressUpdates, rpcCallShapes, rpcCourses } from "../assets/rpc-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const paths = ["docs/lessons/GRPC-PROTOBUF-AND-EVOLUTION.md", "docs/lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md"];
const pages = paths.map(path => readFileSync(new URL(path, root), "utf8"));
const [wire, lifecycle] = pages;
const proto = readFileSync(new URL("docs/contracts/course_api.proto", root), "utf8");
const blocks = (page, language) => [...page.matchAll(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, "g"))].map(match => match[1]);
const examples = page => blocks(page, "json").map(JSON.parse);

const fields = {
  GetCourseRequest: [["string", "course_id", 1]],
  Course: [["string", "id", 1], ["string", "title", 2], ["int32", "seats", 3], ["optional string", "description", 4]],
  EnrollRequest: [["string", "course_id", 1], ["string", "idempotency_key", 2]],
  Enrollment: [["string", "id", 1], ["string", "course_id", 2], ["string", "learner_id", 3]],
  EnrollReply: [["Enrollment", "enrollment", 1], ["Course", "course", 2]],
  ProgressUpdate: [["string", "course_id", 1], ["int32", "percent_complete", 2], ["string", "event_id", 3]],
  ProgressSummary: [["int32", "accepted_count", 1], ["int32", "last_percent", 2]],
  ClassroomMessage: [["string", "course_id", 1], ["string", "message_id", 2], ["string", "text", 3]],
};

test("shared contract field tags, types, presence and method shapes are fixed", () => {
  assert.match(proto, /syntax\s*=\s*"proto3"\s*;/);
  assert.match(proto, /package\s+learning\.v1\s*;/);
  for (const [message, expected] of Object.entries(fields)) {
    const body = proto.match(new RegExp(`message ${message} \\{([\\s\\S]*?)\\}`))?.[1];
    assert.ok(body, message);
    const actual = [...body.matchAll(/\b(optional\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)\s*;/g)]
      .map(([, optional, type, name, tag]) => [`${optional ?? ""}${type}`, name, Number(tag)]);
    assert.deepEqual(actual, expected, message);
  }
  const methods = [
    ["CourseService", "GetCourse", "GetCourseRequest", false, "Course", false],
    ["CourseService", "Enroll", "EnrollRequest", false, "EnrollReply", false],
    ["ProgressService", "WatchProgress", "GetCourseRequest", false, "ProgressUpdate", true],
    ["ProgressService", "RecordProgress", "ProgressUpdate", true, "ProgressSummary", false],
    ["ProgressService", "Discuss", "ClassroomMessage", true, "ClassroomMessage", true],
  ];
  assert.equal([...proto.matchAll(/\brpc\s+/g)].length, methods.length);
  for (const [service, method, request, requestStream, response, responseStream] of methods) {
    const body = proto.match(new RegExp(`service ${service} \\{([\\s\\S]*?)\\}`))?.[1];
    const declaration = `rpc ${method}(${requestStream ? "stream " : ""}${request}) returns (${responseStream ? "stream " : ""}${response});`;
    assert.ok(body?.includes(declaration), declaration);
    assert.ok(rpcCallShapes.some(shape => shape.service === service && shape.method === method && shape.requestStream === requestStream && shape.responseStream === responseStream));
  }
});

test("all diagnostic JSON parses and uses the canonical fixtures", () => {
  const wireJson = examples(wire);
  const lifeJson = examples(lifecycle);
  assert.deepEqual(wireJson[0], courseRequest);
  assert.deepEqual(wireJson[1], rpcCourses[0]);
  assert.deepEqual(wireJson[2], rpcCourses[0]);
  assert.deepEqual(wireJson[3], { ...rpcCourses[0], description: "" });
  assert.equal(Object.hasOwn(wireJson[2], "description"), false);
  assert.equal(Object.hasOwn(wireJson[3], "description"), true);
  assert.deepEqual(lifeJson[0], enrollmentRequest);
  assert.deepEqual(lifeJson[1], enrollmentReply);
  assert.deepEqual(lifeJson.slice(2, 4), progressUpdates);
  assert.deepEqual(lifeJson[4], { acceptedCount: 2, lastPercent: 40 });
  for (const page of pages) assert.match(page, /diagnostic/i);
});

test("request and seats bytes and gRPC envelope have correct keys and lengths", () => {
  const courseId = Buffer.from(courseRequest.courseId, "utf8");
  assert.equal(courseId.length, 10);
  const request = Buffer.concat([Buffer.from([(1 << 3) | 2, courseId.length]), courseId]);
  assert.equal(request.toString("hex"), "0a0a636f757273652d313031");
  const seats = Buffer.from([(3 << 3) | 0, rpcCourses[0].seats]);
  assert.equal(seats.toString("hex"), "181e");
  const prefix = Buffer.alloc(5);
  prefix.writeUInt32BE(request.length, 1);
  const frame = Buffer.concat([prefix, request]);
  assert.equal(frame.toString("hex"), "000000000c0a0a636f757273652d313031");
  assert.equal(frame.readUInt32BE(1), frame.length - 5);
  assert.ok(wire.includes([...frame].map(byte => byte.toString(16).padStart(2, "0")).join(" ")));
  assert.match(wire, /`18 1e`/);
});

test("budget and progress summary match the timelines", () => {
  assert.equal(1000 - 400 - 100, 500);
  assert.match(lifecycle, /1000 - 400 - 100 = 500/);
  assert.deepEqual(progressUpdates.map(item => item.eventId), ["progress-20", "progress-40"]);
  assert.deepEqual(progressUpdates.map(item => item.percentComplete), [20, 40]);
  assert.equal(progressUpdates.length, 2);
  assert.equal(progressUpdates.at(-1).percentComplete, 40);
  assert.match(lifecycle, /acceptedCount.*2.*lastPercent.*40/);
});

test("lost reply model replays one effect and protects the last seat", () => {
  let seats = rpcCourses[0].seats;
  const records = new Map();
  const enroll = (caller, key, course) => {
    const scope = `${caller}:enrollment:${key}`;
    if (records.has(scope)) {
      const record = records.get(scope);
      if (record.course !== course) return "fingerprint-conflict";
      return record.result;
    }
    if (seats === 0) return "full";
    seats--;
    const result = { id: "enrollment-42", courseId: course, learnerId: caller };
    records.set(scope, { course, result });
    return result;
  };
  const committed = enroll("learner-7", "enroll-7-a", "course-101");
  assert.equal(seats, 29); // The response can be lost after this commit.
  assert.deepEqual(enroll("learner-7", "enroll-7-a", "course-101"), committed);
  assert.equal(enroll("learner-7", "enroll-7-a", "course-102"), "fingerprint-conflict");
  assert.equal(seats, 29);
  seats = 1;
  assert.notEqual(enroll("learner-8", "key-8", "course-101"), "full");
  assert.equal(enroll("learner-9", "key-9", "course-101"), "full");
  assert.equal(seats, 0);
  assert.match(lifecycle, /database isolation, conditional decrement or an\nappropriate lock/);
});

test("documented status numbers and reservation statements remain accurate", () => {
  for (const [name, number] of Object.entries({ OK: 0, CANCELLED: 1, INVALID_ARGUMENT: 3, DEADLINE_EXCEEDED: 4, NOT_FOUND: 5, ALREADY_EXISTS: 6, PERMISSION_DENIED: 7, RESOURCE_EXHAUSTED: 8, FAILED_PRECONDITION: 9, ABORTED: 10, UNAVAILABLE: 14, UNAUTHENTICATED: 16 })) {
    assert.match(lifecycle, new RegExp(`\\| \`${name}\` \\| ${number} \\|`));
  }
  assert.match(wire, /reserved 5;\nreserved "legacy_label";/);
  assert.match(wire, /not compressed JSON/i);
  assert.match(lifecycle, /trailers-only/);
});

test("native answers are closed, plaintext and diagrams are bounded", () => {
  for (const page of pages) {
    const answers = [...page.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
    assert.ok(answers.length >= 5);
    assert.equal((page.match(/<details\b/g) ?? []).length, answers.length);
    assert.equal((page.match(/<\/details>/g) ?? []).length, answers.length);
    for (const [, body] of answers) assert.match(body, /^\s*<summary>(?:Predict|Check):[^<]+<\/summary>\s*<p>[^<]+<\/p>\s*$/);
    assert.doesNotMatch(page, /<script\b|<details[^>]*\bopen\b/i);
    assert.ok(blocks(page, "mermaid").length <= 2);
  }
});

test("related links and all local fragments resolve", () => {
  for (const [index, path] of paths.entries()) {
    const page = pages[index];
    const related = ["../03-GUIDED-RPC-AND-GRPC.md", "../03-RPC-AND-GRPC.md", "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md", "../00-GUIDED-FUNDAMENTALS.md", "REST-RELIABILITY-AND-OPERATIONS.md", "../contracts/course_api.proto", "../../assets/rpc-lesson-fixtures.mjs", index ? "GRPC-PROTOBUF-AND-EVOLUTION.md" : "GRPC-LIFECYCLE-AND-OPERATIONS.md"];
    for (const target of related) assert.ok(page.includes(`](${target})`), `${path}: ${target}`);
    for (const [, target] of page.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      const [file, fragment] = target.split("#");
      const url = file ? new URL(file, new URL(path, root)) : new URL(path, root);
      assert.ok(existsSync(url), `${path}: ${target}`);
      if (fragment) {
        const content = readFileSync(url, "utf8");
        const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) => heading.toLowerCase().replace(/[^\w -]/g, "").replace(/ /g, "-"));
        assert.ok(headings.includes(fragment) || content.includes(`id="${fragment}"`), target);
      }
    }
  }
});
