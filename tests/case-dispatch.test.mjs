import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rideCase, locationCase } from "../assets/case-study-fixtures.mjs";

const lesson = readFileSync(new URL("../docs/lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md", import.meta.url), "utf8");
function example(name) {
  const marker = `<!-- example: ${name} -->`;
  assert.equal(lesson.split(marker).length, 2, `one ${name} marker`);
  const match = lesson.split(marker)[1].match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, `${name} must be followed by JSON`);
  return JSON.parse(match[1]);
}

// Sequential teaching models; these do not provide actual transactional isolation.
function requests() {
  const rows = new Map();
  return (rider, key, request, authorized = true) => {
    if (!authorized) return "unauthorized";
    const scope = JSON.stringify([rider, "ride", key]);
    const fingerprint = JSON.stringify([request.rideId, request.pickup, request.destination, request.quote]);
    if (rows.has(scope)) return rows.get(scope) === fingerprint ? "requested" : "conflict";
    rows.set(scope, fingerprint);
    return "requested";
  };
}
function assignment() {
  const rides = new Map(), drivers = new Set(), riders = new Set();
  return (offer, actor, token, now) => {
    if (actor !== offer.driverId) return "unauthorized";
    if (rides.has(offer.rideId)) {
      const existing = rides.get(offer.rideId);
      return existing.driverId === actor && existing.token === token ? "matched" : "conflict";
    }
    if (offer.cancelled || token !== offer.token || now >= offer.expires || drivers.has(actor) || riders.has(offer.riderId)) return "rejected";
    rides.set(offer.rideId, { driverId: actor, token });
    drivers.add(actor); riders.add(offer.riderId);
    return "matched";
  };
}

test("marked examples match fixtures and JSON fences are valid", () => {
  assert.deepEqual(example("ride-case"), rideCase);
  assert.deepEqual(example("location-case"), locationCase);
  for (const match of lesson.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) JSON.parse(match[1]);
  assert.notEqual(rideCase.requestKey, rideCase.chargeKey);
});

test("local planar distance and trusted observation age select only a candidate", () => {
  const l = example("location-case");
  const rows = l.drivers.map(d => ({ id: d.id, distance: Math.hypot(d.xKm - l.rider.xKm, d.yKm - l.rider.yKm), age: l.nowMs - d.observedAtMs }));
  assert.deepEqual(rows.map(({ distance, age }) => [distance, age]), [[1, 1000], [0.1, 8000]]);
  assert.deepEqual(rows.filter(d => d.age >= 0 && d.age <= l.maxAgeMs).map(d => d.id), ["driver-1"]);
  assert.match(lesson, /fresh candidate, not an assignment/i);
  assert.match(lesson, /not latitude\/longitude/i);
});

test("ride request lost reply, semantic change, scope and authorization", () => {
  const request = requests();
  const r = { rideId: rideCase.rideId, pickup: "A", destination: "B", quote: "quote-1" };
  assert.equal(request(rideCase.riderId, rideCase.requestKey, r), "requested");
  assert.equal(request(rideCase.riderId, rideCase.requestKey, { quote: "quote-1", destination: "B", pickup: "A", rideId: rideCase.rideId }), "requested");
  assert.equal(request(rideCase.riderId, rideCase.requestKey, { ...r, destination: "C" }), "conflict");
  assert.equal(request(rideCase.riderId, rideCase.requestKey, r, false), "unauthorized");
  assert.equal(request("rider-2", rideCase.requestKey, { ...r, rideId: "ride-102" }), "requested");
});

test("offer boundary, cancellation, lost reply, and both exclusivity guards", () => {
  const offer = { rideId: rideCase.rideId, riderId: rideCase.riderId, driverId: rideCase.driverId,
    token: rideCase.offerToken, expires: rideCase.offerExpiresAtMs };
  assert.equal(assignment()(offer, offer.driverId, offer.token, offer.expires), "rejected");
  assert.equal(assignment()({ ...offer, cancelled: true }, offer.driverId, offer.token, 19_999), "rejected");
  assert.equal(assignment()(offer, "driver-2", offer.token, 10_000), "unauthorized");
  assert.equal(assignment()(offer, offer.driverId, 6, 10_000), "rejected");
  const accept = assignment();
  assert.equal(accept(offer, offer.driverId, offer.token, 19_999), "matched");
  assert.equal(accept(offer, offer.driverId, offer.token, 25_000), "matched");
  assert.equal(accept({ ...offer, driverId: "driver-2" }, "driver-2", offer.token, 10_000), "conflict");
  assert.equal(accept({ ...offer, rideId: "ride-102", riderId: "rider-2" }, offer.driverId, offer.token, 10_000), "rejected");
  assert.equal(accept({ ...offer, rideId: "ride-103", driverId: "driver-3" }, "driver-3", offer.token, 10_000), "rejected");
});

test("completed physical trip survives unknown and definitive failed payment", () => {
  const trip = { state: "completed", chargeKey: rideCase.chargeKey, payment: "pending", receipts: new Map() };
  trip.payment = "unknown";
  assert.equal(trip.state, "completed");
  assert.equal(trip.chargeKey, "charge-ride-101");
  function receive(id, outcome) {
    if (trip.receipts.has(id)) return trip.receipts.get(id) === outcome ? "duplicate" : "conflict";
    trip.receipts.set(id, outcome); trip.payment = outcome; return "recorded";
  }
  assert.equal(receive("receipt-1", "failed"), "recorded");
  assert.equal(receive("receipt-1", "failed"), "duplicate");
  assert.equal(receive("receipt-1", "succeeded"), "conflict");
  assert.equal(trip.state, "completed");
  assert.match(lesson, /timeout is not a definitive decline/i);
  assert.match(lesson, /unconditionally pay the driver/i);
});

test("lesson links the hub, frozen source, fixtures and full related lessons", () => {
  for (const link of ["../GUIDED-CASE-STUDIES.md", "../09-SYSTEM-DESIGN-CASE-STUDIES.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md", "../../assets/case-study-fixtures.mjs",
    "DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md", "CONSENSUS-AND-COORDINATION.md"]) assert.ok(lesson.includes(link));
  assert.match(lesson, /<details class="learning-answer">\s*<summary>/);
});
