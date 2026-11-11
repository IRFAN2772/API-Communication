import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  realtimeCourse, realtimeLearner, progressEvents, sseBody,
  websocketRequestKey, websocketAccept, classroomMessage, progressRetentionSeconds,
} from "../assets/realtime-lesson-fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const guidePath = resolve(root, "docs/04-GUIDED-REALTIME.md");
const recoveryPath = resolve(root, "docs/lessons/REALTIME-RECOVERY-AND-FLOW.md");
const guide = readFileSync(guidePath, "utf8");
const recovery = readFileSync(recoveryPath, "utf8");
const blocks = (text, language) => [...text.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)]
  .filter(match => match[1] === language).map(match => match[2]);
const jsonBlocks = text => blocks(text, "json").map(JSON.parse);

// Small complete-event decoder for the fixture; not a production streaming parser.
function decodeFixture(body) {
  const events = [];
  let event = { type: "message", data: [], id: "" };
  const lines = body.split("\n");
  lines.pop(); // The final fragment has no line terminator.
  for (const line of lines) {
    if (!line) {
      if (event.data.length) {
        events.push({ id: event.id, event: event.type, data: JSON.parse(event.data.join("\n")) });
      }
      event = { type: "message", data: [], id: "" };
    } else if (!line.startsWith(":")) {
      const colon = line.indexOf(":");
      const name = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (name === "id") event.id = value;
      if (name === "event") event.type = value;
      if (name === "data") event.data.push(value);
    }
  }
  return events;
}

function scopedLog(windowSeconds) {
  const records = [];
  return {
    append(scope, id, value, at) { records.push({ scope, id, value, at }); },
    snapshot(scope) {
      const record = records.filter(item => item.scope === scope).at(-1);
      return { value: record.value, cursor: record.id };
    },
    after(scope, cursor, now) {
      const scoped = records.filter(item => item.scope === scope);
      const index = scoped.findIndex(item => item.id === cursor);
      if (index < 0 || now - scoped[index].at >= windowSeconds) return { reset: true };
      return { reset: false, events: scoped.slice(index + 1) };
    },
  };
}

test("the guide routes to explicit IDs and all referenced local sources", () => {
  for (const id of ["rt-choice", "rt-polling", "rt-long-polling", "rt-sse",
    "rt-websocket", "rt-recovery", "rt-next"]) {
    assert.equal(guide.split(`<span id="${id}"></span>`).length - 1, 1, id);
    assert.ok(guide.includes(`](#${id})`), id);
  }
  for (const id of ["recovery-dispatch", "recovery-replay", "recovery-reset",
    "recovery-snapshot", "recovery-order", "recovery-flow", "recovery-operations"]) {
    assert.equal(recovery.split(`<span id="${id}"></span>`).length - 1, 1, id);
    assert.ok(recovery.includes(`](#${id})`), id);
  }
  for (const [path, text] of [[guidePath, guide], [recoveryPath, recovery]]) {
    for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (target.startsWith("#") || /^https?:/.test(target)) continue;
      assert.doesNotMatch(target, /\.md#/, "no guessed cross-document Markdown anchors");
      assert.ok(existsSync(resolve(dirname(path), target)), `${path}: ${target}`);
    }
  }
  assert.equal((guide.match(/^## Step \d — /gm) ?? []).length, 7);
  for (const page of [guide, recovery]) {
    assert.equal((page.match(/<details class="learning-answer">/g) ?? []).length, 7);
    assert.equal((page.match(/<\/details>/g) ?? []).length, 7);
  }
});

test("shared preview fixtures, exact SSE framing, and documentation agree", () => {
  assert.deepEqual(realtimeCourse, { id: "course-101", title: "API Fundamentals", seats: 30 });
  assert.equal(realtimeLearner, "learner-7");
  assert.deepEqual(progressEvents, [
    { id: "progress-20", event: "progress", data: { courseId: "course-101", percentComplete: 20 } },
    { id: "progress-40", event: "progress", data: { courseId: "course-101", percentComplete: 40 } },
  ]);
  assert.equal(sseBody, ': keepalive\n\nid: progress-20\nevent: progress\ndata: {"courseId":"course-101","percentComplete":20}\n\nid: progress-40\nevent: progress\ndata: {"courseId":"course-101","percentComplete":40}\n\n');
  assert.deepEqual(decodeFixture(sseBody), progressEvents);
  assert.deepEqual(decodeFixture(sseBody.slice(0, -1)), [progressEvents[0]],
    "without the final blank line, the final event is not dispatched");
  for (const page of [guide, recovery]) {
    assert.ok(blocks(page, "text").includes(sseBody), "SSE fence matches fixture byte for byte");
    assert.equal(realtimeCourse.seats, 30, "progress is independent of available seats");
  }
  assert.ok(jsonBlocks(guide).some(value => JSON.stringify(value) === JSON.stringify(classroomMessage)));
  assert.ok(jsonBlocks(guide).some(value => JSON.stringify(value) === JSON.stringify({
    courseId: "course-101", messageId: "message-2", text: "Welcome",
  })));
});

test("HTTP/1.1 WebSocket accept is derived from the exact request fixture", () => {
  const accept = createHash("sha1")
    .update(websocketRequestKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  assert.equal(accept, websocketAccept);
  const handshake = blocks(guide, "http").find(block => block.includes("Sec-WebSocket-Key"));
  assert.match(handshake, new RegExp(`Sec-WebSocket-Key: ${websocketRequestKey}`));
  assert.ok(handshake.includes(`Sec-WebSocket-Accept: ${accept}\n`));
  assert.match(handshake, /HTTP\/1\.1 101 Switching Protocols/);
});

test("replay uses scoped log order, TTL reset, and explicit reset frame", () => {
  assert.equal(progressRetentionSeconds, 300);
  const log = scopedLog(progressRetentionSeconds);
  const scope = "learner-7/course-101";
  log.append(scope, "progress-20", 20, 0);
  log.append(scope, "progress-40", 40, 5);
  log.append("other/course-101", "progress-20", 99, 10);
  assert.deepEqual(log.after(scope, "progress-20", 299).events.map(event => event.id), ["progress-40"]);
  assert.deepEqual(log.after(scope, "progress-20", 300), { reset: true });
  assert.deepEqual(log.after(scope, "unknown", 10), { reset: true });
  assert.deepEqual(log.after("other/course-101", "progress-40", 10), { reset: true });
  const effectiveCursor = (lastEventId, after) => lastEventId || after;
  assert.equal(effectiveCursor("progress-40", "progress-20"), "progress-40");
  assert.equal(effectiveCursor("", "progress-20"), "progress-20");
  assert.match(recovery, /nonempty `Last-Event-ID` in preference to\s+`after`/);
  const reset = blocks(recovery, "text").find(block => block.startsWith("event: reset"));
  assert.equal(reset, 'event: reset\ndata: {"reason":"cursor-unavailable"}\n\n');
  assert.deepEqual(decodeFixture(reset), [{ id: "", event: "reset", data: { reason: "cursor-unavailable" } }]);
  assert.match(recovery, /does \*\*not\*\* expose HTTP status/);
});

test("atomic snapshot cursor bridges a concurrent update, unlike a late cursor", () => {
  const log = scopedLog(progressRetentionSeconds);
  const scope = "learner-7/course-101";
  log.append(scope, "progress-20", 20, 0);
  const snapshot = log.snapshot(scope);
  log.append(scope, "progress-40", 40, 5);
  assert.deepEqual(snapshot, { value: 20, cursor: "progress-20" });
  assert.deepEqual(log.after(scope, snapshot.cursor, 10).events.map(event => event.value), [40]);
  const badCursor = log.snapshot(scope).cursor;
  assert.deepEqual(log.after(scope, badCursor, 10).events, [], "late cursor skips the missing update");
  assert.deepEqual(log.after(scope, snapshot.cursor, 301), { reset: true });
  assert.ok(jsonBlocks(recovery).some(value => JSON.stringify(value) === JSON.stringify({
    progress: { courseId: "course-101", percentComplete: 20 }, cursor: "progress-20",
  })));
});

test("opaque log order is not string, percentage, or timestamp order", () => {
  const log = scopedLog(progressRetentionSeconds);
  const scope = "learner-7/course-101";
  log.append(scope, "z", 40, 10);
  log.append(scope, "a", 20, 10);
  assert.deepEqual(log.after(scope, "z", 11).events.map(event => [event.id, event.value]), [["a", 20]]);
  assert.ok("a" < "z", "lexicographic order would reverse the committed sequence");
});

test("bounded progress coalescing differs from preserving required messages", () => {
  const progressQueue = [];
  for (const value of [20, 40]) progressQueue.splice(0, progressQueue.length, value);
  assert.deepEqual(progressQueue, [40]);
  const messages = [classroomMessage, { courseId: "course-101", messageId: "message-2", text: "Welcome" }];
  assert.equal(messages.length, 2);
  assert.notDeepEqual([messages.at(-1)], messages, "coalescing loses a required message");
  assert.equal((10 - 4) * 100, 600);
  assert.match(recovery, /10 updates per second[\s\S]*?4 per second[\s\S]*?100 seconds[\s\S]*?600/);
  assert.match(recovery, /outgoing/);
  assert.match(recovery, /does not expose inbound backpressure/);
});

test("polling averages do not bound aligned bursts; retries are finite", () => {
  assert.equal(30 - 5, 25);
  assert.ok(Math.abs(1000 / 30 - 33.33) < 0.01);
  assert.match(guide, /time 5 seconds[\s\S]*?time 30[\s\S]*?\*\*25 seconds\*\*/);
  assert.match(guide, /1000 \/ 30 = 33\.33/);
  const aligned = Array(30).fill(0);
  aligned[0] = 1000;
  assert.equal(aligned.reduce((sum, count) => sum + count) / aligned.length, 1000 / 30);
  assert.equal(Math.max(...aligned), 1000);
  const delays = Array.from({ length: 5 }, (_, attempt) => Math.min(30, 2 ** attempt));
  assert.deepEqual(delays, [1, 2, 4, 8, 16]);
  assert.equal(delays.length, 5);
  assert.ok(delays.every(delay => delay <= 30));
});
