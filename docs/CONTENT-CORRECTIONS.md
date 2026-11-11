# Corrections and distinctions

This record explains the corrections and qualifications in the evolution-based
REST, GraphQL, RPC/gRPC and real-time journeys and their related lessons. It is not a claim that every topic in
the course has been audited or rewritten.

**The ten original chapter files and raw notes are retained unchanged.**
Preserving their bytes does not make every statement authoritative. Read the
original alongside these distinctions; the site labels the retained Phase 0,
REST, GraphQL, RPC/gRPC and real-time references and links here.

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
