# Real-time lesson: recovery and flow

This standalone lesson continues the
[guided real-time journey](../04-GUIDED-REALTIME.md).
Read the [original Phase 4 reference](../04-REALTIME-COMMUNICATION.md),
[Phase 3 guide](../03-GUIDED-RPC-AND-GRPC.md),
[content map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md) for the wider context.
The [shared fixtures](../../assets/realtime-lesson-fixtures.mjs) are the
source for the values below. This static, free course describes fictional
endpoints; no running API is implied.

**Explicit independent reset:** `course-101`, **API Fundamentals**, has
30 available seats. Authenticated `learner-7` has no enrollment, independently
of all earlier enrollment timelines. Preview progress can be recorded before
enrollment. The updates from 20% to 40% do not reserve or change seats.
The examples assume absolute progress is current state; change that contract
and some optimizations below cease to be safe.

## Lesson route

- [Understand dispatch and acknowledgement](#recovery-dispatch)
- [Replay a retained, scoped log](#recovery-replay)
- [Reset and close an expired cursor](#recovery-reset)
- [Close the snapshot race](#recovery-snapshot)
- [Control duplicates and ordering](#recovery-order)
- [Bound slow consumers and retries](#recovery-flow)
- [Operate securely across instances](#recovery-operations)

<span id="recovery-dispatch"></span>
## 1. Dispatch is not business acknowledgement

A connection allows bytes to be exchanged while it works. It does not record
whether the learner's application processed a message, performed a side
effect, or durably stored the result. Those are different events at different
places, and a crash can happen between any two of them.

Consider this SSE body, exactly matching the shared fixture:

```text
: keepalive

id: progress-20
event: progress
data: {"courseId":"course-101","percentComplete":20}

id: progress-40
event: progress
data: {"courseId":"course-101","percentComplete":40}

```

The comment line is a keepalive, not an event. A blank line ends each event.
The server's `id` is opaque; its spelling looks like a percentage here only
for readability. Do not derive sequence, time, or business state by sorting it.
The named `progress` event is handled with
`addEventListener("progress", handler)`, not `onmessage`.

Native EventSource maintains an event-stream ID for automatic reconnection and
may send it as `Last-Event-ID`. That protocol position is not a business ACK:
a handler can fail or the page can crash before its own durable write.
In our progress stream every ID accompanies data. More generally, an ID-only
block ending in an empty line can update the browser's reconnect cursor without
dispatching an application message. The
[HTML event-stream rules](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)
update that cursor before checking whether the data buffer is empty.
Even an explicit receipt ACK only means what its contract says; processing
and durable commit might still be pending.

If a business action must happen once, design its transaction, deduplication
key, acknowledgement point and retry behavior explicitly. For this preview
UI, fetching current authorized state after uncertainty can be sufficient;
it is not equivalent to processing every historical transition.

**Changed requirement.** If the application must audit each progress change,
persist and acknowledge each required event, and retain sufficient history.
An event stream alone does not provide exactly-once business processing.

<details class="learning-answer">
<summary>Predict: if Last-Event-ID is progress-40, is the UI's durable storage guaranteed to contain 40%?</summary>
<p><strong>Reasoning:</strong> No. The browser has dispatched an event with that ID, but the application may have failed before saving its own state.</p>
</details>

<span id="recovery-replay"></span>
## 2. Replay only from a retained, authorized log

Assume the service maintains a durable log scoped to the authenticated
learner and course. Its defined ordering is commit order within this scope.
The example has its own 300-second `progressRetentionSeconds` policy from the
[fixture](../../assets/realtime-lesson-fixtures.mjs); it is an example policy,
not an SSE guarantee. A production service specifies precisely when expiry
starts and whether all records needed to continue remain available.
In this example, a record expires when its age reaches 300 seconds from
commit. That is a separate policy from the webhook's inclusive signature-age
window, even though both happen to use 300 seconds.

| Log order | ID | Absolute state |
| --- | --- | --- |
| first | `progress-20` | 20% |
| second | `progress-40` | 40% |

The learner sees `progress-20` then loses the connection before receiving
`progress-40`. If `progress-20` is still a valid cursor and the continuation
is retained, the server finds it in that scoped log and replays the record
after it: `progress-40`. It must not infer the order by comparing ID strings.
The server may then attach the connection to live delivery without a gap:
the replay-to-live handoff must itself be ordered with publication.

The stream endpoint authenticates the connection and verifies the caller may
read `course-101` progress for `learner-7`. A cursor from a different
learner or course is invalid in this scope even if its literal ID exists
elsewhere. Avoid leaking another learner's existence in an error response.
An opaque cursor is a position, not an access token.

Automatic reconnect uses `Last-Event-ID` when available. For a newly created
EventSource after snapshot recovery, this example also defines an `after`
query parameter. The server uses a nonempty `Last-Event-ID` in preference to
`after` on automatic reconnect; otherwise it uses `after`. Both are validated
as scoped cursors. This prevents a reconnect from repeatedly restarting at the
older snapshot position in the URL. Query parameters may be logged; the
cursor must not contain credentials or sensitive data.

**Limitation.** A server that stores only the latest value can restore
current state but cannot replay every missed transition. A longer outage than
the retention window needs a reset or another documented recovery path.

<details class="learning-answer">
<summary>Predict: can the service replay progress-40 after progress-20 without retaining either a log or an equivalent history?</summary>
<p><strong>Reasoning:</strong> No. The server needs a retained ordered continuation; the SSE protocol does not create one automatically.</p>
</details>

<span id="recovery-reset"></span>
## 3. Treat unknown or expired cursor as an explicit reset

When the requested cursor is unknown, expired, outside the learner/course
scope, or its continuation is no longer available, this example contract
does not guess where to resume. After authenticating, the server sends a
successful `text/event-stream` response with a named reset event, then closes:

```text
event: reset
data: {"reason":"cursor-unavailable"}

```

This reset deliberately has no `id`; it is control information, not a new
position in the progress log. The listener immediately calls `close()` to
stop the old EventSource from repeatedly reconnecting to the same invalid
cursor. It then fetches an authenticated snapshot and opens a new stream
using that snapshot's cursor in `after`.

Native EventSource exposes an error event but does **not** expose HTTP status
to application code like Fetch. Returning only `409 Conflict` is therefore
not a magic reset signal to a native EventSource listener. The explicit
named reset above is delivered in a valid SSE response. An alternative is
a status-aware Fetch preflight or a Fetch-based stream with an SSE parser
and its own reconnect logic; either needs a separately specified contract.

The following is conceptual client control flow, not a complete production
implementation. It shows the important lifecycle; add cancellation, status
handling, finite retry budgets, and safe rendering in an application:

```js
function connect(after) {
  const url = new URL("/courses/course-101/progress/stream", location.origin);
  if (after) url.searchParams.set("after", after);
  const stream = new EventSource(url);
  stream.addEventListener("progress", event => {
    showProgress(JSON.parse(event.data));
  });
  stream.addEventListener("reset", async () => {
    stream.close();
    const response = await fetch("/courses/course-101/progress/snapshot");
    if (!response.ok) throw new Error("snapshot unavailable");
    const snapshot = await response.json();
    showProgress(snapshot.progress);
    connect(snapshot.cursor);
  });
  return stream;
}
```

These are illustrative same-origin cookie-authenticated requests, not a
running service. Handle a rejected fetch and page cancellation in real code;
do not let an unhandled rejection become an endless reconnect loop. A failed
snapshot must not reopen with the invalid cursor.

**Changed requirement.** If arbitrary authorization headers are required,
native EventSource cannot set them. Do not put bearer tokens in the URL;
use same-origin cookies where suitable or a Fetch-based client.

<details class="learning-answer">
<summary>Predict: can a native EventSource reset handler detect an HTTP 409 by reading the response status?</summary>
<p><strong>Reasoning:</strong> No. Native EventSource does not expose that status; use the explicit SSE reset event or a separate status-aware protocol.</p>
</details>

<span id="recovery-snapshot"></span>
## 4. Close the snapshot-to-stream race

A naive recovery fetches 20%, then opens a stream only for new events.
If 40% commits between those two actions, the UI can stay at 20% forever.
The snapshot must return a state and a cursor representing the **same
consistent point** in the scoped history. The stream then replays everything
committed after that cursor before continuing live.

Suppose the consistent snapshot response is:

```json
{"progress":{"courseId":"course-101","percentComplete":20},"cursor":"progress-20"}
```

The server supplies this response atomically or from an equivalent consistent
read of state and log position. Merely fetching a state and later independently
reading the latest cursor is unsafe: a concurrent update could be included in
the cursor but absent from the returned state, so replay would skip it.

| Order | Action | Result |
| --- | --- | --- |
| 1 | Snapshot returns 20% and `progress-20` at the same point | UI displays 20% |
| 2 | Server commits `progress-40` | Log now contains the later change |
| 3 | Client opens stream with `after=progress-20` | Server replays `progress-40` |
| 4 | Server hands off to live events without a gap | UI displays 40% |

This works only while the cursor and continuation remain retained. If the
snapshot cursor expires before the stream is established, the server emits
reset again; retry with bounded backoff and eventually show a recoverable
error rather than looping forever. The server must make snapshot, log
publication and replay-to-live handoff consistent with its storage model.
One implementation might use a transactional outbox and ordered log, but
the guarantee, not a particular product, is the important part.

Client processing can also race with multiple concurrent recovery attempts.
Cancel or ignore stale attempts, close obsolete streams, and apply updates
according to the scoped log's documented version semantics. The example
snippet is a teaching outline rather than a concurrency-safe client library.

**Changed requirement.** For current state alone, resnapshot after uncertainty
may be enough. An audit consumer that must observe each change requires a
durable replay and acknowledgement design with a longer retention budget.

<details class="learning-answer">
<summary>Predict: why not read the latest cursor after fetching the old snapshot?</summary>
<p><strong>Reasoning:</strong> A change between those reads could advance the cursor without appearing in the snapshot; resuming after that cursor skips the change.</p>
</details>

<span id="recovery-order"></span>
## 5. Separate duplicates, ordering and side effects

Suppose the application processed `progress-40` but lost its own acknowledgement.
A replay may include it again. A stable event ID plus durable deduplication can
make the business effect idempotent. The deduplication record and the effect
need compatible atomicity: marking an event processed before its effect
commits can lose work; performing the effect then crashing before recording
deduplication can duplicate work.

For an external side effect, a transactional outbox and receiver-side
idempotency key may be needed. Neither a WebSocket nor SSE automatically
coordinates a remote provider's state with a local transaction. Exactly-once
claims require narrow definitions and assumptions; transport reconnection
is not sufficient.

Within one WebSocket connection, messages in a direction are ordered by the
protocol. That does not establish a total order across concurrent publishers,
multiple connections, or disconnect/reconnect boundaries. SSE likewise
reflects the order in which the server sends events on that response, not an
automatic global business order. Choose a partition, sequencer, or other
ordering rule when order matters.

In the scoped log, `progress-20` precedes `progress-40` because the server's
log says so, not because the IDs have numeric suffixes. A timestamp can tie,
drift or be assigned out of order. An opaque ID can be random. If later
progress may decrease, such as a correction from 40% to 20%, selecting the
largest percentage is also wrong; use documented ordered versions instead.

**Changed requirement.** If each classroom message must be delivered and
processed, keep each message ID and durable acknowledgement policy. Merely
showing the latest message or treating duplicates as harmless loses content.

<details class="learning-answer">
<summary>Predict: do numeric-looking event IDs prove the order of two publishers' commits?</summary>
<p><strong>Reasoning:</strong> No. IDs are opaque and publisher timing may differ; only the declared sequencing or scoped log establishes the chosen order.</p>
</details>

<span id="recovery-flow"></span>
## 6. Bound queues, backoff and slow consumers

If producers generate 10 updates per second and the client processes only
4 per second, an unbounded queue grows by 6 per second. After 100 seconds it
has 600 more queued updates, ignoring other effects. A persistent connection
does not make the processing rate keep up. Set explicit message and byte
limits, including limits for each client and the service as a whole.

Browser `WebSocket.bufferedAmount` measures bytes queued by that browser for
**outgoing** sends. It says nothing about incoming messages waiting for
application work and does not prove a server processed anything. Native
browser WebSocket does not expose inbound backpressure. Application-level
credits, bounded queues, server-side admission and slow-consumer policy are
possible design choices; the protocol does not create them automatically.

For this lesson's absolute current-state progress contract, if the consumer
only needs the latest value, a bounded one-slot queue may replace an unsent
20% with a later 40%. The result is 40%, not the history of both changes.
Do this only if the product explicitly permits dropping intermediate states.
It is unsafe for increment events, financial operations, audit records, or
classroom messages that all need independent processing.

If a bounded queue cannot preserve the required semantics, disconnect the
slow consumer and resume from a durable scoped log. If its cursor has expired,
perform the snapshot/reset policy or surface the inability to recover.
Backpressure must reach a controllable producer or trigger an explicit
overflow policy; buffering indefinitely merely postpones failure.

On disconnect, use a bounded exponential backoff with jitter and a total
attempt or time budget. For example, cap the delay at 30 seconds and stop
after five attempts; the exact values are a chosen policy, not a standard.
Honor server rate limits, pause when appropriate, and present an error after
the budget. Cycling forever between SSE, WebSocket and polling can amplify
an outage. A fallback is useful only when deliberately bounded and its
different freshness and recovery semantics are acceptable.

**Changed requirement.** If the library's book inventory changes rarely,
ordinary conditional polling might use fewer operational resources than
maintaining an event stream. Evaluate actual load and freshness, not labels.

<details class="learning-answer">
<summary>Predict: can a one-slot queue safely replace two required chat messages with the newest?</summary>
<p><strong>Reasoning:</strong> No. The messages are separate required facts, unlike an explicitly coalescible current-state progress value.</p>
</details>

<span id="recovery-operations"></span>
## 7. Secure and operate the lifecycle

Authenticate on connection and authorize the requested learner and course.
Recheck or terminate on session expiry, revocation and ownership changes;
an initially valid long-lived connection is not perpetual permission.
Cookie-based browser connections need appropriate origin and CSRF defenses.
Origin checking helps reject unwanted browser origins but is not user
identity. Never use an opaque event cursor as authorization.

With multiple connection servers, a publisher must reach the instance hosting
the relevant connection, or the instances must subscribe to suitable fanout.
A shared durable log or other external storage may be needed for replay
across instances and crashes. Session routing or sticky sessions are options,
not universally required; sticky routing alone does not preserve events when
an instance fails. Test replays, duplicates, expiry, authorization changes,
slow consumers and node loss under realistic proxy and network conditions.

Monitor connection counts, held requests, delivery lag, queue sizes, reset
rates, replay misses, auth failures and retry exhaustion. Avoid putting tokens
or private learner data into logs. Set limits and alerts against explicit
service objectives. A successful handshake is not evidence that the whole
recovery path works.

For different delivery boundaries, continue with
[webhooks and background jobs](WEBHOOKS-AND-BACKGROUND-JOBS.md),
[push notification delivery](PUSH-NOTIFICATION-DELIVERY.md), and
[WebRTC media and connectivity](WEBRTC-MEDIA-AND-CONNECTIVITY.md).
Compare the [next async chapter](../05-ASYNC-APIS.md).

<details class="learning-answer">
<summary>Predict: do sticky sessions alone make a failed connection server's missed events recoverable?</summary>
<p><strong>Reasoning:</strong> No. Routing is not durable storage; recovery requires retained history or a valid snapshot strategy across instances.</p>
</details>
