# Phase 4 — Follow course progress in real time

The [Phase 3 guided RPC journey](03-GUIDED-RPC-AND-GRPC.md) introduced
streaming. Now follow a browser receiving progress and decide when a stream,
ordinary requests, or another delivery method fits. This is a fictional,
static, free course: the example endpoints are **not running APIs**.
HTTP snippets are explanatory excerpts unless stated otherwise. Omitted
credentials and framing fields do not make real authentication or HTTP
message framing optional.

**Explicit reset:** independent of every previous enrollment timeline,
`course-101`, **API Fundamentals**, has 30 available seats and authenticated
`learner-7` has no enrollment. The platform permits preview progress without
enrollment. The progress changes from 20% to 40%; neither update reserves
or changes seats. The shared [fixtures](../assets/realtime-lesson-fixtures.mjs)
define the example events. The IDs are opaque identifiers, not percentages,
timestamps, or values clients should sort.

Read this guide alongside the complete
[original Phase 4 reference](04-REALTIME-COMMUNICATION.md),
[content map](COURSE-CONTENT-MAP.md), and
[corrections ledger](CONTENT-CORRECTIONS.md). Each prediction is closed
until you choose to reveal its reasoning.

## Route through the complete original

The original contains 140 headings. The families below point to the unchanged
full reference, including its diagrams, subsections, summaries and completion
material; they are not claims that this shorter guide reproduces each heading.

| Original family | Guided route | Complete source |
| --- | --- | --- |
| Quick reference and contents; Part 1: big problem, polling, long polling, SSE, WebSocket, chat and failure modes | [Choice](#rt-choice), [polling](#rt-polling), [long polling](#rt-long-polling), [SSE](#rt-sse), [WebSocket](#rt-websocket), [recovery](#rt-recovery) | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |
| Part 2: webhooks, duplicate events, receiver downtime, fake senders, ordering | [Next choices](#rt-next) and [webhooks and jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md) | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |
| Part 3: queues, analogy, architecture, systems, streams, completion, sync vs async, rules | [Next choices](#rt-next) and [webhooks and jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md) | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |
| Part 3: batch processing, use cases, batch vs real time, API design and fit; real-world examples, comparison, architecture and decision framework, summaries | [Next choices](#rt-next) | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |
| Part 4: push problem, platforms, tokens, payloads, fanout, queues, examples, failures and comparison | [Push delivery](lessons/PUSH-NOTIFICATION-DELIVERY.md) | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |
| Part 5: WebRTC, peers, NAT, STUN, ICE, TURN, signalling, SFU, MCU, failures and comparison | [Media and connectivity](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md) | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |

<span id="rt-choice"></span>
## Step 1 — Start with the actual freshness requirement

The course page already knows its latest progress snapshot:

```json
{"courseId":"course-101","percentComplete":20}
```

Later, the server records an absolute 40% preview-progress state for this
learner and course. The browser has an old snapshot until it asks again or
receives an update. Reading progress is not enrolling; seats remain 30.
Authentication identifies `learner-7` separately from the course identifier.

**Requirement.** Progress may be up to roughly 30 seconds old. A repeated
HTTP GET is the simplest first candidate. The server answers each request;
a new representation need not arrive until the next request.

**Changed requirement.** If the page needs a near-live display while it is
open, consider long polling or a server-to-client SSE stream. If the classroom
also has frequent messages in both directions, consider WebSocket. None is
an automatic upgrade: operational capacity, browser support, failure policy
and acceptable staleness matter.

| Need | Starting choice | Important limitation |
| --- | --- | --- |
| Occasional status, 30-second delay acceptable | Polling | repeated requests and stale display |
| One-way updates, streaming unavailable | Long polling | many waiting requests and reissue gaps |
| One-way updates to an open page | SSE | no client messages on the event stream |
| Frequent two-way classroom messages | WebSocket | connection operations and recovery |

For a small library page whose inventory changes once a day, polling every
30 seconds may itself be excessive. A normal fetch on page load or a
less frequent refresh may be sufficient. Ask what users need before choosing.

The choices differ in who initiates each exchange. With polling, the browser
initiates each new request; with long polling it still initiates a request,
but the server delays its reply. With SSE the browser initiates one HTTP
request and the server can send multiple events in its response. WebSocket
establishes a bidirectional channel, after which either side may send.
None of these descriptions says that the browser is always online.

The seat snapshot and progress snapshot also have different meanings. A
progress message is a statement about one learner's preview state; it is not
a command to reserve a seat. A page may display both values, but the
authorization and update rules for each remain separate. Do not copy the
previous enrollment journey's 29-seat result into this independent scenario.

<details class="learning-answer">
<summary>Predict: should the platform replace an acceptable 30-second poll with a socket just because sockets exist?</summary>
<p><strong>Reasoning:</strong> No. Keep polling if measured staleness and load meet the requirement; a persistent connection adds operating and recovery work without necessarily improving the experience.</p>
</details>

<span id="rt-polling"></span>
## Step 2 — Poll an ordinary resource

The browser sends this fictional request on a 30-second interval:

```http
GET /courses/course-101/progress HTTP/1.1
Host: learn.example
Accept: application/json

```

Assume the request at time zero returns 20%. At time 5 seconds the server
commits 40%. The next scheduled request starts at time 30 and, assuming
an immediate response and a fresh read, observes 40%: the change was hidden
for **25 seconds**. Network, scheduling, cache and processing delays can
increase that interval; a 30-second interval is not a hard freshness guarantee.

```json
{"courseId":"course-101","percentComplete":40}
```

Conditional requests such as `If-None-Match` can return `304 Not Modified`
when the authorized representation is unchanged. They reduce response bytes,
not the number of requests. Choose caching rules appropriate for private
learner data and authorize before returning either a representation or a
conditional response. Do not treat an ETag as an authorization credential.

For 1,000 active clients with a 30-second interval, the idealized average
is `1000 / 30 = 33.33` requests per second. It is not a peak: if all clients
start together, 1,000 requests may arrive in a short burst every 30 seconds.
Randomized initial offsets and bounded jitter spread load, while timeouts,
retry limits, rate limits and admission control handle failures. Jitter can
also alter freshness; do not sell the average as a capacity guarantee.

**Changed requirement.** If requests are cheap and a modestly stale status
is fine, retain polling; if the team requires faster updates, evaluate the
extra resources of an open request or stream. Measure before switching.

<details class="learning-answer">
<summary>Predict: can 33.33 requests per second be the maximum in this example?</summary>
<p><strong>Reasoning:</strong> No. It is the average over the interval. Synchronized clients can produce a much larger instantaneous burst, and retries can add more.</p>
</details>

<span id="rt-long-polling"></span>
## Step 3 — Hold a request until change or timeout

Long polling is still HTTP request/response. The browser asks for progress;
the server holds that request until the representation changes or a selected
timeout expires. Here the chosen hold is **25 seconds**, below a configured
proxy timeout with room for network and processing. The actual safe value
depends on every proxy and the application's lifecycle.

If a request at time zero sees 20% and the update commits at time 5, the
server can return 40% then. The browser processes the response and promptly
reissues a request. If nothing changes for 25 seconds, the server sends the
documented timeout response and the client reissues; a conditional request
can return 304 under the chosen contract. Authentication and authorization
apply on each request, including conditional responses.

The server must account for many active held requests, file descriptors,
memory, cancellation, per-user limits and proxy timeouts. HTTP/2 streams can
share a network connection, but the held requests still consume resources.
Use bounded retry with jitter after failures, not an uncontrolled tight loop.
The browser may be suspended or leave the page; clean up abandoned requests.

For a concrete timeout trace, suppose the first request finds no update
before its 25-second hold ends. The server answers according to the agreed
contract, and only then does the client issue another request. A change at
second 26 can be returned by that second request once it reaches the server.
If the client's network disappears between those requests, the client needs a
recovery policy, not an assumption that the first request is still waiting.
Long polling trades repeated empty responses for more time spent holding
resources; whether it is cheaper depends on traffic and implementation.

**Limitation.** The interval between one response and the next request,
network delays, disconnects, and server failures mean no zero-delay or
gap-free guarantee. If every change matters, a cursor and retained history
are needed; polling only current state cannot reconstruct intermediate events.

**Changed requirement.** Long polling is useful when one-way updates should
arrive sooner but streaming infrastructure is unavailable. If an open stream
is supported, SSE can avoid issuing a fresh request after every update.

<details class="learning-answer">
<summary>Predict: does a 25-second long-poll timeout mean every update is observed within 25 seconds?</summary>
<p><strong>Reasoning:</strong> No. It limits a chosen server hold, not network, proxy, reconnect, processing, or reissue delays; missed intermediate changes need a replay contract.</p>
</details>

<span id="rt-sse"></span>
## Step 4 — Stream named progress events with SSE

SSE sends a UTF-8 `text/event-stream` response over HTTP. Its fields are
lines; a blank line dispatches an event. The leading comment below is a
keepalive, not a progress event. This exact body comes from the
[shared fixture](../assets/realtime-lesson-fixtures.mjs):

```text
: keepalive

id: progress-20
event: progress
data: {"courseId":"course-101","percentComplete":20}

id: progress-40
event: progress
data: {"courseId":"course-101","percentComplete":40}

```

Each `id` is a cursor supplied by the server, `event` selects the event
type, and `data` contains JSON text. SSE is a text framing format, not a
JSON array or raw WebSocket frame. A production stream can remain open
and send more events or comments. Configure proxies to avoid buffering and
to allow the expected stream duration, and arrange keepalives and lifecycle
cleanup. Comments do not dispatch application events.
This protected stream and its recovery snapshot use a private, no-store
response policy so shared caches must not reuse one learner's state.

For an authenticated same-origin page, a browser's native `EventSource`
can use same-origin cookies. This illustrative listener handles the named
event, not `onmessage`:

```js
const source = new EventSource("/courses/course-101/progress/stream");
source.addEventListener("progress", event => {
  const progress = JSON.parse(event.data);
  console.log(event.lastEventId, progress.percentComplete);
});
```

The browser normally reconnects after a transient stream failure. Native
`EventSource` does not allow arbitrary request headers; do not put bearer
tokens in URLs, which can leak into logs and history. If headers are required,
an authenticated `fetch` stream with an appropriate SSE parser is one
alternative, but the application must implement reconnect and cursor handling.
Cross-origin cookie use requires deliberate credentials and CORS policy; it is
not the same as authorization.

The stream's data is scoped to the authenticated learner and the selected
course, even though the example payload does not include a learner ID.
Authentication and ownership checks happen before the server reveals data.
On session expiry, the service must stop serving protected events and the
client must reauthenticate according to its application policy. A heartbeat
comment can keep infrastructure aware of an active stream; it does not
prove that a learner processed the last progress event.

**Changed requirement.** If the browser must send frequent classroom messages,
SSE alone is not full duplex. A normal POST can accompany SSE for occasional
commands; WebSocket may fit frequent two-way traffic.

<details class="learning-answer">
<summary>Predict: will the named progress event arrive through an onmessage handler?</summary>
<p><strong>Reasoning:</strong> No. <code>event: progress</code> dispatches a named event; use <code>addEventListener("progress", ...)</code>. Unnamed message events use <code>onmessage</code>.</p>
</details>

<span id="rt-websocket"></span>
## Step 5 — Switch to full-duplex classroom conversation

Now the open classroom needs frequent messages from learners and the server.
WebSocket provides bidirectional messages on a persistent connection.
Use `wss://` in production for TLS protection. This is a different need,
not a requirement to replace the one-way progress stream.

The following is an illustrative **HTTP/1.1 Upgrade** handshake, using the
shared fixture's RFC example key and accept value. It is not the only
transport establishment mechanism; HTTP/2 and HTTP/3 have other mechanisms.

```http
GET /classrooms/course-101 HTTP/1.1
Host: learn.example
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

```

The accept value is Base64(SHA-1(key concatenated with the WebSocket GUID)).
It confirms the intended upgrade protocol, not the user's identity. The
server still authenticates and authorizes `learner-7` for the classroom.
Check the browser's Origin against an allowlist to defend against unwanted
cross-origin use, but Origin is **not identity**. Plan for session expiry,
revocation and resource ownership throughout a long-lived connection.

After the handshake the client sends the shared classroom payload:

```json
{"courseId":"course-101","messageId":"message-1","text":"Ready for class"}
```

The server can send the next classroom message independently:

```json
{"courseId":"course-101","messageId":"message-2","text":"Welcome"}
```

These are JSON **payloads**. WebSocket has its own binary frame format,
including opcode, length and masking; it is not raw JSON pasted onto TCP.
Clients mask frames; masking is not encryption. TLS provides transport
confidentiality and integrity. Frames can be fragmented, and network reads do
not necessarily align with frames; use a maintained implementation rather
than treating this example as a general parser.

A protocol Ping/Pong is a WebSocket control-frame exchange. Browser
JavaScript cannot directly send a protocol Ping with the native API:
`socket.send("ping")` sends an application data message. Define an
application-level heartbeat response if needed, separately from any
server-controlled protocol Ping/Pong.

**Changed requirement.** If only occasional messages are needed, ordinary
POST requests plus SSE may be simpler. A socket's openness alone does not
prove that a peer received, processed, or durably stored any message.

<details class="learning-answer">
<summary>Predict: does client masking keep a classroom message secret from the network?</summary>
<p><strong>Reasoning:</strong> No. Masking is part of WebSocket framing, not encryption. Use WSS/TLS and proper authentication and authorization.</p>
</details>

<span id="rt-recovery"></span>
## Step 6 — Recover deliberately and bound flow

Suppose the learner received `progress-20`, then disconnected before
`progress-40`. If the server has retained an authorized log for this learner
and course, it can replay the later record after `progress-20`. The shared
example retention window (`progressRetentionSeconds`) is 300 seconds; a real service must document its
actual policy and storage. Opaque cursor IDs must be looked up in that log,
not numerically or lexicographically sorted.

Native EventSource sends `Last-Event-ID` when it reconnects after receiving
an event with an ID. That is a browser-maintained protocol cursor,
not a business acknowledgement or proof of durable application processing.
Our progress IDs accompany data; an ID-only block can also advance a browser's
cursor without dispatching an application message, as the deeper lesson explains.
If the cursor is unknown, expired, or out of scope, this example server sends
a named `reset` event and closes the stream. The reset listener must call
`close()`, fetch an authenticated snapshot with an atomic cursor, then open a
new EventSource using the snapshot cursor in an application `after` parameter.
The server replays records committed after that cursor, covering a change
between snapshot and subscription while the log retains it.

Native EventSource does not expose response status like Fetch. A generic HTTP
409 cannot magically trigger that reset listener. The explicit `reset` event
is sent as a valid event-stream response; a server which instead uses HTTP
errors needs a separate status-aware fetch or preflight protocol.
If the new cursor expires before reopening, repeat recovery within a bounded
policy or surface an error. Reauthorization and scoped cursor validation
apply to both snapshot and stream.

Events can be duplicated around reconnects. Deduplicate business operations
by their stable IDs where needed, and make processing idempotent. One
connection preserves its own message order, but that is not a global order
across publishers or across reconnects. Persistent sockets do not supply
durable delivery, business ACKs or exactly-once processing by themselves.
Define explicit acknowledgements and durable state if the business needs them.

`WebSocket.bufferedAmount` counts queued **outgoing** bytes, not incoming
traffic or server processing. Native browser WebSocket has no inbound
backpressure API. Bound application queues and use admission limits; coalesce
absolute progress updates only when the contract needs current state rather
than every transition. Never silently coalesce classroom messages that must
all be processed. Disconnect a slow consumer and resume from a retained log,
or resnapshot if the log has expired. Use bounded exponential backoff and
jitter, a retry budget, and a visible terminal state rather than infinite
fallback between protocols.

Multi-instance deployment needs a plan for fanout or session routing and
shared durable state/logs where recovery requires them. Sticky sessions are
one possible routing choice, not a universal requirement. The detailed
[recovery and flow lesson](lessons/REALTIME-RECOVERY-AND-FLOW.md) works through
the race, cursor expiry, ordering, and bounded queues.

Consider the failure boundary explicitly: the server may commit 40% and
disconnect before the browser receives it. A replayable log can supply the
missing record on reconnect. If the browser received the event but failed
before saving a business effect, the transport cursor alone cannot prove
that effect happened. For a current-state display, an authorized snapshot
can reconcile the UI; for required per-event work, define durable
acknowledgement and idempotent processing instead.

<details class="learning-answer">
<summary>Predict: if the browser dispatched progress-40, has the application definitely saved it?</summary>
<p><strong>Reasoning:</strong> No. Last-Event-ID tracks browser dispatch, not a durable business acknowledgement; a crash before application persistence can still require reconciliation.</p>
</details>

<span id="rt-next"></span>
## Step 7 — Choose the delivery boundary, not a fashionable protocol

The same completion of `course-101` can lead to different work. Do not use
one channel as a substitute for all of them:

| Requirement | Choice and why | Continue |
| --- | --- | --- |
| Tell an external partner's service | Webhook: an HTTP callback across organizations; authenticate and handle duplicates | [Webhooks and background jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md) |
| Generate a certificate later | Queue/job: decouple slow work from the request; retries need idempotency | [Webhooks and background jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md) |
| Wake an inactive device | Push via platform provider: a hint to fetch authorized state, not a guaranteed live stream | [Push notification delivery](lessons/PUSH-NOTIFICATION-DELIVERY.md) |
| Classroom audio/video | WebRTC media: real-time media path with signalling and possible relay | [WebRTC media and connectivity](lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md) |
| Aggregate yesterday's course metrics | Batch: scheduled bulk processing, acceptable when results need not be immediate | [Original Phase 4](04-REALTIME-COMMUNICATION.md) |

Each branch has delivery failures, privacy and resource constraints of its
own. A webhook is not a browser stream; a queue is not automatically an
ordered replay log for every consumer; a push notification is not proof the
learner saw anything; WebRTC can use a relay rather than direct peer-to-peer.
The [guided async API journey](05-GUIDED-ASYNC.md) is the next comparison.
The [original async API chapter](05-ASYNC-APIS.md) remains available in full.

**Transfer.** A small library tracks book availability. If librarians accept
a daily refresh, a page-load GET or slow polling is a good starting point.
If the public catalogue must immediately show changes, an authorized live
update channel may help; if two staff members edit concurrently, add conflict
control rather than assuming a socket resolves concurrent writes. For an
offline patron reminder use a notification system, not an always-open tab.

<details class="learning-answer">
<summary>Predict: does switching to WebSocket guarantee that an offline learner sees completion?</summary>
<p><strong>Reasoning:</strong> No. A disconnected socket cannot deliver to the inactive device. A push hint and later authorized fetch may help, but delivery and user visibility are still not guaranteed.</p>
</details>

Return to the [original Phase 4](04-REALTIME-COMMUNICATION.md) for all 140
headings, or revisit the [Phase 3 guide](03-GUIDED-RPC-AND-GRPC.md) to compare
gRPC stream lifecycles with these browser-facing choices.
