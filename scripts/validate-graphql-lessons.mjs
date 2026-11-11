import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lessonSchema, lessonOperations, courseFixtures, authorFixtures } from "../assets/graphql-lesson-fixtures.mjs";

const require = createRequire(import.meta.url);
const engine = require(process.argv[2] ? resolve(process.argv[2]) : "graphql");
const { buildSchema, parse, validate, graphql, subscribe, defaultFieldResolver } = engine;
const schema = buildSchema(lessonSchema);
const pages = [
  "docs/02-GUIDED-GRAPHQL.md",
  "docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING.md",
  "docs/lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md",
];
let documents = 0;
let expectedRejections = 0;
for (const page of pages) {
  const content = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  for (const [, language, source] of content.matchAll(/```(graphql(?:-invalid)?)\n([\s\S]*?)```/g)) {
    let errors;
    try {
      const document = parse(source);
      if (document.definitions.some(definition => /^(?:Operation|Fragment)Definition$/.test(definition.kind))) {
        errors = validate(schema, document);
      } else {
        buildSchema(source);
        errors = [];
      }
    } catch (error) {
      if (language !== "graphql-invalid") throw error;
      errors = [error];
    }
    if (language === "graphql-invalid") {
      assert.ok(errors.length, `${page}: an intentionally invalid example was accepted`);
      expectedRejections++;
    } else {
      assert.equal(errors.length, 0, `${page}: ${errors.map(error => error.message).join("; ")}`);
      documents++;
    }
  }
}

function world({ batchAuthors = false, denyAuthor = false, denyAuthorName = false, denyProgress = false } = {}) {
  const courses = structuredClone(courseFixtures);
  const replay = new Map();
  const counts = { courseReads: 0, authorReads: 0, enrollments: 0 };
  let authorBatch;
  const contextValue = { learnerId: "learner-7" };
  const rootValue = {
    course({ id }) {
      counts.courseReads++;
      return courses.find(course => course.id === id) || null;
    },
    courses({ first = 2 }) {
      if (!Number.isInteger(first) || first < 1 || first > 20) throw new Error("first must be 1–20");
      counts.courseReads++;
      const selected = courses.slice(0, first);
      return {
        edges: selected.map((course, index) => ({ cursor: `opaque-${index + 1}`, node: course })),
        pageInfo: { hasNextPage: courses.length > selected.length, endCursor: selected.length ? `opaque-${selected.length}` : null },
      };
    },
    me() {
      return { id: contextValue.learnerId, enrollments: [...replay.values()].map(value => value.enrollment) };
    },
    enroll({ input }) {
      if (!input.idempotencyKey) throw new Error("An idempotency key is required");
      const key = `${contextValue.learnerId}:enroll:${input.idempotencyKey}`;
      if (replay.has(key)) {
        const saved = replay.get(key);
        if (saved.enrollment.courseId !== input.courseId) throw new Error("Key reused for a different course");
        return saved;
      }
      const course = courses.find(item => item.id === input.courseId);
      if (!course || course.seats < 1) throw new Error("Course unavailable");
      const enrollment = { id: "enrollment-42", courseId: course.id, learnerId: contextValue.learnerId };
      course.seats--;
      course.enrollment = enrollment;
      const result = { enrollment, course: structuredClone(course) };
      replay.set(key, result);
      counts.enrollments++;
      return result;
    },
    async *courseProgress() {
      yield { courseProgress: { percentComplete: 20 } };
      yield { courseProgress: { percentComplete: 40 } };
    },
  };
  const fieldResolver = async (source, args, context, info) => {
    if (denyProgress && info.parentType.name === "Course" && info.fieldName === "progress") {
      throw new Error("Progress access denied");
    }
    if (denyAuthorName && info.parentType.name === "Author" && info.fieldName === "name") {
      throw new Error("Author name unavailable");
    }
    if (info.parentType.name === "Course" && info.fieldName === "author") {
      if (denyAuthor) throw new Error("Author field denied in this test");
      if (!batchAuthors) {
        counts.authorReads++;
        return authorFixtures.find(author => author.id === source.authorId);
      }
      // This finite fixture models one batched lookup, not a production DataLoader.
      authorBatch ??= Promise.resolve().then(() => {
        counts.authorReads++;
        return new Map(authorFixtures.map(author => [author.id, author]));
      });
      return (await authorBatch).get(source.authorId);
    }
    return defaultFieldResolver(source, args, context, info);
  };
  return {
    counts,
    courses,
    rootValue,
    contextValue,
    fieldResolver,
    run(source, variableValues) {
      return graphql({ schema, source, variableValues, rootValue, contextValue, fieldResolver });
    },
  };
}

const plain = value => JSON.parse(JSON.stringify(value));
const read = world();
assert.deepEqual(plain((await read.run(lessonOperations.course, { id: "course-101" })).data),
  { course: { id: "course-101", title: "API Fundamentals", seats: 30 } });
assert.deepEqual(plain((await read.run(lessonOperations.course, { id: "missing" })).data), { course: null });

const invalid = world();
const invalidField = await invalid.run("query { course(id: \"course-101\") { nonexistent } }");
assert.ok(invalidField.errors?.length);
assert.equal(invalid.counts.courseReads, 0);
const invalidVariables = await invalid.run(lessonOperations.catalogue, { first: "two" });
assert.ok(invalidVariables.errors?.length);
assert.equal(invalid.counts.courseReads, 0);

const denied = await world({ denyAuthor: true }).run('query { course(id: "course-101") { title author { name } } me { id } }');
assert.deepEqual(plain(denied.data), { course: null, me: { id: "learner-7" } });
assert.deepEqual(denied.errors[0].path, ["course", "author"]);
const deniedName = await world({ denyAuthorName: true }).run(lessonOperations.dashboard, { id: "course-101" });
assert.deepEqual(plain(deniedName.data), { course: null, me: { id: "learner-7" } });
assert.deepEqual(deniedName.errors[0].path, ["course", "author", "name"]);
const partial = await world({ denyProgress: true }).run(lessonOperations.dashboard, { id: "course-101" });
assert.deepEqual(plain(partial.data), {
  course: { title: "API Fundamentals", seats: 30, author: { name: "API Team" }, progress: null, enrollment: null },
  me: { id: "learner-7" },
});
assert.deepEqual(partial.errors[0].path, ["course", "progress"]);

for (const type of ["[Course!]", "[Course]!"]) {
  const listSchema = buildSchema(`type Course { title: String! } type Query { items: ${type} }`);
  const result = await graphql({
    schema: listSchema,
    source: "{ items { title } }",
    rootValue: { items: [{ title: "API Fundamentals" }, { title: null }] },
  });
  assert.deepEqual(result.errors[0].path, ["items", 1, "title"]);
  assert.deepEqual(plain(result.data), { items: type === "[Course!]" ? null : [{ title: "API Fundamentals" }, null] });
}

const naive = world();
const batched = world({ batchAuthors: true });
const naiveResult = await naive.run(lessonOperations.catalogue, { first: 2 });
const batchedResult = await batched.run(lessonOperations.catalogue, { first: 2 });
assert.deepEqual(plain(naiveResult.data), plain(batchedResult.data));
assert.deepEqual([naive.counts.courseReads, naive.counts.authorReads], [1, 2]);
assert.deepEqual([batched.counts.courseReads, batched.counts.authorReads], [1, 1]);

const enrollment = world();
const input = { courseId: "course-101", idempotencyKey: "enroll-7-a" };
const first = await enrollment.run(lessonOperations.enroll, { input });
const retry = await enrollment.run(lessonOperations.enroll, { input });
assert.deepEqual(plain(first.data), plain(retry.data));
assert.equal(first.data.enroll.enrollment.id, "enrollment-42");
assert.equal(first.data.enroll.course.seats, 29);
assert.equal(enrollment.counts.enrollments, 1);
const conflict = await enrollment.run(lessonOperations.enroll, { input: { ...input, courseId: "course-102" } });
assert.ok(conflict.errors?.length);
assert.equal(conflict.data.enroll, null);
assert.equal(enrollment.counts.enrollments, 1);

const streaming = world();
const stream = await subscribe({
  schema,
  document: parse(lessonOperations.progress),
  variableValues: { courseId: "course-101" },
  rootValue: streaming.rootValue,
  contextValue: streaming.contextValue,
});
assert.ok(stream[Symbol.asyncIterator], "Subscription should produce an async event stream");
const events = [];
for await (const event of stream) {
  assert.ok(!event.errors);
  events.push(event.data.courseProgress.percentComplete);
}
assert.deepEqual(events, [20, 40]);

console.log(`GraphQL ${engine.version}: ${documents} valid documents, ${expectedRejections} intentional rejections.`);
console.log("Execution probes passed: selection, null/error propagation, validation-before-read, N+1/batching, enrollment/replay/conflict, and two subscription events.");
