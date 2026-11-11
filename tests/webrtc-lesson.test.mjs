import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  classroomMessage, progressEvents, realtimeCourse, realtimeLearner,
} from "../assets/realtime-lesson-fixtures.mjs";
import { progressUpdates, rpcCourses } from "../assets/rpc-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const lessonURL = new URL("docs/lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md", root);
const lesson = readFileSync(lessonURL, "utf8");
const original = readFileSync(new URL("docs/04-REALTIME-COMMUNICATION.md", root), "utf8").split("\n");

// A deliberately simplified all-to-all accounting model, not a media engine.
function budgets(participants, rate) {
  assert.ok(Number.isInteger(participants) && participants >= 2);
  assert.ok(Number.isFinite(rate) && rate > 0);
  return {
    meshPerPeer: (participants - 1) * rate,
    meshTotal: participants * (participants - 1) * rate,
    sfuPerPeer: rate,
    sfuIngress: participants * rate,
    sfuEgress: participants * (participants - 1) * rate,
  };
}

test("the classroom is grounded in the shared course, chat and progress fixtures", () => {
  assert.deepEqual(realtimeCourse, rpcCourses[0]);
  assert.equal(realtimeCourse.id, "course-101");
  assert.equal(realtimeCourse.title, "API Fundamentals");
  assert.equal(realtimeLearner, "learner-7");
  assert.deepEqual(classroomMessage, {
    courseId: realtimeCourse.id, messageId: "message-1", text: "Ready for class",
  });
  assert.deepEqual(progressEvents.map(event => event.id), progressUpdates.map(update => update.eventId));
  assert.deepEqual(progressEvents.map(event => event.data.percentComplete), [20, 40]);
  for (const value of [realtimeCourse.id, realtimeCourse.title, realtimeLearner, classroomMessage.text, "teacher-1"]) {
    assert.ok(lesson.includes(value), value);
  }
  assert.match(lesson, /fictional `teacher-1`/);
  assert.match(lesson, /deploys no media server or TURN/);
  assert.match(lesson, /neither requests camera\s+or microphone access nor creates a connection/);
});

test("mesh and SFU accounting agrees with both documented scenarios", () => {
  assert.deepEqual(budgets(4, 1), {
    meshPerPeer: 3, meshTotal: 12, sfuPerPeer: 1, sfuIngress: 4, sfuEgress: 12,
  });
  assert.deepEqual(budgets(3, 2), {
    meshPerPeer: 4, meshTotal: 12, sfuPerPeer: 2, sfuIngress: 6, sfuEgress: 12,
  });
  assert.deepEqual(budgets(2, 0.5), {
    meshPerPeer: 0.5, meshTotal: 1, sfuPerPeer: 0.5, sfuIngress: 1, sfuEgress: 1,
  });
  assert.throws(() => budgets(1, 1));
  assert.throws(() => budgets(4, 0));
  assert.match(lesson, /no protocol\s+overhead, no simulcast or layered encoding, and no suppressed subscriptions/);
  assert.match(lesson, /each uploads 3 Mbps and the combined\s+outgoing upload is 12 Mbps/);
  assert.match(lesson, /each uploads 1 Mbps and server egress is\s+12 Mbps/);
  assert.match(lesson, /each mesh\s+upload is 4 Mbps, total mesh upload is 12 Mbps, and SFU egress is 12 Mbps/);
  assert.match(lesson, /SFU also ingests 4 Mbps/);
});

test("illustrative available-path choices do not model an ICE implementation", () => {
  // This is a set of allowed outcomes for the lesson's examples, not ICE
  // priority, candidate-pair checking, timing or a selection algorithm.
  const allowedPaths = ({ hostWorks, reflexiveWorks, relayWorks, relayAllowed }) => {
    const paths = [];
    if (hostWorks) paths.push("host");
    if (reflexiveWorks) paths.push("server-reflexive");
    if (relayWorks && relayAllowed) paths.push("relay");
    return paths.length ? paths : ["failure"];
  };
  assert.deepEqual(allowedPaths({ hostWorks: true, reflexiveWorks: false, relayWorks: true, relayAllowed: true }), ["host", "relay"]);
  assert.deepEqual(allowedPaths({ hostWorks: false, reflexiveWorks: true, relayWorks: false, relayAllowed: true }), ["server-reflexive"]);
  assert.deepEqual(allowedPaths({ hostWorks: false, reflexiveWorks: false, relayWorks: true, relayAllowed: true }), ["relay"]);
  assert.deepEqual(allowedPaths({ hostWorks: false, reflexiveWorks: false, relayWorks: true, relayAllowed: false }), ["failure"]);
  assert.deepEqual(allowedPaths({ hostWorks: false, reflexiveWorks: false, relayWorks: false, relayAllowed: true }), ["failure"]);
  for (const type of ["Host", "Server-reflexive", "Relay"]) assert.match(lesson, new RegExp(`\\| ${type} \\|`));
  assert.match(lesson, /STUN server is unreachable; must this call use TURN/);
  assert.match(lesson, /all paths can fail/);
  assert.match(lesson, /not guaranteed instantaneous or successful/);
  assert.match(lesson, /not a magic bypass/);
});

test("protocol decisions follow the changed requirement, not a technology ladder", () => {
  const choices = [
    ["Interactive browser audio/video classroom", "Consider WebRTC"],
    ["Recorded lesson watched on demand", "HTTP video and CDN"],
    ["Server-to-client course progress", "SSE"],
    ["Classroom text chat", "WebSocket"],
    ["Offline completion alert", "Push notification"],
  ];
  for (const [requirement, choice] of choices) {
    assert.ok(lesson.includes(`| ${requirement} | ${choice} |`), requirement);
  }
  assert.match(lesson, /WebSocket \*\*can\*\* carry encoded media bytes/);
  assert.match(lesson, /not a\s+drop-in classroom application/);
  assert.match(lesson, /Its defaults are reliable and ordered/);
  assert.match(lesson, /not\*\*\s+automatically mean end-to-end encryption/);
  assert.match(lesson, /small library wants a remote helper/);
});

test("native prediction answers are closed, plain and self-contained", () => {
  const answers = [...lesson.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 5);
  assert.equal((lesson.match(/<details\b/g) ?? []).length, answers.length);
  assert.equal((lesson.match(/<\/details>/g) ?? []).length, answers.length);
  for (const [, body] of answers) {
    assert.match(body, /^\s*<summary>Predict: [^<]+<\/summary>\s*<p>[^<]+<\/p>\s*$/);
  }
  assert.doesNotMatch(lesson, /<script\b|<details[^>]*\bopen\b/i);
  assert.ok((lesson.match(/```(?:text|mermaid)\n/g) ?? []).length <= 2);
});

test("local jumps, original references and companion lessons remain reachable", () => {
  for (const id of ["webrtc-problem", "webrtc-setup", "webrtc-connectivity", "webrtc-media", "webrtc-group", "webrtc-failure", "webrtc-security", "webrtc-practice", "webrtc-corrections"]) {
    assert.ok(lesson.includes(`](#${id})`), id);
    assert.ok(lesson.includes(`<a id="${id}"></a>`), id);
  }
  for (const target of ["../04-REALTIME-COMMUNICATION.md", "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md", "../../assets/realtime-lesson-fixtures.mjs"]) {
    assert.ok(lesson.includes(`](${target})`), target);
    assert.ok(existsSync(new URL(target, lessonURL)), target);
  }
  for (const target of ["../04-GUIDED-REALTIME.md", "REALTIME-RECOVERY-AND-FLOW.md", "PUSH-NOTIFICATION-DELIVERY.md", "WEBHOOKS-AND-BACKGROUND-JOBS.md"]) {
    assert.ok(lesson.includes(`](${target})`), target);
    assert.ok(existsSync(new URL(target, lessonURL)), target);
  }
  assert.doesNotMatch(lesson, /not present in this checkout/);
});

test("correction quotations match the original line numbers and avoid private-stack claims", () => {
  for (const [line, quote] of [
    [2523, "Much cheaper."], [2524, "Much faster."], [2903, "Works almost always."],
    [2931, "Try STUN first."], [2933, "Use TURN if necessary."],
    [3004, "**Step 4** — STUN attempts connection."], [3203, "Does NOT decode video."],
    [3259, "### Failure 1 — STUN fails"], [3264, "Use TURN."],
    [3312, "| Audio Calls        | ❌        | ✅       |"],
    [3313, "| Video Calls        | ❌        | ✅       |"],
    [3315, "| Screen Share       | ❌        | ✅       |"],
  ]) {
    assert.equal(original[line - 1], quote, `source line ${line}`);
  }
  for (const line of [2523, 2903, 2931, 3004, 3203, 3259, 3312]) {
    assert.ok(lesson.includes(String(line)), `documented line ${line}`);
  }
  assert.match(lesson, /not verified claims about\s+their present private stacks/);
  for (const rfc of [8445, 8656, 8825, 8827, 8831]) {
    assert.ok(lesson.includes(`https://www.rfc-editor.org/rfc/rfc${rfc}`));
  }
  assert.ok(lesson.includes("https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API"));
});
