import test from "node:test";
import assert from "node:assert/strict";
import { requestFrame, requestScenarios, decisions, queueTick, queuePresets, queueLimit } from "../assets/visual-models.mjs";

test("all request scenarios provide six complete, ordered frames", () => {
  for (const scenario of Object.keys(requestScenarios)) {
    for (let step = 0; step <= 5; step++) {
      const frame = requestFrame(scenario, step);
      for (const key of ["title", "explanation", "active", "client", "server", "storage", "request", "response"]) assert.ok(frame[key]);
      assert.equal(frame.step, step);
    }
  }
});
test("missing resource differs from a lost successful response", () => {
  assert.match(requestFrame("missing", 5).response, /404/);
  assert.match(requestFrame("missing", 5).client, /not-found/);
  assert.match(requestFrame("lost", 5).response, /200/);
  assert.match(requestFrame("lost", 5).client, /unknown/);
  assert.equal(requestFrame("lost", 3).response, "No response sent yet.");
  assert.match(requestFrame("found", 5).client, /Render/);
});
test("invalid model input is rejected explicitly", () => {
  assert.throws(() => requestFrame("bad", 0), RangeError);
  assert.throws(() => requestFrame("found", 6), RangeError);
  assert.throws(() => queueTick({ time: 0, queued: 25, processed: 0, rejected: 0 }, 4, 2), RangeError);
  assert.throws(() => queueTick({ time: 0, queued: 0, processed: 0, rejected: 0 }, -1, 2), RangeError);
});
test("decisions include reasoning, alternatives, and costs rather than categorical winners", () => {
  assert.equal(Object.keys(decisions).length, 5);
  for (const choice of Object.values(decisions)) {
    for (const key of ["label", "branch", "method", "example", "reason", "alternative", "cost"]) assert.ok(choice[key]);
  }
});
test("queue conserves every job and enforces the bound through spike and recovery", () => {
  let state = { time: 0, queued: 0, processed: 0, rejected: 0 };
  let arrivals = 0;
  for (const name of ["balanced", "burst", "recover"]) {
    const preset = queuePresets[name];
    for (let i = 0; i < 8; i++) {
      state = queueTick(state, preset.arrival, preset.workers);
      arrivals += preset.arrival;
      assert.equal(state.queued + state.processed + state.rejected, arrivals);
      assert.ok(state.queued <= queueLimit);
    }
    if (name === "balanced") { assert.equal(state.queued, 4); assert.equal(state.rejected, 0); }
    if (name === "burst") { assert.equal(state.queued, 24); assert.ok(state.rejected > 0); }
    if (name === "recover") assert.equal(state.queued, 4);
  }
});
test("balanced capacity cannot drain an existing backlog", () => {
  const next = queueTick({ time: 0, queued: 20, processed: 0, rejected: 0 }, 4, 2);
  assert.equal(next.queued, 20);
  assert.equal(next.processed, 4);
});
