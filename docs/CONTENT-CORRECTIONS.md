# Corrections and distinctions

This record explains the corrections and qualifications in the evolution-based
REST, GraphQL, RPC/gRPC, real-time, async, architecture, expert, senior-design and case-study journeys and their related lessons. It is not a claim that every topic in
the course has been audited or rewritten.

**The ten original chapter files and raw notes are retained unchanged.**
Preserving their bytes does not make every statement authoritative. Read the
original alongside these distinctions; the site labels the retained Phase 0,
REST, GraphQL, RPC/gRPC, real-time, async, architecture, expert, senior-design and case-study references and links here.

Return to the [REST journey](01-GUIDED-REST.md), the
[complete topic library](COURSE-CONTENT-MAP.md), or the
[original REST chapter](01-REST-APIS.md).
On the site, [Full reference mode](01-REST-APIS.md?view=reference)
shows the original REST sections together.

## What changed in the teaching

The quotations below are short excerpts from the original REST chapter.
Line numbers refer to that retained source, not the new lesson.
**Correction** addresses a misleading or invalid statement.
**Qualification** supplies assumptions missing from a shorthand explanation.
Neither removes the underlying topic or its original example.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Safe methods](01-REST-APIS.md), lines 3127–3157: “No state change” and “Result remains same.” | Safety concerns the effect the client requests. A GET may be logged, and other operations can change its later response. Idempotency is about intended effect, not response equality. [HTTP contracts](lessons/REST-HTTP-CONTRACTS.md). |
| Qualification | [Cursor pagination](01-REST-APIS.md), lines 2814–2859: “Start after record abc123,” “Very fast,” and “Slow at scale.” | A cursor is an API-issued continuation, not necessarily a record ID. Offset and keyset costs depend on indexes, query plans, depth, ordering and workload. Neither automatically provides a snapshot. [Collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md). |
| Correction | [Cursor response example](01-REST-APIS.md), line 2821: `"data":[...],` in a JSON block. | Ellipsis is not JSON. The new lessons use actual array elements and distinguish valid JSON from deliberately labeled excerpts or pseudocode. [HTTP contracts](lessons/REST-HTTP-CONTRACTS.md). |
| Qualification | [Cache timing example](01-REST-APIS.md), lines 4167–4182: 50 ms database queries versus 1 ms cache queries. | Those numbers illustrate one assumed workload; they are not universal timings. Hits, misses, network work and invalidation affect the result. [Collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md). |
| Qualification | [Cache directives](01-REST-APIS.md), line 4507: “Never cache.” | `no-store` directs compliant caches not to store the message. It is not a promise that no application, log, browser history or previous stored response contains sensitive information. Use appropriate privacy controls beyond a cache directive. [Collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md). |
| Correction | [Private caching](01-REST-APIS.md), line 4557: “Only browser should cache.” | `private` prohibits shared-cache storage but permits private caches; private caches are not limited to browsers. `no-cache` allows storage but requires validation before reuse. [Collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md). |
| Qualification | [Write-through](01-REST-APIS.md), lines 4931–4935: update the database and cache “same time.” | Writing two systems does not make their updates atomic. Specify ordering, partial failure, invalidation and repair. Write-back also needs a durability policy before acknowledging success. [Collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md). |
| Qualification | [Indexing](01-REST-APIS.md), lines 5068–5100: “Microseconds” and “Filter field → needs index.” | An index can help a query pattern but has storage and write costs. Selectivity, collation, search semantics and actual query plans determine usefulness and latency; not every small dataset needs each proposed index. [Collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md). |
| Qualification | [Versioning](01-REST-APIS.md), line 5451: “No breakage.” | A version prefix does not itself ensure compatibility. Fields, defaults, enums, status codes and behavior can break actual consumers. Test and plan the migration. [Access and evolution](lessons/REST-AUTH-AND-EVOLUTION.md). |
| Qualification | [JWT example](01-REST-APIS.md), lines 5561–5570: user ID, roles and expiry under “JWT (Most Common).” | These are possible claims in a profile, not a universal required JWT schema or the only authentication choice. Tokens can be opaque; JWT signing does not hide its payload or automatically authorize an action. [Access and evolution](lessons/REST-AUTH-AND-EVOLUTION.md). |
| Qualification | [Cookie attributes](01-REST-APIS.md), line 5691: `SameSite=Strict` “prevents CSRF.” | SameSite is useful defense in depth, not a complete CSRF or XSS guarantee. Consider request-origin/CSRF protections, the deployment and unsafe operations. HttpOnly limits direct script access to cookie values, not every action injected code could take. [Access and evolution](lessons/REST-AUTH-AND-EVOLUTION.md). |
| Qualification | [Session/token comparison](01-REST-APIS.md), line 5715: “Stateless — token contains claims.” | Per-request context does not prohibit resource databases or establish every REST constraint. Cookie sessions and token validation each have state, revocation and security trade-offs. [Access and evolution](lessons/REST-AUTH-AND-EVOLUTION.md). |
| Qualification | [Payment transfer example](01-REST-APIS.md), line 3686: transaction IDs and reconciliation “ensure duplicates are not processed.” | External effects depend on the provider's contract and recovery support. A local transaction or key does not by itself guarantee exactly-once charging. Transaction references and reconciliation help resolve uncertainty; named-company examples remain illustrative. [Reliability and operations](lessons/REST-RELIABILITY-AND-OPERATIONS.md). |
| Qualification | [Multiple round trips](01-REST-APIS.md), lines 6519–6521: four 300 ms calls imply 1200 ms. | That sum assumes serial calls. Independent requests may overlap; dependencies, connection behavior, payloads and server work determine the critical path. REST aggregation is a valid alternative to GraphQL. [REST data-shape lesson](01-GUIDED-REST.md#rest-data-shape). |

## Contract consistency across the new lessons

The continuing platform uses `learn.example`, `course-101` (**API Fundamentals**),
`course-102` (**REST Studio**), `learner-7`, and `enrollment-42`.
`seats` means available seats, and collection bodies use a `courses` array.
Examples that restart at 30 seats are explicitly independent snapshots; the
main enrollment leaves 29 seats.

The replay key `enroll-7-a` is scoped to the authenticated caller and enrollment
operation family. The target course belongs in the request fingerprint, not
in a separate key namespace in this example. Consequently reusing the key for
course-102 conflicts rather than creating another enrollment or replaying
course-101's result. Actual APIs may choose another scope; clients must follow it.

The extended-schema and patch examples are labeled separately from the minimal
course contract. Assignment patches, JSON Merge Patch and JSON Patch are not
silently interchangeable. Header/body excerpts are labeled as such instead of
pretending to be complete HTTP/1.1 wire messages.

## Sources behind these distinctions

- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110): HTTP methods, statuses,
  representations and conditional requests.
- [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2): caching directives,
  freshness and validation.
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259): JSON syntax.
- [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) and
  [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902): distinct patch semantics.
- [Google AIP-158](https://google.aip.dev/158): pagination and opaque continuation
  guidance; its organizational conventions are not universal API laws.
- [PostgreSQL LIMIT/OFFSET documentation](https://www.postgresql.org/docs/current/queries-limit.html):
  ordering and skipped-row costs; no universal database latency promise.
- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519): JWT claims and format.
- [MDN CSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF):
  browser threat boundaries and mitigations.
- [AWS Builders' Library: retries](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/):
  timeout ambiguity, bounded retries and duplicate effects.

Application-specific storage atomicity, indexing, cache repair and provider
reconciliation require an explicit design. The HTTP standards do not confer
those guarantees merely because an API uses their methods and headers.

## GraphQL corrections and qualifications

The original [GraphQL chapter](02-GRAPHQL.md) is unchanged. The
[new journey](02-GUIDED-GRAPHQL.md) and two related lessons make the following
distinctions explicit. These are corrections to teaching, not a rewrite of
the retained source or a claim that GraphQL is better than REST.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [REST/GraphQL comparison](02-GRAPHQL.md), lines 250–253: REST's “Server decides response structure” versus GraphQL's “Client decides response structure.” | REST can expose aggregation, BFFs or field selection. A GraphQL client selects within the published schema; the server still controls execution, permission and cost. [GraphQL journey](02-GUIDED-GRAPHQL.md). |
| Correction | [Schema example](02-GRAPHQL.md), lines 510–515: `type User` with `id`, `name` and `bio` but no field types. | That is invalid SDL. The new examples use a complete typed schema and operations checked against it. A schema's nullability is also a response contract, not an authorization rule. [Execution and batching](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md). |
| Qualification | [N+1 example](02-GRAPHQL.md), lines 1151–1164: one user query plus 100 post queries yields 101 queries. | That count depends on the illustrated resolver/fetch plan, not GraphQL itself. The two-course example has three naive reads or two with an effective author batch, under stated assumptions. [Execution and batching](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md). |
| Correction | [DataLoader rule](02-GRAPHQL.md), lines 1357–1358: “Every GraphQL project … eventually needs DataLoader.” | It is one batching/memoization option, not a universal requirement. Joins, preloading and other data-access plans may fit; dispatch windows and selected work can still produce multiple queries. [Execution and batching](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md). |
| Qualification | [Request cache](02-GRAPHQL.md), line 1627: “Caches repeated loads inside request.” | Correct request scoping is a lifecycle/design requirement. A shared loader does not automatically isolate users or tenants; after a mutation, cached values may need clearing or priming. [Execution and batching](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md). |
| Qualification | [Depth limit](02-GRAPHQL.md), lines 1446–1461: maximum depth followed by `403` or `400`. | Depth alone does not bound width, list cardinality, aliases or resolver cost. HTTP statuses depend on the transport/media-type contract; a field error can coexist with data, while validation errors prevent execution. [Cost, caching and evolution](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md). |
| Qualification | [Persisted queries](02-GRAPHQL.md), lines 1631–1634: approved queries referenced by hash are “Much easier to cache.” | An APQ registration/cache-miss flow is not necessarily an enforced allowlist. Variables, identity, selection and invalidation still matter; a query hash is neither authorization nor automatic shared-cache safety. [Cost, caching and evolution](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md). |
| Correction | [Federation motivation](02-GRAPHQL.md), lines 1725–1728: “One huge GraphQL server becomes impossible.” | A single graph server can remain appropriate. Federation addresses ownership/deployment needs at the cost of composition, networking, query planning and failure boundaries. [Cost, caching and evolution](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md). |
| Qualification | [Federation gateway](02-GRAPHQL.md), line 1772: “Gateway merges everything.” | Subgraph composition, entity identity, authorization and cross-service query planning require explicit design. Federation and schema stitching are not interchangeable guarantees or fixes for slow resolvers. [Cost, caching and evolution](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md). |

### Additional detail, not a claim that the original covered it fully

The new lessons show selected response shapes, variables, nullable fields,
non-null propagation and error paths; top-level mutation ordering is
distinguished from transactions and safe retries. Subscriptions use the same
20% and 40% progress events and explicitly separate event execution from
transport, reconnect, replay and durability. Apollo is identified as tooling,
not a mandatory protocol or an implemented framework lab.

The [shared teaching fixture](../assets/graphql-lesson-fixtures.mjs) is not
a running API or durable store. The optional official GraphQL validator
checks documents and executes deterministic probes; it does not certify
production security, throughput, distributed transactions or learning mastery.

### GraphQL sources

- [GraphQL specification](https://spec.graphql.org/October2021/):
  types, validation, execution, response format and mutation ordering.
- [GraphQL over HTTP draft](https://graphql.github.io/graphql-over-http/draft/):
  transport and media-type distinctions; this is a draft, not a final RFC.
- [DataLoader documentation](https://github.com/graphql/dataloader):
  batching, alignment, memoization and request-local usage.
- [Apollo persisted queries documentation](https://www.apollographql.com/docs/apollo-server/performance/apq/):
  automatic registration differs from an enforced operation allowlist.
- [Apollo Federation documentation](https://www.apollographql.com/docs/federation/):
  subgraphs, composition and entity coordination; other tools and single-server
  designs remain valid alternatives.

## Navigation correction

The new lessons used ordinary sibling and parent-relative Markdown links,
but the site had Docsify's default root-relative routing behavior. For example,
`02-GRAPHQL.md` in a lesson under `docs/` became `#/02-GRAPHQL`, so the client
requested a nonexistent root-level file instead of `docs/02-GRAPHQL.md`.
The same issue affected guided lessons and their related pages.

There was also a distinct mistake in the Full reference links: Markdown
destinations starting `#/docs/...` were treated by Docsify as heading links.
They now use `.md?view=reference` lesson paths. Raw HTML hash-route links use
a different rendering path and remain valid.

Local resource links also needed separate handling: a source-module or raw-note
link must open its physical file, not become a lesson route with an added `.md`.
The shared renderer now resolves those files from the source document while
preserving the GitHub Pages project subpath. Only known old lesson routes are
redirected; unknown pages still fail normally.

The fix enables directory-relative lesson routing and roots the shared
sidebar at `/docs/`. The intended reference and journey routes are
`#/docs/02-GRAPHQL` and `#/docs/01-GUIDED-REST`, with query parameters and
section anchors preserved. No lesson content was removed or relocated.

Earlier filesystem checks verified that destinations existed in the
intended directories, not that Docsify generated those URLs. Routing-specific
regression checks now cover that separate requirement. This is a routing
correction, not a claim that browser UI was automatically tested.

## RPC and gRPC corrections and qualifications

The [original RPC/gRPC chapter](03-RPC-AND-GRPC.md) remains unchanged.
The [new journey](03-GUIDED-RPC-AND-GRPC.md) and its related lessons preserve
the concepts while making the following distinctions.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Motivating history](03-RPC-AND-GRPC.md), line 127: “Before RPC Existed,” followed by REST examples. | The comparison motivates a choice; it is not a historical sequence. RPC predates REST, and REST remains a valid internal interface. The new journey starts with an existing remote boundary, not a requirement to split a monolith. [RPC choice](03-GUIDED-RPC-AND-GRPC.md). |
| Qualification | [Project name](03-RPC-AND-GRPC.md), lines 779–788: “Historically” and “Google Remote Procedure Call.” | Google's origin story is separate from the current project's name. The official FAQ uses the recursive “gRPC Remote Procedure Calls”; gRPC is not a Google-only service or a requirement to use its cloud. [Protobuf and evolution](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md). |
| Correction | [Suitcase analogy](03-RPC-AND-GRPC.md), lines 1312–1315: “Vacuum-compressed suitcase” and “smaller and faster.” | Protobuf is a binary serialization format, not compressed JSON. Optional message compression and HTTP/2 header compression are separate. Size and speed depend on the message, runtime and workload. [Protobuf and evolution](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md). |
| Correction | [Field identity analogy](03-RPC-AND-GRPC.md), line 2132: “item positions are already agreed.” | The wire identifies fields by numbered tags and wire types, not positional order. Reordered fields can still be decoded; reusing a tag can reinterpret old data. [Protobuf and evolution](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md). |
| Qualification | [Performance](03-RPC-AND-GRPC.md), line 2066: “usually faster than typical REST/JSON.” | This is not a workload-independent guarantee. REST can use HTTP/2 and schema-based clients; payloads, serialization, connections, storage, network conditions and operations determine the useful comparison. [Lifecycle and operations](lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md). |
| Qualification | [HTTP/1.1 comparison](03-RPC-AND-GRPC.md), lines 1145–1165: sequential exchanges and “Streaming is not natural.” | HTTP/1.1 can stream bodies; HTTP/2 adds different multiplexing/framing facilities but still has TCP-level loss-induced head-of-line blocking. gRPC stream messages are not HTTP/2 frames or TCP packets. [Lifecycle and operations](lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md). |

### Added precision for the worked examples

- The same course, learner, enrollment and replay key are retained. The proto
  uses snake_case; the selected JavaScript diagnostics use camelCase. Those
  diagnostics are not native gRPC wire JSON.
- Deadlines and cancellation concern call lifecycle, not fields automatically
  added to the protobuf message. A committed enrollment can exist after the
  client observes `DEADLINE_EXCEEDED`; cancellation is not rollback.
- gRPC status is distinct from HTTP status. Response messages can precede
  a non-OK final status; inspect trailers and the method's outcome contract.
- Stream ordering is per direction on a call, not a global order across
  callers or proof of application processing. Event IDs alone do not provide
  replay, durable delivery or automatic resumption.
- The complete shared contract offers all four interaction shapes. Browser
  gRPC-Web capabilities depend on its client and transport; native client
  streaming and bidirectional modes are not generally available there.

The [raw contract](contracts/course_api.proto) is a teaching definition,
not a running service. Protobuf.js parsing and binary round-trips are useful
checks but are not the `protoc` compiler or proof of a real gRPC transport,
durable transactions, cancellation or retry behavior.

### RPC sources

- [RFC 1057](https://www.rfc-editor.org/rfc/rfc1057): RPC specification
  published before REST's architectural description.
- [gRPC FAQ](https://grpc.io/docs/what-is-grpc/faq/): framework name,
  serializers and deployment choices.
- [Protobuf encoding guide](https://protobuf.dev/programming-guides/encoding/):
  field keys, wire types and serialization.
- [Protobuf field presence](https://protobuf.dev/programming-guides/field_presence/):
  implicit and explicit presence.
- [gRPC HTTP/2 protocol](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md):
  message prefix, metadata and status trailers.
- [gRPC performance guidance](https://grpc.io/docs/guides/performance/):
  runtime and connection considerations, not a universal speed ratio.
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/) and
  [cancellation](https://grpc.io/docs/guides/cancellation/): lifecycle and
  cooperative server behavior.
- [gRPC-Web](https://github.com/grpc/grpc-web): browser-specific transport
  and supported modes.

## Real-time delivery and media corrections

The [original Phase 4 chapter](04-REALTIME-COMMUNICATION.md) is unchanged.
The [new journey](04-GUIDED-REALTIME.md) and four related lessons distinguish
freshness, protocol receipt, application processing, device delivery and media
connectivity rather than treating all of them as “real time.”

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Long polling](04-REALTIME-COMMUNICATION.md), lines 341–346: “More efficient than polling.” | It can avoid empty responses, but held requests, timeouts, update frequency and reconnections determine resource use. It is not universally cheaper or faster. [Recovery and flow](lessons/REALTIME-RECOVERY-AND-FLOW.md). |
| Qualification | [WebSocket comparison](04-REALTIME-COMMUNICATION.md), line 471: “Connection stays open.” | A connection stays open only while lifecycle and network conditions permit. HTTP can also reuse connections; an active socket does not prove receipt, processing or durable storage. [Real-time journey](04-GUIDED-REALTIME.md). |
| Qualification | [Chat architecture](04-REALTIME-COMMUNICATION.md), line 571: “Sticky Sessions.” | An established connection already reaches its accepted backend; extra affinity is one routing/state choice, not a universal requirement. Cross-instance fanout, recovery and session state need an explicit design. [Recovery and flow](lessons/REALTIME-RECOVERY-AND-FLOW.md). |
| Qualification | [Ordering](04-REALTIME-COMMUNICATION.md), lines 657–659: “Sequence numbers / Timestamps / Per-chat ordering.” | A timestamp alone does not establish a reliable causal or durable order across publishers. Define scope, ordering authority, ties and recovery; opaque cursor IDs are not sortable versions. [Recovery and flow](lessons/REALTIME-RECOVERY-AND-FLOW.md). |
| Qualification | [Queue comparison](04-REALTIME-COMMUNICATION.md), line 963: “One message is processed by one consumer.” | Competing consumers distribute work, but leases, failures and redelivery can repeat processing. Separate groups or subscriptions can each observe an event; delivery is not an exactly-once business effect. [Webhooks and background jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md). |
| Correction | [Push flow](04-REALTIME-COMMUNICATION.md), lines 1788–1792: “Google delivers” and “Phone wakes up”; [silent push](04-REALTIME-COMMUNICATION.md), lines 1986–1990: “Phone wakes app.” | Provider acceptance is not a guarantee of wakeup, delivery, display, app execution or a user read. Permissions, app state, expiry, throttling and OS policy matter. Use a durable inbox and authenticated fetch for recovery. [Push delivery](lessons/PUSH-NOTIFICATION-DELIVERY.md). |
| Qualification | [Direct peer claims](04-REALTIME-COMMUNICATION.md), lines 2523–2524: “Much cheaper” and “Much faster.” | A direct path can reduce relay use, but topology, network conditions, codecs, CPU and infrastructure determine latency and cost. WebRTC is not always direct. [WebRTC media](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md). |
| Qualification | [STUN/TURN sequence](04-REALTIME-COMMUNICATION.md), lines 2931–2933: “Try STUN first” and “Use TURN if necessary”; line 3004: “STUN attempts connection.” | ICE gathers and checks candidate pairs rather than following one guaranteed fallback sequence. Public STUN mapping discovery is distinct from ICE's STUN-based connectivity checks between agents. [WebRTC media](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md). |
| Correction | [TURN reliability](04-REALTIME-COMMUNICATION.md), line 2903: “Works almost always”; lines 3259–3264: STUN failure followed by “Use TURN.” | A relay must be configured, reachable, authorized and within capacity. Other candidates may work, or all paths may fail. Surface failure instead of assuming relay success or bypassing policy. [WebRTC media](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md). |
| Qualification | [SFU](04-REALTIME-COMMUNICATION.md), line 3203: “Does NOT decode video.” | An SFU generally forwards encoded media, but actual processing varies. Not decoding a codec does not imply it cannot access media: transport encryption can terminate at the server, and stronger E2E protection needs separate design. [WebRTC media](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md). |
| Correction | [WebRTC/WebSocket table](04-REALTIME-COMMUNICATION.md), lines 3312–3315: WebSocket marked unavailable for audio, video and screen sharing. | WebSocket can carry encoded media bytes but does not itself provide WebRTC's integrated media stack. Choose by latency, loss, capture, playback and connectivity needs, not a claim of categorical impossibility. [WebRTC media](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md). |

### Precision added to the worked examples

- The earlier simplified “last-dispatched event ID” wording has been refined.
  `Last-Event-ID` is a browser-maintained protocol cursor, not a business ACK.
  Under the HTML algorithm an ID-only block can advance it without dispatching
  application data; our progress events deliberately pair each ID with data.
- Native EventSource does not expose response status like Fetch. The example
  reset protocol closes the old stream, fetches an authorized atomic
  snapshot/cursor, and reopens with a validated application continuation.
  A bare HTTP 409 is not an automatic reset message.
- Progress-log retention and webhook signature freshness have separate
  policies. They both use 300 seconds in these fixtures, but are not the same
  guarantee or boundary condition.
- Webhook signatures authenticate the exact raw body and chosen timestamp
  policy; the displayed key is public test data. Signature validation does
  not replace sender authorization, scoped durable deduplication or recovery.
- A completion event is a separate later action, not an inference that 40%
  progress means completion. A push hint contains no learner identity and
  remains only a hint; the application must authenticate and retrieve truth.
- The four-person media calculation assumes all-to-all 1 Mbps streams without
  overhead or simulcast. Mesh upload totals 12 Mbps; the baseline SFU lowers
  each sender's upload to 1 Mbps but still has 12 Mbps server egress.

Original named-company diagrams remain illustrative, not verified descriptions
of their current private systems or measured capacities. The static course
does not deploy webhook receivers, push services, TURN or media servers;
operating those systems may incur costs even though studying the course is free.

### Real-time sources

- [HTML server-sent event interpretation](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation):
  dispatch, IDs and reconnect state.
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455):
  WebSocket handshake, framing, masking and control messages.
- [Apple background notification guidance](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app):
  background execution is not guaranteed.
- [FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type):
  notification/data payload and platform behavior.
- [RFC 8445](https://www.rfc-editor.org/rfc/rfc8445) and
  [RFC 8656](https://www.rfc-editor.org/rfc/rfc8656): ICE and TURN.
- [RFC 8825](https://www.rfc-editor.org/rfc/rfc8825),
  [RFC 8827](https://www.rfc-editor.org/rfc/rfc8827), and
  [RFC 8831](https://www.rfc-editor.org/rfc/rfc8831):
  WebRTC architecture, security and data channels.

## Asynchronous API guarantees and recovery

The [original async chapter](05-ASYNC-APIS.md) remains unchanged. The
[new completion journey](05-GUIDED-ASYNC.md) and three related lessons qualify
guarantees by the broker, transaction, processing and external-effect boundaries.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Acknowledgement](05-ASYNC-APIS.md), lines 758–764: “I processed message successfully” followed by broker removal. | An ACK or offset records what that product and client policy define; it does not independently prove durable application processing. Normal acknowledged queues remove deliveries, while Kafka group offsets do not delete retained records. [Broker delivery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md). |
| Qualification | [At-least-once](05-ASYNC-APIS.md), line 2053: “Never lose message”; lines 2737–2741: “No loss.” | The claim needs a specified boundary, durability, retention, retries, capacity and supported fault model. Operator deletion, expiry, exhausted recovery or catastrophic loss are not prevented by the label. [Broker delivery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md). |
| Qualification | [Exactly-once recipe](05-ASYNC-APIS.md), lines 2744–2753: at-least-once plus idempotent processing. | An atomic inbox plus a local effect can provide one local result under its retention and uniqueness assumptions. Kafka transactions have their own Kafka-offset/output scope; neither automatically includes an external email or payment. [Outbox and inbox](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md). |
| Qualification | [Idempotent consumer](05-ASYNC-APIS.md), lines 2272–2311: store processed IDs, ignore a duplicate, “Processed Once.” | The identity/fingerprint and protected local effect must be coordinated atomically. A prior check, an in-memory set, or a receipt committed before an external call can lose or repeat effects. [Outbox and inbox](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md). |
| Qualification | [Classic group ordering](05-ASYNC-APIS.md), line 3196: “Ordering preserved.” | Partition read order does not automatically make concurrently executed handlers finish in order. Commit only a safe contiguous watermark, handle rebalance ownership, and distinguish classic groups from other delivery models. [Broker delivery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md). |
| Qualification | [Retention option](05-ASYNC-APIS.md), line 3391: “Keep forever.” | Unlimited time retention is a configuration choice, not a proof of indefinite complete history. Size retention, compaction, failures, permissions and legal deletion can limit reconstruction. [Broker delivery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md). |
| Qualification | [Replay](05-ASYNC-APIS.md), line 3431: “Replay entire history” from offset zero. | Only retained, interpretable history can be replayed. A pure projection rebuild must be isolated from email/payment effect consumers; an offset reset cannot reconstruct deleted data or authorize historical actions. [Event models](lessons/EVENT-MODELS-AND-PROJECTIONS.md). |
| Qualification | [Dead letters](05-ASYNC-APIS.md), lines 2502–2511: move after N retries; lines 2549–2553: “Bad message isolated. System continues.” | Transfer, retention, monitoring and safe retry classification require configuration. Isolation is not repair. Controlled redrive needs remediation, original IDs, retained deduplication, authorization, limited rates and stop criteria. [Broker delivery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md). |
| Qualification | [Saga](05-ASYNC-APIS.md), lines 4362–4420: “The modern solution” and refund/cancel compensation. | A saga is one trade-off, not a default upgrade. The known-charge example still needs compensation retries and explicit financial/inventory invariants; an unknown charge cannot safely be treated as failure. A refund is a new observable operation, not an ACID rollback. [Workflows](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md). |

### What is preserved and what is deliberately different

- The completion fact retains its original `id`, `type` and `data`, including
  `completion-42`, `course-101` and `learner-7`. Commands have separate IDs and
  meanings; message delivery IDs must not replace logical operation identity.
- The alternative event-store envelope adds aggregate identity and versions
  explicitly. It is not a silent change to the Phase 4 signed webhook body.
  The 20/40 progress values and completion are separate facts.
- The projection's completion-to-100% rule is a chosen teaching policy.
  Other products can have different completion criteria. Versions are
  aggregate sequence positions, not wall-clock times or universal Kafka offsets.
- CQRS can use one database and does not require event sourcing or services.
  A completion notification does not make its broker an authoritative event store.
- The local transaction example enforces one completion per enrollment, not
  one completion per learner/course forever. Re-enrollment can create another
  legitimate completion under the product's policy.

The built-in SQLite probe tests actual local rollback and duplicate local
certificate-record protection, with simulated publication and ACK windows.
It uses in-memory databases: it is not a broker deployment, process-crash
experiment, disk-durability test or proof of exactly-once external email.

### Async sources

- [RabbitMQ confirms and acknowledgements](https://www.rabbitmq.com/docs/confirms):
  distinct publisher and consumer boundaries.
- [RabbitMQ streams](https://www.rabbitmq.com/docs/streams):
  replayable retained logs differ from ordinary acknowledged queues.
- [Apache Kafka documentation](https://kafka.apache.org/documentation/):
  producer/consumer configuration, transactions, groups, replication and retention.
- [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html):
  receiving is a time-limited lease, not durable processing.
- [SQS FIFO delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-understanding-logic.html):
  message-group ordering and bounded send deduplication.
- [SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html):
  configured isolation, retention and recovery.
- [Transactional outbox guidance](https://microservices.io/patterns/data/transactional-outbox.html):
  local state plus publication intent; relay duplicates still need handling.
- [Saga guidance](https://microservices.io/patterns/data/saga.html):
  local transactions and compensating business operations.

## Architecture boundaries, contracts and capacity

The [original architecture chapter](06-API-ARCHITECTURE.md) remains unchanged,
including its detailed examples. The [new architecture journey](06-GUIDED-ARCHITECTURE.md)
and four related lessons retain the concepts while distinguishing deployment
choices, configured capabilities and actual guarantees.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Gateway logging path](06-API-ARCHITECTURE.md), line 489: “Every request passes through gateway.” | That is a chosen routing arrangement, not a property of owning a gateway. Alternate/internal paths and bypasses need equivalent identity and authorization enforcement. Log coverage must be verified; the original logging list does not recommend logging tokens. [Gateway boundaries](lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md). |
| Qualification | [Gateway replicas](06-API-ARCHITECTURE.md), lines 647–658: “Multiple gateway instances” followed by “Highly available.” | Replicas address an instance failure, not shared configuration, discovery, upstream, network or database failures. Availability also needs placement, readiness, capacity, failover and recovery plans. [Gateway operations](lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md). |
| Qualification | [Round robin](06-API-ARCHITECTURE.md), line 1818: “Perfect distribution.” | Equal selections can be appropriate for identical servers and equal-cost requests; they do not guarantee equal work, latency or resource use. Least connections counts connections, and HTTP/2 multiplexing can make that signal misleading. [Load balancing](lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md). |
| Qualification | [Sidecar model](06-API-ARCHITECTURE.md), line 2373: “Applications never talk directly.” | This describes the illustrated proxy topology. Other meshes/modes use node-level proxies, ambient approaches or participating application libraries; capabilities and captured traffic differ. [Mesh models](lessons/SERVICE-MESH-AND-TRUST.md). |
| Qualification | [Mesh retry policy](06-API-ARCHITECTURE.md), line 2581: “All services get same behaviour.” | Policies apply only where configured and supported. Per-route safety, shared deadlines and retry budgets matter; nested limits of 2, 3 and 2 total attempts can produce up to 12 downstream attempts, not one universal three-retry policy. [Retries and trust](lessons/SERVICE-MESH-AND-TRUST.md). |
| Qualification | [Mesh telemetry](06-API-ARCHITECTURE.md), lines 2682–2684: “Every request passes through Envoy” and “Metrics automatically collected.” | Observability depends on the mode, proxy/library participation and instrumentation. L4 telemetry is not every L7 or business metric. mTLS authenticates workload peers, not a learner's permission to enroll or an administrator grant. [Mesh coverage](lessons/SERVICE-MESH-AND-TRUST.md). |
| Correction | [OpenAPI document example](06-API-ARCHITECTURE.md), lines 3070–3078: the OpenAPI 3.0 YAML includes `openapi` and `paths` but no `info`. | Label it as an incomplete excerpt; a complete document requires `info`, including title and version. The new [OpenAPI 3.1 file](contracts/course_api.openapi.json) is complete for seven catalogue/enrollment operations. A specification version, contract version and deployed API version are distinct. [Contracts and lifecycle](lessons/API-CONTRACTS-AND-LIFECYCLE.md). |
| Correction | [Schema sketch](06-API-ARCHITECTURE.md), line 3161: `id: number`. | This is a conceptual field/type sketch, not an OpenAPI 3.0 Schema Object to paste into `components.schemas`. Define an object with `properties` containing nested schemas; a numeric user ID can use `{"type":"number"}`. Our separate Course contract intentionally uses string IDs. In JSON Schema, an unfamiliar keyword does not itself define a property constraint. [Typed schemas](lessons/API-CONTRACTS-AND-LIFECYCLE.md). |
| Qualification | [Backpressure](06-API-ARCHITECTURE.md), lines 3651–3654: “System remains stable”; lines 3742–3746 illustrate TCP receiver capacity. | Backpressure can control a cooperative producer at a specified boundary, not guarantee global stability. TCP receive-window flow control bounds connection transfer, not every application/broker backlog. Bound jobs and bytes, define admission/rejection, and measure each relevant boundary. [Capacity and flow](lessons/BACKPRESSURE-AND-CAPACITY.md). |

The stable mean example uses matching long-run quantities:
40 requests/s times 0.125 s gives five requests in the system, not a p99.
The independent fluid model starts with four busy workers and an empty
40-slot waiting queue; fixed 0.05 s service gives an ideal 80/s.
At 100/s it fills in two seconds; from full, at 60/s it drains in two.
These are declared models, not benchmark results or seat-allocation rules.

The maintainer validator checks the actual OpenAPI file and compiled JSON
Schemas, including published response bodies and deliberately invalid
input/output shapes. It does not implement authentication, atomic conditional
writes, shared idempotency, or run a gateway, mesh or load test.
Generated docs, clients and server stubs do not supply those guarantees.

### Architecture sources

- [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3.html):
  mandatory metadata and nested Schema Objects in the original example's generation.
- [OpenAPI 3.1.0 specification](https://spec.openapis.org/oas/v3.1.0.html):
  document structure, JSON Schema alignment and security declarations.
- [NGINX HTTP balancing](https://nginx.org/en/docs/http/load_balancing.html):
  selection methods, connection counts and affinity.
- [Istio sidecar and ambient modes](https://istio.io/latest/docs/overview/dataplane-modes/):
  different L4/L7 coverage and operational costs.
- [TCP specification](https://www.rfc-editor.org/rfc/rfc9293.html):
  receive-window flow control is a transport boundary.
- [Reactive Streams specification](https://www.reactive-streams.org/):
  cooperative demand and bounded asynchronous exchange, not durable business effects.

## Expert design: change, recovery and authority

The [original expert chapter](08-EXPERT-API-DESIGN.md) remains byte-for-byte
unchanged. The [guided expert journey](07-GUIDED-EXPERT-DESIGN.md) and six
complete branch lessons explain the following distinctions rather than
silently deleting examples or treating complexity as an upgrade.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Correction | [Module index](08-EXPERT-API-DESIGN.md), lines 17–20 and 139–145: consensus, tracing, chaos and governance are listed as later module names. | The actual later bodies at lines 4497, 5020, 5721 and 6350 are CAP/consistency, consensus, monetisation/tenancy and staff design. The new reading map follows those bodies. Tracing/chaos and governance retain substantial sections in the [reliability](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md) and [tenancy/governance](lessons/TENANCY-USAGE-AND-GOVERNANCE.md) lessons; the original index's “to be appended” label is historical. |
| Qualification | [Additive response fields](08-EXPERT-API-DESIGN.md), line 361: “Safe. Existing clients ignore unknown fields.” | Some tolerant consumers do; closed schemas and strict consumers reject additions. Our current Course schema rejects the proposed `summary` field. A separate v2 representation can accept it without silently changing v1. Compatibility also includes defaults, enums, cursors and behavior. [Contract evolution](lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md). |
| Qualification | [Provider responsibility](08-EXPERT-API-DESIGN.md), lines 1233–1237: “Guarantees: Contract still valid.” | Provider verification supplies evidence for selected interactions, states, matchers and versions; it cannot guarantee every deployed consumer, security rule, latency or workflow. The illustrative JSON is not a generated Pact file, and the local HTTP probe is not Pact framework verification. [Consumer contracts](lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md). |
| Qualification | [Geo DNS](08-EXPERT-API-DESIGN.md), line 2212: “Nearest region selection.” | Resolver signals, client behavior, caching and TTL affect the answer. Traffic routing does not transfer database ownership, catch up a replica or fence a former primary. [Regional routing](lessons/REGIONS-AND-CONSISTENCY.md). |
| Qualification | [Replication example](08-EXPERT-API-DESIGN.md), lines 1972–1975: “2 seconds.” | This is an assumed example, not a lag bound. A broken link can make lag grow or become unknown. RTO/RPO are recovery objectives that need measured drills and specified durability/failure assumptions. [Replication and recovery](lessons/REGIONS-AND-CONSISTENCY.md). |
| Qualification | [Reliability ladder](08-EXPERT-API-DESIGN.md), lines 2351–2365: Metric → SLI → SLO → SLA. | A measurement, objective and customer agreement are distinct, not increasingly advanced architectures. Define eligibility, outcome and window before calculating a budget. A five-minute burn rate is not the fraction of the whole period's budget consumed. [Reliability](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md). |
| Qualification | [Monolith transaction sketch](08-EXPERT-API-DESIGN.md), lines 3049–3064: `Charge Payment` inside a database transaction followed by “Everything returns to a safe state.” | A local rollback undoes the uncommitted records owned by that transaction. It does not automatically undo a separate payment/license/email provider's effect. Genuine transactional participation must be established; the new lesson separates local seat/reservation/outbox commit from external work. [Transaction boundaries](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md). |
| Qualification | [Saga final state](08-EXPERT-API-DESIGN.md), lines 3373–3378: “No charge. No order.” | Compensation is another observable action, not erasure of the charge or global ACID isolation. Refunds/releases can fail or remain unknown; record and reconcile them before declaring the workflow settled. [Compensation and uncertainty](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md). |
| Correction | [Payment fact](08-EXPERT-API-DESIGN.md), lines 3648–3656: `PaymentCompleted` twice leads to “Charge twice.” | A completion fact does not itself mean “charge again.” If a consumer performs a distinct charge command, name that effect explicitly and protect it with its own identity. Inbox plus a local effect must be atomic; external provider effects have another boundary. [Facts, commands and receipts](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md). |
| Qualification | [Outbox delivery](08-EXPERT-API-DESIGN.md), line 3762: “Guaranteed delivery with DB transaction.” | The transaction records state plus publication intent. Relay duplicates, unavailable providers, retention, storage failure and recovery policy still matter. A timeout after dispatch is unknown, not proof of failure; a matching terminal receipt finalizes or releases the one reservation exactly once locally. [Outbox recovery](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md). |
| Correction | [CAP shorthand](08-EXPERT-API-DESIGN.md), lines 4575–4576 and line 4664: latest write, every request gets a response, “Choose any 2 of 3.” | CAP addresses incompatible linearizability and availability guarantees during a partition. It is not ordinary percentage uptime or a freely chosen three-feature menu. Valid business outcomes differ from inability to fulfill an operation. Quorum overlap also needs an actual version/order/recovery protocol. [CAP and read guarantees](lessons/REGIONS-AND-CONSISTENCY.md). |
| Qualification | [Raft commit summary](08-EXPERT-API-DESIGN.md), line 5406: “Once majority replicate it, leader commits it.” | A leader directly advances commitment by counting replicas for an entry from its current term; committing that entry commits its prefix. An older-term majority alone is insufficient under that rule. Durable votes, log freshness, membership and read/fencing rules remain necessary. [Consensus](lessons/CONSENSUS-AND-COORDINATION.md). |
| Qualification | [Chaos summary](08-EXPERT-API-DESIGN.md), line 4468: “Break things intentionally.” | Start with a steady-state hypothesis, synthetic simulation/tabletop, bounded scope, observation, abort criteria and verified recovery. Any future live experiment requires separate authorization and isolation; none is run by this course. [Incidents and safe resilience planning](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md). |
| Qualification | [Tenant context](08-EXPERT-API-DESIGN.md), lines 5943–5955: every request carries tenant identity. | A client tenant selector is not proof of membership or object permission. Use verified context in storage, joins, caches, exports and jobs. Entitlement does not authorize another tenant's data. [Tenant isolation](lessons/TENANCY-USAGE-AND-GOVERNANCE.md). |
| Qualification | [Usage accounting](08-EXPERT-API-DESIGN.md), lines 6053–6069: request counts as the “Basis of billing.” | Define qualified logical units, stable operation/event identity, uniqueness, conflicting replay, retention and reconciliation. Multiple HTTP attempts can represent one accepted operation. Our tenant/event key binds operation and units; identical replay counts three units once. These commercial transfer examples do not charge for the free course. [Usage and governance](lessons/TENANCY-USAGE-AND-GOVERNANCE.md). |

### Shared example boundaries and checks

The current course remains at 29 seats with learner-7's enrollment-42.
The one-seat partition is a separate hypothetical snapshot for learners-8/9;
A/B form the possible majority and C is isolated. The separate license
workflow reserves one new seat, 29 → 28, then confirms without decrementing
again or releases once, 28 → 29, after a verified rejection.
Unknown provider outcomes remain explicitly tentative.

The rolling 30-day fixture has one million eligible requests and 2,000 bad:
99.8% observed good, 1,000 allowed bad and 200% budget consumption.
The five-minute 50/10,000 fixture has 5× burn. A separate 100-sample latency
model has mean 75 ms, p50 50, p95 200 and p99 1,000 using nearest rank.
The fixed fanout example is 820 ms serial versus 500 parallel against an
800 ms budget, not a calculation of measured end-to-end p99.

AJV validates actual published old/proposed JSON bodies; a short-lived local
HTTP fixture checks literal/subset consumer expectations.
SQLite verifies actual in-memory reservation/receipt rollback, tenant-scoped
lookups and usage deduplication. These do not establish Pact verification,
production authorization, physical durability, a consensus proof or learner
mastery. The static website requires none of those engines or services.

### Expert background sources

- [Pact workflow](https://docs.pact.io/getting_started/how_pact_works):
  consumer tests, provider states and separately executed provider verification.
- [Google SRE: implementing SLOs](https://sre.google/workbook/implementing-slos/):
  user-focused objectives and error-budget decisions.
- [OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/):
  spans, context and telemetry roles, not identity or authorization.
- [Raft paper and resources](https://raft.github.io/):
  election/log rules, current-term commitment and explicit failure assumptions.
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html):
  atomic local intent and duplicate relay delivery.
- [Compensating transactions](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction):
  application-specific, fallible recovery rather than restoration of all history.

## Senior design: evidence, integration and ownership

The [complete original senior guide](07-SENIOR-DESIGN-GUIDE.md) is unchanged.
The [new guided companion](GUIDED-SENIOR-DESIGN.md) works one requirements-led
design and links substantial estimation, SOAP and infrastructure lessons.
Other protocols retain their existing complete guided lessons and references.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Source provenance](07-SENIOR-DESIGN-GUIDE.md), line 9: “I also checked internal enterprise material.” | This is a historical statement in the retained text, not evidence that this rewrite accessed or verified private enterprise documents. The new lessons use public specifications and explicit fictional assumptions; unavailable internal citations are not treated as authority. [Design companion](GUIDED-SENIOR-DESIGN.md). |
| Qualification | [Selection matrix and tiers](07-SENIOR-DESIGN-GUIDE.md), line 34: “Best choice”; headings at line 413, line 539 and line 693 call REST beginner, GraphQL intermediate and gRPC advanced. | These organize material, not a technology ranking. A matrix supplies candidates; contracts, workload, consumer constraints, evidence and operating cost determine the choice. The stage diagram at lines 1276–1288 is one example, not a required path to microservices or multiple regions. [Requirements-led choices](GUIDED-SENIOR-DESIGN.md). |
| Qualification | [Traffic and bandwidth](07-SENIOR-DESIGN-GUIDE.md), lines 332–356: rounded average/peak and 300 MB/s. | Preserve precision before rounding: one billion/86,400 is about 11,574.07 requests/s and 5× is 57,870.37. The 60,000 planning point is not measured capacity. Decimal 5,000-byte response bodies give 300 MB/s or 2.4 Gb/s; framing, headers, requests, compression and cache behavior are separate. [Estimation](lessons/REQUIREMENTS-AND-ESTIMATION.md). |
| Qualification | [Connection memory](07-SENIOR-DESIGN-GUIDE.md), line 372: 1M connections × 50 KB = 50 GB. | The original already notes this is connection state only. The 50,000 bytes per connection is an assumed value, not an intrinsic WebSocket cost or total RAM. Reconnect rate, buffers, heap, subscriptions and fanout need their own model and measurements. [Connection estimates](lessons/REQUIREMENTS-AND-ESTIMATION.md). |
| Qualification | [Event retention](07-SENIOR-DESIGN-GUIDE.md), line 406: “2.1 TB cluster storage.” | This is the uncompressed replicated payload subtotal for the stated model, not a physical allocation or complete storage estimate. Indexes, metadata, temporary files, backups, delivery duplication, compression and configured retention affect the actual result. [Retention and burst bounds](lessons/REQUIREMENTS-AND-ESTIMATION.md). |
| Qualification | [SOAP orientation](07-SENIOR-DESIGN-GUIDE.md), lines 1213–1229: “SOAP uses XML and WSDL contracts.” | WSDL is common but not required for every SOAP exchange. Core SOAP does not automatically provide security, reliable delivery or transactions. Our complete selected read uses SOAP 1.2, WSDL 1.1 with its SOAP 1.2 binding, and a local XSD; the legacy LMS consumes our catalogue. [SOAP and XML](lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md). |
| Qualification | [API server sharding](07-SENIOR-DESIGN-GUIDE.md), lines 1565–1577: horizontally scaled API servers behind a load balancer. | Those are request-handling replicas, not necessarily separate data shards. Data partitioning introduces ownership, routing, cross-shard work, migration and recovery. A route update alone cannot fence the former owner or make a backfill current. [Ownership and migration](lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md). |
| Qualification | [Partition ordering](07-SENIOR-DESIGN-GUIDE.md), line 1641: “Wrong partition key can destroy ordering guarantees”; line 1898: “Otherwise events may arrive out of order.” | A stable scoped key can preserve a partition's log order. It does not automatically order concurrent handlers, retries or external effects; partition-count changes and retained history also matter. [Event and effect ordering](lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md). |
| Qualification | [GraphQL cache strategies](07-SENIOR-DESIGN-GUIDE.md), line 1721: “DataLoader batching.” | Request-scoped batching/memoization is not a shared cross-user response cache. Query, variables, principal, field policy and freshness determine safe reuse. A WebSocket connection likewise is not a cache, even though latest state or history may be stored. [Cache boundaries](lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md). |
| Qualification | [Retry/delivery sketches](07-SENIOR-DESIGN-GUIDE.md), lines 1034–1067 and 1916–1937: prior lookup then transactional insert; line 2446: `broker.publish(event.eventType, event.payload)`. | The sketches still need scoped uniqueness, semantic fingerprints, concurrent duplicate handling and explicit logical IDs through the transport. Local receipt/effect or business/outbox coupling must be atomic; publishing then marking progress can repeat delivery. External effects retain their own idempotency/reconciliation boundary. [Complete outbox/inbox detail](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md). |
| Qualification | [RabbitMQ role](07-SENIOR-DESIGN-GUIDE.md), lines 2636–2638: not ideal for a long-term replayable log. | Distinguish ordinary acknowledged queues from RabbitMQ Streams, which retain logs for configured replay. Redis also distinguishes ephemeral Pub/Sub from Streams and persistence modes. Kafka, RabbitMQ and Cassandra serve different delivery/storage roles, not a universal upgrade sequence. [Infrastructure roles](lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md). |
| Correction | [Rollout note](07-SENIOR-DESIGN-GUIDE.md), line 3017: Phase 7 “is coming soon.” | Phase 7 now has its own guided journey and preserved original. The new senior companion is not Phase 8; the case studies remain complete original material for the next rewrite. [Current course map](COURSE-CONTENT-MAP.md). |

### Shared model and validation boundaries

The current Course remains 29 seats and the learner's enrollment/completion
are already recorded. Certificate and email commands retain their own
identities; the companion does not complete or enroll learner-7 again.
The separate tenant metadata model changes only its label and version.

The local migration probe first backfills version 1, observes a source update
to version 2, blocks early promotion, fences the old owner, catches up, then
establishes epoch 8. It rejects stale expected versions, old-owner writes,
conflicting copies and copy workers after promotion. These are real local
SQLite transaction checks in a finite multi-database sequence, not an atomic
distributed migration, durable-disk experiment or running cache/broker.

The XML validator compiles the actual local XSD, checks WSDL references,
accepts the published request/response/fault and seat boundaries, and rejects
14 invalid payload/namespace/DTD cases. It disables network/entity resolution.
That is not SOAP runtime conformance, generated-client interoperability,
WS-Security verification or proof that a real server is read-only.

### Senior companion background

- [SOAP 1.2 messaging framework](https://www.w3.org/TR/soap12-part1/):
  envelope, namespaces, header processing and extension boundaries.
- [SOAP 1.2 adjuncts](https://www.w3.org/TR/soap12-part2/):
  protocol binding and media-type context.
- [WSDL 1.1 SOAP 1.2 binding](https://www.w3.org/submissions/wsdl11soap12/):
  document/literal messages, operation actions and service addresses.
- [RabbitMQ Streams](https://www.rabbitmq.com/docs/streams):
  retained-log semantics differ from normal queue removal.
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/):
  ephemeral subscriber delivery differs from persisted or retained state.
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html):
  local coupling and the relay's duplicate window.

## Case studies: assumptions, irreversible facts and bounded claims

The [complete original capstone](09-SYSTEM-DESIGN-CASE-STUDIES.md) remains
unchanged, including every diagram and case.
The [guided companion](GUIDED-CASE-STUDIES.md) links six complete cases and
four substantial other-system transfer sections.
These are illustrative designs, not assertions that the named companies
currently use every protocol, product or topology in the original diagrams.

| Kind | Original source and shorthand | Correct explanation and destination |
| --- | --- | --- |
| Qualification | [Capstone framing](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 5: patterns that “power” demanding platforms and “blueprints” for production. | Names, traffic, targets and diagrams are hypothetical design inputs unless supported by specific public evidence. A familiar product name does not supply its private infrastructure, workload or requirements. [Case method](GUIDED-CASE-STUDIES.md). |
| Qualification | [Messaging objectives](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 54: “99.99% message delivery guarantee”; lines 77–78: 500M concurrent connections and 100K per node. | Define the eligible population, window and acceptance/per-device/read boundaries before an SLO. DAU is not simultaneous connections; node capacity is an independent assumption requiring measurement. Do not exclude eligible outage failures to improve the result. [Messaging](lessons/CASE-WHATSAPP-MESSAGING.md). |
| Qualification | [Offline push](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 152: “Wake device when app inactive”; line 211: wake notification. | Provider acceptance does not guarantee waking, delivery or reading. Use minimal hints and recover through authenticated, gap-aware per-device sync. [Messaging recovery](lessons/CASE-WHATSAPP-MESSAGING.md). |
| Qualification | [Registry authority](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 278: “Consensus-based registry or TTL-based expiry.” | A TTL expires a routing hint, not exclusive authority or consensus. A user can have several authorized device connections; receipt and cursor state must identify the device. Resource fencing and actual protocol guarantees remain separate. [Device and ownership boundaries](lessons/CASE-WHATSAPP-MESSAGING.md). |
| Qualification | [Photo processing flow](09-SYSTEM-DESIGN-CASE-STUDIES.md), lines 444–470: direct upload, processed versions, metadata and publication. | Bind finalization to the immutable validated source/generation and every required artifact. READY is not public; publication and its outbox intent commit locally, while object storage and broker operations remain external. Missing or stale output must not be published as complete. [Photo lifecycle](lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA.md). |
| Qualification | [Celebrity rule](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 519: pull for “users with >1M followers.” | That is an illustrative cutoff, not a universal optimization. Posting rate, active readers, write/read cost, capacity, lag and privacy determine whether pull, push or hybrid materialization is useful. [Fanout costs](lessons/CASE-TWITTER-TIMELINES.md). |
| Correction | [REST write label](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 555: “Idempotent, simple CRUD.” | REST does not make every POST idempotent. Model one user's like as a unique relation or use a scoped operation key with semantic conflict checks and atomic effect/outbox coupling. [Likes and privacy](lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA.md). |
| Qualification | [Story expiry](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 524: “TTL-based auto-expiry.” | Serving cutoff, database cleanup, cache/replica deletion, backups, issued capabilities and recipient screenshots are different boundaries. No TTL proves erasure of every copy. [Expiry transfer](lessons/CASE-STUDY-TRANSFERS.md#transfer-snapchat). |
| Correction | [Playback guarantee](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 580: “Zero buffering during playback.” | Adaptive quality cannot guarantee this. The fixed model selects mid at a 3 Mb/s budget; at 375 kb/s none of its representations fits. Signal no-fit/stall rather than inventing playable fallback. [Playback](lessons/CASE-NETFLIX-PLAYBACK.md). |
| Qualification | [Client telemetry arrows](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 685 and line 724: client directly to Kafka. | Show a bounded authenticated ingestion API, explicit event meaning and local durable handoff before an optional internal broker. Requests/downloads/client reports do not prove viewing or attention. [Playback telemetry](lessons/CASE-NETFLIX-PLAYBACK.md). |
| Correction | [CDN origin claim](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 737: “video never hits origin at scale.” | Edges still require content fill/updates and miss handling; capacity, authorization and verified alternate paths matter. A DNS change or a close edge is not proof of successful recovery. [Delivery boundaries](lessons/CASE-NETFLIX-PLAYBACK.md). |
| Correction | [Trip/payment failure](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 938: “Cancel trip completion.” | A physical trip does not unhappen because payment fails. Persist its fact and charge intent separately from the provider outcome; an unknown charge requires same-operation reconciliation, not cancellation of history. [Dispatch and payments](lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md). |
| Qualification | [Refund and credit](09-SYSTEM-DESIGN-CASE-STUDIES.md), lines 942–943: refund rider, then retry driver credit. | Driver payable, payout, refund and collection are separate obligations. Doing both requires an explicitly funded balance/liability policy; compensation is a fallible operation, not a universal automatic refund/credit sequence. [Financial workflow boundaries](lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md). |
| Qualification | [Price fallback and retry](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 965: last-known surge; line 967: ride-creation idempotency prevents duplicate charges. | A stale price needs bounded, unexpired agreed terms and consent. A ride key is not the payment key; external payment effects require provider cooperation, a separate stable identity and reconciliation. [Quote, offer and charge scopes](lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md). |
| Qualification | [Trending timing](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 1120: “returns from cache (sub-ms).” | This is not a measured end-to-end guarantee. Network, policy, query, cache misses and load need a defined population and observation window. [Timeline and trend measurements](lessons/CASE-TWITTER-TIMELINES.md). |
| Correction | [Upload dimensions](09-SYSTEM-DESIGN-CASE-STUDIES.md), lines 1191–1192: 500 hours/min means 720K videos/day and 10.8M jobs/day. | It means 720,000 uploaded hours/day. Video count requires average duration: at 0.25 h/video, 2.88M videos and 43.2M one-output jobs/day; at 1 h/video the original video/job figures become conditional. [Upload units](lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md). |
| Qualification | [Media readiness/storage](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 1261: `status: READY`; line 1310: object storage “essentially unlimited.” | Verify current immutable source, every required output and a compatible manifest, then perform a guarded local transition and separate authorized publication. Storage still has quotas, bandwidth, failures, costs and lifecycle constraints. [Uploads and publication](lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md). |
| Qualification | [Other-system equivalence](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 1364 and line 1396: “Netflix (exactly)”; line 1397: scale × 3. | Reuse mechanisms, not an unverified identical implementation or workload multiplier. Commerce, professional privacy, expiry and live sports have their own authority, timing and failure rules. [Complete transfer sections](lessons/CASE-STUDY-TRANSFERS.md). |
| Correction | [Universal architecture](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 1407: every large-scale system has the same skeleton; line 1465: clients need REST and GraphQL. | These are possible roles, not mandatory boxes. Start small and add a mechanism only when its requirement and cost justify it. Not every system needs both interfaces, Kafka, sharding, a gateway or a cache. [Case method](GUIDED-CASE-STUDIES.md). |
| Qualification | [Completion and numbering](09-SYSTEM-DESIGN-CASE-STUDIES.md), line 1507: Phase 8; line 1512: design any distributed system. | Case studies are a companion to Phases 0–7. Reading availability and finite tests do not certify arbitrary production design, operations or billion-user scale. Prediction, recall, transfer, implementation and representative evaluation remain necessary. [Capstone practice](GUIDED-CASE-STUDIES.md). |

### What was checked, and what was not

The case fixtures contain fictional identities and small synthetic inputs.
SQLite checks actual local rollback/uniqueness, two device inboxes with separate
reported receipts, current audience predicates, required artifact records,
exclusive driver/rider/offer guards and independently recorded trip/payment facts.
The upload probe hashes six actual synthetic bytes; it is not a media decoder.
Late matching finalization preserves READY, and missing/mismatched outputs
cannot create a ready intent in the finite model.

The playback model checks fixed bitrate arithmetic and an explicit no-fit
outcome, plus scoped local authorization/expiry observations. The 24-hour
expiry comparison includes the exact boundary; the three four-second live
segments advertise 12 seconds of media, not a measured live latency.
Those local checks are not encryption, physical device receipt, human attention,
media processing, real money movement, live broker/CDN behavior or distributed
safety/production-SLO proofs.

### Capstone public background

- [Netflix Open Connect](https://openconnect.netflix.com/en/):
  a public description of localized delivery, interconnection and content fills,
  not evidence for every box in this course's illustrative Netflix diagram.
- [HTTP Live Streaming, RFC 8216](https://www.rfc-editor.org/rfc/rfc8216.html):
  protocol reference for playlists and media segments; our toy references are
  not validated HLS files or an actual player.
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html):
  local commit plus publication intent and duplicate relay windows.
- [WebRTC overview](https://www.w3.org/TR/webrtc/):
  negotiated communication APIs, not a guarantee that a particular network path
  or every relay will succeed.
