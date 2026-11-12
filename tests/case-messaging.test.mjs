import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { messagingCase, messagingScale } from "../assets/case-study-fixtures.mjs";

const lesson = readFileSync(new URL("../docs/lessons/CASE-WHATSAPP-MESSAGING.md", import.meta.url), "utf8");
function example(name) {
  const marker = `<!-- example: ${name} -->`;
  assert.equal(lesson.split(marker).length, 2, `one ${name} marker`);
  const match = lesson.split(marker)[1].match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, `${name} must be followed by JSON`);
  return JSON.parse(match[1]);
}

// Illustrative sequential model, not storage, cryptography, or a distributed system.
function messageStore() {
  const requests = new Map(), messages = new Map(), outbox = [];
  return {
    requests, messages, outbox,
    send(sender, key, msg, authorized = true, failBeforeCommit = false) {
      if (!authorized || sender !== msg.senderId) return "unauthorized";
      const scope = JSON.stringify([sender, "send", key]);
      const fingerprint = JSON.stringify([msg.messageId, msg.conversationId, msg.senderId,
        msg.recipientId, msg.ciphertext, [...msg.recipientDevices].sort()]);
      if (requests.has(scope)) return requests.get(scope).fingerprint === fingerprint ? "accepted" : "conflict";
      if (messages.has(msg.messageId)) return "conflict";
      if (failBeforeCommit) return "failed";
      requests.set(scope, { fingerprint, messageId: msg.messageId });
      messages.set(msg.messageId, msg);
      outbox.push(msg.messageId);
      return "accepted";
    },
  };
}

test("marked JSON examples are the canonical fixtures and all JSON blocks parse", () => {
  assert.deepEqual(example("messaging-case"), messagingCase);
  assert.deepEqual(example("messaging-scale"), messagingScale);
  for (const match of lesson.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) JSON.parse(match[1]);
  assert.equal(messagingCase.ciphertext, "opaque-demo-bytes");
  assert.match(lesson, /symbolic placeholder, \*\*not encryption\*\*/i);
});

test("scale arithmetic separates active users and assumed concurrent connections", () => {
  const s = messagingScale;
  const daily = s.dailyActiveUsers * s.messagesPerActiveUserPerDay;
  assert.equal(daily, 20_000_000_000);
  assert.equal((daily / s.secondsPerDay).toFixed(2), "231481.48");
  assert.equal((daily / s.secondsPerDay * s.peakFactor).toFixed(1), "1157407.4");
  assert.equal(daily * s.averageMessageBodyBytes / 1e12, 20);
  assert.equal(daily * s.averageMessageBodyBytes * s.retentionDays / 1e12, 600);
  assert.equal(s.assumedConcurrentConnections / s.assumedConnectionsPerGateway, 5000);
  assert.match(lesson, /independent assumption/);
  assert.match(lesson, /not a benchmark/i);
});

test("lost reply, semantic duplicates, scoped keys and rollback", () => {
  const store = messageStore(), m = example("messaging-case");
  assert.equal(store.send(m.senderId, m.requestKey, m, true, true), "failed");
  assert.equal(store.requests.size + store.messages.size + store.outbox.length, 0);
  assert.equal(store.send(m.senderId, m.requestKey, m), "accepted");
  const reordered = { recipientDevices: [...m.recipientDevices].reverse(), ciphertext: m.ciphertext,
    requestKey: m.requestKey, recipientId: m.recipientId, senderId: m.senderId,
    conversationId: m.conversationId, messageId: m.messageId };
  assert.equal(store.send(m.senderId, m.requestKey, reordered), "accepted");
  assert.equal(store.outbox.length, 1);
  assert.equal(store.send(m.senderId, m.requestKey, { ...m, ciphertext: "different" }), "conflict");
  assert.equal(store.send(m.senderId, m.requestKey, m, false), "unauthorized");
  const other = { ...m, senderId: "sender-2", messageId: "message-102" };
  assert.equal(store.send(other.senderId, m.requestKey, other), "accepted");
  assert.equal(store.requests.size, 2);
});

test("device receipts, replay, retention and revocation are distinct decisions", () => {
  const devices = messagingCase.recipientDevices;
  const receipts = new Set();
  function ack(device, messageId, authorized) {
    if (!authorized || !devices.includes(device)) return false;
    receipts.add(JSON.stringify([device, messageId]));
    return true;
  }
  assert.equal(ack(devices[0], messagingCase.messageId, true), true);
  assert.equal(ack(devices[0], messagingCase.messageId, true), true);
  assert.equal(receipts.size, 1);
  assert.equal(receipts.has(JSON.stringify([devices[1], messagingCase.messageId])), false);
  assert.equal(ack(devices[1], messagingCase.messageId, false), false);
  function resume(authorized, cursorRetained) {
    return !authorized ? "denied" : cursorRetained ? "replay" : "reset";
  }
  assert.equal(resume(true, true), "replay");
  assert.equal(resume(true, false), "reset");
  assert.equal(resume(false, false), "denied");
  assert.match(lesson, /consistent snapshot/i);
  assert.match(lesson, /human read/i);
});

test("lesson points to its source, hub and related complete lessons", () => {
  for (const link of ["../GUIDED-CASE-STUDIES.md", "../09-SYSTEM-DESIGN-CASE-STUDIES.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md", "../../assets/case-study-fixtures.mjs",
    "REALTIME-RECOVERY-AND-FLOW.md", "WEBRTC-MEDIA-AND-CONNECTIVITY.md"]) assert.ok(lesson.includes(link));
  assert.match(lesson, /<details class="learning-answer">\s*<summary>/);
});
