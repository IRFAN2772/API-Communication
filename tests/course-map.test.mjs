import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { coursePhases, companionGuides, requestHops, lessonRoute } from "../assets/course-map.mjs";

const root = new URL("../", import.meta.url);
const sidebar = readFileSync(new URL("_sidebar.md", root), "utf8");
const readme = readFileSync(new URL("README.md", root), "utf8");

test("the map has eight numbered phases and two distinct companion guides", () => {
  assert.deepEqual(coursePhases.map(phase => phase.number), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(companionGuides.length, 2);
  assert.ok(companionGuides.every(guide => !("number" in guide)));
  assert.equal(new Set([...coursePhases, ...companionGuides].map(lesson => lesson.id)).size, 10);
  assert.deepEqual(coursePhases.filter(phase => phase.visual).map(phase => phase.number), [0, 1]);
});

test("every route matches the actual sidebar and an existing lesson", () => {
  for (const lesson of [...coursePhases, ...companionGuides]) {
    assert.ok(sidebar.includes(`](/${lesson.path})`), lesson.path);
    assert.ok(existsSync(new URL(lesson.path, root)), lesson.path);
    assert.equal(lessonRoute(lesson.path), `#/${lesson.path.slice(0, -3)}`);
    assert.ok(lesson.prerequisite.length > 25);
    assert.equal(lesson.outcomes.length, 3);
    assert.ok(lesson.outcomes.every(outcome => outcome.length > 20));
  }
  assert.throws(() => lessonRoute("javascript:alert(1)"), RangeError);
  assert.throws(() => lessonRoute("docs/07-EXPERT-API-DESIGN.md"), RangeError);
});

test("the README offers all real static lesson links without new custom headings", () => {
  const fallback = readme.match(/<course-map>([\s\S]*?)<\/course-map>/)?.[1];
  assert.ok(fallback);
  assert.equal(/<h[1-6]\b/i.test(fallback), false);
  for (const lesson of [...coursePhases, ...companionGuides]) {
    assert.ok(fallback.includes(`href="${lesson.path}"`), lesson.path);
  }
  assert.equal(readme.includes("Overall Completion: 100%"), false);
  assert.ok(readme.includes("## 🧭 Quick Navigation"));
  assert.ok(readme.includes("## 📐 The Senior Decision Framework"));
  assert.ok(readme.includes("## 📚 Sources & References"));
});

test("the illustrative request has four finite hops and explains the optional event branch", () => {
  assert.equal(requestHops.length, 4);
  assert.deepEqual(requestHops.map(hop => hop.wire), ["outbound", "routing", "storage", "return"]);
  assert.ok(requestHops.every(hop => hop.title && hop.text && hop.active));
  assert.match(requestHops.at(-1).text, /optional deferred work/);
});
