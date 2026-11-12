import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  architectureCourse,
  architectureLearner,
  architectureEnrollment,
  catalogueResponse,
  enrollmentResponse,
  requestCapacityModel,
  stableObservation,
} from "../assets/architecture-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const contract = JSON.parse(read("docs/contracts/course_api.openapi.json"));
const api = read("docs/lessons/API-CONTRACTS-AND-LIFECYCLE.md");
const capacity = read("docs/lessons/BACKPRESSURE-AND-CAPACITY.md");
const schemas = contract.components.schemas;
const blocks = (page, language) =>
  [...page.matchAll(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, "g"))]
    .map(match => match[1]);

// This deliberately implements only the JSON Schema keywords used by the examples.
function matchesSchema(value, schema) {
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1);
    return matchesSchema(value, schemas[name]);
  }
  const isType = type => ({
    object: () => value !== null && typeof value === "object" && !Array.isArray(value),
    array: () => Array.isArray(value),
    string: () => typeof value === "string",
    integer: () => Number.isInteger(value),
    null: () => value === null,
  })[type]?.() ?? false;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(isType)) return false;
  if (typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength) return false;
  if (typeof value === "number" && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.items && !value.every(item => matchesSchema(item, schema.items))) return false;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if ((schema.required ?? []).some(key => !Object.hasOwn(value, key))) return false;
    for (const [key, item] of Object.entries(value)) {
      if (!schema.properties?.[key]) {
        if (schema.additionalProperties === false) return false;
      } else if (!matchesSchema(item, schema.properties[key])) return false;
    }
  }
  return true;
}

test("canonical definition has the seven intended operations and distinct versions", () => {
  assert.equal(contract.openapi, "3.1.0");
  assert.equal(contract.info.version, "1.0.0");
  const operations = Object.entries(contract.paths).flatMap(([path, item]) =>
    Object.entries(item).filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map(([method, operation]) => [path, method, operation.operationId]));
  assert.deepEqual(operations, [
    ["/courses", "get", "listCourses"],
    ["/courses", "post", "createCourse"],
    ["/courses/{courseId}", "get", "getCourse"],
    ["/courses/{courseId}", "put", "replaceCourse"],
    ["/courses/{courseId}", "patch", "patchCourse"],
    ["/courses/{courseId}", "delete", "deleteCourse"],
    ["/courses/{courseId}/enrollments", "post", "enrollCurrentLearner"],
  ]);
  assert.equal(contract.components.parameters.CourseId.required, true);
  assert.equal(contract.components.parameters.IfMatch.required, true);
  assert.deepEqual(contract.components.securitySchemes.sessionCookie, { type: "apiKey", in: "cookie", name: "session" });
  assert.equal(contract.paths["/courses/{courseId}/enrollments"].post.parameters[0].required, true);
  assert.ok(contract.paths["/courses/{courseId}"].patch.responses["412"]);
  assert.ok(contract.components.responses.Unauthenticated.headers["WWW-Authenticate"]);
});

test("documented JSON bodies parse and conform to the actual shared schemas", () => {
  const bodies = blocks(api, "json").map(JSON.parse);
  assert.equal(bodies.length, 5);
  const [course, page, write, patch, enrollment] = bodies;
  assert.deepEqual(course, architectureCourse);
  assert.deepEqual(page, catalogueResponse);
  assert.deepEqual(write, { title: architectureCourse.title, seats: architectureCourse.seats });
  assert.deepEqual(patch, { seats: architectureCourse.seats });
  assert.deepEqual(enrollment, enrollmentResponse);
  assert.equal(enrollment.id, architectureEnrollment);
  assert.equal(enrollment.learnerId, architectureLearner);
  for (const [value, name] of [[course, "Course"], [page, "CoursePage"], [write, "CourseWrite"], [patch, "CoursePatch"], [enrollment, "Enrollment"]]) {
    assert.ok(matchesSchema(value, schemas[name]), name);
  }
  assert.equal(blocks(capacity, "json").length, 0);
});

test("schema constraints reject invalid writes, patches and strict output additions", () => {
  const { Course, CoursePage, CourseWrite, CoursePatch } = schemas;
  assert.deepEqual(Course.required, ["id", "title", "seats"]);
  assert.equal(Course.additionalProperties, false);
  assert.deepEqual(CourseWrite.required, ["title", "seats"]);
  assert.equal(Object.hasOwn(CoursePatch, "required"), false);
  assert.deepEqual(CoursePage.properties.nextCursor.type, ["string", "null"]);
  assert.equal(CoursePage.properties.courses.maxItems, 20);
  assert.ok(matchesSchema({ title: "x", seats: 0 }, CourseWrite));
  assert.ok(matchesSchema({ title: "x", seats: 2147483647 }, CourseWrite));
  assert.ok(matchesSchema({}, CoursePatch));
  for (const value of [
    { title: "x", seats: -1 }, { title: "x", seats: 2147483648 },
    { title: "x", seats: 2.5 }, { title: "x" }, { id: "x", title: "x", seats: 0 },
  ]) assert.equal(matchesSchema(value, CourseWrite), false);
  assert.equal(matchesSchema({ title: null }, CoursePatch), false);
  assert.equal(matchesSchema({ seats: null }, CoursePatch), false);
  assert.equal(matchesSchema({ ...architectureCourse, extra: true }, Course), false);
  assert.equal(matchesSchema({ courses: Array(21).fill(architectureCourse), nextCursor: null }, CoursePage), false);
  assert.equal(matchesSchema({ courses: [], nextCursor: 1 }, CoursePage), false);
});

test("stable means and independent deterministic overload calculations match fixtures", () => {
  const { arrivalsPerSecond, meanTimeInSystemSeconds } = stableObservation;
  assert.equal(arrivalsPerSecond * meanTimeInSystemSeconds, 5);
  const { concurrency, serviceSeconds, waitingCapacity, overloadArrivalsPerSecond, recoveryArrivalsPerSecond } = requestCapacityModel;
  const serviceRate = concurrency / serviceSeconds;
  assert.equal(serviceRate, 80);
  assert.equal(overloadArrivalsPerSecond - serviceRate, 20);
  assert.equal(waitingCapacity / (overloadArrivalsPerSecond - serviceRate), 2);
  assert.equal(serviceRate - recoveryArrivalsPerSecond, 20);
  assert.equal(waitingCapacity / (serviceRate - recoveryArrivalsPerSecond), 2);
  assert.equal(3 * 2 * 100, 600);
  for (const phrase of ["L = 40/s × 0.125 s = 5 requests", "4 × 20 = 80 jobs/s", "40 / 20 = 2 seconds", "3 calls × 2 attempts × 100 requests/s = 600 attempts/s"]) {
    assert.ok(capacity.includes(phrase), phrase);
  }
});

test("finite admission counterexample and non-cooperative producer remain bounded", () => {
  const { concurrency, waitingCapacity } = requestCapacityModel;
  let active = 0;
  let waiting = 0;
  let rejected = 0;
  const offer = () => {
    if (active < concurrency) active++;
    else if (waiting < waitingCapacity) waiting++;
    else rejected++;
  };
  // This producer ignores pressure and sends 100 jobs without any completions.
  for (let i = 0; i < 100; i++) offer();
  assert.deepEqual({ active, waiting, rejected }, { active: 4, waiting: 40, rejected: 56 });
  assert.equal(active + waiting + rejected, 100);
  assert.match(capacity, /producer cannot slow down/i);
  assert.match(capacity, /request-size limits/i);
  assert.match(capacity, /does not roll back completed side effects/i);
  assert.match(capacity, /not a durable acknowledgment/i);
});

test("closed native learning answers, bounded diagrams and required references", () => {
  const references = [
    "../06-GUIDED-ARCHITECTURE.md", "../06-API-ARCHITECTURE.md",
    "GATEWAYS-BFFS-AND-LOAD-BALANCING.md", "SERVICE-MESH-AND-TRUST.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md",
    "../../assets/architecture-lesson-fixtures.mjs",
  ];
  for (const page of [api, capacity]) {
    const count = page.trimEnd().split("\n").length;
    assert.ok(count >= 350 && count <= 450, `line count ${count}`);
    const answers = [...page.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
    assert.ok(answers.length >= 5);
    assert.equal((page.match(/<details\b/g) ?? []).length, answers.length);
    assert.equal((page.match(/<\/details>/g) ?? []).length, answers.length);
    for (const [, body] of answers) assert.match(body, /^\s*<summary>(?:Predict|Check):[^<]+<\/summary>\s*<p>[^<]+<\/p>\s*$/);
    assert.doesNotMatch(page, /<script\b|<details[^>]*\bopen\b/i);
    assert.ok(blocks(page, "mermaid").length <= 2);
    for (const ref of references) assert.ok(page.includes(`](${ref})`), ref);
  }
  assert.ok(api.includes("](BACKPRESSURE-AND-CAPACITY.md)"));
  assert.ok(capacity.includes("](API-CONTRACTS-AND-LIFECYCLE.md)"));
  assert.ok(api.includes("](../contracts/course_api.openapi.json)"));
  assert.ok(capacity.includes("](../contracts/course_api.proto)"));
});

test("teaching text preserves important operational and compatibility distinctions", () => {
  for (const phrase of [
    /additionalProperties: false/, /old consumers against the new provider/i,
    /new consumers against the old provider/i, /strong validator/i, /stale.*412/i,
    /cookie.*not.*grant/i, /outcome atomically/i, /nullable: true/,
  ]) assert.match(api, phrase);
  for (const phrase of [
    /stable long-run/i, /not a peak.*p99/i, /TCP.*receive window/i,
    /429.*caller/i, /503.*capacity/i, /Strict priority can starve/i,
    /offset lag.*not inherently elapsed queue age/i, /accepted-only success ratio/i,
    /protobuf contract/i, /not.*fake zero progress/i,
  ]) assert.match(capacity, phrase);
});
