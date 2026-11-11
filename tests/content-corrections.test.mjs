import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const originalLines = read("docs/01-REST-APIS.md").split("\n");
const ledger = read("docs/CONTENT-CORRECTIONS.md");

test("correction provenance matches the actual retained source rather than invented quotations", () => {
  const cases = [
    [3127, 3157, ["No state change.", "Result remains same."]],
    [2814, 2859, ["Start after record abc123.", "Very fast.", "Slow at scale"]],
    [2821, 2821, ['"data":[...],']],
    [4167, 4182, ["Database Query = 50 ms", "Cache Query = 1 ms"]],
    [4507, 4507, ["Never cache."]],
    [4557, 4557, ["Only browser should cache."]],
    [4931, 4935, ["Update DB", "Update Cache", "same time."]],
    [5068, 5100, ["Microseconds.", "Filter field → needs index"]],
    [5451, 5451, ["No breakage."]],
    [5561, 5570, ["JWT (Most Common)", "User ID", "Roles", "Expiry"]],
    [5691, 5691, ["prevents CSRF"]],
    [5715, 5715, ["Stateless — token contains claims"]],
    [3686, 3686, ["to ensure duplicates are not processed."]],
    [6519, 6521, ["4 × 300 ms", "1200 ms"]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = originalLines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) {
      assert.ok(excerpt.includes(phrase), `01-REST-APIS.md:${start}–${end}: ${phrase}`);
    }
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`), `Missing source range ${start}`);
  }
});

test("preserved source is explicitly distinguished from corrected, linked explanations", () => {
  assert.match(ledger, /retained unchanged/);
  assert.match(ledger, /not a claim that every topic/);
  assert.match(ledger, /\*\*Correction\*\*/);
  assert.match(ledger, /\*\*Qualification\*\*/);
  for (const file of [
    "REST-HTTP-CONTRACTS.md",
    "REST-COLLECTIONS-AND-CACHING.md",
    "REST-AUTH-AND-EVOLUTION.md",
    "REST-RELIABILITY-AND-OPERATIONS.md",
  ]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
  assert.ok(read("assets/studio.mjs").includes('link.href = "#/docs/CONTENT-CORRECTIONS"'));
});

test("GraphQL corrections cite actual source passages and keep their explanations reachable", () => {
  const lines = read("docs/02-GRAPHQL.md").split("\n");
  const cases = [
    [250, 253, ["Server decides response structure.", "Client decides response structure."]],
    [510, 515, ["type User", "  id", "  name", "  bio"]],
    [1151, 1164, ["1 query for users", "100 queries for posts", "101 queries", "1 + N"]],
    [1357, 1358, ["Every GraphQL project", "eventually needs DataLoader"]],
    [1627, 1627, ["Caches repeated loads inside request."]],
    [1446, 1461, ["Depth Limit", "403 Forbidden", "400 Bad Request"]],
    [1631, 1634, ["Store approved queries.", "Reference by hash.", "Much easier to cache."]],
    [1725, 1728, ["One huge GraphQL server becomes impossible.", "Federation"]],
    [1772, 1772, ["Gateway merges everything."]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `02-GRAPHQL.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of ["GRAPHQL-EXECUTION-AND-BATCHING.md", "GRAPHQL-COST-CACHING-AND-EVOLUTION.md"]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
});

test("RPC corrections cite the retained source and its standalone explanations", () => {
  const lines = read("docs/03-RPC-AND-GRPC.md").split("\n");
  const cases = [
    [127, 127, ["Before RPC Existed"]],
    [779, 788, ["Historically:", "Google Remote Procedure Call"]],
    [1312, 1315, ["Protobuf = Vacuum-compressed suitcase", "Same information, smaller and faster for machines."]],
    [2132, 2132, ["item positions are already agreed"]],
    [2066, 2066, ["gRPC is usually faster than typical REST/JSON"]],
    [1145, 1165, ["HTTP/1.1 Problem", "Streaming is not natural"]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `03-RPC-AND-GRPC.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of ["GRPC-PROTOBUF-AND-EVOLUTION.md", "GRPC-LIFECYCLE-AND-OPERATIONS.md"]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
});

test("real-time correction quotations match the unchanged chapter and linked lessons", () => {
  const lines = read("docs/04-REALTIME-COMMUNICATION.md").split("\n");
  const cases = [
    [341, 346, ["More efficient than polling"]],
    [471, 471, ["Connection stays open"]],
    [571, 571, ["Sticky Sessions"]],
    [657, 659, ["Sequence numbers", "Timestamps", "Per-chat ordering"]],
    [963, 963, ["One message is processed by one consumer."]],
    [1788, 1792, ["Google delivers notification.", "Phone wakes up."]],
    [1986, 1990, ["Phone wakes app."]],
    [2523, 2524, ["Much cheaper.", "Much faster."]],
    [2931, 2933, ["Try STUN first.", "Use TURN if necessary."]],
    [3004, 3004, ["STUN attempts connection."]],
    [2903, 2903, ["Works almost always."]],
    [3259, 3264, ["STUN fails", "Use TURN."]],
    [3203, 3203, ["Does NOT decode video."]],
    [3312, 3315, ["Audio Calls", "Video Calls", "Screen Share"]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `04-REALTIME-COMMUNICATION.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of [
    "REALTIME-RECOVERY-AND-FLOW.md",
    "WEBHOOKS-AND-BACKGROUND-JOBS.md",
    "PUSH-NOTIFICATION-DELIVERY.md",
    "WEBRTC-MEDIA-AND-CONNECTIVITY.md",
  ]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
});
