# gRPC lesson: lifecycle and operations

This standalone lesson uses the fictional shared Course API. `course-101`
is **API Fundamentals**, initially with 30 seats. Authenticated `learner-7`
uses `enroll-7-a`; one successful enrollment creates `enrollment-42` and
leaves 29 seats. Each worked timeline states its own assumptions. Real
services must implement and test the policies described here.

Read [Protobuf and evolution](GRPC-PROTOBUF-AND-EVOLUTION.md), the
[guided gRPC journey](../03-GUIDED-RPC-AND-GRPC.md), the
[original RPC reference](../03-RPC-AND-GRPC.md),
[Phase 0](../00-GUIDED-FUNDAMENTALS.md),
[REST reliability](REST-RELIABILITY-AND-OPERATIONS.md), the
[content map](../COURSE-CONTENT-MAP.md), and the
[corrections ledger](../CONTENT-CORRECTIONS.md).
The [shared contract](../contracts/course_api.proto) and
[fixtures](../../assets/rpc-lesson-fixtures.mjs) define the examples.

## 1. A call has more than a request and response

A generated stub starts a remote operation, not a local function call.
A typical native gRPC call sends request metadata and one or more encoded
messages over an HTTP/2 stream. The server may authenticate, authorize,
validate, invoke downstream work and emit response messages. The call ends
with a gRPC status, usually in trailing metadata. Errors can occur before
or after the server changes state, and the caller cannot observe every step.

The contract has these actual methods, with no deadline fields in their
messages:

| Method | Request cardinality | Response cardinality |
| --- | --- | --- |
| `CourseService.GetCourse` | one `GetCourseRequest` | one `Course` |
| `CourseService.Enroll` | one `EnrollRequest` | one `EnrollReply` |
| `ProgressService.WatchProgress` | one `GetCourseRequest` | stream of `ProgressUpdate` |
| `ProgressService.RecordProgress` | stream of `ProgressUpdate` | one `ProgressSummary` |
| `ProgressService.Discuss` | stream of `ClassroomMessage` | stream of `ClassroomMessage` |

A client selects a deadline through its gRPC call options, not by adding a
field to `course_api.proto`. The status is separate from application reply
messages. Language APIs expose metadata and stream operations differently.

<details class="learning-answer">
<summary>Check: does a generated method signature remove network failures?</summary>
<p>No. It supplies a typed interface, but network delay, status errors and uncertain remote side effects remain.</p>
</details>

## 2. Deadline budgeting is end to end

A deadline is the latest useful completion time for the logical operation.
A per-attempt timeout limits one attempt within that deadline. The overall
budget includes queueing, network time, retries, downstream calls, response
processing and any backoff. An attempt must not outlive the remaining
budget merely because it was given a longer local timeout.

Suppose a caller has 1,000 ms total. Its first work uses 400 ms and it
reserves 100 ms for returning and cleanup. The downstream call has at most
`1000 - 400 - 100 = 500` ms of useful remaining budget. If time has passed
while scheduling or retrying, recompute the remaining budget; do not reset
it to 1,000 ms at each hop. A downstream server can itself propagate the
remaining time to its own dependencies. Runtime support for propagation
varies by language and configuration, so verify it rather than assuming it.

Deadline expiry tells the client it stopped waiting; it does not prove that
the server never received or committed the request. Server and client can
observe different final outcomes. Deadlines also do not replace bounded
queues, resource limits or authorization. Choose budgets from measured
latency and user needs, leaving room for downstream and cleanup work.

<details class="learning-answer">
<summary>Predict: what downstream budget remains after 400 ms of a 1000 ms budget and a 100 ms reserve?</summary>
<p>At most 500 ms remains for the downstream operation. Further elapsed time reduces that amount.</p>
</details>

## 3. Status is not the HTTP status

A gRPC application status includes a numeric code and optional message and
metadata. HTTP/2 status 200 can carry a non-OK `grpc-status` in trailers.
A trailers-only response can report a status without a response message,
for example when admission fails early. A streaming call may deliver some
messages and then terminate non-OK; partial progress is not final success.
Intermediaries that drop trailers can obscure the outcome.

The following mappings are **chosen example policies**, not universal rules
or a one-to-one mapping to HTTP status codes. Details depend on the API's
contract and privacy requirements:

| gRPC status | Number | Example use in this API |
| --- | ---: | --- |
| `OK` | 0 | Requested work completed according to the method contract |
| `CANCELLED` | 1 | The call was cancelled before a usable response |
| `INVALID_ARGUMENT` | 3 | Malformed course ID or percent outside 0–100 |
| `DEADLINE_EXCEEDED` | 4 | Deadline elapsed before client received a result |
| `NOT_FOUND` | 5 | Course not found under the chosen disclosure policy |
| `ALREADY_EXISTS` | 6 | Enrollment already exists under a chosen uniqueness policy |
| `PERMISSION_DENIED` | 7 | Authenticated learner lacks permission |
| `RESOURCE_EXHAUSTED` | 8 | Admission limit or quota reached |
| `FAILED_PRECONDITION` | 9 | Course has no available seat |
| `ABORTED` | 10 | Transaction conflict requires a higher-level retry decision |
| `UNAVAILABLE` | 14 | Service temporarily unavailable |
| `UNAUTHENTICATED` | 16 | No valid caller identity was established |

A conflict between a reused idempotency key and a different fingerprint
could be `FAILED_PRECONDITION` under this example policy; document it.
Do not treat any particular code as a universal retry instruction. Inspect
method semantics, attempt state, and remaining budget. A status message must
not leak credentials or private record contents.

<details class="learning-answer">
<summary>Predict: does HTTP 200 guarantee the RPC succeeded?</summary>
<p>No. The final gRPC status may be non-OK in trailers, including after a stream delivered some messages.</p>
</details>

## 4. Lost response: state and client knowledge diverge

The JSON below is a **diagnostic representation**, not native gRPC wire
JSON. The contract uses lower_snake_case, while this fixture-style diagnostic
uses lowerCamelCase. Authentication supplies `learner-7` independently of
the message; the idempotency key is not a credential.

```json
{"courseId":"course-101","idempotencyKey":"enroll-7-a"}
```

Assume the database transaction has enough seats and the caller is allowed:

| Time | Server state | Client knowledge |
| --- | --- | --- |
| 0 ms | Request arrives, 30 seats | Waiting |
| 100 ms | Commit creates `enrollment-42`; seats 30 → 29 | Still waiting |
| 150 ms | Reply is lost in transit | Still waiting |
| deadline | Commit remains durable | `DEADLINE_EXCEEDED`; outcome uncertain |

The successful semantic result, shown diagnostically, is:

```json
{"enrollment":{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"},"course":{"id":"course-101","title":"API Fundamentals","seats":29}}
```

Another execution could lose the request before arrival and leave 30 seats.
Those possibilities can look identical to the client at expiry. Neither a
client deadline nor a cancellation rolls back a completed database commit.
A documented replay or lookup mechanism is needed to resolve uncertainty.

<details class="learning-answer">
<summary>Predict: after DEADLINE_EXCEEDED, must the course still have 30 seats?</summary>
<p>No. The server may already have committed enrollment-42 and reduced the seats to 29 before its reply was lost.</p>
</details>

## 5. Idempotency, concurrency, and retries

For this example the server scopes `enroll-7-a` to the authenticated caller
and enrollment operation family, not to an individual course. Its semantic
fingerprint includes the target course and other meaningful request inputs.
A matching replay returns the recorded semantic outcome: the same enrollment
identity and outcome, without another seat decrement. It need not reproduce
identical serialized bytes or metadata. Retain the record for a documented
window, and define what happens after expiration.

Reusing the same key for `course-102` changes the fingerprint and is
rejected, not treated as an independent enrollment. A new logical intent
needs a new key. Authentication, authorization and validation still run
under the service's documented replay policy; knowing a key cannot grant
access to another caller's result.

A check-then-insert outside a transaction races. Two identical requests can
both observe an absent key. Use a unique scoped-key constraint or equivalent
coordination, and atomically connect the deduplication record, enrollment and
seat decrement. Define what an in-progress duplicate sees: wait within its
budget, or return a documented retryable/in-progress result. Recover after
crashes without recording success for an uncommitted effect or reapplying a
committed effect after a missing record.

Distinct keys also compete for the last seat. Idempotency only deduplicates
the same logical request; database isolation, conditional decrement or an
appropriate lock must enforce nonnegative capacity across different callers.
For example, with one seat, two distinct valid requests cannot both commit a
successful decrement. Their replies follow the chosen transaction and status
policy. External side effects require their own durable coordination, such
as an outbox and an idempotent consumer; a database transaction cannot
atomically commit an unrelated remote service by itself.

Retry only when the operation and particular attempt are safe to retry. Use
bounded attempts, exponential backoff with jitter, and one shared deadline;
select one responsible retry layer so nested retries do not multiply load.
Honor server guidance and stop when the remaining budget is inadequate.
Blindly retrying every `UNAVAILABLE` is unsafe: the operation might have
committed before a connection broke. Likewise, `DEADLINE_EXCEEDED` is not
proof of no side effect. Retry enrollment only under its replay contract.

Some gRPC implementations can perform limited transparent retries when they
know the RPC was not processed by application logic; configured retries have
specific commitment rules, including when response headers commit an RPC.
Those mechanisms do not give arbitrary application operations exactly-once
semantics. Verify runtime configuration and the service's own safeguards.

<details class="learning-answer">
<summary>Check: do idempotency keys prevent two different learners taking the last seat?</summary>
<p>No. Keys identify repeated logical requests. The database must also enforce capacity across distinct requests and keys.</p>
</details>

## 6. Four call shapes and their timelines

The same shared contract defines all examples. The progress diagnostics use
lowerCamelCase as in the fixtures; native gRPC sends Protobuf, not JSON.
Each example assumes a successful authorized call and application policy.

### Unary: GetCourse and Enroll

`GetCourse` sends one `GetCourseRequest` and receives one `Course` on
success. It is a read, not a seat reservation. `Enroll` sends one
`EnrollRequest` and receives one `EnrollReply` on success. Its server
transaction changes state. The lost-response example above shows why these
two unary operations need different retry decisions.

1. Client sends `GetCourseRequest` for `course-101`.
2. Server checks access and looks up the current course snapshot.
3. Server sends `Course` with 30 seats, then status `OK`.
4. A later enrollment can change that snapshot before another client acts.

### Server streaming: WatchProgress

`WatchProgress(GetCourseRequest)` returns a stream of `ProgressUpdate`.
For a chosen application scenario, the server sends two updates:

```json
{"courseId":"course-101","percentComplete":20,"eventId":"progress-20"}
```

```json
{"courseId":"course-101","percentComplete":40,"eventId":"progress-40"}
```

1. Client sends the one course request and receives the first 20% update.
2. It receives the 40% update later, in this stream's send order.
3. The server ends the stream with `OK` or a non-OK final status.
4. If the connection breaks after the first event, receipt of the second is
   unknown unless the application has a recovery protocol.

This is a chosen sequence, not a promise that every subscription starts at
20%, replays history, or automatically resumes after failure.

### Client streaming: RecordProgress

`RecordProgress` accepts a stream of `ProgressUpdate` and returns one
`ProgressSummary`. In this scenario both updates above are accepted once,
in order, and the client half-closes its sending direction. The server then
returns the diagnostic summary:

```json
{"acceptedCount":2,"lastPercent":40}
```

A half-close means the client has finished sending, not that it has cancelled
or that the server has already committed. A rejected or repeated event can
change the summary according to an explicitly documented application policy;
the schema alone does not define deduplication. If the final reply is lost,
the client needs a durable event-ID policy to know what can safely be resent.

### Bidirectional: Discuss

`Discuss` accepts and returns streams of `ClassroomMessage`. An illustrative
exchange is:

```json
{"courseId":"course-101","messageId":"message-1","text":"Hello"}
```

```json
{"courseId":"course-101","messageId":"message-2","text":"Welcome"}
```

The client may send message-1, the server may reply with message-2, and
either side may send further messages while the other direction remains
open. The client can finish sending without immediately stopping reads.
A final status ends the call. These IDs are example application identifiers;
no delivery acknowledgement or automatic history is implied by the schema.

For each individual stream direction, messages are delivered in send order.
There is no general total order across the two directions or across separate
RPC streams, and an interrupted stream does not promise all messages arrived.
Do not infer a global classroom sequence from timestamps alone.

<details class="learning-answer">
<summary>Check: does bidirectional streaming impose one total order across both directions?</summary>
<p>No. Each direction preserves its own message order, but the directions and separate RPC streams have no shared total order.</p>
</details>

## 7. Flow control, cancellation and resumption

HTTP/2 flow control manages bytes in flight with stream and connection
windows. It is not a business queue limit, rate policy, or guarantee that a
consumer processed an event. A fast producer can still fill application
buffers if code ignores write readiness. Bound queues and concurrent work,
await or respond to the runtime's write-readiness signal, and read promptly.
Define whether overload blocks, rejects, drops or coalesces updates. Do not
hold a database transaction open indefinitely while waiting for a slow
network reader. Limits should include message size and total stream lifetime.

Cancellation can travel to a server, but server work stops cooperatively.
Handlers and downstream calls should check cancellation and stop expensive
work where safe. Cancellation can race with a commit and cannot undo a side
effect already made. A server may also fail to observe cancellation promptly
if a network path is broken. Clean up stream resources in either case.

Reconnect and resume are **application protocols**, not automatic gRPC
stream guarantees. A robust design may persist a checkpoint after processing
an event, reconnect with a cursor, replay retained events, deduplicate stable
event IDs, and define ordering and retention. The current
`WatchProgress(GetCourseRequest)` has no cursor field, so it does not
provide that protocol as written. The `event_id` helps identify an event but
is not by itself a replay guarantee. An extension would require a compatible
contract and explicit handling of expired checkpoints and duplicate delivery.

<details class="learning-answer">
<summary>Predict: does reconnecting WatchProgress automatically resume at progress-40?</summary>
<p>No. The current request has no cursor and gRPC does not supply automatic application replay. A separate documented resume protocol is needed.</p>
</details>

## 8. Browser, network and deployment tradeoffs

Native gRPC clients can use the full set of four shapes where their runtime
and network support them. Browsers cannot generally use native gRPC's
HTTP/2 framing and trailers directly through ordinary browser APIs.
gRPC-Web is a distinct protocol with a compatible proxy or server and
browser client. Its supported modes and features depend on implementation:
commonly unary and server streaming are supported, while client streaming
and bidirectional streaming are not generally available in browser
implementations. Check the exact client and transport, including whether
server streaming needs a text mode. JSON transcoding or a REST endpoint is
another browser-friendly choice, but must specify its own mapping and errors.

HTTP/2 multiplexes streams over a connection; it does not remove TCP
head-of-line blocking when packet loss stalls the underlying connection.
Compression, serialization, payload size, congestion, connection setup,
application work and proxy behavior all affect latency. gRPC is not always
faster; benchmark representative end-to-end workloads and failure cases.

A long-lived connection can concentrate calls on one backend when balancing
happens only at connection establishment. Depending on the environment,
gRPC-aware layer-7 balancing or client-side balancing with discovery and
health checking can distribute calls more effectively. Verify streaming
behavior, draining, deadlines and retry policies across proxies. Health
checks and discovery are not a substitute for application admission control.

Use TLS and, where appropriate, mTLS to authenticate service identities and
protect traffic. Service identity alone does not authorize `learner-7` to
enroll or read a particular course: enforce operation and field-level
permissions using the caller's trusted identity and the service policy.
Do not send keys or sensitive data in logs merely because transport is secure.

## 9. Observe outcomes, not just requests

Record method, final gRPC status, elapsed time, deadline expiry, bounded
retry count and server-side commit outcome where safe. For streams measure
active streams, duration, message and byte rates, queue depth, write wait,
cancellation and final status; count partial delivery separately from full
success. For enrollment track deduplication hits, fingerprint conflicts,
transaction contention and available capacity. Measure latency percentiles
and saturation, not only averages. Separate caller-observed errors from
server-observed commits to investigate lost replies.

Use trace context or a correlation ID across hops, but limit cardinality in
metrics and avoid logging credentials, full request bodies or raw personal
data. Access-control telemetry, sampling, retention and redaction should
follow privacy policy. A correlation ID is not an authentication credential
or an idempotency key. Test dashboards and alerts against intentional timeout,
overload and cancellation scenarios.

Choose streaming when incremental delivery or interactive work justifies
long-lived connections, backpressure and recovery design. Prefer unary or a
simpler HTTP interface when batches are small, browser compatibility is
primary, or continuous delivery offers little benefit. Neither choice
removes the need to define failures and state transitions.

## Primary references

- [gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/)
- [gRPC status codes](https://grpc.io/docs/guides/status-codes/)
- [gRPC retries](https://grpc.io/docs/guides/retry/)
- [gRPC cancellation](https://grpc.io/docs/guides/cancellation/)
- [gRPC flow control](https://grpc.io/docs/guides/flow-control/)
- [gRPC-Web project](https://github.com/grpc/grpc-web)
- [Protobuf language guide](https://protobuf.dev/programming-guides/proto3/)
- [HTTP/2 RFC 9113](https://www.rfc-editor.org/rfc/rfc9113)
