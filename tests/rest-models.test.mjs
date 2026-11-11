import test from "node:test";
import assert from "node:assert/strict";
import { applyCourseRequest, initialCourses, initialOrders, submitOrder, initialDocument, courseTag, updateCourse, lessons, lessonTrace, lessonFrame } from "../assets/rest-models.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const payload = { courseId: "course-101", learnerId: "learner-7" };
const replacement = { title: "REST Studio", seats: 24 };

test("every scene and scenario has deterministic, independent frames and bounded navigation", () => {
  for (const [lesson, metadata] of Object.entries(lessons)) {
    assert.deepEqual(lessonTrace(lesson), lessonTrace(lesson, Object.keys(metadata.scenarios)[0]));
    for (const scenario of Object.keys(metadata.scenarios)) {
      const frames = lessonTrace(lesson, scenario);
      assert.ok(frames.length >= 6 && frames.length <= 8);
      assert.deepEqual(frames, lessonTrace(lesson, scenario));
      assert.deepEqual(lessonFrame(lesson, scenario, -10), frames[0]);
      assert.deepEqual(lessonFrame(lesson, scenario, 1000), frames.at(-1));
      frames.forEach((frame, index) => {
        assert.equal(frame.step, index);
        for (const field of ["title", "explanation", "client", "server", "storage", "request", "response"]) {
          assert.equal(typeof frame[field], "string");
          assert.ok(frame[field].length > 0);
        }
        assert.deepEqual(JSON.parse(frame.storage), frame.snapshot);
        assert.ok(["client", "server", "storage", "request", "response", "lost"].includes(frame.active));
        assert.ok(["client", "server", "storage"].includes(frame.event.from));
        assert.ok(["client", "server", "storage"].includes(frame.event.to));
        if (frame.decision) assert.ok(frame.decision.branches.includes(frame.decision.selected));
        if (index > 0) assert.notEqual(frame.snapshot, frames[index - 1].snapshot);
      });
      frames[0].snapshot.tampered = true;
      assert.equal(frames[1].snapshot.tampered, undefined);
      assert.equal(lessonTrace(lesson, scenario)[0].snapshot.tampered, undefined);
    }
  }
});

test("unknown lessons/scenarios and invalid steps fail explicitly", () => {
  for (const lesson of ["unknown", "__proto__", null]) assert.throws(() => lessonTrace(lesson), RangeError);
  assert.throws(() => lessonTrace("anatomy", "unknown"), RangeError);
  for (const step of [NaN, Infinity, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => lessonFrame("anatomy", "read", step), TypeError);
  }
});

test("course methods produce the documented statuses, bodies, and state snapshots", () => {
  const expected = { read: 200, create: 201, replace: 200, patch: 200, remove: 204, invalid: 400, missing: 404 };
  for (const [scenario, status] of Object.entries(expected)) {
    const frames = lessonTrace("anatomy", scenario);
    assert.deepEqual(frames[2].snapshot, initialCourses());
    assert.equal(frames[3].status, null);
    assert.equal(frames[4].status, status);
    assert.equal(frames[4].delivered, false);
    assert.equal(frames[5].delivered, true);
    assert.match(frames[4].response, new RegExp(`HTTP/1.1 ${status}`));
    if (["read", "invalid", "missing"].includes(scenario)) assert.deepEqual(frames.at(-1).snapshot, initialCourses());
  }
  assert.equal(lessonTrace("anatomy", "create").at(-1).snapshot.courses.length, 2);
  assert.match(lessonTrace("anatomy", "create").at(-1).response, /Location: \/courses\/course-102/);
  assert.equal(lessonTrace("anatomy", "replace").at(-1).snapshot.courses[0].title, "REST Studio");
  assert.equal(lessonTrace("anatomy", "patch").at(-1).snapshot.courses[0].title, "API Fundamentals");
  assert.equal(lessonTrace("anatomy", "patch").at(-1).snapshot.courses[0].seats, 20);
  assert.equal(lessonTrace("anatomy", "remove").at(-1).snapshot.courses.length, 0);
  assert.equal(lessonTrace("anatomy", "remove").at(-1).response, "HTTP/1.1 204 No Content");
  assert.doesNotMatch(lessonTrace("anatomy", "read")[0].request, /Content-Type/);
  assert.match(lessonTrace("anatomy", "create")[0].request, /Content-Type: application\/json\n\n\{/);
});

test("course operations do not mutate input and preserve method effect invariants", () => {
  const state = initialCourses();
  const original = clone(state);
  const get = applyCourseRequest(state, { method: "GET", path: "/courses/course-101" });
  get.response.body.title = "Changed copy";
  assert.deepEqual(state, original);
  for (const method of ["PUT", "PATCH"]) {
    const spec = { method, path: "/courses/course-101", body: replacement };
    const once = applyCourseRequest(state, spec);
    const twice = applyCourseRequest(once.state, spec);
    assert.deepEqual(once.state, twice.state);
    assert.equal(once.response.status, 200);
  }
  const once = applyCourseRequest(state, { method: "DELETE", path: "/courses/course-101" });
  const twice = applyCourseRequest(once.state, { method: "DELETE", path: "/courses/course-101" });
  assert.equal(once.response.status, 204);
  assert.equal(twice.response.status, 404);
  assert.deepEqual(once.state, twice.state);
  const post = { method: "POST", path: "/courses", body: replacement };
  const first = applyCourseRequest(state, post);
  const second = applyCourseRequest(first.state, post);
  assert.equal(second.state.courses.length, 3);
  assert.notEqual(first.response.body.id, second.response.body.id);
  assert.deepEqual(state, original);
  assert.deepEqual(post.body, replacement);
});

test("schema boundaries reject invalid bodies without writing", () => {
  const state = initialCourses();
  for (const method of ["POST", "PUT"]) {
    for (const body of [null, {}, { seats: 30 }, { title: "   ", seats: 30 }, { title: "a".repeat(81), seats: 0 },
      { title: "OK", seats: -1 }, { title: "OK", seats: 201 }, { title: "OK", seats: 1.5 }, { title: "OK", seats: "30" },
      { ...replacement, admin: true }]) {
      const result = applyCourseRequest(state, { method, path: method === "POST" ? "/courses" : "/courses/course-101", body });
      assert.equal(result.response.status, 400);
      assert.deepEqual(result.state, state);
    }
  }
  for (const body of [{ seats: 0 }, { seats: 200 }, { title: "a".repeat(80) }]) {
    assert.equal(applyCourseRequest(state, { method: "PATCH", path: "/courses/course-101", body }).response.status, 200);
  }
  for (const body of [null, {}, { id: "course-999" }, { seats: -1 }, { title: "" }]) {
    const result = applyCourseRequest(state, { method: "PATCH", path: "/courses/course-101", body });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.state, state);
  }
  assert.throws(() => applyCourseRequest(null, {}), TypeError);
  assert.throws(() => applyCourseRequest(state, { method: "TRACE", path: "/courses/course-101" }), TypeError);
  assert.throws(() => applyCourseRequest(state, { method: "GET", path: "/users/123" }), TypeError);
  assert.throws(() => applyCourseRequest(state, { method: "GET", path: "/courses" }), RangeError);
  assert.throws(() => applyCourseRequest(state, { method: "POST", path: "/courses/course-101" }), RangeError);
  assert.throws(() => applyCourseRequest({ ...state, nextId: 101 }, { method: "POST", path: "/courses", body: replacement }), TypeError);
  assert.throws(() => applyCourseRequest({ ...state, nextId: Number.MAX_SAFE_INTEGER }, { method: "POST", path: "/courses", body: replacement }), RangeError);
});

test("lost reply leaves a committed effect but no client knowledge", () => {
  for (const scenario of ["duplicate", "protected", "mismatch"]) {
    const frames = lessonTrace("retry", scenario);
    assert.equal(frames[2].metrics.orders, 1);
    assert.equal(frames[3].metrics.orders, 1);
    assert.equal(frames[3].status, 201);
    assert.equal(frames[3].delivered, false);
    assert.match(frames[3].client, /UNKNOWN/);
  }
  assert.equal(lessonTrace("retry", "duplicate").at(-1).metrics.orders, 2);
  assert.equal(lessonTrace("retry", "protected").at(-1).metrics.orders, 1);
  const conflict = lessonTrace("retry", "mismatch").at(-1);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.metrics.orders, 1);
  assert.equal(conflict.metrics.keys, 1);
});

test("atomic key contract replays the exact response and binds semantic payload", () => {
  const state = initialOrders();
  const first = submitOrder(state, payload, "enroll-7");
  assert.deepEqual(state, initialOrders());
  assert.equal(first.committed, true);
  assert.equal(first.state.orders.length, 1);
  assert.equal(Object.keys(first.state.keys).length, 1);
  const replay = submitOrder(first.state, { learnerId: "learner-7", courseId: "course-101" }, "enroll-7");
  assert.equal(replay.replayed, true);
  assert.equal(replay.committed, false);
  assert.deepEqual(replay.response, first.response);
  assert.deepEqual(replay.state, first.state);
  replay.response.body.courseId = "tampered";
  assert.equal(submitOrder(first.state, payload, "enroll-7").response.body.courseId, "course-101");
  const mismatch = submitOrder(first.state, { ...payload, courseId: "course-202" }, "enroll-7");
  assert.equal(mismatch.response.status, 409);
  assert.deepEqual(mismatch.state, first.state);
  const newIntent = submitOrder(first.state, payload, "new-intent");
  assert.equal(newIntent.state.orders.length, 2);
  assert.equal(Object.keys(newIntent.state.keys).length, 2);
});

test("repeated protected attempts stay at one effect; no-key attempts accumulate", () => {
  let protectedState = initialOrders();
  let unprotectedState = initialOrders();
  for (let i = 0; i < 100; i++) {
    protectedState = submitOrder(protectedState, payload, "enroll-7").state;
    unprotectedState = submitOrder(unprotectedState, payload).state;
  }
  assert.equal(protectedState.orders.length, 1);
  assert.equal(Object.keys(protectedState.keys).length, 1);
  assert.equal(unprotectedState.orders.length, 100);
  assert.equal(Object.keys(unprotectedState.keys).length, 0);
});

test("abort rolls back effect and key together, so retry can create once", () => {
  const aborted = submitOrder(initialOrders(), payload, "enroll-7", { commit: false });
  assert.equal(aborted.response, null);
  assert.equal(aborted.committed, false);
  assert.deepEqual(aborted.state, initialOrders());
  const retry = submitOrder(aborted.state, payload, "enroll-7");
  assert.equal(retry.response.status, 201);
  assert.equal(retry.state.orders.length, 1);
  assert.equal(Object.keys(retry.state.keys).length, 1);
  const frames = lessonTrace("retry", "rollback");
  assert.equal(frames[3].metrics.orders, 0);
  assert.equal(frames[3].metrics.keys, 0);
  assert.equal(frames[3].status, null);
  assert.equal(frames.at(-1).metrics.orders, 1);
});

test("invalid order payloads do not consume keys and key bounds are explicit", () => {
  for (const body of [null, {}, { ...payload, courseId: "course-999" }, { ...payload, learnerId: "real-person" }, { ...payload, price: 100 }]) {
    const result = submitOrder(initialOrders(), body, "enroll-7");
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.state, initialOrders());
  }
  for (const key of ["", "x".repeat(65), "UPPER", "a b", 1]) assert.throws(() => submitOrder(initialOrders(), payload, key), TypeError);
  assert.equal(submitOrder(initialOrders(), payload, "x".repeat(64)).response.status, 201);
  assert.throws(() => submitOrder(null, payload), TypeError);
  assert.throws(() => submitOrder(initialOrders(), payload, null, { commit: "yes" }), TypeError);
});

test("ETag rejects stale, weak, and missing guards without a write", () => {
  const state = initialDocument();
  assert.equal(courseTag(state), '"course-101-v1"');
  const a = updateCourse(state, { title: "REST Studio", seats: 30 }, courseTag(state));
  assert.deepEqual(state, initialDocument());
  assert.equal(a.state.revision, 2);
  assert.equal(a.response.headers.ETag, '"course-101-v2"');
  for (const [guard, expected] of [[courseTag(state), 412], [`W/${courseTag(a.state)}`, 412], [null, 428]]) {
    const b = updateCourse(a.state, replacement, guard);
    assert.equal(b.response.status, expected);
    assert.deepEqual(b.state, a.state);
  }
  const merged = updateCourse(a.state, replacement, courseTag(a.state));
  assert.equal(merged.state.revision, 3);
  assert.equal(merged.state.title, "REST Studio");
  assert.equal(merged.state.seats, 24);
  const retry = updateCourse(merged.state, replacement, courseTag(a.state));
  assert.equal(retry.response.status, 412);
  assert.deepEqual(retry.state, merged.state);
});

test("all editor stories expose the intended loss or successful reviewed merge", () => {
  for (const [scenario, error] of [["guarded", 412], ["weak", 412], ["missing", 428]]) {
    const frames = lessonTrace("etag", scenario);
    assert.equal(frames[4].status, error);
    assert.equal(frames[4].snapshot.revision, 2);
    assert.equal(frames[4].snapshot.title, "REST Studio");
    assert.equal(frames[4].snapshot.seats, 30);
    assert.equal(frames.at(-1).snapshot.title, "REST Studio");
    assert.equal(frames.at(-1).snapshot.seats, 24);
    assert.equal(frames.at(-1).snapshot.revision, 3);
    assert.match(frames.at(-1).request, /If-Match: "course-101-v2"/);
  }
  const blind = lessonTrace("etag", "blind");
  assert.equal(blind[4].status, 200);
  assert.equal(blind.at(-1).snapshot.title, "API Fundamentals");
  assert.equal(blind.at(-1).snapshot.seats, 24);
  assert.doesNotMatch(blind[3].request, /If-Match/);
});

test("conditional-write schema, options, and revision bounds fail explicitly", () => {
  const state = initialDocument();
  for (const body of [null, { title: "OK" }, { ...replacement, seats: 201 }, { ...replacement, id: "changed" }]) {
    const result = updateCourse(state, body, courseTag(state));
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.state, state);
  }
  assert.throws(() => courseTag({ ...state, revision: 0 }), TypeError);
  assert.throws(() => courseTag({ ...state, revision: 1.5 }), TypeError);
  assert.throws(() => updateCourse(state, replacement, 123), TypeError);
  assert.throws(() => updateCourse(state, replacement, null, { requireMatch: "yes" }), TypeError);
  const full = { ...state, revision: Number.MAX_SAFE_INTEGER };
  assert.throws(() => updateCourse(full, replacement, courseTag(full)), RangeError);
});
