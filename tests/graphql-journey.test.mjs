import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lessonSchema, lessonOperations, courseFixtures, authorFixtures } from "../assets/graphql-lesson-fixtures.mjs";

const lesson = readFileSync(new URL("../docs/02-GUIDED-GRAPHQL.md", import.meta.url), "utf8");
const fences = [...lesson.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
  .map(([, language, body]) => ({ language, body }));
const graphql = fences.filter(block => block.language === "graphql").map(block => block.body);
const json = fences.filter(block => block.language === "json").map(block => JSON.parse(block.body));
const compact = text => text.replace(/\s+/g, "");
const section = (start, end) => lesson.slice(lesson.indexOf(start), end ? lesson.indexOf(end) : undefined);

const author = name => ({ name });
const dashboard = {
  title: "API Fundamentals", seats: 30, author: author("API Team"),
  progress: { percentComplete: 20 }, enrollment: null,
};

test("the journey has stable anchors, complete branches and reference routes", () => {
  for (const id of ["graphql-choice", "graphql-schema", "graphql-query", "graphql-execution", "graphql-mutation", "graphql-cost", "graphql-next"]) {
    assert.equal((lesson.match(new RegExp(`<span id="${id}"></span>`, "g")) ?? []).length, 1, id);
    assert.ok(lesson.includes(`](#${id})`), id);
  }
  assert.equal((lesson.match(/^## Step [1-7] — /gm) ?? []).length, 7);
  assert.ok(lesson.split("\n").length >= 450 && lesson.split("\n").length <= 600);
  for (const path of ["01-GUIDED-REST.md", "02-GRAPHQL.md", "03-RPC-AND-GRPC.md", "COURSE-CONTENT-MAP.md", "CONTENT-CORRECTIONS.md", "lessons/GRAPHQL-EXECUTION-AND-BATCHING.md", "lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md"]) {
    assert.ok(lesson.includes(`](${path})`), path);
  }
  assert.doesNotMatch(lesson, /\]\(02-GRAPHQL\.md#/);
  const table = section("## Route through the original reference", '<span id="graphql-choice">');
  for (const topic of ["Why GraphQL", "Schema", "Resolvers", "Mutations", "Depth", "Caching", "Subscriptions", "Apollo", "federation"]) assert.ok(table.includes(topic), topic);
});

test("fences are closed, schema matches the shared contract and operations match fixtures", () => {
  assert.equal((lesson.match(/^```/gm) ?? []).length, fences.length * 2);
  assert.deepEqual(new Set(fences.map(block => block.language)), new Set(["graphql", "json"]));
  assert.equal(graphql.length, 6);
  assert.equal(compact(graphql[0]), compact(lessonSchema));
  for (const [index, name] of ["course", "dashboard", "catalogue", "enroll", "progress"].entries()) {
    assert.equal(compact(graphql[index + 1]), compact(lessonOperations[name]), name);
  }
  assert.match(graphql[1], /query CourseCard\(\$id: ID!\)/);
  assert.match(graphql[3], /query Catalogue\(\$first: Int!\)/);
  assert.match(graphql[4], /mutation Enroll\(\$input: EnrollInput!\)/);
  assert.match(graphql[5], /subscription Progress\(\$courseId: ID!\)/);
  assert.match(lesson, /`operationName` equal to `CourseCard`/);
});

test("every checkpoint is closed native HTML with a plain reasoning answer", () => {
  const answers = [...lesson.matchAll(/<details class="learning-answer">\n([\s\S]*?)\n<\/details>/g)].map(match => match[1]);
  assert.equal(answers.length, 8);
  assert.equal((lesson.match(/<details\b[^>]*>/g) ?? []).length, answers.length);
  for (const answer of answers) {
    assert.match(answer, /<summary>Predict:[\s\S]*?<\/summary>/);
    assert.match(answer, /<p><strong>Reasoning:<\/strong>[\s\S]*?<\/p>/);
    assert.doesNotMatch(answer, /```/);
  }
  assert.match(lesson, /keep the REST read and bounded polling/);
  assert.match(lesson, /library loan mutation/);
});

test("card and dashboard JSON have exactly the selected shape and canonical state", () => {
  assert.equal(json.length, 12);
  assert.deepEqual(json[0], { id: "course-101" });
  assert.deepEqual(json[1], { data: { course: { id: "course-101", title: "API Fundamentals", seats: 30 } } });
  assert.deepEqual(json[2], { data: { course: dashboard, me: { id: "learner-7" } } });
  assert.deepEqual(json[3], { data: { course: null, me: { id: "learner-7" } } });
  assert.deepEqual(courseFixtures.map(({ id, title, seats }) => ({ id, title, seats })), [
    { id: "course-101", title: "API Fundamentals", seats: 30 },
    { id: "course-102", title: "REST Studio", seats: 20 },
  ]);
  assert.deepEqual(authorFixtures, [{ id: "author-1", name: "API Team" }, { id: "author-2", name: "REST Team" }]);
  assert.deepEqual(courseFixtures[0].progress, { percentComplete: 20 });
});

test("nullable and non-null errors have exact data and original error paths", () => {
  assert.deepEqual(json[4], {
    data: { course: { ...dashboard, progress: null }, me: { id: "learner-7" } },
    errors: [{ message: "Progress access denied", path: ["course", "progress"] }],
  });
  assert.deepEqual(json[5], {
    data: { course: null, me: { id: "learner-7" } },
    errors: [{ message: "Author name unavailable", path: ["course", "author", "name"] }],
  });
  assert.match(lesson, /`String!`[\s\S]*?`author: Author!`[\s\S]*?nullable\s+`course`/);
  assert.match(lesson, /validation[\s\S]*?prevents execution/);
  assert.match(lesson, /HTTP 200 for executed operations[\s\S]*?HTTP 400/);
  assert.match(lesson, /chosen contract, not a\s+claim that all GraphQL responses are 200/);
});

test("catalogue connection follows the typed selection and batching arithmetic", () => {
  assert.deepEqual(json[6], { first: 2 });
  assert.deepEqual(json[7], { data: { courses: {
    edges: [
      { node: { id: "course-101", title: "API Fundamentals", author: author("API Team") } },
      { node: { id: "course-102", title: "REST Studio", author: author("REST Team") } },
    ],
    pageInfo: { hasNextPage: false, endCursor: "cursor-102" },
  } } });
  assert.equal(1 + courseFixtures.length, 3);
  assert.equal(1 + 1, 2);
  assert.match(lesson, /1 \+ 2 = 3 database calls/);
  assert.match(lesson, /1 \+ 1 = 2/);
  assert.match(lesson, /different envelope, not a silently renamed REST response/);
  assert.match(lesson, /accepts `first` from 1 through\s+20 inclusive/);
});

test("enrollment and subscription preserve principal, selection and independent state", () => {
  assert.deepEqual(json[8], { input: { courseId: "course-101", idempotencyKey: "enroll-7-a" } });
  assert.deepEqual(json[9], { data: { enroll: {
    enrollment: { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" },
    course: { id: "course-101", seats: 29 },
  } } });
  assert.equal(courseFixtures[0].seats - 1, json[9].data.enroll.course.seats);
  assert.deepEqual(json[10], { courseId: "course-101" });
  // The final event response is also parsed and checked below.
});

test("event result and production policies are explicit", () => {
  const last = JSON.parse(fences.filter(block => block.language === "json").at(-1).body);
  assert.deepEqual(last, { data: { courseProgress: { percentComplete: 40 } } });
  for (const pattern of [
    /top-level mutation fields serially/, /not a global transaction/,
    /same\s+intent with the same key/, /within its documented retention period/,
    /does not grant data access/, /not synonymous with the HTTP GET method/,
    /mutations must not be executed through HTTP GET/,
    /Depth limits bound nesting but not list/, /authorization at fields and\s+objects/,
    /not a complete Apollo framework lab/, /parallel typed-call design/,
  ]) assert.match(lesson, pattern);
});
