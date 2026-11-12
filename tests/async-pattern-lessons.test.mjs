import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregateId, asyncCourse, asyncEnrollment, asyncLearner, completionFact,
  emailCommand, certificateCommand, projectionEvents,
} from "../assets/async-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const workflowLesson = readFileSync(new URL("docs/lessons/OUTBOX-INBOX-AND-WORKFLOWS.md", root), "utf8");
const eventLesson = readFileSync(new URL("docs/lessons/EVENT-MODELS-AND-PROJECTIONS.md", root), "utf8");

// Test-only pure projection; it is neither a broker nor a durable consumer.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function initialProjection() {
  return { aggregateId, version: 0, percentComplete: 0, completed: false, ids: {}, versions: {} };
}

function project(state, event) {
  if (event.aggregateId !== state.aggregateId || !Number.isSafeInteger(event.version) || event.version < 1) {
    throw new Error("invalid aggregate or version");
  }
  const fingerprint = canonical(event);
  const byId = state.ids[event.id];
  const byVersion = state.versions[event.version];
  if (byId || byVersion) {
    if (byId?.version === event.version && byId.fingerprint === fingerprint &&
        byVersion?.id === event.id && byVersion.fingerprint === fingerprint) return state;
    throw new Error("event identity conflict");
  }
  if (event.version !== state.version + 1) throw new Error("version gap");
  let percentComplete = state.percentComplete;
  let completed = state.completed;
  if (event.type === "course.progress-recorded") {
    if (!Number.isFinite(event.data.percentComplete) || event.data.percentComplete < 0 ||
        event.data.percentComplete > 100 || completed) throw new Error("invalid progress");
    percentComplete = event.data.percentComplete;
  } else if (event.type === "course.completed") {
    if (completed) throw new Error("already completed");
    percentComplete = 100;
    completed = true;
  } else {
    throw new Error("unknown event");
  }
  return {
    ...state, version: event.version, percentComplete, completed,
    ids: { ...state.ids, [event.id]: { version: event.version, fingerprint } },
    versions: { ...state.versions, [event.version]: { id: event.id, fingerprint } },
  };
}

// This pure example models decisions, not payment/provider implementation.
function initialSaga() {
  return { available: 1, reservation: "none", payment: "pending", activation: "pending", refund: "none", outcome: "pending" };
}

function saga(state, action) {
  const s = { ...state };
  switch (action) {
    case "reserve":
      if (s.reservation !== "none" || s.available < 1 || s.outcome !== "pending") throw new Error("cannot reserve");
      s.available--; s.reservation = "held"; break;
    case "authorize":
      if (s.reservation !== "held" || s.payment !== "pending") throw new Error("cannot authorize");
      s.payment = "authorized"; break;
    case "charge-unknown":
      if (s.reservation !== "held" || s.payment !== "authorized") throw new Error("cannot charge");
      s.payment = "unknown"; break;
    case "charge-confirmed":
      if (s.reservation !== "held" || !["authorized", "unknown"].includes(s.payment)) throw new Error("cannot confirm charge");
      s.payment = "charged"; break;
    case "charge-not-made":
      if (s.payment !== "unknown") throw new Error("not unknown");
      s.payment = "authorized"; break;
    case "activation-failed":
      if (s.payment !== "charged" || s.reservation !== "held") throw new Error("cannot fail activation");
      s.activation = "failed"; break;
    case "activate":
      if (s.payment !== "charged" || s.reservation !== "held" || s.activation !== "pending") throw new Error("cannot activate");
      s.reservation = "consumed"; s.activation = "active"; s.outcome = "success"; break;
    case "request-refund":
      if (s.payment !== "charged" || s.activation !== "failed" || !["none", "failed"].includes(s.refund)) throw new Error("cannot request refund");
      s.refund = "pending"; break;
    case "refund-failed":
      if (s.refund !== "pending") throw new Error("no pending refund");
      s.refund = "failed"; break;
    case "refund-unknown":
      if (s.refund !== "pending") throw new Error("no pending refund");
      s.refund = "unknown"; break;
    case "refund-confirmed":
      if (s.payment !== "charged" || s.activation !== "failed" || !["pending", "unknown"].includes(s.refund)) throw new Error("cannot refund");
      s.payment = "refunded"; s.refund = "confirmed"; break;
    case "release":
      if (s.reservation !== "held" || !["pending", "authorized", "refunded"].includes(s.payment) ||
          (s.payment === "authorized" && s.activation !== "pending")) throw new Error("unsafe release");
      s.reservation = "released"; s.available++; s.outcome = "failed"; break;
    default: throw new Error("unknown action");
  }
  return s;
}

test("canonical scenario, fact, commands and alternative envelopes remain aligned", () => {
  assert.deepEqual(asyncCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.equal(asyncEnrollment, "enrollment-42");
  assert.equal(asyncLearner, "learner-7");
  assert.deepEqual(completionFact, {
    id: "completion-42", type: "course.completed",
    data: { courseId: "course-101", learnerId: "learner-7" },
  });
  assert.deepEqual(projectionEvents.map(({ id, version, aggregateId: idOfAggregate }) => [id, version, idOfAggregate]),
    [["progress-20", 1, aggregateId], ["progress-40", 2, aggregateId], ["completion-42", 3, aggregateId]]);
  const { aggregateId: ignoredAggregate, version: ignoredVersion, ...sourceFact } = projectionEvents[2];
  assert.deepEqual(sourceFact, completionFact);
  assert.deepEqual(projectionEvents.slice(0, 2).map(event => event.data.percentComplete), [20, 40]);
  for (const lesson of [workflowLesson, eventLesson]) {
    for (const item of [completionFact, emailCommand, certificateCommand]) assert.ok(lesson.includes(JSON.stringify(item)));
    assert.match(lesson, /40% is not completion/i);
    assert.match(lesson, /per enrollment/i);
  }
});

test("projection applies lesson policy and exact duplicates without mutating state", () => {
  let state = initialProjection();
  for (const [index, event] of projectionEvents.entries()) {
    const before = structuredClone(state);
    const next = project(state, event);
    assert.deepEqual(state, before);
    state = next;
    assert.deepEqual([state.version, state.percentComplete, state.completed],
      [[1, 20, false], [2, 40, false], [3, 100, true]][index]);
    assert.strictEqual(project(state, structuredClone(event)), state);
  }
  assert.throws(() => project(state, { ...projectionEvents[1], data: { ...projectionEvents[1].data, percentComplete: 41 } }), /conflict/);
  assert.throws(() => project(state, { ...projectionEvents[1], id: "another-id" }), /conflict/);
  assert.throws(() => project(state, { ...projectionEvents[1], version: 4 }), /conflict/);
  assert.throws(() => project(state, { ...projectionEvents[0], aggregateId: "other" }), /aggregate/);
});

test("reordering detects gaps; ordered recovery and snapshot-tail replay agree", () => {
  const first = project(initialProjection(), projectionEvents[0]);
  const before = structuredClone(first);
  assert.throws(() => project(first, projectionEvents[2]), /gap/);
  assert.deepEqual(first, before);
  const snapshot = project(first, projectionEvents[1]);
  const recovered = project(snapshot, projectionEvents[2]);
  const fullReplay = projectionEvents.reduce(project, initialProjection());
  assert.deepEqual(recovered, fullReplay);
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.percentComplete, 40);
  assert.equal(snapshot.completed, false);
  assert.equal(fullReplay.completed, true);
});

test("saga succeeds only with a consumed reservation, charge and active enrollment", () => {
  let state = initialSaga();
  for (const action of ["reserve", "authorize", "charge-confirmed", "activate"]) state = saga(state, action);
  assert.deepEqual(state, {
    available: 0, reservation: "consumed", payment: "charged", activation: "active", refund: "none", outcome: "success",
  });
  assert.throws(() => saga(state, "reserve"), /cannot reserve/);
  assert.throws(() => saga(state, "activate"), /cannot activate/);
  assert.throws(() => saga(initialSaga(), "activate"), /cannot activate/);
});

test("unknown charge cannot be blindly refunded or released; failed compensation remains pending", () => {
  let state = initialSaga();
  for (const action of ["reserve", "authorize", "charge-unknown"]) state = saga(state, action);
  assert.equal(state.outcome, "pending");
  assert.throws(() => saga(state, "release"), /unsafe release/);
  assert.throws(() => saga(state, "refund-confirmed"), /cannot refund/);
  assert.throws(() => saga(state, "activate"), /cannot activate/);
  const noCharge = saga(state, "charge-not-made");
  assert.equal(saga(noCharge, "release").outcome, "failed");
  state = saga(state, "charge-confirmed");
  state = saga(state, "activation-failed");
  assert.throws(() => saga(state, "release"), /unsafe release/);
  state = saga(state, "request-refund");
  state = saga(state, "refund-failed");
  assert.equal(state.refund, "failed");
  assert.equal(state.payment, "charged");
  assert.equal(state.outcome, "pending");
  assert.throws(() => saga(state, "release"), /unsafe release/);
  state = saga(state, "request-refund");
  state = saga(state, "refund-unknown");
  assert.throws(() => saga(state, "request-refund"), /cannot request refund/);
  assert.throws(() => saga(state, "release"), /unsafe release/);
  state = saga(state, "refund-confirmed");
  assert.throws(() => saga(state, "refund-confirmed"), /cannot refund/);
  state = saga(state, "release");
  assert.deepEqual([state.payment, state.reservation, state.available, state.outcome], ["refunded", "released", 1, "failed"]);
});

test("lessons provide valid examples, closed answers, references and focused links", () => {
  const shared = [
    "../05-GUIDED-ASYNC.md", "../05-ASYNC-APIS.md", "BROKERS-DELIVERY-AND-RECOVERY.md",
    "../04-GUIDED-REALTIME.md", "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md",
    "../../assets/async-lesson-fixtures.mjs",
  ];
  for (const [lesson, other] of [[workflowLesson, "EVENT-MODELS-AND-PROJECTIONS.md"], [eventLesson, "OUTBOX-INBOX-AND-WORKFLOWS.md"]]) {
    const lines = lesson.split("\n").length;
    assert.ok(lines >= 350 && lines <= 500, `lesson has ${lines} lines`);
    for (const path of [...shared, other]) assert.ok(lesson.includes(`](${path})`), path);
    const examples = [...lesson.matchAll(/```json\n([\s\S]*?)\n```/g)];
    assert.ok(examples.length >= 3);
    for (const [, example] of examples) assert.doesNotThrow(() => JSON.parse(example));
    const open = lesson.match(/<details class="learning-answer">/g) ?? [];
    assert.ok(open.length >= 5);
    assert.equal(open.length, (lesson.match(/<\/details>/g) ?? []).length);
    assert.equal(open.length, (lesson.match(/<summary>/g) ?? []).length);
    assert.match(lesson, /Primary references:/);
    assert.match(lesson, /Original claim ledger/);
  }
  const envelope = JSON.parse([...eventLesson.matchAll(/```json\n([\s\S]*?)\n```/g)][3][1]);
  assert.deepEqual(envelope, projectionEvents);
});
