import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  messagingCase, messagingScale, photoCase, fanoutCase, playbackCase, uploadCase, uploadScale,
  rideCase, locationCase, expiryCase, liveWindowCase,
} from "../assets/case-study-fixtures.mjs";

class InjectedFailure extends Error {}
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function transaction(db, action) {
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
function example(page, name) {
  const content = readFileSync(new URL(`../docs/lessons/${page}`, import.meta.url), "utf8");
  const matches = [...content.matchAll(new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``, "g"))];
  assert.equal(matches.length, 1, `${page}: ${name}`);
  return JSON.parse(matches[0][1]);
}

export function validatePublishedCases() {
  for (const [page, name, expected] of [
    ["CASE-WHATSAPP-MESSAGING.md", "messaging-case", messagingCase],
    ["CASE-WHATSAPP-MESSAGING.md", "messaging-scale", messagingScale],
    ["CASE-INSTAGRAM-FEEDS-AND-MEDIA.md", "photo-case", photoCase],
    ["CASE-TWITTER-TIMELINES.md", "fanout-case", fanoutCase],
    ["CASE-NETFLIX-PLAYBACK.md", "playback-case", playbackCase],
    ["CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md", "upload-case", uploadCase],
    ["CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md", "upload-scale", uploadScale],
    ["CASE-UBER-DISPATCH-AND-PAYMENTS.md", "ride-case", rideCase],
    ["CASE-UBER-DISPATCH-AND-PAYMENTS.md", "location-case", locationCase],
    ["CASE-STUDY-TRANSFERS.md", "expiry-case", expiryCase],
    ["CASE-STUDY-TRANSFERS.md", "live-window-case", liveWindowCase],
  ]) assert.deepEqual(example(page, name), expected);
  const messagesPerDay = messagingScale.dailyActiveUsers * messagingScale.messagesPerActiveUserPerDay;
  assert.equal(messagesPerDay, 20_000_000_000);
  assert.equal(messagesPerDay * messagingScale.averageMessageBodyBytes * messagingScale.retentionDays, 600_000_000_000_000);
  assert.equal(Math.ceil(messagingScale.assumedConcurrentConnections / messagingScale.assumedConnectionsPerGateway), 5000);
  assert.equal(fanoutCase.postsPerSecond * fanoutCase.ordinaryFollowers, 60);
  assert.equal(fanoutCase.postsPerSecond * fanoutCase.broadcasterFollowers, 20_000_000);
  const hours = uploadScale.uploadedHoursPerMinute * uploadScale.minutesPerDay;
  const videos = hours / uploadScale.averageVideoDurationHours;
  assert.equal(hours, 720_000);
  assert.equal(videos, 2_880_000);
  assert.equal(videos * uploadScale.resolutions * uploadScale.formats, 43_200_000);
  assert.equal(hours * uploadScale.sourceBytesPerHour, 720_000_000_000_000);
  return { publishedExamples: 11, uploadedHoursPerDay: hours, modeledVideosPerDay: videos };
}

export function validateMessaging() {
  const server = new DatabaseSync(":memory:");
  const devices = new Map(messagingCase.recipientDevices.map(id => [id, new DatabaseSync(":memory:")]));
  try {
    server.exec(`
      CREATE TABLE messages (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, ciphertext TEXT NOT NULL, seq INTEGER NOT NULL, UNIQUE (conversation, seq));
      CREATE TABLE requests (sender TEXT NOT NULL, conversation TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, message_id TEXT NOT NULL, PRIMARY KEY (sender, request_key));
      CREATE TABLE outbox (message_id TEXT PRIMARY KEY REFERENCES messages(id));
      CREATE TABLE receipts (message_id TEXT NOT NULL, device_id TEXT NOT NULL, reported_read INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (message_id, device_id));
      CREATE TABLE members (principal TEXT PRIMARY KEY, active INTEGER NOT NULL);
    `);
    for (const principal of [messagingCase.senderId, messagingCase.recipientId]) server.prepare("INSERT INTO members VALUES (?, 1)").run(principal);
    for (const db of devices.values()) db.exec("CREATE TABLE inbox (id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL)");
    function accept(input, fail = false) {
      if (input.senderId !== messagingCase.senderId || input.recipientId !== messagingCase.recipientId ||
          input.conversationId !== messagingCase.conversationId) {
        throw new Error("Sender or recipient not authorized in this fixture");
      }
      const fingerprint = JSON.stringify([input.conversationId, input.messageId, input.recipientId, input.ciphertext]);
      return transaction(server, () => {
        for (const principal of [input.senderId, input.recipientId]) {
          if (!server.prepare("SELECT principal FROM members WHERE principal = ? AND active = 1").get(principal)) throw new Error("Conversation access revoked");
        }
        const previous = server.prepare("SELECT * FROM requests WHERE sender = ? AND request_key = ?")
          .get(input.senderId, input.requestKey);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new Error("Conflicting send intent");
          return previous.message_id;
        }
        const sequence = server.prepare("SELECT coalesce(max(seq), 0) + 1 AS n FROM messages WHERE conversation = ?").get(input.conversationId).n;
        server.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)").run(
          input.messageId, input.conversationId, input.senderId, input.recipientId, input.ciphertext, sequence);
        server.prepare("INSERT INTO requests VALUES (?, ?, ?, ?, ?)").run(
          input.senderId, input.conversationId, input.requestKey, fingerprint, input.messageId);
        if (fail) throw new InjectedFailure("After message, before outbox");
        server.prepare("INSERT INTO outbox VALUES (?)").run(input.messageId);
        return input.messageId;
      });
    }
    assert.throws(() => accept(messagingCase, true), InjectedFailure);
    assert.equal(server.prepare("SELECT count(*) AS n FROM messages").get().n, 0);
    assert.equal(accept(messagingCase), messagingCase.messageId);
    assert.equal(accept({ ...messagingCase }), messagingCase.messageId);
    assert.throws(() => accept({ ...messagingCase, ciphertext: "different-symbolic-envelope" }), /Conflicting/);
    assert.equal(server.prepare("SELECT count(*) AS n FROM messages").get().n, 1);
    assert.equal(server.prepare("SELECT count(*) AS n FROM outbox").get().n, 1);
    function deliver(deviceId, acknowledge) {
      const db = devices.get(deviceId);
      if (!db) throw new Error("Unknown recipient device");
      const message = server.prepare("SELECT * FROM messages WHERE id = ?").get(messagingCase.messageId);
      if (!server.prepare("SELECT principal FROM members WHERE principal = ? AND active = 1").get(message.recipient)) throw new Error("Recipient access revoked");
      transaction(db, () => {
        const previous = db.prepare("SELECT ciphertext FROM inbox WHERE id = ?").get(message.id);
        if (previous && previous.ciphertext !== message.ciphertext) throw new Error("Conflicting device envelope");
        db.prepare("INSERT INTO inbox VALUES (?, ?) ON CONFLICT (id) DO NOTHING").run(message.id, message.ciphertext);
      });
      if (acknowledge) transaction(server, () => server.prepare(
        "INSERT INTO receipts (message_id, device_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(message.id, deviceId));
    }
    deliver(messagingCase.recipientDevices[0], false);
    assert.equal(server.prepare("SELECT count(*) AS n FROM receipts").get().n, 0);
    deliver(messagingCase.recipientDevices[0], true);
    deliver(messagingCase.recipientDevices[1], true);
    assert.throws(() => deliver("foreign-device", true), /Unknown/);
    for (const db of devices.values()) assert.equal(db.prepare("SELECT count(*) AS n FROM inbox").get().n, 1);
    assert.equal(server.prepare("SELECT sum(reported_read) AS n FROM receipts").get().n, 0);
    server.prepare("UPDATE receipts SET reported_read = 1 WHERE message_id = ? AND device_id = ?")
      .run(messagingCase.messageId, messagingCase.recipientDevices[0]);
    server.prepare("UPDATE members SET active = 0 WHERE principal = ?").run(messagingCase.recipientId);
    assert.throws(() => deliver(messagingCase.recipientDevices[0], true), /revoked/);
    assert.throws(() => accept(messagingCase), /revoked/);
    return {
      storedMessages: 1,
      deviceInboxes: 2,
      acknowledgedDevices: server.prepare("SELECT count(*) AS n FROM receipts").get().n,
      clientReadReports: server.prepare("SELECT sum(reported_read) AS n FROM receipts").get().n,
    };
  } finally {
    server.close();
    for (const db of devices.values()) db.close();
  }
}

export function validateFeeds() {
  const db = new DatabaseSync(":memory:");
  const artifacts = new Map();
  try {
    db.exec(`
      CREATE TABLE photos (id TEXT PRIMARY KEY, generation INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE variants (photo_id TEXT NOT NULL, generation INTEGER NOT NULL, kind TEXT NOT NULL, artifact TEXT NOT NULL, PRIMARY KEY (photo_id, generation, kind));
      CREATE TABLE photo_outbox (id TEXT PRIMARY KEY);
      CREATE TABLE followers (viewer TEXT PRIMARY KEY, active INTEGER NOT NULL);
      CREATE TABLE likes (viewer TEXT NOT NULL, photo_id TEXT NOT NULL, PRIMARY KEY (viewer, photo_id));
      CREATE TABLE posts (id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE post_requests (author TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, post_id TEXT NOT NULL, PRIMARY KEY (author, request_key));
      CREATE TABLE post_outbox (post_id TEXT PRIMARY KEY);
      CREATE TABLE timeline (viewer TEXT NOT NULL, post_id TEXT NOT NULL, PRIMARY KEY (viewer, post_id));
    `);
    db.prepare("INSERT INTO photos VALUES (?, ?, 'processing')").run(photoCase.photoId, photoCase.sourceVersion);
    for (const viewer of fanoutCase.recipients) db.prepare("INSERT INTO followers VALUES (?, 1)").run(viewer);
    function photoVariant(kind, generation, artifact, fail = false) {
      const verified = artifacts.get(artifact);
      if (!photoCase.requiredVariants.includes(kind) || generation !== photoCase.sourceVersion ||
          !verified || verified.kind !== kind || verified.generation !== generation) {
        throw new Error("Unverified or stale photo artifact");
      }
      transaction(db, () => {
        const previous = db.prepare("SELECT artifact FROM variants WHERE photo_id = ? AND generation = ? AND kind = ?")
          .get(photoCase.photoId, generation, kind);
        if (previous && previous.artifact !== artifact) throw new Error("Conflicting photo output");
        db.prepare("INSERT INTO variants VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").run(photoCase.photoId, generation, kind, artifact);
        const complete = photoCase.requiredVariants.every(required => db.prepare(
          "SELECT artifact FROM variants WHERE photo_id = ? AND generation = ? AND kind = ?").get(photoCase.photoId, generation, required));
        if (complete) {
          db.prepare("UPDATE photos SET status = 'ready' WHERE id = ?").run(photoCase.photoId);
          db.prepare("INSERT INTO photo_outbox VALUES (?) ON CONFLICT DO NOTHING").run(`ready-${photoCase.photoId}-v${generation}`);
        }
        if (fail) throw new InjectedFailure("Before photo readiness commit");
      });
    }
    const thumb = `${photoCase.sourceObject}/thumbnail`;
    const display = `${photoCase.sourceObject}/display`;
    artifacts.set(thumb, { kind: "thumbnail", generation: 1 });
    photoVariant("thumbnail", 1, thumb);
    assert.equal(db.prepare("SELECT status FROM photos").get().status, "processing");
    assert.throws(() => photoVariant("display", 1, display), /Unverified/);
    artifacts.set(display, { kind: "display", generation: 1 });
    assert.throws(() => photoVariant("display", 1, thumb), /Unverified/);
    assert.throws(() => photoVariant("display", 1, display, true), InjectedFailure);
    assert.equal(db.prepare("SELECT status FROM photos").get().status, "processing");
    photoVariant("display", 1, display);
    photoVariant("display", 1, display);
    assert.throws(() => photoVariant("display", 0, display), /stale/);
    assert.equal(db.prepare("SELECT status FROM photos").get().status, "ready");
    assert.equal(db.prepare("SELECT count(*) AS n FROM photo_outbox").get().n, 1);
    const mayRead = viewer => Boolean(db.prepare("SELECT viewer FROM followers WHERE viewer = ? AND active = 1").get(viewer));
    const reader = fanoutCase.recipients[0];
    assert.ok(mayRead(reader));
    transaction(db, () => {
      db.prepare("INSERT INTO likes VALUES (?, ?) ON CONFLICT DO NOTHING").run(reader, photoCase.photoId);
      db.prepare("INSERT INTO likes VALUES (?, ?) ON CONFLICT DO NOTHING").run(reader, photoCase.photoId);
    });
    assert.equal(db.prepare("SELECT count(*) AS n FROM likes").get().n, 1);
    function createPost(body, fail = false) {
      return transaction(db, () => {
        const previous = db.prepare("SELECT * FROM post_requests WHERE author = ? AND request_key = ?").get(fanoutCase.authorId, fanoutCase.requestKey);
        if (previous) {
          if (previous.fingerprint !== body) throw new Error("Conflicting post intent");
          return previous.post_id;
        }
        db.prepare("INSERT INTO posts (id, body, created_at) VALUES (?, ?, 1000)").run(fanoutCase.postId, body);
        db.prepare("INSERT INTO post_requests VALUES (?, ?, ?, ?)").run(fanoutCase.authorId, fanoutCase.requestKey, body, fanoutCase.postId);
        if (fail) throw new InjectedFailure("Before post outbox");
        db.prepare("INSERT INTO post_outbox VALUES (?)").run(fanoutCase.postId);
        return fanoutCase.postId;
      });
    }
    assert.throws(() => createPost("A design note", true), InjectedFailure);
    assert.equal(db.prepare("SELECT count(*) AS n FROM posts").get().n, 0);
    createPost("A design note");
    createPost("A design note");
    assert.throws(() => createPost("Different intent"), /Conflicting/);
    for (const viewer of [...fanoutCase.recipients, ...fanoutCase.recipients]) {
      db.prepare("INSERT INTO timeline VALUES (?, ?) ON CONFLICT DO NOTHING").run(viewer, fanoutCase.postId);
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM timeline").get().n, 3);
    assert.equal(db.prepare("SELECT count(*) AS n FROM post_outbox").get().n, 1);
    const visibleTimeline = viewer => db.prepare(
      "SELECT p.id FROM posts p JOIN timeline t ON p.id = t.post_id JOIN followers f ON f.viewer = t.viewer WHERE t.viewer = ? AND f.active = 1 AND p.deleted = 0").all(viewer);
    assert.equal(visibleTimeline(reader).length, 1);
    db.prepare("UPDATE followers SET active = 0 WHERE viewer = ?").run(reader);
    assert.ok(db.prepare("SELECT * FROM timeline WHERE viewer = ?").get(reader));
    assert.equal(mayRead(reader), false);
    assert.equal(visibleTimeline(reader).length, 0);
    db.prepare("UPDATE posts SET deleted = 1 WHERE id = ?").run(fanoutCase.postId);
    assert.equal(db.prepare("SELECT p.id FROM posts p JOIN timeline t ON p.id = t.post_id WHERE t.viewer = ? AND p.deleted = 0")
      .get(fanoutCase.recipients[1]), undefined);
    return { photoReadyIntents: 1, timelineReferences: 3, posts: 1, likes: 1 };
  } finally {
    db.close();
  }
}

export function validateUploads() {
  const db = new DatabaseSync(":memory:");
  const artifacts = new Map();
  try {
    db.exec(`
      CREATE TABLE upload_parts (part INTEGER PRIMARY KEY, payload BLOB NOT NULL, digest TEXT NOT NULL);
      CREATE TABLE upload_state (id TEXT PRIMARY KEY, status TEXT NOT NULL, source_digest TEXT);
      CREATE TABLE outputs (kind TEXT PRIMARY KEY, artifact TEXT NOT NULL, source_digest TEXT NOT NULL);
      CREATE TABLE upload_outbox (id TEXT PRIMARY KEY);
    `);
    db.prepare("INSERT INTO upload_state VALUES (?, 'uploading', NULL)").run(uploadCase.uploadId);
    function putPart(number, bytes, suppliedDigest) {
      if (!uploadCase.parts.some(part => part.number === number) || hash(bytes) !== suppliedDigest) throw new Error("Invalid part number or checksum");
      transaction(db, () => {
        const previous = db.prepare("SELECT digest FROM upload_parts WHERE part = ?").get(number);
        if (previous && previous.digest !== suppliedDigest) throw new Error("Conflicting upload part");
        if (db.prepare("SELECT status FROM upload_state").get().status !== "uploading") {
          if (previous) return;
          throw new Error("Upload is already finalized");
        }
        db.prepare("INSERT INTO upload_parts VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(number, bytes, suppliedDigest);
      });
    }
    const first = Buffer.from(uploadCase.parts[0].body);
    putPart(1, first, hash(first));
    putPart(1, first, hash(first));
    assert.throws(() => putPart(1, Buffer.from("xyz"), hash(Buffer.from("xyz"))), /Conflicting/);
    assert.throws(() => putPart(2, Buffer.from("def"), "incorrect-digest"), /checksum/);
    const source = Buffer.concat(uploadCase.parts.map(part => Buffer.from(part.body)));
    const expectedDigest = hash(source);
    function finalize(digest) {
      return transaction(db, () => {
        const rows = db.prepare("SELECT * FROM upload_parts ORDER BY part").all();
        if (rows.length !== uploadCase.parts.length) throw new Error("Missing upload part");
        const bytes = Buffer.concat(rows.map(row => Buffer.from(row.payload)));
        if (bytes.length !== uploadCase.expectedBytes || hash(bytes) !== digest) throw new Error("Final size or checksum mismatch");
        const previous = db.prepare("SELECT status, source_digest FROM upload_state").get();
        if (previous.source_digest) {
          if (previous.source_digest !== digest) throw new Error("Conflicting finalized source");
          return bytes;
        }
        db.prepare("UPDATE upload_state SET status = 'processing', source_digest = ? WHERE id = ?").run(digest, uploadCase.uploadId);
        db.prepare("INSERT INTO upload_outbox VALUES (?) ON CONFLICT DO NOTHING").run(`uploaded-${uploadCase.videoId}`);
        return bytes;
      });
    }
    assert.throws(() => finalize(expectedDigest), /Missing/);
    const second = Buffer.from(uploadCase.parts[1].body);
    putPart(2, second, hash(second));
    assert.throws(() => finalize("incorrect-final-digest"), /checksum/);
    assert.equal(finalize(expectedDigest).length, 6);
    assert.equal(finalize(expectedDigest).length, 6);
    assert.equal(db.prepare("SELECT count(*) AS n FROM upload_outbox").get().n, 1);
    function output(kind, digest, artifact) {
      const verified = artifacts.get(artifact);
      if (!uploadCase.requiredVariants.includes(kind) || digest !== expectedDigest ||
          !verified || verified.kind !== kind || verified.sourceDigest !== digest) {
        throw new Error("Unverified or stale video output");
      }
      transaction(db, () => {
        const previous = db.prepare("SELECT artifact FROM outputs WHERE kind = ?").get(kind);
        if (previous && previous.artifact !== artifact) throw new Error("Conflicting video output");
        db.prepare("INSERT INTO outputs VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(kind, artifact, digest);
      });
    }
    const low = "video-101/v1/low";
    const high = "video-101/v1/high";
    const manifest = "video-101/v1/manifest";
    artifacts.set(low, { kind: "low", sourceDigest: expectedDigest });
    output("low", expectedDigest, low);
    assert.throws(() => output("high", "older-source", low), /stale/);
    function publishReady(fail = false) {
      return transaction(db, () => {
        const complete = uploadCase.requiredVariants.every(kind => {
          const row = db.prepare("SELECT artifact, source_digest FROM outputs WHERE kind = ?").get(kind);
          const verified = row && artifacts.get(row.artifact);
          return row && row.source_digest === expectedDigest && verified?.kind === kind &&
            verified.sourceDigest === expectedDigest && artifacts.get(manifest)?.outputs?.[kind] === row.artifact;
        });
        if (!complete || !artifacts.has(manifest)) throw new Error("Required output or manifest is missing");
        db.prepare("UPDATE upload_state SET status = 'ready' WHERE id = ?").run(uploadCase.uploadId);
        db.prepare("INSERT INTO upload_outbox VALUES (?) ON CONFLICT DO NOTHING").run(`ready-${uploadCase.videoId}`);
        if (fail) throw new InjectedFailure("Before video readiness commit");
      });
    }
    assert.throws(publishReady, /missing/);
    artifacts.set(high, { kind: "high", sourceDigest: expectedDigest });
    output("high", expectedDigest, high);
    assert.throws(publishReady, /manifest/);
    artifacts.set(manifest, { outputs: { low, high }, sourceDigest: expectedDigest });
    assert.throws(() => publishReady(true), InjectedFailure);
    assert.equal(db.prepare("SELECT status FROM upload_state").get().status, "processing");
    publishReady();
    publishReady();
    assert.equal(finalize(expectedDigest).length, 6);
    putPart(1, first, hash(first));
    assert.equal(db.prepare("SELECT status FROM upload_state").get().status, "ready");
    return {
      sourceBytes: source.length, sourceSha256: expectedDigest, requiredOutputs: 2,
      readyIntents: db.prepare("SELECT count(*) AS n FROM upload_outbox WHERE id = ?").get(`ready-${uploadCase.videoId}`).n,
    };
  } finally {
    db.close();
  }
}

export function validateDispatch() {
  const eligible = locationCase.drivers.filter(driver => {
    const age = locationCase.nowMs - driver.observedAtMs;
    return age >= 0 && age <= locationCase.maxAgeMs;
  }).sort((a, b) => Math.hypot(a.xKm - locationCase.rider.xKm, a.yKm - locationCase.rider.yKm) -
    Math.hypot(b.xKm - locationCase.rider.xKm, b.yKm - locationCase.rider.yKm));
  assert.deepEqual(eligible.map(driver => driver.id), [rideCase.driverId]);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE rides (id TEXT PRIMARY KEY, rider TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE active_riders (rider TEXT PRIMARY KEY, ride_id TEXT NOT NULL UNIQUE);
      CREATE TABLE requests (rider TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, ride_id TEXT NOT NULL, PRIMARY KEY (rider, request_key));
      CREATE TABLE assignments (driver TEXT PRIMARY KEY, ride_id TEXT NOT NULL UNIQUE, offer_token INTEGER NOT NULL);
      CREATE TABLE drivers (id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE offers (driver TEXT PRIMARY KEY, ride_id TEXT NOT NULL UNIQUE, token INTEGER NOT NULL, expires_at INTEGER NOT NULL, active INTEGER NOT NULL);
      CREATE TABLE trip_facts (ride_id TEXT PRIMARY KEY);
      CREATE TABLE charge_intents (charge_key TEXT PRIMARY KEY, ride_id TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL, currency TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE payment_receipts (charge_key TEXT PRIMARY KEY, amount INTEGER NOT NULL, currency TEXT NOT NULL, outcome TEXT NOT NULL);
      CREATE TABLE driver_payable (ride_id TEXT PRIMARY KEY, amount INTEGER NOT NULL, state TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO drivers VALUES (?, ?, 'available')").run(rideCase.driverId, rideCase.offerToken);
    function requestRide(input) {
      const fingerprint = JSON.stringify([input.fareCents, input.currency]);
      return transaction(db, () => {
        const previous = db.prepare("SELECT * FROM requests WHERE rider = ? AND request_key = ?").get(input.riderId, input.requestKey);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new Error("Conflicting ride intent");
          return previous.ride_id;
        }
        if (db.prepare("SELECT ride_id FROM active_riders WHERE rider = ?").get(input.riderId)) throw new Error("Rider already has an active request");
        db.prepare("INSERT INTO rides VALUES (?, ?, 'requested')").run(input.rideId, input.riderId);
        db.prepare("INSERT INTO active_riders VALUES (?, ?)").run(input.riderId, input.rideId);
        db.prepare("INSERT INTO requests VALUES (?, ?, ?, ?)").run(input.riderId, input.requestKey, fingerprint, input.rideId);
        return input.rideId;
      });
    }
    requestRide(rideCase);
    assert.equal(requestRide({ ...rideCase }), rideCase.rideId);
    assert.throws(() => requestRide({ ...rideCase, fareCents: 1600 }), /Conflicting/);
    assert.throws(() => requestRide({ ...rideCase, rideId: "ride-103", requestKey: "another-rider-1-request" }), /already has an active/);
    requestRide({ ...rideCase, rideId: "ride-102", riderId: "rider-2", requestKey: "ride-102-a" });
    transaction(db, () => {
      db.prepare("INSERT INTO offers VALUES (?, ?, ?, ?, 1)")
        .run(rideCase.driverId, rideCase.rideId, rideCase.offerToken, rideCase.offerExpiresAtMs);
      db.prepare("UPDATE drivers SET state = 'offered' WHERE id = ?").run(rideCase.driverId);
      db.prepare("UPDATE rides SET status = 'offered' WHERE id = ?").run(rideCase.rideId);
    });
    function acceptOffer(rideId, token, now) {
      return transaction(db, () => {
        const previous = db.prepare("SELECT * FROM assignments WHERE driver = ?").get(rideCase.driverId);
        if (previous) {
          if (previous.ride_id === rideId && previous.offer_token === token) return "duplicate";
          throw new Error("Driver already assigned");
        }
        const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(rideCase.driverId);
        const ride = db.prepare("SELECT * FROM rides WHERE id = ?").get(rideId);
        const offer = db.prepare("SELECT * FROM offers WHERE driver = ?").get(rideCase.driverId);
        if (!ride || ride.status !== "offered" || driver.state !== "offered" || driver.epoch !== token ||
            !offer || !offer.active || offer.ride_id !== rideId || offer.token !== token) throw new Error("Stale assignment authority");
        if (now >= offer.expires_at) throw new Error("Stale or expired offer");
        db.prepare("INSERT INTO assignments VALUES (?, ?, ?)").run(rideCase.driverId, rideId, token);
        db.prepare("UPDATE drivers SET state = 'reserved' WHERE id = ?").run(rideCase.driverId);
        db.prepare("UPDATE offers SET active = 0 WHERE driver = ?").run(rideCase.driverId);
        db.prepare("UPDATE rides SET status = 'assigned' WHERE id = ?").run(rideId);
        return "assigned";
      });
    }
    assert.throws(() => acceptOffer(rideCase.rideId, rideCase.offerToken, rideCase.offerExpiresAtMs), /expired/);
    assert.throws(() => acceptOffer("ride-102", rideCase.offerToken, rideCase.nowMs), /Stale assignment authority/);
    assert.equal(acceptOffer(rideCase.rideId, rideCase.offerToken, rideCase.nowMs), "assigned");
    assert.equal(acceptOffer(rideCase.rideId, rideCase.offerToken, 21_000), "duplicate");
    assert.throws(() => acceptOffer("ride-102", rideCase.offerToken, rideCase.nowMs), /already assigned/);
    function completeTrip(fail = false) {
      transaction(db, () => {
        if (db.prepare("SELECT ride_id FROM trip_facts WHERE ride_id = ?").get(rideCase.rideId)) return;
        if (!db.prepare("SELECT driver FROM assignments WHERE ride_id = ? AND driver = ?").get(rideCase.rideId, rideCase.driverId)) throw new Error("Trip has no authorized assignment");
        db.prepare("INSERT INTO trip_facts VALUES (?) ON CONFLICT DO NOTHING").run(rideCase.rideId);
        db.prepare("UPDATE rides SET status = 'completed' WHERE id = ?").run(rideCase.rideId);
        db.prepare("INSERT INTO charge_intents VALUES (?, ?, ?, ?, 'pending') ON CONFLICT DO NOTHING")
          .run(rideCase.chargeKey, rideCase.rideId, rideCase.fareCents, rideCase.currency);
        db.prepare("INSERT INTO driver_payable VALUES (?, ?, 'owed') ON CONFLICT DO NOTHING").run(rideCase.rideId, rideCase.fareCents);
        db.prepare("DELETE FROM assignments WHERE ride_id = ?").run(rideCase.rideId);
        db.prepare("DELETE FROM offers WHERE ride_id = ?").run(rideCase.rideId);
        db.prepare("DELETE FROM active_riders WHERE ride_id = ?").run(rideCase.rideId);
        db.prepare("UPDATE drivers SET state = 'available', epoch = epoch + 1 WHERE id = ?").run(rideCase.driverId);
        if (fail) throw new InjectedFailure("Before trip/charge-intent commit");
      });
    }
    assert.throws(() => completeTrip(true), InjectedFailure);
    assert.equal(db.prepare("SELECT count(*) AS n FROM trip_facts").get().n, 0);
    completeTrip();
    completeTrip();
    assert.equal(db.prepare("SELECT count(*) AS n FROM assignments").get().n, 0);
    assert.equal(db.prepare("SELECT rider FROM active_riders WHERE rider = ?").get(rideCase.riderId), undefined);
    assert.throws(() => acceptOffer("ride-102", rideCase.offerToken, rideCase.nowMs), /Stale assignment authority/);
    db.prepare("UPDATE charge_intents SET state = 'unknown' WHERE charge_key = ?").run(rideCase.chargeKey);
    assert.equal(db.prepare("SELECT status FROM rides WHERE id = ?").get(rideCase.rideId).status, "completed");
    function receipt(amount, currency, outcome) {
      if (amount !== rideCase.fareCents || currency !== rideCase.currency || outcome !== "captured") throw new Error("Conflicting provider result");
      transaction(db, () => {
        if (!db.prepare("SELECT charge_key FROM charge_intents WHERE charge_key = ?").get(rideCase.chargeKey)) throw new Error("Unknown charge intent");
        db.prepare("INSERT INTO payment_receipts VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").run(rideCase.chargeKey, amount, currency, outcome);
        db.prepare("UPDATE charge_intents SET state = 'captured' WHERE charge_key = ?").run(rideCase.chargeKey);
      });
    }
    receipt(1500, "USD", "captured");
    receipt(1500, "USD", "captured");
    assert.throws(() => receipt(1600, "USD", "captured"), /Conflicting/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM trip_facts").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM payment_receipts").get().n, 1);
    assert.equal(db.prepare("SELECT state FROM driver_payable").get().state, "owed");
    return { eligibleDrivers: 1, exclusiveClaims: 1, activeAssignmentsAfterTrip: 0, tripFacts: 1, localCaptureRecords: 1, driverPayableCents: 1500 };
  } finally {
    db.close();
  }
}

export function validatePlaybackAndTransfers() {
  const sizes = playbackCase.representations.map(representation => representation.bitrateBitsPerSecond * playbackCase.segmentSeconds / 8);
  assert.deepEqual(sizes, [500_000, 1_500_000, 3_000_000]);
  function choose(throughput) {
    if (!Number.isFinite(throughput) || throughput < 0) throw new Error("Invalid throughput estimate");
    const budget = throughput * playbackCase.safetyFraction;
    const selected = [...playbackCase.representations].sort((a, b) => b.bitrateBitsPerSecond - a.bitrateBitsPerSecond)
      .find(representation => representation.bitrateBitsPerSecond <= budget);
    return selected ? { status: "selected", id: selected.id } : { status: "no-fit", id: null };
  }
  assert.deepEqual(choose(playbackCase.estimatedThroughputBitsPerSecond), { status: "selected", id: "mid" });
  assert.deepEqual(choose(500_000), { status: "no-fit", id: null });
  assert.throws(() => choose(-1), /Invalid/);
  const policy = new DatabaseSync(":memory:");
  try {
    policy.exec(`
      CREATE TABLE grants (session TEXT PRIMARY KEY, subject TEXT NOT NULL, asset TEXT NOT NULL, generation INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL);
      CREATE TABLE telemetry (session TEXT NOT NULL, event_id TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (session, event_id));
    `);
    policy.prepare("INSERT INTO grants VALUES (?, 'viewer-1', ?, ?, 20000, 0)")
      .run(playbackCase.sessionId, playbackCase.assetId, playbackCase.assetGeneration);
    function authorize(subject, generation, now) {
      const grant = policy.prepare("SELECT * FROM grants WHERE session = ?").get(playbackCase.sessionId);
      if (!grant || grant.subject !== subject || grant.asset !== playbackCase.assetId ||
          grant.generation !== generation || grant.revoked || now >= grant.expires_at) {
        throw new Error("Playback grant does not permit this request");
      }
      return grant;
    }
    assert.ok(authorize("viewer-1", 7, 10000));
    assert.throws(() => authorize("viewer-2", 7, 10000), /does not permit/);
    assert.throws(() => authorize("viewer-1", 8, 10000), /does not permit/);
    assert.throws(() => authorize("viewer-1", 7, 20000), /does not permit/);
    function telemetry(id, kind) {
      transaction(policy, () => {
        const previous = policy.prepare("SELECT kind FROM telemetry WHERE session = ? AND event_id = ?").get(playbackCase.sessionId, id);
        if (previous && previous.kind !== kind) throw new Error("Conflicting telemetry identity");
        policy.prepare("INSERT INTO telemetry VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(playbackCase.sessionId, id, kind);
      });
    }
    telemetry("view-event-101", "segment.requested");
    telemetry("view-event-101", "segment.requested");
    assert.throws(() => telemetry("view-event-101", "human.watched"), /Conflicting/);
    assert.equal(policy.prepare("SELECT count(*) AS n FROM telemetry").get().n, 1);
    policy.prepare("UPDATE grants SET revoked = 1 WHERE session = ?").run(playbackCase.sessionId);
    assert.throws(() => authorize("viewer-1", 7, 10000), /does not permit/);
  } finally {
    policy.close();
  }
  assert.ok(expiryCase.createdAtMs < expiryCase.expiresAtMs);
  const expired = now => now >= expiryCase.expiresAtMs;
  assert.equal(expired(expiryCase.expiresAtMs - 1), false);
  assert.equal(expired(expiryCase.nowMs), true);
  const segmentState = number => number < liveWindowCase.firstSegment ? "rolled-off" :
    number > liveWindowCase.lastSegment ? "not-produced" : "advertised";
  assert.equal(segmentState(100), "rolled-off");
  assert.equal(segmentState(102), "advertised");
  assert.equal(segmentState(104), "not-produced");
  const duration = (liveWindowCase.lastSegment - liveWindowCase.firstSegment + 1) * liveWindowCase.segmentSeconds;
  assert.equal(duration, 12);
  return { representation: "mid", noFitIsExplicit: true, expiryBoundaryMs: 86_400_000, advertisedWindowSeconds: 12 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(validatePublishedCases());
  console.log("Messaging:", validateMessaging());
  console.log("Feeds:", validateFeeds());
  console.log("Uploads:", validateUploads());
  console.log("Dispatch:", validateDispatch());
  console.log("Playback/transfer models:", validatePlaybackAndTransfers());
  console.log("Actual local SQL/checksum and finite decision checks only: no encryption, codecs, provider charges, broker/CDN, physical trip or production SLO is verified.");
}
