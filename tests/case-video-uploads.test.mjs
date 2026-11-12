import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { uploadCase, uploadScale } from "../assets/case-study-fixtures.mjs";

const lessonUrl = new URL("../docs/lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md", import.meta.url);
const lesson = readFileSync(lessonUrl, "utf8");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function example(name) {
  const marker = `<!-- example: ${name} -->`;
  assert.equal(lesson.split(marker).length, 2);
  const match = lesson.split(marker)[1].match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

test("fixtures match marked examples and the source is synthetic UTF-8 bytes", () => {
  assert.deepEqual(example("upload-case"), uploadCase);
  assert.deepEqual(example("upload-scale"), uploadScale);
  for (const match of lesson.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) JSON.parse(match[1]);
  const bytes = Buffer.concat(uploadCase.parts.map(p => Buffer.from(p.body, "utf8")));
  assert.equal(bytes.length, uploadCase.expectedBytes);
  assert.equal(bytes.toString("utf8"), "abcdef");
  assert.equal(sha(bytes), "bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721");
  assert.notEqual(sha(Buffer.from(uploadCase.parts.map(p => sha(p.body)).join(""))), sha(bytes));
  assert.match(lesson, /not a\s+valid video/i);
});

test("scale calculation distinguishes hours, video count and output jobs", () => {
  const s = uploadScale;
  const hours = s.uploadedHoursPerMinute * s.minutesPerDay;
  const videos = hours / s.averageVideoDurationHours;
  const outputs = s.resolutions * s.formats;
  assert.equal(hours, 720_000);
  assert.equal(videos, 2_880_000);
  assert.equal(outputs, 15);
  assert.equal(videos * outputs, 43_200_000);
  assert.equal(hours * s.sourceBytesPerHour / 1e12, 720);
  assert.equal(hours / 1 * outputs, 10_800_000);
  assert.match(lesson, /average video lasts \*\*one hour\*\*/i);
  assert.match(lesson, /not a\s+conversion from hours to videos/i);
});

// SQLite is an in-memory local transaction model, not an object store or broker.
test("SQL probe checks multipart identity, inbox deduplication and guarded readiness", () => {
  const python = String.raw`
import hashlib, json, sqlite3, sys
x = json.loads(sys.stdin.read())
c = sqlite3.connect(':memory:')
c.executescript("""
CREATE TABLE parts (upload TEXT, owner TEXT, number INTEGER, digest TEXT, body BLOB,
                    PRIMARY KEY(upload, number));
CREATE TABLE asset (video TEXT PRIMARY KEY, generation INTEGER, status TEXT,
                    source_version TEXT, source_hash TEXT);
CREATE TABLE variants (video TEXT, generation INTEGER, variant TEXT, version TEXT, valid INTEGER,
                       PRIMARY KEY(video, generation, variant));
CREATE TABLE manifests (video TEXT, generation INTEGER, version TEXT, valid INTEGER,
                        PRIMARY KEY(video, generation));
CREATE TABLE inbox (consumer TEXT, event TEXT, fingerprint TEXT, PRIMARY KEY(consumer, event));
CREATE TABLE outbox (event TEXT PRIMARY KEY, video TEXT, generation INTEGER);
""")
def part(owner, number, body):
    if owner != x['ownerId']: return 'unauthorized'
    digest = hashlib.sha256(body).hexdigest()
    row = c.execute('SELECT owner,digest,body FROM parts WHERE upload=? AND number=?',
                    (x['uploadId'], number)).fetchone()
    if row: return 'accepted' if row == (owner,digest,body) else 'conflict'
    c.execute('INSERT INTO parts VALUES (?,?,?,?,?)', (x['uploadId'],owner,number,digest,body))
    return 'accepted'
assert part(x['ownerId'],1,b'abc') == 'accepted'
assert part(x['ownerId'],1,b'abc') == 'accepted'
assert part(x['ownerId'],1,b'xyz') == 'conflict'
assert part('other',2,b'def') == 'unauthorized'
def finalize(expected_hash, verified_version, object_version):
    rows = c.execute('SELECT number,body FROM parts WHERE upload=? ORDER BY number', (x['uploadId'],)).fetchall()
    if [r[0] for r in rows] != [p['number'] for p in x['parts']]: return False
    data = b''.join(r[1] for r in rows)
    return len(data) == x['expectedBytes'] and hashlib.sha256(data).hexdigest() == expected_hash and verified_version == object_version
digest = hashlib.sha256(b'abcdef').hexdigest()
assert not finalize(digest,'v1','v1')
assert part(x['ownerId'],2,b'def') == 'accepted'
assert not finalize('wrong','v1','v1')
assert not finalize(digest,'v1','v2')
assert finalize(digest,'v1','v1')
c.commit()
with c:
    c.execute("INSERT INTO asset VALUES (?,1,'PROCESSING','v1',?)", (x['videoId'],digest))
    c.execute("INSERT INTO outbox VALUES ('process-1',?,1)", (x['videoId'],))
def receive(fingerprint):
    row = c.execute("SELECT fingerprint FROM inbox WHERE consumer='worker' AND event='process-1'").fetchone()
    if row: return 'duplicate' if row[0] == fingerprint else 'conflict'
    c.execute("INSERT INTO inbox VALUES ('worker','process-1',?)", (fingerprint,))
    return 'new'
assert receive('g1') == 'new'
assert receive('g1') == 'duplicate'
assert receive('g2') == 'conflict'
c.execute("INSERT INTO variants VALUES (?,1,'low','low-v1',1)", (x['videoId'],))
c.execute("INSERT INTO manifests VALUES (?,1,'manifest-v1',1)", (x['videoId'],))
def ready(generation):
    # Artifact validity stands in for external verification; this is not a media decoder.
    with c:
        cur = c.execute("""UPDATE asset SET status='READY'
          WHERE video=? AND generation=? AND status='PROCESSING'
          AND EXISTS (SELECT 1 FROM variants WHERE video=asset.video AND generation=asset.generation AND variant='low' AND valid=1)
          AND EXISTS (SELECT 1 FROM variants WHERE video=asset.video AND generation=asset.generation AND variant='high' AND valid=1)
          AND EXISTS (SELECT 1 FROM manifests WHERE video=asset.video AND generation=asset.generation AND valid=1)""", (x['videoId'],generation))
        if cur.rowcount:
            c.execute("INSERT INTO outbox VALUES ('ready-1',?,?)", (x['videoId'],generation))
        return cur.rowcount
assert ready(1) == 0
c.execute("INSERT INTO variants VALUES (?,1,'high','high-v1',0)", (x['videoId'],))
assert ready(1) == 0
c.execute("UPDATE variants SET valid=1 WHERE variant='high'")
c.execute("UPDATE manifests SET valid=0")
assert ready(1) == 0
c.execute("UPDATE manifests SET valid=1")
assert ready(2) == 0
# A failed outbox insert rolls back the readiness state in the same transaction.
c.execute("INSERT INTO outbox VALUES ('ready-1',?,1)", (x['videoId'],))
c.commit()
try:
    ready(1)
    raise AssertionError('duplicate outbox identity should fail')
except sqlite3.IntegrityError:
    pass
assert c.execute("SELECT status FROM asset").fetchone()[0] == 'PROCESSING'
c.execute("DELETE FROM outbox WHERE event='ready-1'")
c.commit()
assert ready(1) == 1
assert ready(1) == 0
assert c.execute("SELECT status FROM asset").fetchone()[0] == 'READY'
assert c.execute("SELECT count(*) FROM outbox WHERE event='ready-1'").fetchone()[0] == 1
`;
  const result = spawnSync("python3", ["-c", python], {
    input: JSON.stringify(uploadCase), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test("lesson links, failure boundaries and native answers are present", () => {
  for (const href of ["../GUIDED-CASE-STUDIES.md", "../09-SYSTEM-DESIGN-CASE-STUDIES.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md", "../../assets/case-study-fixtures.mjs",
    "CASE-NETFLIX-PLAYBACK.md", "OUTBOX-INBOX-AND-WORKFLOWS.md",
    "WEBRTC-MEDIA-AND-CONNECTIVITY.md", "CONTRACT-EVOLUTION-AND-CONSUMERS.md"]) {
    assert.ok(lesson.includes(href), href);
    assert.ok(existsSync(new URL(href, lessonUrl)), href);
  }
  assert.match(lesson, /database and object store are\s+not atomically committed/i);
  assert.match(lesson, /not billing proof/i);
  assert.match(lesson, /READY.*does not mean\s+public/is);
  const blocks = [...lesson.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(blocks.length >= 5);
  assert.equal((lesson.match(/<details\b/g) ?? []).length, blocks.length);
  for (const [, body] of blocks) {
    assert.match(body, /^\s*<summary>[^<]+<\/summary>\s*<p>[\s\S]+<\/p>\s*$/);
    assert.doesNotMatch(body, /```|\*\*|\[[^\]]+\]\(/);
  }
});
