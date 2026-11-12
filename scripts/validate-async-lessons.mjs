import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  asyncCourse, asyncLearner, asyncEnrollment, completionFact, projectionEvents, aggregateId, queueBudget,
} from "../assets/async-lesson-fixtures.mjs";

const producer = new DatabaseSync(":memory:");
const consumer = new DatabaseSync(":memory:");
class InjectedFailure extends Error {}

try {
  producer.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, seats INTEGER NOT NULL CHECK (seats >= 0));
    CREATE TABLE enrollments (id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id), learner_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE completions (id TEXT PRIMARY KEY, enrollment_id TEXT NOT NULL UNIQUE REFERENCES enrollments(id), course_id TEXT NOT NULL, learner_id TEXT NOT NULL);
    CREATE TABLE outbox (event_id TEXT PRIMARY KEY REFERENCES completions(id), payload TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);
  `);
  producer.prepare("INSERT INTO courses VALUES (?, ?, ?)").run(asyncCourse.id, asyncCourse.title, asyncCourse.seats);
  producer.prepare("INSERT INTO enrollments (id, course_id, learner_id) VALUES (?, ?, ?)").run(asyncEnrollment, asyncCourse.id, asyncLearner);
  consumer.exec(`
    CREATE TABLE inbox (source TEXT NOT NULL, consumer_group TEXT NOT NULL, event_id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY (source, consumer_group, event_id));
    CREATE TABLE certificates (id TEXT PRIMARY KEY, completion_id TEXT NOT NULL UNIQUE, enrollment_id TEXT NOT NULL, learner_id TEXT NOT NULL, course_id TEXT NOT NULL);
  `);

  const producerCount = table => producer.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  const consumerCount = table => consumer.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  function complete({ failAfterBusinessWrite = false, failAfterOutboxWrite = false } = {}) {
    producer.exec("BEGIN IMMEDIATE");
    try {
      producer.prepare("UPDATE enrollments SET completed = 1 WHERE id = ?").run(asyncEnrollment);
      producer.prepare("INSERT INTO completions VALUES (?, ?, ?, ?)").run(
        completionFact.id, asyncEnrollment, asyncCourse.id, asyncLearner);
      if (failAfterBusinessWrite) throw new InjectedFailure("After completion, before outbox");
      producer.prepare("INSERT INTO outbox (event_id, payload) VALUES (?, ?)").run(
        completionFact.id, JSON.stringify(completionFact));
      if (failAfterOutboxWrite) throw new InjectedFailure("Before transaction commit");
      producer.exec("COMMIT");
    } catch (error) {
      producer.exec("ROLLBACK");
      throw error;
    }
  }

  for (const failure of [{ failAfterBusinessWrite: true }, { failAfterOutboxWrite: true }]) {
    assert.throws(() => complete(failure), InjectedFailure);
    assert.equal(producerCount("completions"), 0);
    assert.equal(producerCount("outbox"), 0);
    assert.equal(producer.prepare("SELECT completed FROM enrollments WHERE id = ?").get(asyncEnrollment).completed, 0);
  }
  complete();
  assert.equal(producerCount("completions"), 1);
  assert.equal(producerCount("outbox"), 1);
  assert.equal(producer.prepare("SELECT seats FROM courses WHERE id = ?").get(asyncCourse.id).seats, 29);

  // Publication is outside the producer transaction; skipping its marker models a crash window.
  const deliveries = [];
  function publish(markPublished) {
    for (const row of producer.prepare("SELECT event_id, payload FROM outbox WHERE published = 0").all()) {
      deliveries.push(JSON.parse(row.payload));
      if (markPublished) producer.prepare("UPDATE outbox SET published = 1 WHERE event_id = ?").run(row.event_id);
    }
  }
  publish(false);
  publish(true);
  assert.equal(deliveries.length, 2);
  assert.deepEqual(deliveries[0], deliveries[1]);

  function consume(event, failBeforeCommit = false) {
    if (event.type !== "course.completed" || !event.id ||
        typeof event.data?.courseId !== "string" || typeof event.data?.learnerId !== "string") {
      throw new Error("Invalid completion event");
    }
    const fingerprint = JSON.stringify([event.type, event.data.courseId, event.data.learnerId]);
    // This lookup stands for an authorized source lookup, not a distributed transaction.
    const completion = producer.prepare("SELECT * FROM completions WHERE id = ?").get(event.id);
    if (!completion || completion.course_id !== event.data.courseId || completion.learner_id !== event.data.learnerId) {
      throw new Error("Payload does not match the authoritative completion");
    }
    consumer.exec("BEGIN IMMEDIATE");
    try {
      const previous = consumer.prepare("SELECT fingerprint FROM inbox WHERE source = ? AND consumer_group = ? AND event_id = ?")
        .get("course-service", "certificate-consumer", event.id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("Conflicting event payload");
        consumer.exec("COMMIT");
        return "duplicate";
      }
      consumer.prepare("INSERT INTO inbox VALUES (?, ?, ?, ?)").run(
        "course-service", "certificate-consumer", event.id, fingerprint);
      consumer.prepare("INSERT INTO certificates VALUES (?, ?, ?, ?, ?)").run(
        "certificate-42", event.id, completion.enrollment_id, completion.learner_id, completion.course_id);
      if (failBeforeCommit) throw new InjectedFailure("Before certificate/inbox commit");
      consumer.exec("COMMIT");
      return "processed";
    } catch (error) {
      consumer.exec("ROLLBACK");
      throw error;
    }
  }

  assert.throws(() => consume(deliveries[0], true), InjectedFailure);
  assert.equal(consumerCount("inbox"), 0);
  assert.equal(consumerCount("certificates"), 0);
  assert.equal(consume(deliveries[0]), "processed");
  // The first delivery's acknowledgement is deliberately absent; its redelivery must not repeat the local effect.
  assert.equal(consume(deliveries[1]), "duplicate");
  assert.equal(consumerCount("inbox"), 1);
  assert.equal(consumerCount("certificates"), 1);
  assert.throws(() => consume({ ...completionFact, data: { ...completionFact.data, courseId: "course-102" } }));
  assert.equal(consumerCount("certificates"), 1);

  function projection() {
    let state = { aggregateId, version: 0, percentComplete: 0, completed: false };
    const seen = new Map();
    return {
      get state() { return structuredClone(state); },
      apply(event) {
        if (event.aggregateId !== aggregateId) throw new Error("Event belongs to another aggregate");
        const fingerprint = JSON.stringify([
          event.type, event.version, event.data.courseId, event.data.learnerId,
          event.type === "course.progress-recorded" ? event.data.percentComplete : null,
        ]);
        if (seen.has(event.id)) {
          if (seen.get(event.id) !== fingerprint) throw new Error("Conflicting repeated event");
          return;
        }
        if (event.version !== state.version + 1) throw new Error("Projection version gap");
        if (event.type === "course.progress-recorded") {
          if (!Number.isInteger(event.data.percentComplete) || event.data.percentComplete < 0 || event.data.percentComplete > 100) {
            throw new Error("Invalid progress value");
          }
          state.percentComplete = event.data.percentComplete;
        } else if (event.type === "course.completed") {
          // This teaching policy maps authoritative completion to 100%; not every product must do so.
          state.percentComplete = 100;
          state.completed = true;
        } else throw new Error("Unsupported event type");
        state.version = event.version;
        seen.set(event.id, fingerprint);
      },
    };
  }
  const view = projection();
  assert.throws(() => view.apply(projectionEvents[2]), /gap/);
  for (const event of projectionEvents) view.apply(event);
  const expected = { aggregateId, version: 3, percentComplete: 100, completed: true };
  assert.deepEqual(view.state, expected);
  for (const event of projectionEvents) view.apply(event);
  assert.deepEqual(view.state, expected);
  view.apply({
    ...projectionEvents[1],
    data: { percentComplete: 40, learnerId: "learner-7", courseId: "course-101" },
  });
  assert.deepEqual(view.state, expected, "Equivalent member order must not change the semantic replay result");
  const rebuilt = projection();
  for (const event of projectionEvents) rebuilt.apply(event);
  assert.deepEqual(rebuilt.state, expected);
  assert.throws(() => view.apply({ ...projectionEvents[1], data: { ...projectionEvents[1].data, percentComplete: 99 } }), /Conflicting/);
  assert.equal(consumerCount("certificates"), 1, "Pure read-model replay must not issue another certificate");

  const backlog = (queueBudget.arrivalsPerSecond - queueBudget.processingPerSecond) * queueBudget.overloadSeconds;
  assert.equal(backlog, 360);
  assert.equal(backlog / (queueBudget.processingPerSecond - queueBudget.recoveryArrivalsPerSecond), 180);
  console.log("SQLite transaction probes passed: business/outbox rollback together; duplicate publication; inbox/local-certificate rollback and redelivery deduplication.");
  console.log("Projection probes passed: version gaps, repeated IDs, reconstruction, no replayed certificate effect; queue growth/drain is 360 jobs/180 seconds.");
  console.log("These use in-memory SQLite and simulated publication/ack windows, not a live broker, process crash, external email or disk-durability test.");
} finally {
  consumer.close();
  producer.close();
}
