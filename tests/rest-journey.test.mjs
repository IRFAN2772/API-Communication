import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const lesson = readFileSync(fileURLToPath(new URL("../docs/01-GUIDED-REST.md", import.meta.url)), "utf8");
const blocks = [...lesson.matchAll(/```(http|json|text)\n([\s\S]*?)\n```/g)]
  .map(([, language, body]) => ({ language, body }));
const jsonBlocks = blocks.filter(({ language }) => language === "json").map(({ body }) => JSON.parse(body));
const httpBlocks = blocks.filter(({ language }) => language === "http").map(({ body }) => body);
const findHttp = prefix => {
  const found = httpBlocks.find(block => block.startsWith(prefix));
  assert.ok(found, `missing HTTP example ${prefix}`);
  return found;
};
const bodyOf = transcript => {
  const separator = transcript.indexOf("\n\n");
  return separator === -1 ? "" : transcript.slice(separator + 2);
};
const parseBody = transcript => JSON.parse(bodyOf(transcript));
const course = (id, title, seats) => ({ id, title, seats });

test("the seven stable destinations, eight steps, and complete branches are present", () => {
  const ids = ["rest-resources", "rest-messages", "rest-collections", "rest-retries", "rest-caching", "rest-production", "rest-data-shape"];
  for (const id of ids) {
    assert.equal([...lesson.matchAll(new RegExp(`<span id="${id}"></span>`, "g"))].length, 1, id);
    assert.match(lesson, new RegExp(`\\]\\(#${id}\\)`));
  }
  assert.equal([...lesson.matchAll(/^## Step [1-8] — /gm)].length, 8);
  for (const name of ["REST-HTTP-CONTRACTS", "REST-COLLECTIONS-AND-CACHING", "REST-AUTH-AND-EVOLUTION", "REST-RELIABILITY-AND-OPERATIONS"]) {
    assert.ok(lesson.includes(`](lessons/${name}.md)`), name);
  }
  for (const reference of ["00-GUIDED-FUNDAMENTALS.md", "01-REST-APIS.md", "02-GRAPHQL.md", "COURSE-CONTENT-MAP.md", "CONTENT-CORRECTIONS.md"]) {
    assert.ok(lesson.includes(reference), reference);
  }
  assert.match(lesson, /original \[Phase 1 reference\]/);
  const referenceRows = lesson.match(/^\| (?:Part [1-6]:|Final REST\/GraphQL)[^\n]+$/gm) ?? [];
  assert.equal(referenceRows.length, 7);
  for (const row of referenceRows) {
    assert.match(row, /\]\(01-REST-APIS\.md\)/);
    assert.doesNotMatch(row, /01-REST-APIS\.md#/);
  }
});

test("closed native HTML checkpoints provide reasoning without Markdown fences", () => {
  const checkpoints = [...lesson.matchAll(/<details class="learning-answer">\n([\s\S]*?)\n<\/details>/g)].map(match => match[1]);
  assert.ok(checkpoints.length >= 8);
  assert.equal((lesson.match(/<details(?:\s[^>]*)?>/g) ?? []).length, checkpoints.length);
  for (const checkpoint of checkpoints) {
    assert.match(checkpoint, /<summary>[\s\S]+?<\/summary>/);
    assert.match(checkpoint, /<p><strong>Reasoning:<\/strong>[\s\S]+?<\/p>/);
    assert.doesNotMatch(checkpoint, /```/);
  }
  assert.match(lesson, /keep the REST read and simple polling/i);
  assert.match(lesson, /library loan succeeds but its reply is lost/i);
});

test("every HTTP JSON body parses; excerpts do not claim framing they omit", () => {
  assert.match(lesson, /HTTP\/1\.1 \*\*excerpt\*\*/);
  assert.match(lesson, /framing headers and wire line\s+endings are deliberately omitted/);
  assert.doesNotMatch(lesson, /api\.example\.test/);
  for (const transcript of httpBlocks) {
    assert.doesNotMatch(transcript, /^Content-Length:/im);
    if (/^(?:GET|POST|PUT|PATCH|DELETE) /.test(transcript)) {
      assert.match(transcript, /^Host: learn\.example$/m);
    }
    const body = bodyOf(transcript);
    if (body && /^Content-Type: application\/(?:json|merge-patch\+json|problem\+json)$/im.test(transcript)) {
      assert.doesNotThrow(() => JSON.parse(body), transcript);
    }
    if (/^HTTP\/1\.1 (?:204|304)\b/.test(transcript)) assert.equal(body, "");
  }
  assert.match(lesson, /204.*304[\s\S]*?no content/i);
  assert.match(lesson, /HEAD requests have GET-like metadata but no response content/i);
});

test("create, read and enrollment retain canonical fields, locations and seat accounting", () => {
  assert.deepEqual(parseBody(findHttp("HTTP/1.1 200 OK\nContent-Type: application/json\n\n")), course("course-101", "API Fundamentals", 30));
  assert.deepEqual(parseBody(findHttp("POST /courses HTTP/1.1")), { title: "REST Studio", seats: 20 });
  const created = findHttp("HTTP/1.1 201 Created\nLocation: /courses/course-102");
  assert.deepEqual(parseBody(created), course("course-102", "REST Studio", 20));
  const enrollmentRequest = findHttp("POST /courses/course-101/enrollments HTTP/1.1");
  assert.match(enrollmentRequest, /Idempotency-Key: enroll-7-a/);
  assert.equal(bodyOf(enrollmentRequest), "");
  const enrollment = findHttp("HTTP/1.1 201 Created\nLocation: /courses/course-101/enrollments/enrollment-42");
  assert.deepEqual(parseBody(enrollment), { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  assert.equal(30 - 1, 29);
  assert.deepEqual(jsonBlocks[0].courses, [course("course-101", "API Fundamentals", 29), course("course-102", "REST Studio", 20)]);
  assert.match(lesson, /subsequent[\s\S]*?retain 29 unless an explicitly independent snapshot/);
});

test("PUT and merge PATCH examples agree with their explicit field semantics", () => {
  const put = parseBody(findHttp("PUT /courses/course-102 HTTP/1.1"));
  const patchRequest = findHttp("PATCH /courses/course-102 HTTP/1.1");
  const patch = parseBody(patchRequest);
  assert.deepEqual(Object.keys(put).sort(), ["seats", "title"]);
  assert.match(patchRequest, /Content-Type: application\/merge-patch\+json/);
  assert.deepEqual({ ...put, ...patch }, { title: "REST Studio", seats: 20 });
  assert.match(lesson, /omitting either required field is a\s+`400`/);
  assert.match(lesson, /`null` would remove a field[\s\S]*?rejected here/);
  assert.match(lesson, /repeat may return `404`[\s\S]*?idempotent/);
});

test("pagination is an ordered continuation over the actual fixtures", () => {
  const [all, first, second] = jsonBlocks;
  assert.equal(all.courses.length, 2);
  const ordered = all.courses.filter(item => item.seats >= 20).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  assert.deepEqual([...first.courses, ...second.courses], ordered);
  assert.equal(first.courses.length, 1);
  for (const page of [all, first, second]) assert.equal(Object.hasOwn(page, "data"), false);
  assert.equal(first.nextCursor, "opaque-page-token");
  assert.equal(second.nextCursor, null);
  assert.match(findHttp("GET /courses?minSeats=20&sort=title&limit=1&cursor="), /cursor=opaque-page-token/);
  assert.match(lesson, /opaque token, not as a course\s+ID/);
  assert.match(lesson, /\*\*live\*\* traversal[\s\S]*?snapshot-based cursor/i);
  assert.match(lesson, /neither approach\s+is universally fastest/);
});

test("retry, validation and cache examples are internally consistent", () => {
  assert.match(lesson, /same key receives\s+the recorded outcome/);
  assert.match(lesson, /different intent returns\s+`409`/);
  assert.match(lesson, /After expiry the key may no longer prevent a duplicate/);
  assert.match(lesson, /atomically or with an equivalent recovery design/);
  assert.match(lesson, /does\s+not automatically make that external effect exactly once/);
  const cached = findHttp("HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: private, max-age=60\nETag: \"course-101-v1\"");
  const revalidate = findHttp("GET /courses/course-101 HTTP/1.1\nHost: learn.example\nAuthorization:");
  const notModified = findHttp("HTTP/1.1 304 Not Modified");
  const changed = findHttp("HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: private, max-age=60\nETag: \"course-101-v2\"");
  assert.deepEqual(parseBody(cached), course("course-101", "API Fundamentals", 29));
  assert.match(revalidate, /If-None-Match: "course-101-v1"/);
  assert.match(notModified, /ETag: "course-101-v1"/);
  assert.equal(bodyOf(notModified), "");
  assert.deepEqual(parseBody(changed), course("course-101", "API Fundamentals", 28));
  assert.match(cached, /Vary: Accept/);
  assert.match(findHttp("PUT /courses/course-101 HTTP/1.1"), /If-Match: "course-101-v1"/);
  assert.match(lesson, /`412 Precondition Failed`[\s\S]*?fetch the current representation[\s\S]*?merge deliberately/);
});

test("failure policies, independent snapshots and primary sources are explicit", () => {
  for (const status of [400, 401, 403, 404, 409, 412, 415, 429, 503]) {
    assert.match(lesson, new RegExp(`\\\`${status} `));
  }
  assert.match(lesson, /Authentication establishes[\s\S]*?authorization evaluates/);
  assert.match(lesson, /independent cache continuation/);
  assert.match(lesson, /return to the main snapshot at 29/);
  for (const rfc of ["rfc9110", "rfc9111", "rfc9457", "rfc7396"]) {
    assert.ok(lesson.includes(`https://www.rfc-editor.org/rfc/${rfc}.html`));
  }
  assert.match(lesson, /https:\/\/developer\.mozilla\.org\//);
});
