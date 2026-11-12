import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePublishedCases, validateMessaging, validateFeeds, validateUploads,
  validateDispatch, validatePlaybackAndTransfers,
} from "../scripts/validate-case-study-models.mjs";

test("published case inputs and workload units match the exact shared models", () => {
  assert.deepEqual(validatePublishedCases(), { publishedExamples: 11, uploadedHoursPerDay: 720_000, modeledVideosPerDay: 2_880_000 });
});
test("message/local-device commits and reported acknowledgements are distinct", () => {
  assert.deepEqual(validateMessaging(), { storedMessages: 1, deviceInboxes: 2, acknowledgedDevices: 2, clientReadReports: 1 });
});
test("photo readiness, fanout replay and current audience checks preserve local invariants", () => {
  assert.deepEqual(validateFeeds(), { photoReadyIntents: 1, timelineReferences: 3, posts: 1, likes: 1 });
});
test("real synthetic-byte checksums and local readiness reject partial or stale outputs", () => {
  const result = validateUploads();
  assert.equal(result.sourceBytes, 6);
  assert.equal(result.sourceSha256, "bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721");
  assert.equal(result.requiredOutputs, 2);
  assert.equal(result.readyIntents, 1);
});
test("fresh candidates are not exclusive assignments or external payment proof", () => {
  assert.deepEqual(validateDispatch(), { eligibleDrivers: 1, exclusiveClaims: 1, activeAssignmentsAfterTrip: 0, tripFacts: 1, localCaptureRecords: 1, driverPayableCents: 1500 });
});
test("fixed bitrate, exact expiry and rolling-window outcomes remain explicit", () => {
  assert.deepEqual(validatePlaybackAndTransfers(), {
    representation: "mid", noFitIsExplicit: true, expiryBoundaryMs: 86_400_000, advertisedWindowSeconds: 12,
  });
});
