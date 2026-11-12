import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { trafficAssumptions, connectionAssumptions, retentionAssumptions, burstAssumptions } from "../assets/senior-lesson-fixtures.mjs";

const url = new URL("../docs/lessons/REQUIREMENTS-AND-ESTIMATION.md", import.meta.url);
const lesson = readFileSync(url, "utf8");
const published = name => {
  const matches = [...lesson.matchAll(new RegExp(`<!-- example: ${name} -->\\s*\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\``, "g"))];
  assert.equal(matches.length, 1, name);
  return JSON.parse(matches[0][1]);
};
const number = value => Number(value.replaceAll(",", ""));
const match = expression => {
  const result = expression.exec(lesson);
  assert.ok(result, `missing calculation: ${expression}`);
  return result.slice(1).map(number);
};

test("exact shared fixtures are published as parseable JSON", () => {
  assert.deepEqual(published("traffic-assumptions"), trafficAssumptions);
  assert.deepEqual(published("connection-assumptions"), connectionAssumptions);
  assert.deepEqual(published("retention-assumptions"), retentionAssumptions);
  assert.deepEqual(published("burst-assumptions"), burstAssumptions);
  for (const [, body] of lesson.matchAll(/```json\n([\s\S]*?)\n```/g)) JSON.parse(body);
  assert.match(lesson, /independent imaginary large-platform scenario/i);
  assert.match(lesson, /not actual site statistics[\s\S]*Phase 6/i);
});

test("published rates and body bandwidth have correct units and rounding", () => {
  const t = published("traffic-assumptions");
  const daily = t.dailyActiveUsers * t.callsPerActiveUserPerDay;
  const [publishedDaily, seconds] = match(/([\d,]+) requests\/day ÷ ([\d,]+) seconds\/day/);
  assert.equal(publishedDaily, daily);
  assert.equal(seconds, t.secondsPerDay);
  const [average, peak] = match(/([\d,]+\.\d+) requests\/s average\*\*[\s\S]*?\*\*([\d,]+\.\d+) requests\/s assumed peak/);
  assert.equal(average, Number((daily / seconds).toFixed(2)));
  assert.equal(peak, Number((daily / seconds * t.peakFactor).toFixed(2)));
  const [rate, body, bytes, mb] = match(/([\d,]+) requests\/s × ([\d,]+) bytes\/response\s*=\s*([\d,]+) bytes\/s = ([\d,]+) MB\/s/);
  assert.equal(rate, t.planningPeakRequestsPerSecond);
  assert.equal(body, t.averageResponseBodyBytes);
  assert.equal(bytes, rate * body);
  assert.equal(mb, bytes / 1e6);
  const [largerRate, largerBody, largerBytes, gb] = match(/([\d,]+) requests\/s × ([\d,]+) bytes\/response\s*=\s*([\d,]+) bytes\/s = ([\d,]+) GB\/s/);
  assert.equal(largerRate, rate);
  assert.equal(largerBody, t.largerResponseBodyBytes);
  assert.equal(largerBytes, rate * largerBody);
  assert.equal(gb, largerBytes / 1e9);
  const [smallBits, smallGb] = match(/300,000,000 bytes\/s × 8 = ([\d,]+) bits\/s = ([\d.]+) Gb\/s/);
  const [largeBits, largeGb] = match(/3,000,000,000 bytes\/s × 8 = ([\d,]+) bits\/s = ([\d.]+) Gb\/s/);
  assert.equal(smallBits, bytes * 8);
  assert.equal(smallGb, smallBits / 1e9);
  assert.equal(largeBits, largerBytes * 8);
  assert.equal(largeGb, largeBits / 1e9);
  assert.match(lesson, /not a measured benchmark or proven capacity/i);
});

test("published connection, retention and burst calculations use the fixture", () => {
  const c = published("connection-assumptions");
  const r = published("retention-assumptions");
  const b = published("burst-assumptions");
  const daily = trafficAssumptions.dailyActiveUsers * trafficAssumptions.callsPerActiveUserPerDay;
  const [connections, state, total, gb] = match(/([\d,]+) simultaneous connections × ([\d,]+) bytes\/connection\s*=\s*([\d,]+) bytes = ([\d,]+) GB connection state only/);
  assert.deepEqual([connections, state], [c.simultaneousConnections, c.stateBytesPerConnection]);
  assert.equal(total, connections * state);
  assert.equal(gb, total / 1e9);
  const [reconnecting, window, perSecond] = match(/([\d,]+) reconnects ÷ ([\d,]+) seconds = ([\d,]+) reconnects\/s/);
  assert.equal(reconnecting, connections * c.reconnectFraction);
  assert.equal(window, c.reconnectWindowSeconds);
  assert.equal(perSecond, reconnecting / window);
  const [events, eventSize, payload, dailyGb] = match(/([\d,]+) events\/day × ([\d,]+) bytes\/event\s*=\s*([\d,]+) bytes\/day = ([\d,]+) GB\/day/);
  assert.equal(events, daily * r.eventFraction);
  assert.equal(eventSize, r.averageEventBodyBytes);
  assert.equal(payload, events * eventSize);
  assert.equal(dailyGb, payload / 1e9);
  const [retained, days, rawGb] = match(/([\d,]+) GB\/day × ([\d,]+) days = ([\d,]+) GB retained payload/);
  assert.equal(retained, dailyGb);
  assert.equal(days, r.retentionDays);
  assert.equal(rawGb, retained * days);
  const [sourceGb, replicas, replicatedGb, tb] = match(/([\d,]+) GB × ([\d,]+) copies = ([\d,]+) GB = ([\d.]+) TB replicated payload lower bound/);
  assert.equal(sourceGb, rawGb);
  assert.equal(replicas, r.replicationFactor);
  assert.equal(replicatedGb, rawGb * replicas);
  assert.equal(tb, replicatedGb / 1000);
  const [offered, service, growth] = match(/growth = ([\d,]+) - ([\d,]+) = ([\d,]+) waiting events\/s/);
  assert.deepEqual([offered, service, growth], [b.offeredEventsPerSecond, b.serviceEventsPerSecond, offered - service]);
  const [capacity, rate, fill] = match(/([\d,]+) waiting slots ÷ ([\d,]+) events\/s = ([\d,]+) seconds to fill/);
  assert.equal(capacity, b.waitingCapacity);
  assert.equal(rate, growth);
  assert.equal(fill, capacity / growth);
  const [serving, recovery, drain] = match(/drain = ([\d,]+) - ([\d,]+) = ([\d,]+) waiting events\/s/);
  assert.deepEqual([serving, recovery, drain], [b.serviceEventsPerSecond, b.recoveryEventsPerSecond, serving - recovery]);
  const [waiting, drainRate, drainSeconds] = match(/([\d,]+) waiting events ÷ ([\d,]+) events\/s = ([\d,]+) seconds to drain/);
  assert.equal(waiting, capacity);
  assert.equal(drainRate, drain);
  assert.equal(drainSeconds, waiting / drain);
  assert.match(lesson, /independent fluid overload and recovery model/i);
  assert.match(lesson, /not such a measurement/i);
});

test("answers are closed HTML and links resolve", () => {
  const lines = lesson.split("\n").length;
  assert.ok(lines >= 400 && lines <= 501, `length ${lines}`);
  const answers = [...lesson.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 7);
  assert.equal((lesson.match(/<details\b/g) ?? []).length, answers.length);
  for (const [, attributes, body] of answers) {
    assert.equal(attributes.trim(), 'class="learning-answer"');
    assert.match(body, /^\s*<summary>[^<]+<\/summary>\s*(?:<p>[\s\S]*?<\/p>\s*)+$/);
    assert.doesNotMatch(body, /`|\*\*|\[[^\]]+\]\([^)]+\)/);
    for (const tag of body.matchAll(/<\/?([a-z][\w-]*)(?:\s[^>]*)?>/gi)) {
      assert.ok(["summary", "p", "strong", "code"].includes(tag[1]), tag[0]);
    }
  }
  for (const [, target] of lesson.matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(existsSync(new URL(target.split("#")[0], url)), target);
  }
});
