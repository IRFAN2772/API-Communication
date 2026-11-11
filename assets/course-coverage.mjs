// Baselines are for the ten retained chapters, not the new guided lesson or raw notes.
const records = [
  {
    filename: "00-FUNDAMENTALS.md", title: "Fundamentals", phase: "Phase 0",
    classification: "original chapter", headingCount: 90,
    sha256: "2f8062804266727634f31ffb67df175accf13cea8df4a7f0450b024cbb14b3f9",
    topics: [
      [222, "1. What is an API?", "API basics"],
      [323, "3. Basic API vocabulary", "vocabulary"],
      [498, "7. Requirements and estimations for API communication design", "requirements and estimates"],
      [581, "9. Step-by-step design thinking: from monolith to distributed", "distributed design"],
      [878, "10. Main communication methods explained", "communication methods"],
      [1450, "14. Edge cases and failure modes", "failure modes"],
      [1787, "17. One realistic end-to-end flow", "end-to-end flow"],
    ],
  },
  {
    filename: "01-REST-APIS.md", title: "REST APIs", phase: "Phase 1",
    classification: "original chapter", headingCount: 247,
    sha256: "8b3d131569e1eca6a46d1548fd27d6c9568ebd82be0f78d3ddc7a5cebe14f46c",
    topics: [
      [379, "Chapter 2: URLs in REST", "resources and URLs"],
      [529, "Chapter 3: HTTP Methods", "HTTP methods"],
      [1034, "Chapter 1: Anatomy of an HTTP Request", "request and response"],
      [2622, "Chapter 6: Pagination", "pagination"],
      [3206, "Chapter 2: Idempotency", "idempotency and retries"],
      [4040, "Why Caching Exists", "caching"],
      [5217, "Chapter 1: The API Evolution Problem", "API evolution"],
      [5494, "Chapter 3: Authentication", "authentication"],
      [6172, "Chapter 9: Observability", "observability"],
    ],
  },
  {
    filename: "02-GRAPHQL.md", title: "GraphQL", phase: "Phase 2",
    classification: "original chapter", headingCount: 75,
    sha256: "f94d28fb733ae6fa3bbb3337761b5f30478aa0436d6ba4044fc33d3dd190e7a3",
    topics: [
      [350, "Chapter 3 — GraphQL Query", "queries"],
      [435, "Chapter 4 — Schema", "schema"],
      [602, "Chapter 5 — Resolver", "resolvers"],
      [759, "Chapter 6 — Mutation", "mutations"],
      [1233, "Chapter 2 — DataLoader", "N+1 and DataLoader"],
      [1470, "Chapter 4 — Query Complexity Problem", "query complexity"],
      [1555, "Chapter 5 — GraphQL Caching", "caching"],
      [1699, "Chapter 7 — GraphQL Federation", "federation"],
    ],
  },
  {
    filename: "03-RPC-AND-GRPC.md", title: "RPC and gRPC", phase: "Phase 3",
    classification: "original chapter", headingCount: 93,
    sha256: "6190d124904d06e926361cf1aa25f747e57824065af6331c2866fe6257516389",
    topics: [
      [255, "Chapter 2 — What is RPC?", "RPC"],
      [675, "Chapter 6 — Service Contract", "service contracts"],
      [839, "Chapter 8 — Protocol Buffers (Proto)", "Protocol Buffers"],
      [1168, "5. HTTP/2 — gRPC's Transport Power", "HTTP/2"],
      [1401, "9. Code Generation", "code generation and stubs"],
      [1570, "12. Four Types of gRPC Calls", "streaming RPC"],
      [2745, "23. Failure Modes in gRPC", "failure modes"],
      [2765, "24. Deadlines: Very Important", "deadlines and retries"],
    ],
  },
  {
    filename: "04-REALTIME-COMMUNICATION.md", title: "Real-time communication", phase: "Phase 4",
    classification: "original chapter", headingCount: 140,
    sha256: "105f865a4edc441db068db8513a015cf32cdc21b210a5cc983c28cacbe49f8a7",
    topics: [
      [179, "2. Polling", "polling and long polling"],
      [373, "4. Server-Sent Events (SSE)", "SSE"],
      [443, "5. WebSocket", "WebSocket"],
      [694, "8. Webhooks", "webhooks"],
      [1140, "17.1 Batch Processing", "batch processing"],
      [1607, "4.1.2. Why Push Notifications Exist", "push notifications"],
      [2540, "4.2.3. What is WebRTC?", "WebRTC"],
      [2735, "4.2.7. STUN Server", "STUN, TURN and ICE"],
    ],
  },
  {
    filename: "05-ASYNC-APIS.md", title: "Asynchronous APIs", phase: "Phase 5",
    classification: "original chapter", headingCount: 174,
    sha256: "9b79b849e4bdc2cb9d5e550579c1bd6f6a4cf0673ee30e5862463c3e7cf6e75e",
    topics: [
      [149, "Why Message Queues Exist", "queues and brokers"],
      [949, "Kafka vs RabbitMQ vs SQS — Zero → Hero", "Kafka, RabbitMQ and SQS"],
      [1949, "2. The Three Delivery Guarantees", "delivery guarantees"],
      [2489, "12. Dead Letter Queue (DLQ)", "retries and dead-letter queues"],
      [3028, "6. The Most Important Concept: Partition", "partitions and offsets"],
      [3839, "Event vs Command", "events and commands"],
      [3979, "Event Sourcing", "event sourcing"],
      [4136, "CQRS", "CQRS"],
      [4226, "Outbox Pattern", "outbox and saga"],
    ],
  },
  {
    filename: "06-API-ARCHITECTURE.md", title: "API architecture", phase: "Phase 6",
    classification: "original chapter", headingCount: 157,
    sha256: "4da6dc6a56f0b24881680d7bf47436d60423da88aed10c911a6ea3010de70134",
    topics: [
      [81, "Phase 6.1 — API Gateway Deep Dive (Zero → Hero)", "API gateways"],
      [773, "Phase 6.2 — Backend For Frontend (BFF) — Zero → Hero", "backend for frontend"],
      [1359, "Phase 6.3 — Load Balancers (Zero → Hero)", "load balancing"],
      [2161, "Phase 6.4 — Service Mesh (Zero → Hero)", "service mesh"],
      [2905, "Phase 6.5 — OpenAPI & Swagger (Zero → Hero)", "OpenAPI and Swagger"],
      [3475, "Phase 6.6 — Backpressure & Flow Control (Zero → Hero)", "backpressure and flow control"],
    ],
  },
  {
    filename: "07-SENIOR-DESIGN-GUIDE.md", title: "Senior design guide", phase: "Reference",
    classification: "cross-cutting reference", headingCount: 158,
    sha256: "41171c35a5238c2ca34a796a078dee5e2695a79782bb7d0bc3ef00f42d357009",
    topics: [
      [245, "3. Requirement Clarification: How to Approach This in Interviews", "requirements and estimation"],
      [1204, "12. SOAP and XML APIs", "SOAP and XML"],
      [1233, "13. API Communication Decision Matrix", "decision matrix"],
      [1459, "15. API Data Models and Contracts", "data contracts"],
      [1561, "16. Sharding Strategies for API Communication Systems", "sharding"],
      [1842, "19. Consistency Models", "consistency"],
      [1940, "20. Fault Tolerance Patterns", "fault tolerance"],
      [2065, "21. Security Design", "security"],
      [2356, "25. The Outbox Pattern: Critical for Reliable Events", "outbox"],
    ],
  },
  {
    filename: "08-EXPERT-API-DESIGN.md", title: "Expert API design", phase: "Phase 7",
    classification: "original chapter", headingCount: 258,
    sha256: "aa3eb0aed826400a65c6072e425e7d2b49ace00cf5cf04639fb0e5fde7281f7c",
    topics: [
      [168, "Phase 7.1 — API Evolution & Backward Compatibility", "compatibility and evolution"],
      [815, "Phase 7.2 — Consumer-Driven Contracts (CDC) & Pact (Zero → Hero)", "consumer-driven contracts"],
      [1504, "Phase 7.3 — Multi-Region APIs & Global Architecture (Zero → Hero)", "multi-region"],
      [2280, "Phase 7.4 — Latency Budgets, SLI, SLO, SLA & Error Budgets", "latency and reliability budgets"],
      [3029, "Phase 7.5 — Distributed Transactions (2PC vs Saga vs Outbox)", "distributed transactions"],
      [3843, "Phase 7.6 — API Abuse Prevention & Production Incidents", "abuse prevention and incidents"],
      [4497, "Phase 7.7 — CAP Theorem & Consistency Models (Zero → Hero)", "CAP and consistency"],
      [5020, "Phase 7.8 — Consensus, Raft, Paxos & Leader Election", "consensus"],
      [5721, "Phase 7.9 — API Monetisation & Multi-Tenant Architecture", "monetisation and multi-tenancy"],
      [6350, "Phase 7.10 — How Staff Engineers Think During System Design", "staff-level design"],
    ],
  },
  {
    filename: "09-SYSTEM-DESIGN-CASE-STUDIES.md", title: "System design case studies", phase: "Reference",
    classification: "case-study reference", headingCount: 90,
    sha256: "7fc22cd90f88066cb700999e0b47c12a3de7b7f5e7140638fd57b389eeed1974",
    topics: [
      [35, "Case Study 1: Design WhatsApp", "WhatsApp"],
      [299, "Case Study 2: Design Instagram (Staff Engineer Version)", "Instagram"],
      [562, "Case Study 3: Design Netflix (Staff Engineer Version)", "Netflix"],
      [776, "Case Study 4: Design Uber (Staff Engineer Version)", "Uber"],
      [987, "Case Study 5: Design Twitter/X (Staff Engineer Version)", "Twitter/X"],
      [1163, "Case Study 6: Design YouTube (Staff Engineer Version)", "YouTube"],
      [1351, "How Other Systems Map", "other systems"],
    ],
  },
];

export const chapters = records.map(({ topics, ...chapter }) => ({
  ...chapter,
  destination: `docs/${chapter.filename}`,
  topics: topics.map(([line, text, label]) => ({
    line, text, label, destination: `docs/${chapter.filename}`,
  })),
}));

// ATX headings outside fenced code blocks; line numbers are 1-based and duplicates
// are deliberately retained. The source's exact heading text is not normalized.
export function collectHeadings(markdown) {
  const headings = [];
  let fence = null;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
        fence = marker[1];
        continue;
      }
      if (fence && marker[1][0] === fence[0] &&
          marker[1].length >= fence.length && /^\s*$/.test(marker[2])) {
        fence = null;
        continue;
      }
    }
    if (fence) continue;
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (heading) headings.push({ line: index + 1, level: heading[1].length, text: heading[2] });
  }
  return headings;
}

export function chapterHeadings(chapter, markdown) {
  return collectHeadings(markdown).map((heading) => ({
    ...heading, destination: chapter.destination,
  }));
}
