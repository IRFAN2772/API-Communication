import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expertCourse, expertEnrollment, reservationCase } from "../assets/expert-lesson-fixtures.mjs";

class InjectedFailure extends Error {}

function createStore() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, seats INTEGER NOT NULL CHECK (seats >= 0));
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, learner_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id), provider_key TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('awaiting-provider', 'unknown', 'confirmed', 'released'))
    );
    CREATE TABLE enrollments (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id), learner_id TEXT NOT NULL,
      reservation_id TEXT UNIQUE REFERENCES reservations(id)
    );
    CREATE TABLE outbox (reservation_id TEXT PRIMARY KEY REFERENCES reservations(id), payload TEXT NOT NULL, dispatched INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE inbox (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
  `);
  db.prepare("INSERT INTO courses VALUES (?, ?, ?)").run(expertCourse.id, expertCourse.title, expertCourse.seats);
  db.prepare("INSERT INTO enrollments VALUES (?, ?, ?, NULL)").run(
    expertEnrollment.id, expertEnrollment.courseId, expertEnrollment.learnerId);
  const seatCount = () => db.prepare("SELECT seats FROM courses WHERE id = ?").get(expertCourse.id).seats;
  const reservation = () => db.prepare("SELECT * FROM reservations WHERE id = ?").get(reservationCase.reservationId);
  const count = table => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function reserve(intent, failurePoint) {
    const fingerprint = JSON.stringify([intent.learnerId, intent.courseId, intent.providerKey, intent.reservationId]);
    return transaction(() => {
      const previous = db.prepare("SELECT * FROM reservations WHERE intent_id = ?").get(intent.intentId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("Conflicting reservation intent");
        return previous.id;
      }
      const update = db.prepare("UPDATE courses SET seats = seats - 1 WHERE id = ? AND seats > 0").run(intent.courseId);
      if (update.changes !== 1) throw new Error("Course unavailable or no seat can be reserved");
      if (failurePoint === "after-seat") throw new InjectedFailure("After seat write");
      db.prepare("INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, 'awaiting-provider')").run(
        intent.reservationId, intent.intentId, intent.learnerId, intent.courseId, intent.providerKey, fingerprint);
      db.prepare("INSERT INTO outbox (reservation_id, payload) VALUES (?, ?)").run(
        intent.reservationId, JSON.stringify(intent));
      if (failurePoint === "before-commit") throw new InjectedFailure("After outbox, before commit");
      return intent.reservationId;
    });
  }
  function recordUnknown() {
    return transaction(() => {
      const row = reservation();
      if (!row) throw new Error("Unknown reservation");
      if (row.status === "unknown") return "already-unknown";
      if (row.status !== "awaiting-provider") throw new Error("Cannot mark terminal outcome unknown");
      db.prepare("UPDATE reservations SET status = 'unknown' WHERE id = ?").run(row.id);
      return "unknown";
    });
  }
  function receive(event, failBeforeCommit = false) {
    if (!event.id || !["LicenseGranted", "LicenseRejected"].includes(event.type)) {
      throw new Error("A terminal license receipt is required");
    }
    const fingerprint = JSON.stringify([event.type, event.reservationId, event.providerKey]);
    return transaction(() => {
      const row = db.prepare("SELECT * FROM reservations WHERE id = ?").get(event.reservationId);
      if (!row || row.provider_key !== event.providerKey) throw new Error("Receipt does not match reservation");
      const previous = db.prepare("SELECT fingerprint FROM inbox WHERE id = ?").get(event.id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("Conflicting receipt");
        return "duplicate";
      }
      if (!["awaiting-provider", "unknown"].includes(row.status)) throw new Error("Conflicting terminal transition");
      db.prepare("INSERT INTO inbox VALUES (?, ?)").run(event.id, fingerprint);
      if (event.type === "LicenseGranted") {
        db.prepare("INSERT INTO enrollments VALUES (?, ?, ?, ?)").run(
          "enrollment-8", row.course_id, row.learner_id, row.id);
        db.prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ?").run(row.id);
      } else {
        db.prepare("UPDATE courses SET seats = seats + 1 WHERE id = ?").run(row.course_id);
        db.prepare("UPDATE reservations SET status = 'released' WHERE id = ?").run(row.id);
      }
      if (failBeforeCommit) throw new InjectedFailure("After receipt/effect, before commit");
      return "processed";
    });
  }
  return { db, seatCount, reservation, count, reserve, recordUnknown, receive };
}

export function runExpertTransactionProbe() {
  const confirmed = createStore();
  const rejected = createStore();
  const grant = {
    id: "license-result-8", type: "LicenseGranted",
    reservationId: reservationCase.reservationId, providerKey: reservationCase.providerKey,
  };
  try {
    for (const point of ["after-seat", "before-commit"]) {
      assert.throws(() => confirmed.reserve(reservationCase, point), InjectedFailure);
      assert.equal(confirmed.seatCount(), 29);
      assert.equal(confirmed.count("reservations"), 0);
      assert.equal(confirmed.count("outbox"), 0);
      assert.equal(confirmed.count("enrollments"), 1);
    }
    confirmed.reserve(reservationCase);
    assert.equal(confirmed.seatCount(), 28);
    assert.equal(confirmed.reservation().status, "awaiting-provider");
    assert.equal(confirmed.reserve({ ...reservationCase }), reservationCase.reservationId);
    assert.equal(confirmed.seatCount(), 28);
    assert.throws(() => confirmed.reserve({ ...reservationCase, learnerId: "learner-9" }), /Conflicting/);
    assert.equal(confirmed.seatCount(), 28);

    // This models duplicate dispatch, not a real license provider or process crash.
    const deliveries = [];
    for (const mark of [false, true]) {
      for (const row of confirmed.db.prepare("SELECT * FROM outbox WHERE dispatched = 0").all()) {
        deliveries.push(JSON.parse(row.payload));
        if (mark) confirmed.db.prepare("UPDATE outbox SET dispatched = 1 WHERE reservation_id = ?").run(row.reservation_id);
      }
    }
    assert.equal(deliveries.length, 2);
    assert.deepEqual(deliveries[0], deliveries[1]);
    assert.equal(confirmed.recordUnknown(), "unknown");
    assert.equal(confirmed.recordUnknown(), "already-unknown");
    assert.equal(confirmed.seatCount(), 28);
    assert.equal(confirmed.count("enrollments"), 1);
    assert.throws(() => confirmed.receive({ ...grant, type: "LicenseOutcomeUnknown" }), /terminal/);

    assert.throws(() => confirmed.receive(grant, true), InjectedFailure);
    assert.equal(confirmed.count("inbox"), 0);
    assert.equal(confirmed.count("enrollments"), 1);
    assert.equal(confirmed.reservation().status, "unknown");
    assert.equal(confirmed.receive(grant), "processed");
    assert.equal(confirmed.reservation().status, "confirmed");
    assert.equal(confirmed.seatCount(), 28);
    assert.equal(confirmed.receive({
      providerKey: grant.providerKey, reservationId: grant.reservationId, type: grant.type, id: grant.id,
    }), "duplicate");
    assert.equal(confirmed.count("enrollments"), 2);
    assert.equal(confirmed.count("inbox"), 1);
    assert.throws(() => confirmed.receive({ ...grant, type: "LicenseRejected" }), /Conflicting receipt/);
    assert.throws(() => confirmed.receive({ ...grant, id: "second-conflicting-result", type: "LicenseRejected" }), /terminal/);
    assert.equal(confirmed.seatCount(), 28);

    rejected.reserve(reservationCase);
    rejected.recordUnknown();
    const decline = { ...grant, type: "LicenseRejected" };
    assert.throws(() => rejected.receive(decline, true), InjectedFailure);
    assert.equal(rejected.seatCount(), 28);
    assert.equal(rejected.reservation().status, "unknown");
    assert.equal(rejected.count("inbox"), 0);
    assert.equal(rejected.receive(decline), "processed");
    assert.equal(rejected.reservation().status, "released");
    assert.equal(rejected.seatCount(), 29);
    assert.equal(rejected.receive(decline), "duplicate");
    assert.equal(rejected.seatCount(), 29);
    assert.equal(rejected.count("enrollments"), 1);
    assert.ok(rejected.db.prepare("SELECT id FROM enrollments WHERE id = ?").get(expertEnrollment.id));

    function twoPhaseModel(states) {
      const participants = new Map(states);
      let decision = null;
      return {
        participants,
        recordDecision(next) {
          if (!["commit", "abort"].includes(next)) throw new Error("Invalid commit decision");
          if (decision) {
            if (decision !== next) throw new Error("Cannot replace recorded decision");
            return;
          }
          if (next === "commit" && [...participants.values()].some(state => state !== "prepared")) {
            throw new Error("Commit requires all participants prepared");
          }
          decision = next;
        },
        recover() {
          if (!decision) return "in-doubt";
          for (const participant of participants.keys()) {
            participants.set(participant, decision === "commit" ? "committed" : "aborted");
          }
          return decision;
        },
      };
    }
    const committed = twoPhaseModel([["A", "prepared"], ["B", "prepared"]]);
    assert.equal(committed.recover(), "in-doubt");
    assert.deepEqual([...committed.participants.values()], ["prepared", "prepared"]);
    committed.recordDecision("commit");
    assert.throws(() => committed.recordDecision("abort"), /recorded decision/);
    assert.equal(committed.recover(), "commit");
    committed.recordDecision("commit");
    assert.equal(committed.recover(), "commit");
    assert.deepEqual([...committed.participants.values()], ["committed", "committed"]);
    const aborted = twoPhaseModel([["A", "prepared"], ["B", "declined"]]);
    assert.throws(() => aborted.recordDecision("commit"), /all participants prepared/);
    aborted.recordDecision("abort");
    assert.equal(aborted.recover(), "abort");
    assert.deepEqual([...aborted.participants.values()], ["aborted", "aborted"]);

    return { initialSeats: 29, confirmedSeats: 28, releasedSeats: 29, dispatches: 2, localEnrollments: 2, receipts: 1 };
  } finally {
    confirmed.db.close();
    rejected.db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("Passed actual in-memory SQLite reservation/outbox and receipt/effect rollback, matching replay, conflict and one-time release:", runExpertTransactionProbe());
  console.log("2PC recovery is an abstract decision model; no real provider, disk crash, distributed commit or production authorization is tested.");
}
