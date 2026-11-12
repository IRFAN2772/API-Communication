import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  architectureCourse, catalogueResponse, enrollmentResponse, stableObservation, requestCapacityModel,
} from "../assets/architecture-lesson-fixtures.mjs";

const require = process.argv[2]
  ? createRequire(pathToFileURL(resolve(process.argv[2], "package.json")))
  : createRequire(import.meta.url);
const SwaggerParser = require("@apidevtools/swagger-parser");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const contractPath = fileURLToPath(new URL("../docs/contracts/course_api.openapi.json", import.meta.url));
const api = await SwaggerParser.validate(contractPath, { resolve: { external: false } });
assert.equal(api.openapi, "3.1.0");
assert.ok(api.info.title && api.info.version);
await assert.rejects(() => SwaggerParser.validate({
  openapi: "3.0.0",
  paths: { "/users": { get: { summary: "Get Users", responses: { 200: { description: "Success" } } } } },
}, { resolve: { external: false } }));
await assert.rejects(() => SwaggerParser.validate({
  openapi: "3.0.0", info: { title: "Deliberately invalid field/type sketch", version: "1.0.0" },
  paths: {}, components: { schemas: { User: { id: "number", name: "string", email: "string" } } },
}, { resolve: { external: false } }));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validators = new Map();
for (const [name, schema] of Object.entries(api.components.schemas)) {
  validators.set(name, ajv.compile(schema));
}
const accepts = (name, value) => validators.get(name)(value);
assert.ok(accepts("Course", architectureCourse));
assert.ok(accepts("CoursePage", catalogueResponse));
assert.ok(accepts("Enrollment", enrollmentResponse));
assert.ok(!accepts("Course", { ...architectureCourse, seats: -1 }));
assert.ok(!accepts("Course", { ...architectureCourse, seats: "29" }));
assert.ok(!accepts("Course", { ...architectureCourse, extra: "not declared in this closed schema" }));
assert.ok(accepts("CourseWrite", { title: "REST Studio", seats: 20 }));
assert.ok(!accepts("CourseWrite", { title: "REST Studio" }));
assert.ok(!accepts("CourseWrite", { id: "course-102", title: "REST Studio", seats: 20 }));
assert.ok(accepts("CoursePatch", { seats: 20 }));
assert.ok(accepts("CoursePatch", {}));
assert.ok(!accepts("CoursePatch", { title: null }));
assert.ok(!accepts("CoursePatch", { seats: null }));
assert.ok(!accepts("CoursePage", { ...catalogueResponse, courses: Array(21).fill(architectureCourse) }));
assert.ok(!accepts("CoursePage", { courses: catalogueResponse.courses }));

const operationNames = new Set();
let operations = 0;
for (const item of Object.values(api.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!["get", "put", "post", "delete", "patch", "head", "options", "trace"].includes(method)) continue;
    assert.ok(!operationNames.has(operation.operationId));
    operationNames.add(operation.operationId);
    assert.ok(operation.responses);
    for (const [status, response] of Object.entries(operation.responses)) {
      if (status === "204" || status === "304") assert.ok(!response.content, `${status} must not declare a response body`);
    }
    operations++;
  }
}
assert.equal(operations, 7);
const enrollment = api.paths["/courses/{courseId}/enrollments"].post;
assert.equal(enrollment.requestBody, undefined);
assert.ok(enrollment.parameters.some(parameter => parameter.name === "Idempotency-Key" && parameter.required));
assert.ok(enrollment.security.some(requirement => "sessionCookie" in requirement));
const coursePath = api.paths["/courses/{courseId}"];
assert.ok(coursePath.parameters.some(parameter => parameter.name === "courseId" && parameter.in === "path" && parameter.required));
assert.ok(coursePath.put.parameters.some(parameter => parameter.name === "If-Match" && parameter.required));
assert.ok(coursePath.patch.parameters.some(parameter => parameter.name === "If-Match" && parameter.required));
assert.equal(api.components.securitySchemes.sessionCookie.name, "session");

const fixtureProblems = [
  [400, "invalid-course", "Invalid course"],
  [403, "forbidden", "Operation not permitted"],
  [409, "conflict", "Conflicting intent"],
  [412, "stale-write", "Write precondition failed"],
  [429, "rate-limit", "Caller limit reached"],
  [503, "unavailable", "Service temporarily unavailable"],
];
for (const [status, name, title] of fixtureProblems) {
  assert.ok(accepts("Problem", { type: `https://learn.example/problems/${name}`, title, status }));
}

const stableMean = stableObservation.arrivalsPerSecond * stableObservation.meanTimeInSystemSeconds;
assert.equal(stableMean, 5);
const idealCapacity = requestCapacityModel.concurrency / requestCapacityModel.serviceSeconds;
assert.equal(idealCapacity, 80);
const netGrowth = requestCapacityModel.overloadArrivalsPerSecond - idealCapacity;
assert.equal(netGrowth, 20);
assert.equal(requestCapacityModel.waitingCapacity / netGrowth, 2);
assert.equal(requestCapacityModel.waitingCapacity / (idealCapacity - requestCapacityModel.recoveryArrivalsPerSecond), 2);

const pages = [
  "docs/06-GUIDED-ARCHITECTURE.md",
  "docs/lessons/API-CONTRACTS-AND-LIFECYCLE.md",
];
let responseExamples = 0;
for (const page of pages) {
  const content = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  for (const [, body] of content.matchAll(/```json\n([\s\S]*?)```/g)) {
    const example = JSON.parse(body);
    const name = example.id === "course-101" && "title" in example && "seats" in example ? "Course" :
      example.id === "enrollment-42" && "learnerId" in example ? "Enrollment" :
      Array.isArray(example.courses) && "nextCursor" in example ? "CoursePage" : null;
    if (!name) continue;
    assert.ok(accepts(name, example), `${page}: ${name} example violates the shared contract`);
    responseExamples++;
  }
}
assert.ok(responseExamples >= 3, "Expected published Course, CoursePage and Enrollment response examples");
console.log(`OpenAPI 3.1 validated: ${operations} operations, ${validators.size} compiled JSON Schemas, ${responseExamples} canonical lesson response examples.`);
console.log("Passed: rejected incomplete OpenAPI 3.0 and field/type sketches; request/body/header constraints, 204/304 bodylessness, closed-schema/input failures, stable mean and bounded capacity arithmetic.");
console.log("These validate contracts and finite models, not implemented authorization, live proxies, or measured server throughput.");
