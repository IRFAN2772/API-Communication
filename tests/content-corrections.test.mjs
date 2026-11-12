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

test("async qualifications cite actual original guarantees and their complete lessons", () => {
  const lines = read("docs/05-ASYNC-APIS.md").split("\n");
  const cases = [
    [758, 764, ["I processed message successfully.", "Then broker removes it."]],
    [2053, 2053, ["Never lose message."]],
    [2737, 2741, ["At-Least-Once", "No loss"]],
    [2744, 2753, ["Exactly-Once", "Idempotent Processing"]],
    [2272, 2311, ["Idempotent Consumers", "Processed Once"]],
    [3196, 3196, ["Ordering preserved."]],
    [3391, 3391, ["Keep forever."]],
    [3431, 3431, ["Replay entire history"]],
    [2502, 2511, ["After N retries:", "Dead Letter Queue"]],
    [2549, 2553, ["Bad message isolated.", "System continues."]],
    [4362, 4420, ["The modern solution.", "Refund payment", "Cancel order"]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `05-ASYNC-APIS.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of [
    "BROKERS-DELIVERY-AND-RECOVERY.md",
    "OUTBOX-INBOX-AND-WORKFLOWS.md",
    "EVENT-MODELS-AND-PROJECTIONS.md",
  ]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
});

test("architecture distinctions quote actual retained sources and link the complete corrected lessons", () => {
  const lines = read("docs/06-API-ARCHITECTURE.md").split("\n");
  const cases = [
    [489, 489, ["Every request passes through gateway."]],
    [647, 658, ["Multiple gateway instances.", "Highly available."]],
    [1818, 1818, ["Perfect distribution."]],
    [2373, 2373, ["Applications never talk directly."]],
    [2581, 2581, ["All services get same behaviour."]],
    [2682, 2684, ["Every request passes through Envoy.", "Metrics automatically collected:"]],
    [3070, 3078, ["openapi: 3.0.0", "paths:", "description: Success"]],
    [3161, 3161, ["id: number"]],
    [3651, 3654, ["System remains stable."]],
    [3742, 3746, ["I can currently accept", "10 KB more.", "Sender respects the limit."]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `06-API-ARCHITECTURE.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of [
    "GATEWAYS-BFFS-AND-LOAD-BALANCING.md", "SERVICE-MESH-AND-TRUST.md",
    "API-CONTRACTS-AND-LIFECYCLE.md", "BACKPRESSURE-AND-CAPACITY.md",
  ]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
});

test("expert corrections cite the exact retained body and keep all complete explanations linked", () => {
  const lines = read("docs/08-EXPERT-API-DESIGN.md").split("\n");
  const cases = [
    [17, 20, ["Consensus & Coordination", "API Observability", "Chaos Engineering", "Platform Thinking"]],
    [139, 145, ["to be appended", "API Governance"]],
    [361, 361, ["Safe. Existing clients ignore unknown fields."]],
    [1233, 1237, ["Guarantees:", "Contract still valid."]],
    [2212, 2212, ["Nearest region selection."]],
    [1972, 1975, ["2 seconds"]],
    [2351, 2365, ["Reliability Ladder", "Metric", "SLI", "SLO", "SLA"]],
    [3049, 3064, ["BEGIN", "Charge Payment", "ROLLBACK", "Everything returns to a safe state."]],
    [3373, 3378, ["Final state:", "No charge.", "No order."]],
    [3648, 3656, ["PaymentCompleted", "Charge twice."]],
    [3762, 3762, ["Guaranteed delivery with DB transaction"]],
    [4575, 4576, ["Every read returns latest write", "Every request gets a response"]],
    [4664, 4664, ["Choose any 2 of 3."]],
    [5406, 5406, ["Once majority replicate it, leader commits it."]],
    [4468, 4468, ["Break things intentionally"]],
    [5943, 5955, ["Every request must carry:", "Tenant Identity"]],
    [6053, 6069, ["50,002 requests", "Basis of billing."]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `08-EXPERT-API-DESIGN.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of [
    "CONTRACT-EVOLUTION-AND-CONSUMERS.md", "REGIONS-AND-CONSISTENCY.md",
    "DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md", "CONSENSUS-AND-COORDINATION.md",
    "RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md", "TENANCY-USAGE-AND-GOVERNANCE.md",
  ]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../CONTENT-CORRECTIONS.md)"));
  }
});

test("senior qualifications quote the preserved source without inventing guarantees or private verification", () => {
  const lines = read("docs/07-SENIOR-DESIGN-GUIDE.md").split("\n");
  const cases = [
    [9, 9, ["I also checked internal enterprise material"]],
    [34, 34, ["Best choice"]],
    [413, 413, ["Beginner Level: REST"]],
    [539, 539, ["Intermediate Level: GraphQL"]],
    [693, 693, ["Advanced Level: gRPC"]],
    [1276, 1288, ["Monolith to Distributed", "GraphQL BFF"]],
    [332, 356, ["11,574", "57,870", "300 MB/s"]],
    [372, 372, ["Memory required", "50 GB"]],
    [406, 406, ["2.1 TB cluster storage"]],
    [1213, 1229, ["SOAP uses XML and WSDL contracts.", "formal contract"]],
    [1565, 1577, ["API Server Sharding", "horizontally scaled"]],
    [1641, 1641, ["Wrong partition key can destroy ordering guarantees."]],
    [1898, 1898, ["Otherwise events may arrive out of order."]],
    [1721, 1721, ["DataLoader batching"]],
    [1034, 1067, ["alreadyProcessed", "db.transaction"]],
    [1916, 1937, ["db.idempotency.findOne", "db.transaction"]],
    [2446, 2446, ["broker.publish(event.eventType, event.payload)"]],
    [2636, 2638, ["Not ideal for:", "long-term replayable event log"]],
    [3017, 3017, ["is coming soon"]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `07-SENIOR-DESIGN-GUIDE.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of [
    "REQUIREMENTS-AND-ESTIMATION.md", "SOAP-XML-AND-ENTERPRISE-CONTRACTS.md",
    "SHARDING-CACHING-AND-INFRASTRUCTURE.md",
  ]) {
    assert.ok(ledger.includes(`](lessons/${file})`));
    assert.ok(read(`docs/lessons/${file}`).includes("](../07-SENIOR-DESIGN-GUIDE.md)"));
  }
});

test("case-study distinctions quote retained source and link the complete corrected designs", () => {
  const lines = read("docs/09-SYSTEM-DESIGN-CASE-STUDIES.md").split("\n");
  const cases = [
    [5, 5, ["power", "blueprints"]],
    [54, 54, ["99.99% message delivery guarantee"]],
    [77, 78, ["500M concurrent", "100K conn/node"]],
    [152, 152, ["Wake device when app inactive"]],
    [211, 211, ["Wake device notification"]],
    [278, 278, ["Consensus-based registry or TTL-based expiry"]],
    [444, 470, ["Store processed versions", "Write post metadata"]],
    [519, 519, [">1M followers"]],
    [555, 555, ["Idempotent, simple CRUD"]],
    [524, 524, ["TTL-based auto-expiry"]],
    [580, 580, ["Zero buffering during playback"]],
    [685, 685, ["C->>K: ViewingEvent"]],
    [724, 724, ["C->>K: ViewingEvent"]],
    [737, 737, ["video never hits origin"]],
    [938, 938, ["Cancel trip completion"]],
    [942, 943, ["refund rider", "retry for driver credit"]],
    [965, 965, ["last known surge multiplier"]],
    [967, 967, ["Idempotency key on ride creation"]],
    [1120, 1120, ["returns from cache (sub-ms)"]],
    [1191, 1192, ["720K videos/day", "10.8M transcoding jobs/day"]],
    [1261, 1261, ["status: READY"]],
    [1310, 1310, ["essentially unlimited"]],
    [1364, 1364, ["Netflix (exactly)"]],
    [1396, 1396, ["Netflix (exactly)"]],
    [1397, 1397, ["scale × 3"]],
    [1407, 1407, ["Every large-scale system follows the same skeleton"]],
    [1465, 1465, ["Clients need both"]],
    [1507, 1507, ["Phase 8: Case Studies"]],
    [1512, 1512, ["**Design** any distributed system"]],
  ];
  for (const [start, end, phrases] of cases) {
    const excerpt = lines.slice(start - 1, end).join("\n");
    for (const phrase of phrases) assert.ok(excerpt.includes(phrase), `09-SYSTEM-DESIGN-CASE-STUDIES.md:${start}–${end}: ${phrase}`);
    assert.ok(ledger.includes(start === end ? `line ${start}` : `${start}–${end}`));
  }
  for (const file of [
    "CASE-WHATSAPP-MESSAGING.md", "CASE-INSTAGRAM-FEEDS-AND-MEDIA.md",
    "CASE-NETFLIX-PLAYBACK.md", "CASE-UBER-DISPATCH-AND-PAYMENTS.md",
    "CASE-TWITTER-TIMELINES.md", "CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md",
    "CASE-STUDY-TRANSFERS.md",
  ]) assert.ok(ledger.includes(`](lessons/${file})`) || ledger.includes(`](lessons/${file}#`));
});
