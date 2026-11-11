import assert from "node:assert/strict";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StringDecoder } from "node:string_decoder";
import {
  progressEvents, sseBody, websocketRequestKey, websocketAccept, classroomMessage,
  completionBody, completionEvent, webhookTimestamp, replayWindowSeconds, allowedFutureSeconds,
  webhookTestKey,
} from "../assets/realtime-lesson-fixtures.mjs";

const { createParser } = await import(process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href : "eventsource-parser");

function parseEvents(body) {
  const events = [];
  const parser = createParser({ onEvent: event => events.push(event), onError: error => { throw error; } });
  const decoder = new StringDecoder("utf8");
  for (const byte of Buffer.from(body)) parser.feed(decoder.write(Buffer.from([byte])));
  parser.feed(decoder.end());
  return events;
}

const parsed = parseEvents(sseBody);
assert.deepEqual(parsed.map(event => ({ id: event.id, event: event.event, data: JSON.parse(event.data) })), progressEvents);
assert.equal(parseEvents(": keepalive\n\n").length, 0);
assert.equal(parseEvents("id: checkpoint-only\n\n").length, 0);
assert.equal(parseEvents("id: progress-20\nevent: progress\ndata: {}\n").length, 0,
  "An unterminated SSE event has not been dispatched");
const multiline = parseEvents('event: progress\ndata: {"courseId":"course-101",\ndata: "percentComplete":40}\n\n');
assert.deepEqual(JSON.parse(multiline[0].data), progressEvents[1].data);

function replayAfter(cursor, retained) {
  const index = retained.findIndex(event => event.id === cursor);
  if (index < 0) throw new Error("History unavailable; resynchronize from an authorized snapshot");
  return retained.slice(index + 1);
}
assert.deepEqual(replayAfter("progress-20", progressEvents), [progressEvents[1]]);
assert.deepEqual(replayAfter("progress-40", progressEvents), []);
assert.throws(() => replayAfter("expired-cursor", progressEvents));
assert.throws(() => replayAfter("progress-20", [progressEvents[1]]));
const snapshot = { ...progressEvents[0].data, lastEventId: progressEvents[0].id };
assert.deepEqual(replayAfter(snapshot.lastEventId, progressEvents), [progressEvents[1]],
  "An event committed between snapshot and reconnect is recovered after the snapshot cursor");
let displayed = { ...progressEvents[0].data };
const appliedIds = new Set([progressEvents[0].id]);
function applyProgress(event) {
  if (event.data.courseId !== displayed.courseId) throw new Error("Event belongs to another course");
  if (appliedIds.has(event.id)) return false;
  displayed = { ...event.data };
  appliedIds.add(event.id);
  return true;
}
assert.equal(applyProgress(progressEvents[1]), true);
assert.equal(applyProgress(progressEvents[1]), false);
assert.equal(displayed.percentComplete, 40);

const accept = createHash("sha1")
  .update(websocketRequestKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
  .digest("base64");
assert.equal(Buffer.from(websocketRequestKey, "base64").length, 16);
assert.equal(accept, websocketAccept);

const payload = Buffer.from(JSON.stringify(classroomMessage));
assert.ok(payload.length < 126);
const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]); // Fixed only for this finite test.
const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
const clientFrame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]);
assert.equal(clientFrame[0], 0x81);
assert.equal(clientFrame[1] & 0x80, 0x80);
assert.equal(clientFrame.length, payload.length + 6);
const decoded = Buffer.from(clientFrame.subarray(6).map((byte, index) => byte ^ clientFrame[2 + index % 4]));
assert.deepEqual(JSON.parse(decoded), classroomMessage);

const signature = (timestamp, body) => createHmac("sha256", webhookTestKey).update(`${timestamp}.${body}`).digest("hex");
function verifyWebhook(timestamp, body, supplied, now) {
  const age = now - timestamp;
  if (!Number.isInteger(timestamp) || age > replayWindowSeconds || age < -allowedFutureSeconds) {
    throw new Error("Timestamp outside the example replay window");
  }
  if (!/^[a-f0-9]{64}$/.test(supplied)) throw new Error("Invalid signature encoding");
  const expected = Buffer.from(signature(timestamp, body), "hex");
  if (!timingSafeEqual(expected, Buffer.from(supplied, "hex"))) throw new Error("Signature does not match the raw body");
  return JSON.parse(body);
}
const signed = signature(webhookTimestamp, completionBody);
const webhookLesson = readFileSync(new URL("../docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md", import.meta.url), "utf8");
assert.equal(Number(webhookLesson.match(/^X-Lesson-Timestamp: (\d+)$/m)?.[1]), webhookTimestamp);
assert.equal(Number(webhookLesson.match(/^Content-Length: (\d+)$/m)?.[1]), Buffer.byteLength(completionBody));
assert.equal(webhookLesson.match(/^X-Lesson-Signature: ([a-f0-9]+)$/m)?.[1], signed);
assert.deepEqual(verifyWebhook(webhookTimestamp, completionBody, signed, webhookTimestamp + 10), completionEvent);
assert.throws(() => verifyWebhook(webhookTimestamp, completionBody + " ", signed, webhookTimestamp + 10));
assert.throws(() => verifyWebhook(webhookTimestamp, completionBody, signed, webhookTimestamp + 301));
assert.throws(() => verifyWebhook(webhookTimestamp, completionBody, signed, webhookTimestamp - 31));
assert.deepEqual(verifyWebhook(webhookTimestamp, completionBody, signed, webhookTimestamp + 300), completionEvent);
assert.deepEqual(verifyWebhook(webhookTimestamp, completionBody, signed, webhookTimestamp - 30), completionEvent);

const pages = [
  "docs/04-GUIDED-REALTIME.md",
  "docs/lessons/REALTIME-RECOVERY-AND-FLOW.md",
];
let literalStreams = 0;
for (const page of pages) {
  const content = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  for (const [, source] of content.matchAll(/```(?:text|sse|http)\n([\s\S]*?)```/g)) {
    const first = source.search(/^id: progress-(?:20|40)\r?$/m);
    if (first < 0) continue;
    const events = parseEvents(source.slice(first)).filter(event => event.event === "progress");
    const ids = [...source.slice(first).matchAll(/^id: (progress-(?:20|40))\r?$/gm)].map(match => match[1]);
    assert.equal(events.length, ids.length, `${page}: every literal SSE event must end with an empty line`);
    events.forEach(event => {
      const fixture = progressEvents.find(item => item.id === event.id);
      assert.ok(fixture, `${page}: unknown event ${event.id}`);
      assert.deepEqual(JSON.parse(event.data), fixture.data);
    });
    literalStreams++;
  }
}
assert.ok(literalStreams >= 1, "The lessons should include at least one actual SSE event stream");
console.log(`Parsed the shared SSE stream and ${literalStreams} literal lesson streams, including one-byte chunks and multiline data.`);
console.log("Passed: replay/reset boundaries, snapshot race, WebSocket accept/masking, and raw-body HMAC freshness/tamper cases.");
console.log("These are parser and finite contract probes, not browser delivery, push-provider, or live ICE/media tests.");
