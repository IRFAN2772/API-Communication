import test from "node:test";
import assert from "node:assert/strict";
import { runSeniorModelChecks } from "../scripts/validate-senior-models.mjs";

test("published planning units and actual local migration guard the required thresholds and data", () => {
  assert.deepEqual(runSeniorModelChecks(), {
    dailyCalls: 1_000_000_000,
    planningBodyBytesPerSecond: 300_000_000,
    connectionStateBytes: 50_000_000_000,
    replicatedPayloadBytes: 2_100_000_000_000,
    courseJsonBytes: 57,
    completionJsonBytes: 105,
    cutoverEpoch: 8,
  });
});
