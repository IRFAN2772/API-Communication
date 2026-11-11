import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  allowedFutureSeconds,
  completionBody,
  completionEvent,
  progressEvents,
  pushHint,
  realtimeCourse,
  realtimeLearner,
  replayWindowSeconds,
  webhookTimestamp,
} from "../assets/realtime-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const webhook = readFileSync(new URL("docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md", root), "utf8");
const push = readFileSync(new URL("docs/lessons/PUSH-NOTIFICATION-DELIVERY.md", root), "utf8");
const key = "lesson-test-key-not-a-secret";

function sign(timestamp, rawBody, secret = key) {
  return createHmac("sha256", secret).update(`${timestamp}.`, "utf8")
    .update(rawBody).digest("hex");
}

// Model of the documented lesson policy, not production receiver code.
function verify(timestamp, rawBody, signature, now) {
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(now)) return false;
  if (now - timestamp > replayWindowSeconds || timestamp - now > allowedFutureSeconds) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const actual = Buffer.from(signature, "hex");
  const expected = Buffer.from(sign(timestamp, rawBody), "hex");
  return timingSafeEqual(actual, expected);
}

test("shared event, independent progress, and minimal hint match the lessons", () => {
  assert.equal(realtimeCourse.id, "course-101");
  assert.equal(realtimeCourse.title, "API Fundamentals");
  assert.equal(realtimeLearner, "learner-7");
  assert.deepEqual(progressEvents.map(item => item.data.percentComplete), [20, 40]);
  assert.deepEqual(completionEvent, {
    id: "completion-42", type: "course.completed",
    data: { courseId: "course-101", learnerId: "learner-7" },
  });
  assert.equal(completionBody, JSON.stringify(completionEvent));
  assert.deepEqual(pushHint, {
    type: "course.completed", courseId: "course-101", eventId: "completion-42",
  });
  assert.equal(Object.hasOwn(pushHint, "learnerId"), false);
  for (const page of [webhook, push]) {
    assert.ok(page.includes(completionBody));
    assert.match(page, /40%[^.]{0,40}not\s+completion/i);
    assert.match(page, /independent/i);
  }
  assert.ok(push.includes(JSON.stringify(pushHint)));
});

test("HMAC authenticates exact UTF-8 bytes with the fixed example key and timestamp", () => {
  assert.equal(webhookTimestamp, Date.parse("2026-11-11T10:00:00Z") / 1000);
  const raw = Buffer.from(completionBody, "utf8");
  const signature = sign(webhookTimestamp, raw);
  assert.equal(signature, "221debca7d9a8086942c6d56ca334bcb357f22d689b263b489728cc5f657b10e");
  assert.ok(webhook.includes(signature));
  assert.equal(verify(webhookTimestamp, raw, signature, webhookTimestamp), true);
  assert.equal(verify(webhookTimestamp, raw, sign(webhookTimestamp, raw, "wrong-key"), webhookTimestamp), false);
  const whitespace = Buffer.from(completionBody.replace(',"type"', ', "type"'), "utf8");
  assert.deepEqual(JSON.parse(whitespace.toString()), completionEvent);
  assert.equal(verify(webhookTimestamp, whitespace, signature, webhookTimestamp), false);
  assert.equal(verify(webhookTimestamp + 1, raw, signature, webhookTimestamp), false);
  assert.equal(verify(webhookTimestamp, raw, "not-a-signature", webhookTimestamp), false);
});

test("freshness policy accepts inclusive boundaries and rejects out-of-window attempts", () => {
  assert.equal(replayWindowSeconds, 300);
  assert.equal(allowedFutureSeconds, 30);
  const body = Buffer.from(completionBody, "utf8");
  const signature = sign(webhookTimestamp, body);
  assert.equal(verify(webhookTimestamp, body, signature, webhookTimestamp + 300), true);
  assert.equal(verify(webhookTimestamp, body, signature, webhookTimestamp + 301), false);
  assert.equal(verify(webhookTimestamp, body, signature, webhookTimestamp - 30), true);
  assert.equal(verify(webhookTimestamp, body, signature, webhookTimestamp - 31), false);
  assert.equal(verify(NaN, body, signature, webhookTimestamp), false);
});

test("receipt/job transaction models duplicate and crash windows", () => {
  // This Map models a durable database with an atomic unique insert and job
  // transaction; it is not itself persistent or a concurrency implementation.
  const receipts = new Map();
  const jobs = new Map();
  function accept(integration, event, failBeforeCommit = false) {
    const id = `${integration}:${event.id}`;
    const body = JSON.stringify(event);
    if (receipts.has(id)) return receipts.get(id) === body ? 204 : 409;
    if (failBeforeCommit) return 503;
    receipts.set(id, body);
    jobs.set(id, { status: "queued", attempts: 0 });
    return 204;
  }
  assert.equal(accept("lms-a", completionEvent, true), 503);
  assert.equal(receipts.size, 0);
  assert.equal(jobs.size, 0);
  assert.equal(accept("lms-a", completionEvent), 204); // Commit; response may be lost.
  assert.equal(accept("lms-a", completionEvent), 204);
  assert.equal(jobs.size, 1);
  assert.equal(accept("lms-a", { ...completionEvent, type: "other" }), 409);
  assert.equal(accept("lms-b", completionEvent), 204); // Dedup scope is per integration.
  const job = jobs.get("lms-a:completion-42");
  job.attempts++;
  job.status = "failed";
  assert.equal(accept("lms-a", completionEvent), 204);
  assert.equal(job.status, "failed"); // 204 promised receipt/job, not email success.
  assert.equal(job.attempts, 1);
});

test("lessons include meaningful exercises, decision guidance, links, and sources", () => {
  const common = [
    "../04-GUIDED-REALTIME.md", "../04-REALTIME-COMMUNICATION.md",
    "REALTIME-RECOVERY-AND-FLOW.md", "WEBRTC-MEDIA-AND-CONNECTIVITY.md",
    "../05-ASYNC-APIS.md", "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md",
  ];
  for (const [page, other] of [[webhook, "PUSH-NOTIFICATION-DELIVERY.md"], [push, "WEBHOOKS-AND-BACKGROUND-JOBS.md"]]) {
    const lines = page.split("\n").length;
    assert.ok(lines >= 300 && lines <= 450, `lesson has ${lines} lines`);
    for (const link of [...common, other]) assert.ok(page.includes(`](${link})`), link);
    assert.ok((page.match(/<details class="learning-answer">/g) ?? []).length >= 5);
    assert.equal((page.match(/<details /g) ?? []).length, (page.match(/<\/details>/g) ?? []).length);
    assert.doesNotMatch(page, /```(?:html|markdown)\n<details/);
    assert.match(page, /Primary references:/);
    assert.match(page, /can incur costs/i);
  }
  const queueSection = webhook.split("## 6. Queue, retained stream and batch: the substantive choices")[1]
    .split("## 7.")[0];
  assert.ok(queueSection.trim().split(/\s+/).length >= 600);
  assert.match(webhook, /300 seconds old and at most 30 seconds/);
  assert.match(webhook, /durably recorded/);
  assert.match(push, /not.*prove device delivery/i);
});
