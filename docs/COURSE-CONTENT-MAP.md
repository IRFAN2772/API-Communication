# All topics: course content map

This library is the destination index for the course. Start with the
[guided Phase 0 journey](00-GUIDED-FUNDAMENTALS.md), then use the question,
constraints, and prerequisites below to choose what to read next. The
numbered phases organize material; they are not a claim that one protocol
replaces or upgrades another. An application can use several at once.

**Status:** All numbered Phases 0–7 now have evolution-based guided entries. Phases 1,
4 and 6 each have four detailed related lessons; Phases 2 and 3 each have two,
and Phase 5 has three; Phase 7 has six. The ten original full chapters and
references remain intact. The senior-design companion now has a guided
entry and three related lessons. The case-study companion now has six complete
case lessons and a linked four-system transfer lesson.
A link here is a route to existing material, not
a claim of complete treatment or mastery. Related branches are not disposable
extras: learn the branch when its problem or constraints apply.
You can also study each branch independently to understand its mechanism,
expected behavior and trade-offs, even if the learning-platform story does
not need it. No topic is removed just because the main example does not use it.

Each entry links its entire chapter, including headings not individually
listed here. The [coverage manifest](../assets/course-coverage.mjs) records
the original bytes, heading counts and selected source headings; it can map
every original heading, including repeated ones, to its retained chapter.

## Phase 0 — Fundamentals

**Main-path question:** What problem does an API solve, and how do a client's
requirements shape communication choices?

**Read:** [Original full fundamentals chapter](00-FUNDAMENTALS.md).
The guided journey is the starting point; this original is the full reference.

**Within the guided page:** learn the six core exchanges first, then revisit
[retry correctness](00-GUIDED-FUNDAMENTALS.md#phase0-retry-correctness) and
[reliable deferred work](00-GUIDED-FUNDAMENTALS.md#phase0-deferred-work)
for the retained implementation constraints. The prediction answers are
separate disclosures; the closing exercises test recall, a changed condition,
and transfer to another domain. These exercises do not certify mastery.

- API basics and vocabulary: clients, servers, requests, responses, endpoints,
  payloads and contracts.
- requirements and estimates: clarify functional and operational needs before
  selecting a mechanism.
- distributed design and communication methods: follow the system boundary
  from a simple application to interacting services.
- failure modes and end-to-end flow: trace an actual request and what can go
  wrong, rather than memorizing names.

**Practice:** Name the caller and receiver in a familiar action, then identify
the contract and what the caller can do if the response never arrives.
The original progression is an example of changing constraints, not a rule
that every system must become a collection of services.

**Related / prerequisites:** No protocol background assumed. Continue with
REST for ordinary HTTP request-response; revisit this chapter when comparing
GraphQL, RPC, real-time and asynchronous branches.

## Phase 1 — REST APIs

**Main-path question:** How can clients work with resources using HTTP, and
what makes that interface safe to operate?

**Read:** [Original full REST chapter](01-REST-APIS.md).

**Main journey:** [Evolve the Course API through requirements](01-GUIDED-REST.md).
On the site, [open the original in Full reference mode](01-REST-APIS.md?view=reference)
to see every retained section together.

**Related lessons with their own explanations:**

- [HTTP contracts and representations](lessons/REST-HTTP-CONTRACTS.md):
  methods, wire messages, JSON, content negotiation, errors and status semantics.
- [Collections, caching and validators](lessons/REST-COLLECTIONS-AND-CACHING.md):
  query design, pagination, indexes, freshness, cache patterns and conditional requests.
- [Access and contract evolution](lessons/REST-AUTH-AND-EVOLUTION.md):
  authentication, authorization, cookie/token trade-offs and compatible changes.
- [Reliability and operations](lessons/REST-RELIABILITY-AND-OPERATIONS.md):
  retries, duplicate effects, external boundaries, budgets, gateways and diagnostics.

The [correction record](CONTENT-CORRECTIONS.md) explains what was corrected or
qualified. The reading map retains the original destination for every REST
heading; these lessons organize knowledge, not a mandatory technology ladder.
The [REST reading map](../assets/rest-reading-map.mjs) records each original
heading's source line and recommended destination for retention checks.

- resources and URLs, HTTP methods, request and response, status codes and
  headers.
- path and query parameters, filtering, sorting, searching and pagination.
- idempotency and retries, payment examples and partial failure.
- [caching](01-REST-APIS.md#why-caching-exists): cache controls, validators,
  freshness and cache patterns.
- API evolution, versioning, authentication, rate limiting, gateways,
  timeouts, circuit breakers and observability.

**Practice:** Continue with learner-7's enrollment in API Fundamentals and
separate the client's retry from the server's responsibility to avoid
unintended repeated effects. Then use the retained payment examples to transfer
the reasoning to external side effects. Compare a fresh course-cache response
with a conditional revalidation.

**Related / prerequisites:** Begin with Phase 0 vocabulary. GraphQL addresses
different data-fetching constraints; RPC addresses procedure-shaped service
calls. API architecture and the senior guide extend production concerns.

## Phase 2 — GraphQL

**Main-path question:** How can a client ask for a shaped response without
ignoring the costs of resolving and securing it?

**Read:** [Original full GraphQL chapter](02-GRAPHQL.md).

**Main journey:** [Shape the same course dashboard](02-GUIDED-GRAPHQL.md).
Compare the REST alternatives before choosing GraphQL, then follow the schema,
selected response, resolver execution, and failure boundaries.

**Related lessons with their own explanations:**

- [Execution and batching](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md):
  validation, aliases/fragments/directives, nulls and errors, resolver work,
  N+1, request-scoped batching, and mutation boundaries.
- [Cost, caching and evolution](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md):
  cardinality budgets, privacy, persisted operations versus allowlists,
  compatibility, federation, Apollo tooling, and subscription delivery.

The [GraphQL reading map](../assets/graphql-reading-map.mjs) retains a source
and recommended destination for every original heading. The
[correction record](CONTENT-CORRECTIONS.md) explains the distinctions.

- queries, schema, types, resolvers and mutations.
- N+1 and DataLoader; query depth and query complexity.
- caching, security and federation across services.
- REST comparison and a production architecture.

**Practice:** Trace a nested query through its resolvers and explain why
batching, depth and complexity limits matter to the server.

**Related / prerequisites:** Know HTTP, client/server and REST resource
thinking first. GraphQL is a choice for a particular data access problem, not
a mandatory successor to REST; compare caching and security trade-offs.
**Depth needed:** The original GraphQL chapter simplifies several production
details. Its schema example omits field types; N+1 depends on the resolver plan,
and DataLoader requires appropriate request-scoped lifetime and does not
automatically solve all N+1 problems. Depth limits alone do not control query
width or cardinality; persisted queries are not automatically an allowlist.
Federation also requires entity identity and query planning.

## Phase 3 — RPC and gRPC

**Main-path question:** When does a typed remote procedure contract suit a
service call, and what changes when the call crosses a network?

**Read:** [Original full RPC and gRPC chapter](03-RPC-AND-GRPC.md).

**Main journey:** [Follow the Course API as a typed remote call](03-GUIDED-RPC-AND-GRPC.md).
Begin with the reason for a remote boundary, compare REST, and follow the
same course and enrollment through the contract and its failure cases.

**Related lessons with their own explanations:**

- [Protobuf and evolution](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md):
  schemas, generated bindings, field tags, presence, framing, and compatibility.
- [Lifecycle, streaming, and operations](lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md):
  statuses, deadlines, cancellation, retry boundaries, four interaction shapes,
  backpressure, browser limitations, balancing and diagnostics.

The [RPC reading map](../assets/rpc-reading-map.mjs) records the source and
recommended destination of every original heading. The
[shared contract](contracts/course_api.proto) is a teaching definition, not
an operating server; the [correction record](CONTENT-CORRECTIONS.md) describes
qualified claims.

- RPC, service contracts, REST versus procedure-oriented thinking.
- Protocol Buffers, HTTP/2, code generation and stubs.
- unary and streaming RPC, including client, server and bidirectional streams.
- failure modes, deadlines and retries, load balancing and observability.

**Practice:** Compare a local call with a remote call whose response is lost.
The appropriate transport depends on the environment and workload; gRPC is
not automatically faster in every use case.

**Related / prerequisites:** Phase 0 and HTTP basics help. Compare stream
requirements with WebSocket and WebRTC, and use architecture material for
service-to-service deployment concerns.

## Phase 4 — Real-time communication

**Main-path question:** How should updates reach a client when waiting for a
new request is too slow or wasteful?

**Read:** [Original full real-time chapter](04-REALTIME-COMMUNICATION.md).

**Main journey:** [Follow the learner's progress and changed requirements](04-GUIDED-REALTIME.md).
Begin with polling; do not adopt a persistent stream, device push, or media
stack unless its interaction and failure model fit.

**Related lessons with their own explanations:**

- [Recovery and flow](lessons/REALTIME-RECOVERY-AND-FLOW.md):
  dispatch versus processing, retained cursors, reset/snapshot races,
  ordering, slow consumers and bounded recovery.
- [Webhooks and background jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md):
  signed raw bodies, durable receipt, retries, queues/streams/batches and job status.
- [Push delivery](lessons/PUSH-NOTIFICATION-DELIVERY.md):
  provider/platform boundaries, permissions, installation tokens, hints,
  durable inboxes and authenticated retrieval.
- [WebRTC media and connectivity](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md):
  signaling, ICE/STUN/TURN, media/data transport, mesh/SFU/MCU costs and security.

The [real-time reading map](../assets/realtime-reading-map.mjs) keeps the
source and recommended destination for every original heading. The
[correction record](CONTENT-CORRECTIONS.md) distinguishes improved teaching
from unchanged source; the examples do not deploy those services.

- polling and long polling, SSE, WebSocket and their failure modes.
- webhooks, message queues, events, synchronous versus asynchronous work and
  batch processing.
- push notifications: device tokens, providers, fanout and delivery failures.
- [WebRTC](04-REALTIME-COMMUNICATION.md#423-what-is-webrtc): peer-to-peer
  media and signaling, NAT traversal, STUN, TURN and ICE, SFU/MCU and failures.

**Practice:** Choose between a one-way feed, two-way chat and a media call.
Describe connection recovery and what each design needs from the server.

**Related / prerequisites:** Start with request-response and client/server.
WebRTC is a distinct lesson for media and connectivity, not a synonym for
WebSocket. The async chapter goes deeper into queues and event delivery.

## Phase 5 — Asynchronous APIs

**Main-path question:** How can work continue across time and failures without
assuming every consumer is immediately available?

**Read:** [Original full asynchronous chapter](05-ASYNC-APIS.md).

**Main journey:** [Follow completion, publication and consumer outcomes](05-GUIDED-ASYNC.md).
Start with the smallest workable completion/email contract, then change
requirements before introducing deferred work, independent consumers or replay.

**Related lessons with their own explanations:**

- [Brokers, delivery and recovery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md):
  RabbitMQ, Kafka and SQS choices; confirmations, leases, offsets, ordering,
  retention, retries and controlled dead-letter recovery.
- [Outbox, inbox and workflows](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md):
  local atomicity, publication/ack crash windows, external effects,
  orchestration/choreography and saga compensation limits.
- [Event models and projections](lessons/EVENT-MODELS-AND-PROJECTIONS.md):
  facts versus commands, event notification versus event sourcing, versioned
  history, snapshots, pure replay and CQRS consistency choices.

The [async reading map](../assets/async-reading-map.mjs) records the unchanged
source and recommended destination for every original heading. See the
[correction record](CONTENT-CORRECTIONS.md) for qualified guarantees.

- [queues and brokers](05-ASYNC-APIS.md#why-message-queues-exist), producers,
  consumers, acknowledgements, ordering and durability.
- Kafka, RabbitMQ and SQS; partitions and offsets, consumer groups,
  replication, retention and replay.
- delivery guarantees, idempotent consumers, retries and dead-letter queues.
- events and commands, choreography and orchestration, event sourcing,
  CQRS, outbox and saga.

**Practice:** Follow a message from publish through acknowledgement and
redelivery. For a database change plus an event, examine atomic recording;
external side effects can require their own deduplication strategy.

**Related / prerequisites:** Understand basic request-response and failure
handling first. Real-time delivery and async processing overlap but are not
interchangeable; distributed transactions in Phase 7 revisit these trade-offs.

## Phase 6 — API architecture

**Main-path question:** What infrastructure and interface boundaries help
multiple clients and services communicate reliably?

**Read:** [Original full architecture chapter](06-API-ARCHITECTURE.md).

**Main journey:** [Grow an API architecture only when its problem grows](06-GUIDED-ARCHITECTURE.md).
Start with one working backend and a database; change client needs, reliability,
shared policy and capacity one at a time. A BFF, gateway, replica fleet or mesh
is not required simply because it appears in the reference.

**Related lessons with complete explanations:**

- [Gateways, BFFs and load balancing](lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md):
  routing, trusted identity, optional aggregation, L4/L7 selection, multiplexing,
  readiness, draining, affinity and consistent-hashing limits.
- [Service mesh and trust](lessons/SERVICE-MESH-AND-TRUST.md):
  data/control planes, sidecar and other modes, workload versus learner authority,
  retry multiplication, deadlines, canaries, credentials and rollback limits.
- [API contracts and lifecycle](lessons/API-CONTRACTS-AND-LIFECYCLE.md):
  inspect the complete [OpenAPI 3.1 definition](contracts/course_api.openapi.json),
  schemas, security declarations, conditional writes, compatibility,
  implementation tests, ownership and retirement.
- [Backpressure and capacity](lessons/BACKPRESSURE-AND-CAPACITY.md):
  matching means in Little's Law, bounded jobs/bytes, independent fluid
  queue calculations, flow control, rejection, retry budgets and fairness.

The [architecture reading map](../assets/architecture-reading-map.mjs) preserves
every original heading's exact source and recommended destination.
See the [correction record](CONTENT-CORRECTIONS.md) for explicit qualifications.
The JSON contract describes seven catalogue/enrollment operations; a valid file
does not prove runtime authorization or implement the rest of the platform.
No live proxy, cluster or API is required to read these lessons.

- API gateways: routing, authentication, limits and failure considerations.
- backend for frontend and client-specific aggregation.
- load balancing and service mesh.
- OpenAPI and Swagger for describing interfaces.
- backpressure and flow control when demand exceeds capacity.

**Practice:** Trace a request first through the small baseline, then through
justified optional boundaries. Distinguish service identity from learner
permission; predict a lost-response retry, unhealthy pool, or full waiting queue.
If an ordinary endpoint already meets the requirement, explain why keeping it
can be better than introducing a BFF or mesh.

**Related / prerequisites:** REST and basic distributed systems provide
context; RPC and async experience make the service-level trade-offs concrete.
The senior guide connects these tools to a requirements-driven design.

## Senior design guide — cross-cutting reference

**Main-path question:** How do we choose and combine communication methods
for an explicitly constrained system?

**Read:** [Original full senior design guide](07-SENIOR-DESIGN-GUIDE.md).

**Guided companion:** [Work one requirements-driven design](GUIDED-SENIOR-DESIGN.md).
This is not another numbered phase or a mandatory combined stack.
The current completed learner and 29 available seats remain unchanged;
large-platform estimates and the tenant metadata migration are separate
explicitly hypothetical models.

**Complete related lessons:**

- [Requirements and estimation](lessons/REQUIREMENTS-AND-ESTIMATION.md):
  callers, invariants and measurement; exact request/bandwidth/connection/
  retention units, burst bounds, uncertainty and representative capacity evidence.
- [SOAP, XML and enterprise contracts](lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md):
  one complete SOAP 1.2 read with [WSDL](contracts/course_api.wsdl) and
  [XSD](contracts/course_api.xsd), namespaces, structured faults, security
  profile limits and compatibility. The legacy LMS is the caller.
- [Sharding, caching and infrastructure](lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md):
  replicas versus data ownership, expected versions and fencing, migration
  recovery, scoped caches, connection registries and Redis/Kafka/RabbitMQ/
  Cassandra roles and failure boundaries.

The [senior reading map](../assets/senior-reading-map.mjs) preserves every
original heading and routes other protocol topics to their existing complete
guided lessons. The [correction ledger](CONTENT-CORRECTIONS.md) distinguishes
qualifications from the preserved source. Private internal references in the
old text are not publicly verified evidence for this rewrite.

- requirements and estimation, decision matrix and method comparisons.
- [SOAP and XML](07-SENIOR-DESIGN-GUIDE.md#12-soap-and-xml-apis): enterprise
  and legacy contracts, WSDL, strengths and limitations.
- data contracts, sharding, caching, load balancing and consistency.
- fault tolerance, security, observability, evolution and failure modes.
- outbox, infrastructure comparisons and a mixed-method architecture.

**Practice:** Write down the workload, latency, consistency and operational
constraints before using the decision matrix. Compare a design with and without
a queue rather than selecting components by popularity.

**Related / prerequisites:** Use after the fundamentals and at least one
protocol branch, or consult a specific section when a design demands it.
**Depth boundary:** SOAP now has a complete selected read contract and
substantial explanation, not just the original orientation. Actual schema/
message checks are not deployed interoperability, WS-Security verification
or production competence; those require the real stack and agreed policy.

## Phase 7 — Expert API design

**Main-path question:** How do distributed APIs evolve safely and remain
dependable across teams, regions and changing business constraints?

**Read:** [Original full expert design chapter](08-EXPERT-API-DESIGN.md).

**Main journey:** [Grow expert design from a working API](07-GUIDED-EXPERT-DESIGN.md).
Keep the same current course and confirmed enrollment; independent mobile
versions, a measured SLO, a regional failure or an external workflow motivate
the next decision. The last-seat partition is an explicitly independent
hypothetical snapshot, not a silent reset of the current 29-seat record.

**Complete related lessons:**

- [Contract evolution and consumers](lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md):
  directional compatibility, defaults/enums/cursors, strict versus tolerant
  consumers, CDC/Pact concepts, mixed deployments and retirement.
- [Regions and consistency](lessons/REGIONS-AND-CONSISTENCY.md):
  routing versus data ownership, active/passive and active/active, RTO/RPO,
  CAP, session reads and quorum-overlap limits.
- [Distributed transactions and recovery](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md):
  local atomicity, prepared 2PC participants, saga uncertainty, outbox/inbox,
  terminal receipts and fallible compensation.
- [Consensus and coordination](lessons/CONSENSUS-AND-COORDINATION.md):
  Raft elections/commit rules, Paxos/Zab roles, majority assumptions,
  replay, leases, protected-resource fencing and external-effect limits.
- [Reliability, observability and incidents](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md):
  eligible requests, SLI/SLO/SLA, period and burn budgets, exact sample
  quantiles, deadlines, traces, cache/overload controls and safe chaos planning.
- [Tenancy, usage and governance](lessons/TENANCY-USAGE-AND-GOVERNANCE.md):
  verified membership and object authorization, storage/cache boundaries,
  logical usage, reconciliation, ownership, standards and staff design review.

The [expert reading map](../assets/expert-reading-map.mjs) records every
original heading's exact source and recommended destination.
The original quick reference's later module names differ from the body:
the new route uses actual CAP, consensus, tenancy and staff-design modules,
while retaining tracing, chaos and governance as substantial related sections.
See the [correction ledger](CONTENT-CORRECTIONS.md).
Commercial API examples are fictional transfer products; this course remains free.

- compatibility and evolution, consumer-driven contracts and Pact.
- multi-region design, latency and reliability budgets: SLI, SLO, SLA and
  error budgets.
- distributed transactions: 2PC, saga and outbox.
- abuse prevention and incidents; CAP and consistency.
- consensus: Raft, Paxos and leader election.
- monetisation and multi-tenancy: product, pricing and tenant isolation.
- staff-level design and organizational trade-offs.

**Practice:** Propose a contract change for old and new consumers, then
consider rollout and failure across regions. Identify what a consensus
mechanism coordinates and what it does not guarantee about the entire system.

**Related / prerequisites:** Start with contracts, failures, queues and API
architecture. Consensus is a separate coordination problem; monetisation is
a product and isolation problem. Neither is an upgrade to a protocol.
**Depth boundary:** The full reference and new lessons explain decisions
and behaviors. Finite models, actual schema checks and local SQLite/HTTP
probes are not proof of production consensus, deployed authorization,
Pact provider verification or measured learner competence.

## System design case studies — applied reference

**Main-path question:** How do requirements, scale estimates and failure
handling affect communication choices in complete designs?

**Read:** [Original full case-study chapter](09-SYSTEM-DESIGN-CASE-STUDIES.md).

**Guided companion:** [Transfer the reasoning, not the boxes](GUIDED-CASE-STUDIES.md).
State an invariant and a small baseline, work through one exchange and
changed condition, then compare costs and predict the failure.
No branded diagram is treated as verified current company infrastructure.

**Complete case lessons:**

- [WhatsApp-style messaging](lessons/CASE-WHATSAPP-MESSAGING.md):
  message/outbox commit, independent devices, acceptance versus receipts,
  retention, group fanout, encryption prerequisites and calls.
- [Instagram-style feeds and media](lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA.md):
  private upload/processing/publication, immutable generations, all required
  variants, serving-time audience checks and repeatable likes.
- [Netflix-style playback](lessons/CASE-NETFLIX-PLAYBACK.md):
  control versus media delivery, immutable manifests, scoped rights,
  fixed ABR arithmetic, no-fit outcomes, telemetry and regional recovery.
- [Uber-style dispatch and payments](lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md):
  stale candidates, exclusive offers, physical trip facts, unknown charges,
  separate payout/refund obligations and bounded consent.
- [Twitter-style timelines](lessons/CASE-TWITTER-TIMELINES.md):
  pull/push/hybrid fanout, duplicate tasks, stable merge/cursor policy,
  current privacy, trends and workload amplification.
- [YouTube-style uploads and delivery](lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md):
  resumable numbered parts, actual synthetic-byte checksums, generation-scoped
  outputs, readiness versus publication and dimensionally correct estimates.

**Other systems retain substantial transfer sections:**

- [Amazon/Prime-style commerce and media](lessons/CASE-STUDY-TRANSFERS.md#transfer-amazon).
- [LinkedIn-style professional networks](lessons/CASE-STUDY-TRANSFERS.md#transfer-linkedin).
- [Snapchat-style expiry and privacy](lessons/CASE-STUDY-TRANSFERS.md#transfer-snapchat).
- [Live-sports streaming, languages and ads](lessons/CASE-STUDY-TRANSFERS.md#transfer-live-sports).

The [case reading map](../assets/case-study-reading-map.mjs) retains every
original heading's exact source and destination. See the
[corrections](CONTENT-CORRECTIONS.md) for qualified guarantees, numeric
dimensions and the limits of the original universal-stack diagram.

- WhatsApp: chat, real-time connections and asynchronous delivery.
- Instagram: feed and media flows; Netflix: streaming and distribution.
- Uber: location and dispatch; Twitter/X: fanout and timelines.
- YouTube: uploads, processing and serving; other systems and the common
  design pattern.

**Practice:** For one case, state assumptions, estimate a workload, select
communication mechanisms and walk through a failure. Compare alternatives
instead of treating the diagram as the only valid architecture.

**Related / prerequisites:** Use after the fundamentals and relevant
protocol branches; return to estimates, architecture, reliability and
consistency as each case requires. These are illustrative designs, not
verified descriptions of the named companies' current internal systems.
The local models use real SQL/checksums for finite examples, not live
encryption, media processing, payments, distributed proofs or learner mastery.

## Source boundary and coverage

The original numbered files 00–09 remain the source of the full existing
material. The repository's [exrta.txt](../exrta.txt) and
[phase-7.txt](../phase-7.txt) are preserved raw notes, **not additional course
chapters** or evidence that every note has been rewritten. The chapter links
above are the destination for every original heading; the automated manifest
and tests audit the boundary and source integrity. Coverage means that a
reader can find retained material, not that every topic has equal depth.
