import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expertCourse, proposedCourseRepresentation } from "../assets/expert-lesson-fixtures.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lesson = read("docs/lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md");
const contract = JSON.parse(read("docs/contracts/course_api.openapi.json"));

function example(name) {
  const marker = `<!-- example: ${name} -->`;
  assert.equal(lesson.split(marker).length, 2, `one ${name} marker required`);
  const match = lesson.slice(lesson.indexOf(marker) + marker.length).match(/^\s*```json\n([\s\S]*?)\n```/);
  assert.ok(match, `${name} needs an adjacent JSON fence`);
  return JSON.parse(match[1]);
}

test("marked examples reproduce their source-owned fixtures", () => {
  assert.deepEqual(example("current-course-response"), expertCourse);
  assert.deepEqual(example("proposed-course-response"), proposedCourseRepresentation);
  const interaction = example("consumer-interaction");
  assert.equal(typeof interaction.providerState, "string");
  assert.ok(interaction.providerState.length > 0);
  assert.deepEqual(interaction.request, { method: "GET", path: "/courses/course-101" });
  assert.deepEqual(interaction.response, { status: 200, body: expertCourse });
  for (const [, body] of lesson.matchAll(/```json\n([\s\S]*?)\n```/g)) JSON.parse(body);
  assert.match(lesson, /```json-invalid/);
});

test("the old closed course schema rejects the proposed field", () => {
  const schema = contract.components.schemas.Course;
  assert.deepEqual(schema.required, ["id", "title", "seats"]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(expertCourse).sort(), Object.keys(schema.properties).sort());
  const extra = Object.keys(proposedCourseRepresentation).filter(key => !Object.hasOwn(schema.properties, key));
  assert.deepEqual(extra, ["summary"]);
  assert.match(lesson, /fails the old closed `Course` schema/);
  assert.match(lesson, /tolerant subset consumer/i);
});

test("lesson addresses directional and behavioral compatibility and migration", () => {
  for (const topic of [/Old consumer → new provider/, /New consumer → old provider/, /defaults/i, /status/i, /cursor/i, /enum/i, /Postel/i, /security/i, /rollback/i, /deprecation/i, /offline clients/i]) {
    assert.match(lesson, topic);
  }
  assert.match(lesson, /TEACHING MODEL/);
  assert.match(lesson, /not serialized Pact/i);
  assert.match(lesson, /not an\s+executed Pact test/i);
  for (const topic of [/provider state/i, /matchers?/i, /broker/i, /matrix/i, /CI/i, /OpenAPI/i, /end-to-end/i, /event/i, /deduplication/i]) {
    assert.match(lesson, topic);
  }
});

test("native closed answers provide prediction and transfer exercises", () => {
  const details = [...lesson.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.equal((lesson.match(/<details\b/g) ?? []).length, details.length);
  assert.ok(details.length >= 8);
  for (const [, attributes, body] of details) {
    assert.equal(attributes.trim(), 'class="learning-answer"');
    assert.match(body, /^\s*<summary>[\s\S]+?<\/summary>\s*<p>[\s\S]+<\/p>\s*$/);
    assert.doesNotMatch(body, /`|\*\*|\[[^\]]+\]\([^)]+\)/);
  }
  assert.match(lesson, /keep the simple solution/i);
  assert.match(lesson, /transfer the contract to a parcel tracking event/i);
  const lines = lesson.split("\n").length;
  assert.ok(lines >= 400 && lines <= 501, `length ${lines}`);
});
