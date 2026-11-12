import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  seniorCourse, seniorCompletion, trafficAssumptions, connectionAssumptions,
  retentionAssumptions, burstAssumptions, shardCase,
} from "../assets/senior-lesson-fixtures.mjs";

function published(path, name) {
  const content = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const match = new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\``).exec(content);
  assert.ok(match, `${path}: missing published ${name}`);
  return JSON.parse(match[1]);
}

export function runSeniorModelChecks() {
  const estimates = "docs/lessons/REQUIREMENTS-AND-ESTIMATION.md";
  for (const [name, value] of [
    ["traffic-assumptions", trafficAssumptions], ["connection-assumptions", connectionAssumptions],
    ["retention-assumptions", retentionAssumptions], ["burst-assumptions", burstAssumptions],
  ]) {
    assert.deepEqual(published(estimates, name), value);
  }
  const dailyCalls = trafficAssumptions.dailyActiveUsers * trafficAssumptions.callsPerActiveUserPerDay;
  const meanRate = dailyCalls / trafficAssumptions.secondsPerDay;
  const assumedPeak = meanRate * trafficAssumptions.peakFactor;
  assert.equal(dailyCalls, 1_000_000_000);
  assert.ok(assumedPeak < trafficAssumptions.planningPeakRequestsPerSecond);
  assert.ok(assumedPeak > 57_870 && assumedPeak < 57_871);
  const bodyBytesPerSecond = trafficAssumptions.planningPeakRequestsPerSecond * trafficAssumptions.averageResponseBodyBytes;
  assert.equal(bodyBytesPerSecond, 300_000_000);
  assert.equal(bodyBytesPerSecond * 8, 2_400_000_000);
  assert.equal(trafficAssumptions.planningPeakRequestsPerSecond * trafficAssumptions.largerResponseBodyBytes, 3_000_000_000);
  const connectionState = connectionAssumptions.simultaneousConnections * connectionAssumptions.stateBytesPerConnection;
  assert.equal(connectionState, 50_000_000_000);
  assert.equal(connectionAssumptions.simultaneousConnections * connectionAssumptions.reconnectFraction /
    connectionAssumptions.reconnectWindowSeconds, 500);
  const dailyEvents = dailyCalls * retentionAssumptions.eventFraction;
  const replicatedPayload = dailyEvents * retentionAssumptions.averageEventBodyBytes *
    retentionAssumptions.retentionDays * retentionAssumptions.replicationFactor;
  assert.equal(dailyEvents, 50_000_000);
  assert.equal(replicatedPayload, 2_100_000_000_000);
  assert.equal(burstAssumptions.waitingCapacity /
    (burstAssumptions.offeredEventsPerSecond - burstAssumptions.serviceEventsPerSecond), 10);
  assert.equal(burstAssumptions.waitingCapacity /
    (burstAssumptions.serviceEventsPerSecond - burstAssumptions.recoveryEventsPerSecond), 10);
  assert.equal(Buffer.byteLength(JSON.stringify(seniorCourse), "utf8"), 57);
  assert.equal(Buffer.byteLength(JSON.stringify(seniorCompletion), "utf8"), 105);

  assert.deepEqual(published("docs/lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md", "shard-migration-case"), shardCase);
  const source = new DatabaseSync(":memory:");
  const target = new DatabaseSync(":memory:");
  try {
    for (const [db, enabled] of [[source, 1], [target, 0]]) {
      db.exec(`
        CREATE TABLE ownership (tenant_id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, write_enabled INTEGER NOT NULL CHECK (write_enabled IN (0, 1)));
        CREATE TABLE records (
          tenant_id TEXT NOT NULL, course_id TEXT NOT NULL, version INTEGER NOT NULL,
          label TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, course_id)
        );
      `);
      db.prepare("INSERT INTO ownership VALUES (?, ?, ?)").run(shardCase.tenantId, shardCase.initialEpoch, enabled);
    }
    source.prepare("INSERT INTO records VALUES (?, ?, ?, ?, ?)").run(
      shardCase.tenantId, shardCase.courseId, shardCase.initialRecordVersion, shardCase.initialLabel, JSON.stringify(seniorCourse));
    const row = db => db.prepare("SELECT * FROM records WHERE tenant_id = ? AND course_id = ?").get(shardCase.tenantId, shardCase.courseId);
    const owner = db => db.prepare("SELECT * FROM ownership WHERE tenant_id = ?").get(shardCase.tenantId);
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
    function mutate(db, epoch, expectedVersion, label) {
      return transaction(db, () => {
        const authority = owner(db);
        if (!authority.write_enabled || authority.epoch !== epoch) throw new Error("Fenced or inactive write owner");
        const record = row(db);
        if (!record) throw new Error("Missing course record");
        if (record.version !== expectedVersion) throw new Error("Stale expected record version");
        const update = db.prepare("UPDATE records SET version = version + 1, label = ? WHERE tenant_id = ? AND course_id = ? AND version = ?")
          .run(label, shardCase.tenantId, shardCase.courseId, expectedVersion);
        if (update.changes !== 1) throw new Error("Record version changed before write");
        return row(db);
      });
    }
    function copyVersion(record) {
      if (record.tenant_id !== shardCase.tenantId || record.course_id !== shardCase.courseId) {
        throw new Error("Backfill scope mismatch");
      }
      if (!Number.isSafeInteger(record.version) || record.version < 1) throw new Error("Invalid record version");
      return transaction(target, () => {
        if (owner(target).write_enabled) throw new Error("Backfill worker is fenced after promotion");
        const previous = row(target);
        if (previous) {
          if (record.version < previous.version) throw new Error("Stale backfill rejected");
          if (record.version === previous.version) {
            if (record.label !== previous.label || !isDeepStrictEqual(JSON.parse(record.payload), JSON.parse(previous.payload))) {
              throw new Error("Conflicting record version");
            }
            return "duplicate";
          }
          target.prepare("UPDATE records SET version = ?, label = ?, payload = ? WHERE tenant_id = ? AND course_id = ?")
            .run(record.version, record.label, record.payload, record.tenant_id, record.course_id);
        } else {
          target.prepare("INSERT INTO records VALUES (?, ?, ?, ?, ?)").run(
            record.tenant_id, record.course_id, record.version, record.label, record.payload);
        }
        return "copied";
      });
    }
    let route = { owner: shardCase.source, epoch: shardCase.initialEpoch };
    const snapshot = { ...row(source) };
    copyVersion(snapshot);
    assert.throws(() => mutate(target, shardCase.initialEpoch, 1, "unapproved"), /inactive/);
    mutate(source, shardCase.initialEpoch, 1, shardCase.changedLabel);
    assert.equal(row(source).version, shardCase.nextRecordVersion);
    assert.throws(() => mutate(source, shardCase.initialEpoch, 1, "lost-update attempt"), /Stale expected/);
    function promote() {
      if (owner(source).write_enabled) throw new Error("Old write owner is not fenced");
      assert.deepEqual(row(target), row(source), "Destination has not caught up");
      transaction(target, () => target.prepare("UPDATE ownership SET epoch = ?, write_enabled = 1 WHERE tenant_id = ?")
        .run(shardCase.nextEpoch, shardCase.tenantId));
      route = { owner: shardCase.target, epoch: shardCase.nextEpoch };
    }
    assert.throws(promote, /not fenced/);
    transaction(source, () => source.prepare("UPDATE ownership SET epoch = ?, write_enabled = 0 WHERE tenant_id = ?")
      .run(shardCase.nextEpoch, shardCase.tenantId));
    assert.throws(promote, /not caught up/);
    assert.throws(() => mutate(source, shardCase.initialEpoch, 2, "late source write"), /Fenced/);
    assert.equal(copyVersion(row(source)), "copied");
    assert.throws(() => copyVersion(snapshot), /Stale backfill/);
    assert.throws(() => copyVersion({ ...row(target), label: "conflicting label" }), /Conflicting/);
    assert.throws(() => copyVersion({ ...row(target), tenant_id: "org-b" }), /scope mismatch/);
    assert.throws(() => copyVersion({ ...row(target), version: 2.5 }), /Invalid record version/);
    assert.equal(copyVersion({
      ...row(target),
      payload: JSON.stringify({ seats: seniorCourse.seats, title: seniorCourse.title, id: seniorCourse.id }),
    }), "duplicate");
    promote();
    assert.deepEqual(route, { owner: shardCase.target, epoch: shardCase.nextEpoch });
    assert.throws(() => mutate(target, shardCase.initialEpoch, 2, "stale route"), /Fenced/);
    mutate(target, shardCase.nextEpoch, 2, "hourly");
    assert.equal(row(target).version, 3);
    assert.throws(() => mutate(target, shardCase.nextEpoch, 2, "late current-owner write"), /Stale expected/);
    assert.throws(() => copyVersion({ ...snapshot, version: 99 }), /fenced after promotion/);
    assert.deepEqual(JSON.parse(row(target).payload), seniorCourse);
    assert.equal(row(target).label, "hourly");
    assert.equal(owner(source).write_enabled, 0);

    const cacheKey = (tenant, epoch, version) => JSON.stringify([tenant, shardCase.courseId, epoch, version]);
    const cache = new Map([[cacheKey(shardCase.tenantId, shardCase.initialEpoch, 1), snapshot]]);
    assert.equal(cache.get(cacheKey(shardCase.tenantId, shardCase.nextEpoch, 3)), undefined);
    assert.notEqual(cacheKey("org-a", 8, 3), cacheKey("org-b", 8, 3));
    function scopedRead(selectedTenant) {
      if (selectedTenant !== shardCase.tenantId) throw new Error("Tenant selector is not authorized in this verified context");
      return row(target);
    }
    target.prepare("INSERT INTO records VALUES (?, ?, ?, ?, ?)").run(
      "org-b", shardCase.courseId, 1, "foreign label", JSON.stringify({ ...seniorCourse, title: "Other tenant catalogue" }));
    assert.ok(target.prepare("SELECT * FROM records WHERE tenant_id = ?").get("org-b"));
    assert.throws(() => scopedRead("org-b"), /not authorized/);
    assert.equal(scopedRead("org-a").tenant_id, "org-a");
    return {
      dailyCalls, planningBodyBytesPerSecond: bodyBytesPerSecond, connectionStateBytes: connectionState,
      replicatedPayloadBytes: replicatedPayload, courseJsonBytes: 57, completionJsonBytes: 105, cutoverEpoch: 8,
    };
  } finally {
    source.close();
    target.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("Passed published planning figures, exact UTF-8 bytes and actual local SQLite backfill/fence/cutover guards:", runSeniorModelChecks());
  console.log("The multi-database sequence is a finite recovery model, not an atomic distributed migration, cache deployment or measured capacity.");
}
