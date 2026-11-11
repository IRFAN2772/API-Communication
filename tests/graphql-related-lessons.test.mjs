import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { authorFixtures, courseFixtures, lessonSchema } from "../assets/graphql-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const paths = [
  "docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING.md",
  "docs/lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md",
];
const pages = paths.map(path => readFileSync(new URL(path, root), "utf8"));
const [execution, production] = pages;
const blocks = (page, language) =>
  [...page.matchAll(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, "g"))]
    .map(match => match[1]);
const json = page => blocks(page, "json").map(JSON.parse);

test("selected JSON uses the shared snapshot, aliases and directives", () => {
  const examples = json(execution);
  const [first, second] = courseFixtures;
  assert.deepEqual(examples[1], {
    data: { course: { id: first.id, title: first.title, seats: first.seats } },
  });
  assert.deepEqual(examples[3], {
    data: {
      firstCard: { id: first.id, title: first.title, progress: first.progress },
      secondCard: { id: second.id, title: second.title },
    },
  });
  assert.equal(Object.hasOwn(examples[3].data.secondCard, "progress"), false);
  assert.deepEqual(examples[6], {
    input: { courseId: first.id, idempotencyKey: "enroll-7-a" },
  });
  assert.deepEqual(examples[7], {
    data: { enroll: {
      enrollment: { id: "enrollment-42", courseId: first.id, learnerId: "learner-7" },
      course: { id: first.id, seats: first.seats - 1 },
    } },
  });
  for (const page of pages) assert.ok(json(page).length > 0);
});

test("field error examples preserve sibling data and the original error paths", () => {
  const examples = json(execution);
  const progressError = examples[4];
  assert.equal(progressError.data.course.progress, null);
  assert.equal(progressError.data.course.title, courseFixtures[0].title);
  assert.equal(progressError.data.me.id, "learner-7");
  assert.deepEqual(progressError.errors[0].path, ["course", "progress"]);
  const authorError = examples[5];
  assert.equal(authorError.data.course, null);
  assert.equal(authorError.data.me.id, "learner-7");
  assert.deepEqual(authorError.errors[0].path, ["course", "author", "name"]);
  assert.match(lessonSchema, /author: Author!/);
  assert.match(lessonSchema, /name: String!/);
  assert.match(lessonSchema, /course\(id: ID!\): Course\b/);
  assert.match(execution, /`errors` but no `data` entry/);
});

test("list nullability distinguishes failed item, failed list, and enclosing boundary", () => {
  const itemFailure = nonNullItems => nonNullItems ? null : [{ id: "course-101" }, null];
  const listFailure = nonNullList => nonNullList ? "bubble to containing boundary" : null;
  assert.equal(itemFailure(true), null); // [Course!]
  assert.deepEqual(itemFailure(false), [{ id: "course-101" }, null]); // [Course]!
  assert.equal(listFailure(false), null);
  assert.equal(listFailure(true), "bubble to containing boundary");
  assert.match(execution, /\[Course!\].*nullable list, non-null items/);
  assert.match(execution, /\[Course\]!.*non-null list, nullable items/);
  assert.match(execution, /`\["items",1,"title"\]`/);
});

test("naive and aligned batched author reads have the stated counts", () => {
  let calls = 0;
  const courses = () => { calls++; return courseFixtures; };
  const author = id => { calls++; return authorFixtures.find(row => row.id === id) ?? null; };
  const selected = courses();
  assert.deepEqual(selected.map(row => author(row.authorId).name), ["API Team", "REST Team"]);
  assert.equal(calls, 3);

  calls = 0;
  courses();
  const keys = ["author-2", "author-1", "missing"];
  calls++;
  const rowsFromDatabase = [...authorFixtures].reverse();
  const byId = new Map(rowsFromDatabase.map(row => [row.id, row]));
  assert.deepEqual(keys.map(key => byId.get(key)?.name ?? null), ["REST Team", "API Team", null]);
  assert.equal(calls, 2);
  assert.match(execution, /1 \+ 2 = 3/);
  assert.match(execution, /\*\*2\*\* database calls/);
  assert.match(execution, /different dispatch windows/);
  assert.match(execution, /clear and prime/);
});

test("cardinality model and first bounds have calculable behavior", () => {
  const cost = first => 2 + 5 * first;
  assert.equal(cost(2), 12);
  assert.equal(cost(20), 102);
  assert.equal(cost(20) * 2, 204);
  const validFirst = first => Number.isInteger(first) && first >= 1 && first <= 20;
  assert.deepEqual([0, 1, 2, 20, 21, 100].map(validFirst), [false, true, true, true, false, false]);
  assert.match(production, /`1 \+ 1 \+ 20 \* 5 = 102`/);
  assert.match(production, /bound of 204 units/);
  assert.match(execution, /between\s+1 and 20 inclusive/);
  assert.match(production, /before database access/);
});

test("the documented request body limit counts bytes, not characters", () => {
  const maxBytes = 16_384;
  const accepted = body => Buffer.byteLength(body, "utf8") <= maxBytes;
  assert.equal(accepted("a".repeat(maxBytes)), true);
  assert.equal(accepted("a".repeat(maxBytes + 1)), false);
  assert.equal(accepted("é".repeat(maxBytes / 2)), true);
  assert.equal(accepted("é".repeat(maxBytes / 2 + 1)), false);
  assert.match(production, /entire decoded request body at\s+16,384 bytes/);
  assert.match(production, /after\s+decompression/);
});

test("evolution and subscription JSON are selected snapshots, not guarantees", () => {
  const [before, after, progress20, progress40] = json(production);
  const course = courseFixtures[0];
  assert.deepEqual(before, { data: { course: { id: course.id, title: course.title, seats: course.seats } } });
  assert.deepEqual(after, { data: { course: { ...before.data.course, description: "An introduction" } } });
  assert.deepEqual(progress20, { data: { courseProgress: course.progress } });
  assert.deepEqual(progress40, { data: { courseProgress: { percentComplete: 40 } } });
  assert.match(production, /hypothetical schema change/);
  assert.match(production, /does not promise\s+an initial snapshot/);
  assert.match(production, /no event ID/);
});

test("both lessons link to related material and local anchors exist", () => {
  for (const [index, path] of paths.entries()) {
    const page = pages[index];
    for (const target of [
      "../02-GUIDED-GRAPHQL.md", "../02-GRAPHQL.md", "../COURSE-CONTENT-MAP.md",
      "../CONTENT-CORRECTIONS.md", "../00-GUIDED-FUNDAMENTALS.md",
      "REST-RELIABILITY-AND-OPERATIONS.md",
      index === 0 ? "GRAPHQL-COST-CACHING-AND-EVOLUTION.md" : "GRAPHQL-EXECUTION-AND-BATCHING.md",
    ]) assert.ok(page.includes(`](${target})`), `${path}: ${target}`);
    for (const [, target] of page.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      const [file, fragment] = target.split("#");
      const url = file ? new URL(file, new URL(path, root)) : new URL(path, root);
      assert.ok(existsSync(url), `${path}: ${target}`);
      if (fragment) {
        const content = readFileSync(url, "utf8");
        const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
          heading.toLowerCase().replace(/[^\w -]/g, "").replace(/ /g, "-"));
        assert.ok(headings.includes(fragment) || content.includes(`id="${fragment}"`), target);
      }
    }
  }
});

test("native answers are closed, plaintext HTML and diagrams are bounded", () => {
  for (const page of pages) {
    const answers = [...page.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
    assert.ok(answers.length >= 5);
    assert.equal((page.match(/<details\b/g) ?? []).length, answers.length);
    assert.equal((page.match(/<\/details>/g) ?? []).length, answers.length);
    for (const [, body] of answers) {
      assert.match(body, /^\s*<summary>(?:Predict|Check):[^<]+<\/summary>\s*<p>[^<]+<\/p>\s*$/);
      assert.doesNotMatch(body, /`|\[[^\]]+\]\(|\*\*|<script\b/i);
    }
    assert.doesNotMatch(page, /<script\b|<details[^>]*\bopen\b/i);
    assert.ok(blocks(page, "mermaid").length <= 2);
  }
});
