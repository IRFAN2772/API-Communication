import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  asyncCourse, asyncEnrollment, asyncLearner, certificateCommand,
  classicConsumerGroup, completionFact, emailCommand, queueBudget,
} from "../assets/async-lesson-fixtures.mjs";
import { completionEvent } from "../assets/realtime-lesson-fixtures.mjs";

const page = readFileSync(new URL("../docs/lessons/BROKERS-DELIVERY-AND-RECOVERY.md", import.meta.url), "utf8");

// These in-memory models demonstrate the lesson's assumptions, not broker implementations.
test("the documented JSON preserves the source fact and distinct command identities", () => {
  assert.deepEqual(asyncCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.equal(asyncLearner, "learner-7");
  assert.equal(asyncEnrollment, "enrollment-42");
  assert.deepEqual(completionFact, completionEvent);
  const json = [...page.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  assert.equal(json.length, 2);
  assert.deepEqual(json[0], completionEvent);
  assert.deepEqual(json[1], emailCommand);
  assert.notEqual(emailCommand.id, completionFact.id);
  assert.notEqual(certificateCommand.id, emailCommand.id);
  assert.equal(emailCommand.completionId, completionFact.id);
  assert.equal(certificateCommand.completionId, completionFact.id);
  assert.match(page, /40% is not completion/);
});

test("broker acceptance, producer confirmation, local commit and external email are separate", () => {
  const state = { accepted: false, confirmed: false, inbox: new Map(), jobs: new Map(), sent: 0 };
  const publish = () => { state.accepted = true; };
  const consume = (command, crashBeforeCommit = false) => {
    const previous = state.inbox.get(command.id);
    if (previous !== undefined) {
      if (previous !== JSON.stringify(command)) return "conflict";
      return "duplicate";
    }
    if (crashBeforeCommit) return "crash";
    state.inbox.set(command.id, JSON.stringify(command));
    state.jobs.set(command.id, "pending");
    return "committed";
  };
  publish(); // Confirm can be lost even after acceptance.
  assert.equal(state.accepted, true);
  assert.equal(state.confirmed, false);
  publish(); // Retry preserves the ID.
  assert.equal(consume(emailCommand, true), "crash");
  assert.equal(state.jobs.size, 0);
  assert.equal(consume(emailCommand), "committed");
  assert.equal(consume(emailCommand), "duplicate"); // Crash after commit before ACK.
  assert.equal(consume({ ...emailCommand, learnerId: "other" }), "conflict");
  assert.equal(state.jobs.size, 1);
  assert.equal(state.sent, 0);
  state.confirmed = true;
  assert.equal(state.sent, 0); // Confirmation and durable job do not send email.
});

test("visibility lease expires or renews; deletion follows the durable job", () => {
  function lease(receivedAt, seconds) {
    return {
      expires: receivedAt + seconds,
      deleted: false,
      visible(now) { return !this.deleted && now >= this.expires; },
      renew(now, duration) {
        assert.ok(now < this.expires && !this.deleted);
        this.expires = now + duration;
      },
      deleteAfterCommit(committed) {
        assert.ok(committed, "local job must commit first");
        this.deleted = true;
      },
    };
  }
  const expired = lease(0, 30);
  assert.equal(expired.visible(29), false);
  assert.equal(expired.visible(30), true);
  const renewed = lease(0, 30);
  renewed.renew(20, 30);
  assert.equal(renewed.visible(49), false);
  assert.equal(renewed.visible(50), true);
  assert.throws(() => renewed.deleteAfterCommit(false));
  renewed.deleteAfterCommit(true);
  assert.equal(renewed.visible(100), false);
  // Standard may produce a duplicate even before lease expiry; the lease is not a lock.
  assert.match(page, /Standard duplicates remain possible/);
});

test("classic group assignments and independent cursors model replay and gaps", () => {
  const { partitions, consumers } = classicConsumerGroup;
  assert.equal(partitions, 2);
  assert.equal(consumers, 3);
  const workers = ["A", "B", "C"];
  const owners = Array.from({ length: partitions }, (_, i) => workers[i]);
  assert.deepEqual(owners, ["A", "B"]);
  assert.deepEqual(workers.filter(worker => !owners.includes(worker)), ["C"]);
  const offsets = { notification: [0, 0], analytics: [0, 0] };
  offsets.notification[0] = 1; // Next record after completing offset 0.
  assert.deepEqual(offsets.analytics, [0, 0]);
  assert.deepEqual(offsets.notification, [1, 0]);
  const safeNext = (current, complete) => {
    while (complete.has(current)) current++;
    return current;
  };
  assert.equal(safeNext(0, new Set([0, 2])), 1);
  assert.equal(safeNext(0, new Set([0, 1, 2])), 3);
  const retentionStart = 2;
  const reset = requested => Math.max(requested, retentionStart);
  assert.equal(reset(0), 2); // Model skips missing history; real reset policy varies.
  assert.match(page, /Share Groups are a distinct feature/);
  assert.match(page, /cannot recreate records already deleted or\s+compacted away/);
});

test("bounded retry and controlled redrive preserve identity and prevent a second job", () => {
  const maxAttempts = 5;
  const deadline = 900;
  const retry = (attempt, now, transient) => transient && attempt < maxAttempts && now < deadline;
  assert.equal(retry(4, 899, true), true);
  assert.equal(retry(5, 899, true), false);
  assert.equal(retry(4, 900, true), false);
  assert.equal(retry(1, 0, false), false);
  const inbox = new Set([emailCommand.id]);
  const dlq = [
    { originalId: emailCommand.id, valid: true, authorized: true, stale: false, attempts: 5 },
    { originalId: "other-command", valid: true, authorized: true, stale: false, attempts: 5 },
    { originalId: "old-command", valid: true, authorized: true, stale: true, attempts: 5 },
    { originalId: "denied-command", valid: true, authorized: false, stale: false, attempts: 5 },
  ];
  const jobs = [];
  function redrive(batch, { remediated, limit, stop }) {
    if (!remediated || stop) return;
    for (const item of batch.slice(0, limit)) {
      if (!item.valid || !item.authorized || item.stale || inbox.has(item.originalId)) continue;
      inbox.add(item.originalId);
      jobs.push(item.originalId);
    }
  }
  redrive(dlq, { remediated: false, limit: 4, stop: false });
  assert.deepEqual(jobs, []);
  redrive(dlq, { remediated: true, limit: 2, stop: false });
  assert.deepEqual(jobs, ["other-command"]);
  redrive(dlq, { remediated: true, limit: 4, stop: false });
  assert.deepEqual(jobs, ["other-command"]);
  redrive([{ originalId: "new", valid: true, authorized: true, stale: false }],
    { remediated: true, limit: 1, stop: true });
  assert.deepEqual(jobs, ["other-command"]);
  assert.equal(dlq[0].originalId, emailCommand.id);
  assert.match(page, /provider state/);
  assert.match(page, /not a receipt proving the email was sent/);
});

test("queue budget includes continuing arrivals during recovery", () => {
  const { arrivalsPerSecond, processingPerSecond, overloadSeconds, recoveryArrivalsPerSecond } = queueBudget;
  const backlog = (arrivalsPerSecond - processingPerSecond) * overloadSeconds;
  const netDrain = processingPerSecond - recoveryArrivalsPerSecond;
  assert.equal(backlog, 360);
  assert.equal(netDrain, 2);
  assert.equal(backlog / netDrain, 180);
  assert.equal(recoveryArrivalsPerSecond * 180, 360);
  assert.equal(processingPerSecond * 180, 720);
});

test("lesson is substantial, closed-answer Markdown with the requested navigation and primary sources", () => {
  const lines = page.split("\n").length;
  assert.ok(lines >= 450 && lines <= 600, `lesson has ${lines} lines`);
  const links = [
    "../05-GUIDED-ASYNC.md", "../05-ASYNC-APIS.md",
    "OUTBOX-INBOX-AND-WORKFLOWS.md", "EVENT-MODELS-AND-PROJECTIONS.md",
    "../04-GUIDED-REALTIME.md", "../COURSE-CONTENT-MAP.md",
    "../CONTENT-CORRECTIONS.md", "../../assets/async-lesson-fixtures.mjs",
  ];
  for (const link of links) assert.ok(page.includes(`](${link})`), link);
  const answers = page.match(/<details class="learning-answer">/g) ?? [];
  assert.ok(answers.length >= 5);
  assert.equal(answers.length, (page.match(/<\/details>/g) ?? []).length);
  assert.doesNotMatch(page, /<details[^>]*\sopen(?:[=>\s])/);
  assert.doesNotMatch(page, /\]\(#\//);
  assert.match(page, /https:\/\/www\.rabbitmq\.com\/docs\//);
  assert.match(page, /https:\/\/kafka\.apache\.org\/documentation\//);
  assert.match(page, /https:\/\/docs\.aws\.amazon\.com\/AWSSimpleQueueService\//);
  assert.match(page, /not\s+verified descriptions of any company's private current architecture/);
});
