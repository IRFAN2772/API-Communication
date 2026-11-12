import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { playbackCase } from "../assets/case-study-fixtures.mjs";

const lessonUrl = new URL("../docs/lessons/CASE-NETFLIX-PLAYBACK.md", import.meta.url);
const lesson = readFileSync(lessonUrl, "utf8");

function example(name) {
  const marker = `<!-- example: ${name} -->`;
  assert.equal(lesson.split(marker).length, 2);
  const match = lesson.split(marker)[1].match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function choose(fixture, throughput) {
  const budget = throughput * fixture.safetyFraction;
  return fixture.representations
    .filter(r => r.bitrateBitsPerSecond <= budget)
    .sort((a, b) => b.bitrateBitsPerSecond - a.bitrateBitsPerSecond)[0]?.id ?? null;
}

test("the marked fixture and every JSON block are exact and parseable", () => {
  assert.deepEqual(example("playback-case"), playbackCase);
  for (const match of lesson.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) JSON.parse(match[1]);
});

test("four-second segments and throughput budget use consistent units", () => {
  const sizes = playbackCase.representations.map(r =>
    r.bitrateBitsPerSecond * playbackCase.segmentSeconds / 8);
  assert.deepEqual(sizes, [500_000, 1_500_000, 3_000_000]);
  assert.equal(playbackCase.estimatedThroughputBitsPerSecond * playbackCase.safetyFraction, 3_000_000);
  assert.equal(choose(playbackCase, playbackCase.estimatedThroughputBitsPerSecond), "mid");
  assert.equal(choose(playbackCase, 500_000), null);
  assert.match(lesson, /no representation fits/i);
  assert.match(lesson, /stall or a\s+quality\/network error/i);
});

test("delivery, authorization, telemetry and regional limits are explicit", () => {
  for (const pattern of [
    /identity, rights, entitlement, region and device/i,
    /signed URL.*until\s+expiry/is,
    /origin.fill/i,
    /SSE stream could synchronize session state/i,
    /never send directly to internal Kafka/i,
    /authenticated, bounded HTTPS/i,
    /does not\s+prove viewing or human attention/i,
    /RTO.*RPO/is,
    /DNS changes alone cannot/i,
    /Simulation only/i,
  ]) assert.match(lesson, pattern);
});

test("links resolve and answer blocks use closed native HTML", () => {
  for (const href of ["../GUIDED-CASE-STUDIES.md", "../09-SYSTEM-DESIGN-CASE-STUDIES.md",
    "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md", "../../assets/case-study-fixtures.mjs",
    "REALTIME-RECOVERY-AND-FLOW.md", "WEBRTC-MEDIA-AND-CONNECTIVITY.md",
    "OUTBOX-INBOX-AND-WORKFLOWS.md", "REGIONS-AND-CONSISTENCY.md"]) {
    assert.ok(lesson.includes(href), href);
    assert.ok(existsSync(new URL(href, lessonUrl)), href);
  }
  const blocks = [...lesson.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(blocks.length >= 5);
  assert.equal((lesson.match(/<details\b/g) ?? []).length, blocks.length);
  for (const [, body] of blocks) {
    assert.match(body, /^\s*<summary>[^<]+<\/summary>\s*<p>[\s\S]+<\/p>\s*$/);
    assert.doesNotMatch(body, /```|\*\*|\[[^\]]+\]\(/);
  }
});
