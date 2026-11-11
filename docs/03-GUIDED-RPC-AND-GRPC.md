# Phase 3 — Make a remote course call deliberately

The learning platform from the [REST journey](01-GUIDED-REST.md) and
[GraphQL journey](02-GUIDED-GRAPHQL.md) now considers a different boundary.
This is a fictional contract and execution trace, not a deployed service.
Read the complete [original Phase 3 reference](03-RPC-AND-GRPC.md), the
[course content map](COURSE-CONTENT-MAP.md), and
[content corrections](CONTENT-CORRECTIONS.md) alongside this guide.

**Starting snapshot.** `seats` means available seats. Course `course-101`
is **API Fundamentals**, with 30 seats; `course-102` is **REST Studio**,
with 20. The authenticated learner is `learner-7`. Neither starts enrolled.
The platform permits preview progress before enrollment, so an initial 20%
does not imply enrollment or authorization. Identifiers and the key below are
illustrations, not live credentials. This lesson uses independent snapshots
only where explicitly reset; enrollment in the main timeline leaves 29 seats.

## Route through the original reference

The original repeats its deep dive in two passes. This map preserves the
major topics without implying that one protocol is the next upgrade rung.
Every original link below goes to the chapter itself, not a guessed anchor.

| Original family | Follow the journey or branch | Full source |
| --- | --- | --- |
| Part 1: history, local vs remote, REST vs RPC, architecture and hidden failures | [Choice](#rpc-choice) and [lifecycle](#rpc-lifecycle) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Part 1: service contracts, Google and protobuf; comparison and summary | [Contract](#rpc-contract) and [choice](#rpc-choice) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Part 2: HTTP/1.1, HTTP/2 multiplexing, header compression, framing, binary vs JSON | [Wire](#rpc-wire) and [protobuf and evolution](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Part 2: proto, field numbers, generation, client/server stubs, end-to-end lifecycle | [Contract](#rpc-contract), [wire](#rpc-wire), [lifecycle](#rpc-lifecycle) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Part 2: unary, server, client, bidirectional streaming and WebSocket | [Streaming](#rpc-streaming) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Part 2: microservices, polyglot clients, fit, browser limits, REST/GraphQL/gRPC and platform architecture | [Choice](#rpc-choice), [streaming](#rpc-streaming), [next](#rpc-next) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Part 2: failures, deadlines, retries, load balancing, observability and production decisions | [Operations](#rpc-operations) and [lifecycle and operations](lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md) | [Phase 3 reference](03-RPC-AND-GRPC.md) |
| Next lesson: real-time patterns and async context | [Next choices](#rpc-next) | [Phase 3 reference](03-RPC-AND-GRPC.md) |

<span id="rpc-choice"></span>
## Step 1 — Decide whether a remote boundary exists

**Problem.** The platform's catalogue is already an independently deployed
service owned by a different team. A Java catalogue and a Node.js gateway
must agree on a course read across that existing boundary. The team controls
both clients and server, wants a shared typed contract, and may need progress
streams. This scenario justifies evaluating gRPC; it does not justify splitting
an otherwise healthy monolith. If the operation is in the same process, an
ordinary local call is usually the simpler starting point.

A **remote procedure call** (RPC) asks a remote service to perform an
operation. RPC is a broad idea and predates REST; gRPC is one implementation
of RPC, not a synonym for all RPC. gRPC commonly combines protobuf-defined
messages and generated bindings with HTTP/2 transport. Google developed gRPC
from experience with its internal RPC systems; the choice is about contracts
and operational needs, not a promise that every gRPC call is faster.
For the name itself, the [official FAQ](https://grpc.io/docs/what-is-grpc/faq/)
uses the recursive expansion “gRPC Remote Procedure Calls.” Google's role in
its origin does not make it a Google-only service or require Google's cloud.

The caller might invoke `CourseService.GetCourse`, while REST might read
`GET /courses/course-101`. Both can serve the same course. REST is a valid
internal service interface too, and REST can use HTTP/2 and schema-based
code generation. GraphQL can shape a dashboard but is not a replacement
requirement. Public gRPC APIs are possible when consumers can use them;
browser access and tooling deserve explicit consideration.

```text
Browser -- REST or GraphQL --> gateway -- gRPC --> catalogue service
                                           |        independently deployed
                                           +------> progress service
```

Text alternative: the browser talks to a gateway; the gateway may call the
independently deployed catalogue and progress services over gRPC. This is
one possible architecture, not a mandate to create either service.

**Changed condition.** If the existing internal REST read meets the latency,
contract and team needs, keep REST. If progress can be slightly stale, bounded
polling is another reasonable choice. Measure actual end-to-end behavior,
including network and storage costs, rather than assuming a benchmark result.

<details class="learning-answer">
<summary>Predict: does a typed remote GetCourse behave like a local function?</summary>
<p><strong>Reasoning:</strong> No. It crosses a network and can fail in transit,
time out or return after server work completes. Types help describe values,
not the availability or timing of the remote service.</p>
</details>

<span id="rpc-contract"></span>
## Step 2 — Read the shared contract

**Problem.** Both teams need the same operation names, input and output types,
and a safe path for changing them. The complete authoritative file is
[course_api.proto](contracts/course_api.proto). It declares proto3, package
`learning.v1`, two services and their message definitions. Follow that link
for the entire valid compilation unit; the excerpt below is not a complete file.
A proto service groups methods; both services can run in one process.
Separate service definitions do not require separate deployments.

```text
service CourseService {
  rpc GetCourse(GetCourseRequest) returns (Course);
  rpc Enroll(EnrollRequest) returns (EnrollReply);
}
message GetCourseRequest {
  string course_id = 1;
}
```

Read `rpc GetCourse(GetCourseRequest) returns (Course);` as a unary
operation taking one `GetCourseRequest` and returning one `Course`.
`course_id` is a string identified by field number 1. `Course` contains
`id`, `title`, `seats` and an optional `description`, with field numbers
1, 2, 3 and 4 respectively. `Enroll` returns an `Enrollment` and a `Course`.
This definition does not carry a learner ID in `EnrollRequest`: the example
server derives the principal from authenticated context, not a caller-supplied
identity in the request body.

The proto uses lower_snake_case names, while this lesson's JavaScript
fixtures use lowerCamelCase: `course_id` becomes `courseId`, and
`idempotency_key` becomes `idempotencyKey`. That is a binding/library choice,
not a claim that every generated language API uses the same spelling.
Inspect the generator and its options in a real project. The JSON blocks in
this lesson are **diagnostic renderings** of the selected JavaScript binding's
message objects, not raw gRPC wire payloads or HTTP JSON requests.

For this binding, the actual request value for `GetCourse` is:

```json
{"courseId":"course-101"}
```

Run suitable protobuf and gRPC generators against the shared schema to obtain
client and server bindings for each language. A client stub handles much of
the call and serialization plumbing; server bindings dispatch to the handler.
Neither generated stubs nor strong typing implement business logic, input
policy, authentication or authorization. For example, an `int32` permits
negative numbers, while our available-seat policy rejects them.

**Changed condition.** A new optional field can be an additive evolution,
but compatibility depends on readers, writers and deployment order. Keep
field numbers stable; reserve deleted numbers and names instead of reusing
them. A field's absence may differ from an explicitly empty value when it has
presence, as `description` does. The detailed
[protobuf and evolution branch](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md)
explores encoding and rolling changes.

<details class="learning-answer">
<summary>Predict: does the schema alone authorize learner-7 to enroll?</summary>
<p><strong>Reasoning:</strong> No. It describes message shapes and methods.
The handler must authenticate the caller and apply the course and learner
access policies to this particular operation.</p>
</details>

<span id="rpc-wire"></span>
## Step 3 — Follow one read onto the wire

**Problem.** A function-shaped call hides several layers. Knowing which layer
carries which information helps diagnose errors without mistaking a text
rendering for network traffic.

For the starting snapshot, the server's complete `Course` value, with its
optional description absent, has this diagnostic JSON rendering:

```json
{"id":"course-101","title":"API Fundamentals","seats":30}
```

The other complete course in the same snapshot is:

```json
{"id":"course-102","title":"REST Studio","seats":20}
```

The generated client serializes the request message as protobuf binary. In
this one example, field 1 is length-delimited: tag byte `0a`, length byte
`0a`, then the ten UTF-8 bytes of `course-101`. The 12-byte protobuf message
is `0a0a636f757273652d313031` in hexadecimal. The field number is a wire
identifier, not a position or ordinal: encoded fields need not appear in
schema order. Binary serialization is not itself compression.

A gRPC message adds a five-byte prefix: one compressed flag byte and a
four-byte big-endian message length. Here the flag is 0 and length is 12,
so the prefix is `000000000c` and this one gRPC message is 17 bytes. That
is not the whole HTTP/2 request: metadata, HTTP/2 frames, TLS and network
headers add other bytes. A gRPC message can span HTTP/2 DATA frames, and
one DATA frame need not correspond to one message. Compression can be
negotiated separately; it is not implied by protobuf's binary format.

HTTP/2 multiplexes logical streams on a connection and compresses headers;
REST can also use HTTP/2. TCP loss can still affect streams sharing the
connection, and multiplexing is not a universal latency guarantee. For native
gRPC, request and response messages travel in HTTP/2 DATA frames, while
metadata travels in headers and final gRPC status normally in trailers.
A trailers-only error response is also possible. HTTP status and gRPC status
are distinct: HTTP 200 alone does not establish a successful RPC; inspect
final `grpc-status`, such as `OK` or `PERMISSION_DENIED`.

<details class="learning-answer">
<summary>Predict: does a 17-byte gRPC message mean the network used 17 bytes?</summary>
<p><strong>Reasoning:</strong> No. That count includes the five-byte gRPC
prefix and 12-byte protobuf message, but not HTTP/2, TLS or network overhead.
The diagnostic JSON is neither of those wire encodings.</p>
</details>

<span id="rpc-lifecycle"></span>
## Step 4 — Trace the read and an uncertain enrollment

**Problem.** A read and a write can both fail remotely, but a write can have
committed before its response is lost. Trace the boundary rather than treating
an exception as proof of what happened on the server.

For `GetCourse`, the gateway supplies the message and a native client call
option specifying a deadline, along with authentication metadata. The
**deadline is not a protobuf message field**. The stub encodes the request;
TLS protects the transport, and HTTP/2 carries it to the server. Server
bindings decode it and dispatch to the handler. The handler authenticates
and authorizes the caller, fetches the course, and returns a `Course`; the
binding encodes it and the client receives the message and final status.
The actual deadline API differs by language and library.

Now learner-7 asks to enroll, starting from 30 available seats. The request
in the chosen binding is the following diagnostic rendering:

```json
{"courseId":"course-101","idempotencyKey":"enroll-7-a"}
```

The example service authenticates learner-7 from metadata, checks their
permission and seat availability, and commits the enrollment and seat change
atomically with a durable idempotency record. A successful response is:

```json
{"enrollment":{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"},"course":{"id":"course-101","title":"API Fundamentals","seats":29}}
```

The returned course is a complete `Course` snapshot with `description`
absent, not just a seat count. Course-102 remains REST Studio with 20 seats.
A later `GetCourse` of course-101 in this main timeline returns this complete
value, assuming no intervening changes:

```json
{"id":"course-101","title":"API Fundamentals","seats":29}
```

Suppose the server commits that result but its reply is lost. The client's
call deadline expires and it observes `DEADLINE_EXCEEDED`. The client outcome
is **unknown**, not known failure: the seat may already be reserved. A retry
with a fresh key could reserve another seat if policy permits. Instead, within
the documented retention period, retry the same intent with the same key.
The server scopes keys by authenticated caller and operation, includes
`course_id` in a request fingerprint, atomically stores the result, and
returns that result for a matching duplicate. A conflicting fingerprint is
rejected, not silently reused. Retention and concurrent duplicate behavior
must be documented and tested in the real service.

The atomic record protects the enrollment in this example; it does not make
external emails or payments exactly once. Those require their own durable
outbox, consumer deduplication or other explicit delivery design. Cancellation
is cooperative: the server should stop work when practical, but cancellation
or a deadline does not roll back a commit already made.

**Explicit reset.** For the streaming exercises only, independently reset
course-101 to 30 available seats and no enrollment. The two preview-progress
events do not consume seats. This is not a reversal of the main timeline.

<details class="learning-answer">
<summary>Predict: after DEADLINE_EXCEEDED, is enrollment definitely absent?</summary>
<p><strong>Reasoning:</strong> No. The server may have committed before the
reply was lost. Retry the same scoped key and same request, or reconcile via
an authorized lookup; do not assume cancellation undid the write.</p>
</details>

<span id="rpc-streaming"></span>
## Step 5 — Choose the direction of each stream

**Problem.** The same platform needs a read, live progress, a batch of
progress updates and classroom discussion. The shared service contract—not
an invented method—determines which side may send multiple messages.

| Method | Client messages | Server messages | Shape |
| --- | --- | --- | --- |
| `CourseService.GetCourse` | one `GetCourseRequest` | one `Course` | unary |
| `ProgressService.WatchProgress` | one `GetCourseRequest` | stream of `ProgressUpdate` | server streaming |
| `ProgressService.RecordProgress` | stream of `ProgressUpdate` | one `ProgressSummary` | client streaming |
| `ProgressService.Discuss` | stream of `ClassroomMessage` | stream of `ClassroomMessage` | bidirectional |

`CourseService.Enroll` is another unary method, as seen in Step 4. In a
successful unary call, one request message leads to one response message;
an error can terminate the call without a successful response message.

For `WatchProgress`, the client sends the same one-message course request.
In this independent preview scenario the server sends exactly two progress
messages, shown below as two separate diagnostic renderings:

```json
{"courseId":"course-101","percentComplete":20,"eventId":"progress-20"}
```

```json
{"courseId":"course-101","percentComplete":40,"eventId":"progress-40"}
```

That is two protobuf messages and two gRPC message prefixes, not necessarily
two HTTP/2 DATA frames. The stream can send zero, one or more updates in
other situations, followed by final status. Event IDs are application data;
they do not by themselves promise durable delivery or authorize a viewer.

For `RecordProgress`, a client sends those same two `ProgressUpdate`
messages, then half-closes its sending side. In this example the server
accepts both and returns this one diagnostic `ProgressSummary`:

```json
{"acceptedCount":2,"lastPercent":40}
```

The count is two accepted application messages, not a count of HTTP/2 frames.
A real service must define validation, duplicates, persistence and whether
partial acceptance is possible before it publishes these semantics. Receiving
an aggregate is not an implicit exactly-once promise.

`Discuss` uses `ClassroomMessage` in both directions. For example, a client
sends this diagnostic message:

```json
{"courseId":"course-101","messageId":"message-1","text":"Ready for class"}
```

The server can independently send another classroom message:

```json
{"courseId":"course-101","messageId":"message-2","text":"Welcome"}
```

Each direction preserves its own message order on a call; there is no global
ordering between the directions and no inherent per-message ACK or persistence
guarantee. An application can define acknowledgments and sequence numbers,
but this contract does not. Half-closing one direction need not immediately
end the other. Bound queues and apply backpressure when receivers are slow.

If a deadline interrupts a stream after the 20% update, the client has a
partial observation, not a successful complete stream. Neither replay nor
resume is automatic. A separate application protocol would need a cursor,
retention, authorization, duplicate handling and a reconnection policy;
this shared contract does not define one.

Browser-native gRPC support differs from native clients. gRPC-Web typically
requires a compatible proxy and supports unary and server streaming, not
native client or bidirectional streaming. Check the chosen implementation.
For browser bidirectional interaction WebSocket is an alternative; for
server-to-browser updates SSE or bounded polling may fit. These are different
protocols with their own contracts and operational trade-offs.

<details class="learning-answer">
<summary>Predict: does seeing progress-20 prove progress-40 will arrive?</summary>
<p><strong>Reasoning:</strong> No. A stream can end with an error or deadline
before the next message. The client must treat the observed event as partial
and use a separately designed reconciliation or resume mechanism.</p>
</details>

<span id="rpc-operations"></span>
## Step 6 — Bound failures and operate the boundary

**Problem.** A typed contract does not keep a service healthy or ensure a
caller is entitled to course data. Production needs an explicit policy for
identity, failure, time and load as well as schema compatibility.

Use TLS to protect traffic and authenticate service peers where appropriate.
Carry credentials or delegated identity in metadata, not hardcoded examples.
The server validates identity and checks permission on each operation and
object; a strongly typed message does not grant permission. A gateway's
identity alone is not automatically proof of learner-7's authority.
Avoid logging credentials, private payloads or idempotency keys unnecessarily.

Set a deadline appropriate to the user's total time budget. A downstream call
must use the remaining budget, accounting for work already spent, not restart
an unlimited clock at each hop. For example, if the caller has a 500 ms total
budget and 150 ms has elapsed, at most 350 ms remains for downstream work,
and the caller may reserve some of that for response handling. This is an
illustrative budget, not a universal recommended deadline.

Classify typed gRPC status before considering retry:

| Status | Example response policy |
| --- | --- |
| `INVALID_ARGUMENT` | Fix input; do not retry unchanged. |
| `UNAUTHENTICATED` | Obtain valid identity; do not blindly retry. |
| `PERMISSION_DENIED` | Respect policy; do not retry unchanged. |
| `NOT_FOUND` | Apply lookup semantics; do not assume transient failure. |
| `UNAVAILABLE` | Potentially transient; retry only if safe and within budget. |
| `DEADLINE_EXCEEDED` | Outcome may be unknown, especially for writes; reconcile or use the idempotency contract. |
| `RESOURCE_EXHAUSTED` | Respect quota or backpressure; retry only under a deliberate policy. |
| `CANCELLED` / `INTERNAL` | Inspect context; cancellation is not rollback, internal faults need investigation. |

A read can still incur load when retried. Choose one retry layer to avoid
multiplying attempts; cap attempts, apply exponential backoff with jitter,
and stop when the remaining deadline budget cannot cover another attempt.
Only retry a write when its idempotency semantics support it. Coordinate
application retries with any library, proxy or service-mesh retry policy.

Long-lived HTTP/2 connections can make a connection-level load balancer sticky:
many calls from one client can reach the same backend even as others idle.
Consider client-side balancing with service discovery, or an HTTP/2-aware
Layer 7 proxy/service mesh that can route per RPC method. Verify health,
connection draining, stream limits and actual distribution under load; a
long-lived stream itself cannot be moved transparently to a new backend.

Observe method, gRPC status, latency, deadline expiry, retry attempts, active
streams, stream duration and payload sizes. Propagate trace context across the
gateway and services; correlate logs without exposing sensitive data. Test
slow dependencies, lost replies, overload and deployments. Compare measured
latency, throughput, resource use and operational costs against REST under
representative workloads, rather than promising a fixed speedup.

For deeper failure timelines, service discovery and operational policy, use
[the lifecycle and operations branch](lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md).
The [protobuf and evolution branch](lessons/GRPC-PROTOBUF-AND-EVOLUTION.md)
handles compatible schema changes in more detail.

<details class="learning-answer">
<summary>Predict: should every UNAVAILABLE response trigger endless retries?</summary>
<p><strong>Reasoning:</strong> No. Retry only when the operation is safe under
its contract, with a bounded attempt count, backoff and jitter inside the
remaining deadline budget. Repeated retries can worsen overload.</p>
</details>

<span id="rpc-next"></span>
## Step 7 — Transfer the decision to another domain

**Problem.** A library has an existing resource-oriented HTTP API and wants
to create a book loan. Two independently deployed teams already own the
catalogue and loan components. A loan changes inventory just as enrollment
changes available seats. What transfers, and what depends on the boundary?

First retain the existing REST loan interface if it meets the consumers'
needs. If a controlled internal typed contract across the existing boundary
has concrete benefits, consider a unary RPC for creating the loan. The caller
still needs identity, authorization and a deadline; the handler needs an
atomic loan-and-inventory policy and a scoped idempotency key for uncertain
outcomes. If a due-date notification is lost, a successful loan may still
exist. External notification delivery needs its own durability design.
Do not invent a library method in the course proto: this is a design transfer,
not another method on `CourseService`.

**Changed condition.** If the loan code and inventory are inside one monolith,
keep the local call and transaction until an independent boundary is justified.
If the library browser needs one-way due-date updates, SSE or polling might be
simpler than adding gRPC-Web; bidirectional collaboration may suggest
WebSocket. A queue can decouple asynchronous notification processing, but has
its own delivery and deduplication semantics.

<details class="learning-answer">
<summary>Predict: is the book loan safe to repeat after a lost reply?</summary>
<p><strong>Reasoning:</strong> Not automatically. The loan may have committed.
A documented, durable, caller-scoped idempotency contract and reconciliation
make a same-intent retry safer; transport or generated types do not do that.</p>
</details>

Continue to the [Phase 4 real-time journey](04-GUIDED-REALTIME.md)
to compare WebSocket, SSE and related patterns, not as an upgrade rung. For
resource and client-shaped alternatives revisit the [REST journey](01-GUIDED-REST.md)
and [GraphQL journey](02-GUIDED-GRAPHQL.md). For the full set of source
references return to the [course content map](COURSE-CONTENT-MAP.md).
The [original Phase 4 reference](04-REALTIME-COMMUNICATION.md) remains available
with all of its examples, diagrams, and comparisons.
