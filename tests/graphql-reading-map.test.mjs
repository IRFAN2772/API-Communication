import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { collectHeadings, chapters } from "../assets/course-coverage.mjs";
import { mapGraphqlHeadings, graphqlReadingDestinations } from "../assets/graphql-reading-map.mjs";
import { lessonSchema, lessonOperations, courseFixtures, authorFixtures } from "../assets/graphql-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every original GraphQL heading retains its exact source and has a reading destination", () => {
  const source = read("docs/02-GRAPHQL.md");
  const mapped = mapGraphqlHeadings(source);
  assert.equal(mapped.length, chapters.find(chapter => chapter.filename === "02-GRAPHQL.md").headingCount);
  assert.deepEqual(mapped.map(({ line, level, text }) => ({ line, level, text })), collectHeadings(source));
  for (const item of mapped) {
    assert.equal(item.source, "docs/02-GRAPHQL.md");
    assert.ok(existsSync(new URL(item.recommended, root)));
    if (item.anchor) assert.ok(read(item.recommended).includes(`id="${item.anchor}"`), item.anchor);
  }
});

test("schema, queries, execution, mutations and production concerns receive distinct destinations", () => {
  const mapped = mapGraphqlHeadings(read("docs/02-GRAPHQL.md"));
  const familyFor = title => mapped.find(item => item.text === title)?.family;
  assert.equal(familyFor("Chapter 4 — Schema"), "schema");
  assert.equal(familyFor("Chapter 3 — GraphQL Query"), "query");
  assert.equal(familyFor("Chapter 5 — Resolver"), "execution");
  assert.equal(familyFor("Chapter 6 — Mutation"), "mutation");
  assert.equal(familyFor("Chapter 2 — DataLoader"), "execution");
  assert.equal(familyFor("Chapter 4 — Query Complexity Problem"), "cost");
  assert.equal(familyFor("Chapter 7 — GraphQL Federation"), "cost");
});

test("related lessons are complete reachable branches, not orphaned source files", () => {
  const core = read("docs/02-GUIDED-GRAPHQL.md");
  const library = read("docs/COURSE-CONTENT-MAP.md");
  for (const destination of graphqlReadingDestinations.filter(item => item.path.startsWith("docs/lessons/"))) {
    const relative = destination.path.slice("docs/".length);
    assert.ok(core.includes(`](${relative})`));
    assert.ok(library.includes(`](${relative})`));
    assert.ok(read(destination.path).includes("](../02-GUIDED-GRAPHQL.md)"));
    assert.ok(read(destination.path).includes("](../02-GRAPHQL.md)"));
  }
});

test("shared fixtures keep the existing course, learner-facing state and declared contract", () => {
  assert.deepEqual(courseFixtures.map(({ id, title, seats }) => ({ id, title, seats })), [
    { id: "course-101", title: "API Fundamentals", seats: 30 },
    { id: "course-102", title: "REST Studio", seats: 20 },
  ]);
  assert.ok(courseFixtures.every(course => authorFixtures.some(author => author.id === course.authorId)));
  for (const field of ["course", "courses", "me", "enroll", "createCourse", "updateCourse", "deleteCourse", "courseProgress"]) {
    assert.match(lessonSchema, new RegExp(`\\b${field}[(:]`));
  }
  assert.equal(Object.keys(lessonOperations).length, 5);
});
