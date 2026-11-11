import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const journey = readFileSync(new URL("../docs/00-GUIDED-FUNDAMENTALS.md", import.meta.url), "utf8");
const blocks = [...journey.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(([, language, content]) => ({ language, content }));
const json = blocks.filter(block => block.language === "json").map(block => JSON.parse(block.content));
// Split only on level-two headings, so later lessons cannot become part of step 6.
const chunks = journey.split(/(?=^## )/m);
const steps = chunks.filter(chunk => /^## Step /m.test(chunk));
const lesson = heading => chunks.find(chunk => chunk.startsWith(`## ${heading}\n`));
const disclosures = text => [...text.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];

test("six paced steps keep a problem, mechanism, limitation, fit, and reasoning checkpoint", () => {
  assert.deepEqual(steps.map(step => step.split("\n")[0]), [
    "## Step 1 — A click becomes a request",
    "## Step 2 — Protect the boundary and distinguish outcomes",
    "## Step 3 — Enrollment changes the retry problem",
    "## Step 4 — The catalogue grows",
    "## Step 5 — Enrollment should not wait for email",
    "## Step 6 — Progress needs fresher updates",
  ]);
  steps.forEach((step, index) => {
    assert.match(step, /### /);
    assert.match(step, /(?:limitation|Limitation|cost|costs)/);
    assert.match(step, /\*\*Predict:/);
    const answers = disclosures(step);
    assert.equal(answers.length, 1, `step ${index + 1} has one answer`);
    assert.ok(step.indexOf("**Predict:") < step.indexOf("<details"));
  });
  assert.equal((journey.match(/\*\*Predict:/g) || []).length, 6);
  assert.ok(blocks.filter(block => ["mermaid", "text"].includes(block.language)).length <= 3);
});

test("all reasoning disclosures are native, closed, and render without Markdown", () => {
  const answers = disclosures(journey);
  assert.equal(answers.length, 9);
  assert.equal((journey.match(/<details\b/g) || []).length, answers.length);
  for (const [, body] of answers) {
    assert.match(body, /^\s*<summary>Reveal reasoning<\/summary>\s*<p><strong>Reasoning:<\/strong>[\s\S]+<\/p>\s*$/);
    assert.doesNotMatch(body, /```|`|\*\*|\[[^\]]+\]\(/);
    assert.doesNotMatch(body, /&(?!amp;|lt;|gt;|quot;|#\d+;|#x[\da-f]+;)/i);
  }
});

test("the first read is a separate, completely framed request and an exact response", () => {
  const request = blocks.find(block => block.language === "http" && block.content.startsWith("GET /courses/course-101 HTTP/1.1"));
  const response = blocks.find(block => block.language === "http" && block.content.startsWith("HTTP/1.1 200"));
  assert.ok(request);
  assert.ok(response);
  assert.ok(request.content.endsWith("\n\n"), "The request headers end with an empty line");
  const [headers, bodyWithNewline] = response.content.split("\n\n");
  const body = bodyWithNewline.trimEnd();
  const length = Number(headers.match(/Content-Length: (\d+)/)?.[1]);
  assert.equal(length, 57);
  assert.equal(Buffer.byteLength(body), length);
  assert.deepEqual(JSON.parse(body), { id: "course-101", title: "API Fundamentals", seats: 30 });
  assert.match(headers, /Content-Type: application\/json/);
});

test("enrollment and catalogue keep the same learner, course IDs, titles, and seat meaning", () => {
  const enrollment = json.find(body => body.id === "enrollment-42");
  assert.deepEqual(enrollment, { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" });
  const catalogue = json.find(body => Array.isArray(body.courses));
  assert.deepEqual(catalogue.courses, [
    { id: "course-101", title: "API Fundamentals", seats: 29 },
    { id: "course-102", title: "REST Studio", seats: 20 },
  ]);
  assert.equal(catalogue.nextCursor, "next-page-token");
  assert.equal(30 - 1, catalogue.courses[0].seats);
  assert.ok(!journey.includes("seatsAvailable"));
  assert.match(journey, /rewinds[\s\S]*?original 30 seats/);
});

test("the write example identifies the logical request, while stating its guarantee boundary", () => {
  const request = blocks.find(block => block.language === "http" && block.content.startsWith("POST "));
  assert.match(request.content, /POST \/courses\/course-101\/enrollments HTTP\/1\.1/);
  assert.match(request.content, /Idempotency-Key: enroll-7-a/);
  assert.match(request.content, /Content-Length: 0/);
  assert.ok(request.content.endsWith("\n\n"));
  const core = steps[2];
  const retry = lesson("Deeper lesson — Retry correctness");
  assert.ok(retry);
  for (const phrase of ["Atomically claim", "retention", "409 Conflict", "external effect", "reconciliation", "authenticated", "last seat under concurrent requests", "after expiry"]) {
    assert.ok(retry.includes(phrase), phrase);
  }
  assert.match(core, /response is lost[\s\S]*?timeout/);
  assert.match(core, /same key and same enrollment[\s\S]*?enrollment-42[\s\S]*?29 seats/);
  assert.match(core, /key is not magic/);
  assert.doesNotMatch(core, /Atomically claim|409 Conflict|reconciliation/);
});

test("deeper lessons are explicitly anchored, reachable, and follow the core before the reference", () => {
  const retryAnchor = '<span id="phase0-retry-correctness"></span>';
  const deferredAnchor = '<span id="phase0-deferred-work"></span>';
  const retryIndex = journey.indexOf(retryAnchor);
  const deferredIndex = journey.indexOf(deferredAnchor);
  assert.ok(retryIndex > journey.indexOf("## Step 6"));
  assert.ok(deferredIndex > retryIndex);
  assert.ok(journey.indexOf("## Stop here, or follow a requirement-driven branch") > deferredIndex);
  assert.ok(journey.includes(`${retryAnchor}\n\n## Deeper lesson — Retry correctness`));
  assert.ok(journey.includes(`${deferredAnchor}\n\n## Deeper lesson — Reliable deferred work`));
  assert.ok((journey.match(/\]\(#phase0-retry-correctness\)/g) || []).length >= 2);
  assert.ok((journey.match(/\]\(#phase0-deferred-work\)/g) || []).length >= 2);
  const deferred = lesson("Deeper lesson — Reliable deferred work");
  for (const phrase of ["durable record", "transactional", "outbox", "durably published", "publisher crash", "deduplication", "Reconciliation"]) {
    assert.ok(deferred.includes(phrase), phrase);
  }
  assert.match(steps[4], /201[\s\S]*?not[\s\S]*?email[\s\S]*?202 Accepted[\s\S]*?not completion/);
  assert.doesNotMatch(steps[4], /transactional outbox|durably published/);
});

test("the lost response diagram explains the committed write and client uncertainty", () => {
  const diagrams = blocks.filter(block => block.language === "mermaid");
  assert.equal(diagrams.length, 1);
  const diagram = diagrams[0].content;
  for (const phrase of ["Browser client", "Course API", "Storage", "enrollment-42", "seats 30 to 29", "201 Created response lost", "outcome is unknown"]) {
    assert.ok(diagram.includes(phrase), phrase);
  }
  assert.match(steps[2], /Text alternative:[\s\S]*?enrollment-42[\s\S]*?30[\s\S]*?29[\s\S]*?201 Created[\s\S]*?cannot tell/);
  assert.ok(blocks.some(block => block.language === "text" && block.content.includes("Browser (untrusted client)")));
});

test("recall exercises separate prompts from reasoning and invite conditional judgment", () => {
  const exercise = lesson("Explain it without looking");
  assert.ok(exercise);
  const promptsAndAnswers = exercise.split(/(?=^[123]\. )/m).slice(1);
  assert.equal(promptsAndAnswers.length, 3);
  for (const item of promptsAndAnswers) {
    assert.equal(disclosures(item).length, 1);
    assert.ok(item.indexOf("<details") > item.indexOf("?") || item.includes("Distinguish a lost response"));
  }
  const [reconstruction, catalogue, library] = promptsAndAnswers;
  assert.match(reconstruction, /30[\s\S]*?lost response[\s\S]*?<details[\s\S]*?29[\s\S]*?cannot infer/);
  assert.match(catalogue, /20 courses[\s\S]*?pagination[\s\S]*?100 columns[\s\S]*?<details[\s\S]*?not automatically necessary[\s\S]*?authorization[\s\S]*?does not[\s\S]*?make 100 columns safe/i);
  assert.match(library, /library book loan[\s\S]*?payment provider[\s\S]*?<details[\s\S]*?Other documented designs[\s\S]*?local loan commit alone[\s\S]*?reconciliation/);
  assert.match(steps[3], /Keep the simple solution when it fits[\s\S]*?tiny and bounded/);
  assert.match(steps[5], /Keep the simple solution when it fits[\s\S]*?only once[\s\S]*?45 seconds[\s\S]*?network[\s\S]*?failure/);
});

test("quantitative examples state expected outcomes and do not promise universal performance", () => {
  assert.match(journey, /10 jobs arrive per second[\s\S]*?4 per second[\s\S]*?6 per second/);
  assert.equal(10 - 4, 6);
  assert.equal(30 - 5, 25);
  assert.match(journey, /12:00:05[\s\S]*?12:00:30, about 25 seconds later/);
  assert.match(journey, /snapshot or reflects[\s\S]*?changes/);
  assert.match(journey, /not a universal freshness guarantee/);
  assert.match(journey, /not automatically faster/);
  assert.match(journey, /not a replacement/);
  assert.match(journey, /None of the[\s\S]*?required upgrade or a fixed sequence/);
});
