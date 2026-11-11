# Webhooks and background jobs: accepting is not finishing

This standalone lesson follows authenticated `learner-7` studying
**API Fundamentals**, `course-101`. The earlier independent preview timeline
reported 20% and then 40%; neither update allocates seats, and **40% is not
completion**. Later, a separate completion action produces `completion-42`.
Nothing here infers completion from a preview percentage.

Continue with [push delivery](PUSH-NOTIFICATION-DELIVERY.md),
[realtime recovery and flow](REALTIME-RECOVERY-AND-FLOW.md),
[WebRTC media and connectivity](WEBRTC-MEDIA-AND-CONNECTIVITY.md),
the [guided realtime lesson](../04-GUIDED-REALTIME.md),
[original realtime chapter](../04-REALTIME-COMMUNICATION.md),
[async APIs](../05-ASYNC-APIS.md), [content map](../COURSE-CONTENT-MAP.md),
and [corrections](../CONTENT-CORRECTIONS.md).
The [fixture](../../assets/realtime-lesson-fixtures.mjs) is canonical.

## 1. Problem: an LMS is not a browser tab

Our Course service must inform an external learning management system (LMS)
that a learner completed a course. The LMS exposes an HTTPS callback; our
service sends it an HTTP POST. This is a server-to-server webhook, not SSE
to an open browser. The LMS could be unavailable while the learner's own
completion is already committed. The callback should not require keeping the
learner waiting for the LMS or an email service.

Text diagram, read left to right:

```text
Course completion -> durable outbox -> HTTPS POST -> LMS receiver
                                               -> receipt + job -> worker
```

The outbox and the receiver's job represent separate durability boundaries.
This is one possible design, not a feature supplied automatically by HTTP.

<details class="learning-answer">
<summary>Predict: if the learner closes the browser, must the LMS callback stop?</summary>
<p>No. The sender and receiver are servers; a durable sender outbox can
continue delivery independently of the browser session.</p>
</details>

## 2. Worked exchange: exact bytes and a chosen signing policy

The completion event and the compact UTF-8 body below are exactly the shared
fixture. Whitespace matters to the signature. The learner ID is appropriate
only for an authorized integration; it must not be copied into a push hint.

```json
{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

Assume the sender and LMS explicitly agree on this **lesson policy**; this is
not a universal webhook or provider standard:

1. Use HTTPS to a registered, validated LMS endpoint.
2. `X-Lesson-Timestamp` is an integer Unix timestamp in seconds.
3. `X-Lesson-Signature` is lowercase hexadecimal HMAC-SHA-256 of the exact
   UTF-8 bytes of `${timestamp}.${rawBody}`.
4. An attempt can be at most 300 seconds old and at most 30 seconds in the
   future, both inclusive.
5. The shared `lesson-test-key-not-a-secret` is a public **test-only** key,
   not a credential. Real keys must be generated and protected separately.

For the fixture timestamp `1794391200` (2026-11-11 10:00:00 UTC), the
following signature was calculated with Node's `crypto` from those exact
bytes and that test key. The 105-byte body excludes the displayed final newline:

```http
POST /webhooks/course-completed HTTP/1.1
Host: lms.example
Content-Type: application/json
Content-Length: 105
X-Lesson-Timestamp: 1794391200
X-Lesson-Signature: 221debca7d9a8086942c6d56ca334bcb357f22d689b263b489728cc5f657b10e

{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

The body shown is the entire signed body, without an extra newline. Headers
are metadata; this policy signs the timestamp value and body, not the HTTP
method or URL. Production agreements may need to bind additional context.
The receiver enforces a small configured body-size limit *before* buffering
and rejects malformed or oversized inputs; HTTPS protects the transport.

At receiver time `1794391500`, the difference is exactly 300 seconds and
passes this example freshness policy. At `1794391501` it fails. At receiver
time `1794391170`, the timestamp is exactly 30 seconds in the future and
passes; at `1794391169` it fails. Synchronized clocks matter.
The timestamp is a delivery-attempt timestamp, not the time the course was
completed. A retry may be freshly signed while keeping the same event ID.

The receiver validates the timestamp's integer format and signature format,
computes the expected MAC from the original bytes, decodes fixed-length
signatures, and compares equal-length MACs in constant time. Only after a
valid signature and freshness check does it parse JSON and validate its
schema and permitted event type. Re-serializing parsed JSON before checking
the signature changes the authenticated bytes and is unsafe.

For rotation, associate an agreed key identifier with the signature and accept
the old and new key only during a bounded overlap; retire the old key.
Never log keys. A valid signature authenticates the configured sender and
integrity; **signature is not permission**. Independently authorize that sender
for this integration, tenant, event and learner.

<details class="learning-answer">
<summary>Predict: does adding a space to the signed JSON preserve verification?</summary>
<p>No. Even equivalent JSON has different bytes. Verification must use the
received raw body, not a parsed and re-serialized representation.</p>
</details>

## 3. Endpoint safety and the first acknowledgement

Callback URLs are outbound-request targets, not trusted merely because a
customer entered them. Validate registration and every delivery: require
HTTPS, enforce integration ownership and an allowlist where feasible, reject
loopback, link-local, private and otherwise prohibited addresses, and check
resolved destinations and redirects to prevent SSRF and DNS rebinding.
Constrain redirects, ports, network egress, response size and request time.
Avoid forwarding credentials across origins. A production implementation
needs a network-aware defense, not just string matching.

For this lesson, receiver `204 No Content` means **the verified event receipt
and its job have been durably recorded**. It does not mean the worker ran,
an external email was sent, or the learner read anything. In one database
transaction, insert a unique `(integration, event ID)` receipt and a durable
job, then commit before returning 204. A duplicate with the same event and
payload returns 204 without creating another job. A conflicting payload for
the same scoped ID is quarantined and investigated, not silently accepted.
If the transaction fails, return a retryable failure, such as 503 under the
sender's agreed policy.

No separate “check whether ID exists, then insert” is safe under concurrent
requests. A unique constraint and transaction make the claim atomic. Retain
deduplication records at least as long as the sender's documented retry and
replay horizon; longer retention or reconciliation may be appropriate.
If receipt and job live in different systems, a transactional outbox in the
receipt database must bridge them; an in-memory enqueue is not durable.

<details class="learning-answer">
<summary>Predict: the database commits but the 204 is lost. What happens on retry?</summary>
<p>The sender may retry. The unique durable receipt recognizes the same ID;
the receiver returns 204 without making a second job.</p>
</details>

## 4. Crash windows and effects

Assume completion and its sender outbox row commit in the same transaction.
A crash before commit leaves neither; a crash afterward leaves an outbox row
to deliver. Publishing directly after a database commit without an outbox can
lose the event if the process crashes in between. A publisher may deliver
twice if it crashes after POST but before marking its outbox row delivered;
the receiver's persistent deduplication handles this.

The worker claims jobs using an atomic lease or transaction. If a worker dies,
the lease eventually expires and another worker can retry. Database-local
business effects and the completion marker can be committed atomically with
an effect-specific unique key. For an external email, no local transaction
can atomically commit the remote send: a crash after the provider accepts the
email but before local recording leaves an uncertain outcome. Use a provider
idempotency key if actually supported, reconcile provider status if available,
or explicitly tolerate possible duplicates. Never claim universal exactly-once
external delivery.

A job can fail after receipt was acknowledged. Record attempts, last error,
next attempt and final failure; alert and offer controlled replay. The 204
remains truthful because it promised receipt and a job, not final success.
Authorization failures and malformed events need investigation rather than
unlimited redelivery. Never mark an external effect complete before the
corresponding observed result under the chosen contract.

## 5. Retry and ordering: failure changes the design

Our example sender treats network errors, 5xx and 429 as potentially
transient. Respect a valid `Retry-After` for 429 or 503, subject to a stated
overall delivery deadline and operational policy; otherwise use bounded
exponential backoff with jitter. Cap the delay, attempts and total age to
avoid synchronized retry storms. When the budget expires, put the event in a
dead-letter or failed-delivery store and alert; reconcile against authoritative
completion records and permit a controlled replay.

For this integration, 401 or 403 is an authentication/authorization or
configuration problem: stop automatic retries and alert for key, endpoint,
or permission repair. Other 4xx responses require a documented policy;
some providers make different choices. A 2xx is success only according to
the receiver's contract. Neither HTTP nor webhooks guarantee that all
providers retry forever, preserve exact order, or retry every status.

If progress 40 arrives before progress 20, “last arrival wins” could roll the
display backward. A timestamp alone is not always an ordering authority:
clocks differ and concurrent updates exist. If the producer supplies a
monotonic business version within the relevant learner/course scope, compare
and atomically apply only a newer version. Otherwise fetch current authorized
truth from the source rather than inventing an order from arrival time. The
fixture's progress events have no business version; `completion-42` is a
separate event, not an update transforming 40 into completion.

<details class="learning-answer">
<summary>Predict: the LMS receives 40 then 20 without a trustworthy version. Should 20 overwrite 40?</summary>
<p>No. Fetch the current authoritative state, or use a producer-defined
monotonic version scoped to that learner and course if one exists.</p>
</details>

## 6. Queue, retained stream and batch: the substantive choices

A queue is a way to distribute work, not a magic guarantee of execution.
Imagine `SendCompletionEmail` as a command: it asks one logical worker group
to perform a specific task for a particular recipient. Several worker
instances can compete for work, but the queue's delivery, visibility timeout,
acknowledgement and retention rules depend on its implementation. A worker
may receive a message more than once if it crashes or its lease expires.
“One worker at a time” is a desired coordination model, not proof that one
external email is ever sent exactly once. Make the effect idempotent where
possible and observe failures.

An event such as `course.completed` is a fact that occurred, not an
instruction for a specific downstream task. Different consumers may care:
certificates, analytics, notifications and the external LMS integration.
Do not assume the same ordinary competing-consumer queue automatically
broadcasts a copy to each of those services. It may require separate queues,
subscriptions or explicit routing. A retained stream can allow multiple
independent consumer groups to read the same event, each maintaining its own
position. Within one group, instances typically share partition work; another
group can independently process the same event. Exact routing, ordering and
replay behavior is product and configuration dependent.

Retention enables replay only while the data remains available and access is
allowed. A consumer's offset is not a business-effect receipt. If a consumer
performs a database update then crashes before committing its offset, replay
may repeat that update. If it commits its offset first and then crashes, the
update may be lost. Coordinate a local durable effect with its processing
marker, or make it idempotent; external side effects require their own
idempotency and reconciliation strategy. Replaying a whole stream can also
produce outdated actions, so choose replay scope and effect policy carefully.
Ordering is normally limited to a documented partition or key, not across
every learner, every worker and every service. Keying by learner and course
may help only if the chosen system actually guarantees that ordering.

Delivery, processing, and an external effect are three distinct milestones.
The broker's acceptance says it accepted a message under its durability
configuration. Delivery says a worker received it. A worker acknowledgement
may mean it recorded processing according to that worker's contract. An
email provider accepting a send is still not inbox delivery or a human read.
Instrument each boundary separately with event ID, scoped recipient, attempts
and timestamps; avoid logging learner secrets. Monitor oldest pending age,
failure rate, retry count, consumer lag and dead-letter volume, not merely
queue length. Alert on missed business deadlines and periodically reconcile
against the completion database.

Buffering absorbs a temporary mismatch; it does not create capacity. Suppose
10 jobs arrive per second and workers finish 4 per second, consistently.
The backlog grows by 6 jobs per second: after 60 seconds it has grown by
360 jobs, ignoring initial backlog and variability. A finite queue eventually
fills. If arrivals later remain at 2 per second while capacity stays 4,
the spare 2 per second drains those 360 jobs in at least 180 seconds.
To recover, provision headroom, reduce arrivals, reject or defer work, or
change the service objective. Capacity, provider quotas and storage are
bounded; backpressure and admission control matter. Scaling workers beyond a
provider's rate limit can worsen retries.

Batch processing groups items by time, count or another threshold, for example
a nightly reconciliation of LMS receipts. It can reduce per-item overhead,
but adds waiting time, resource spikes and partial-failure complexity.
Record per-item outcomes, retry only appropriate failed items, and make
re-running the batch safe. A batch might run as a background job, or a small
batch might be processed synchronously; batching describes grouping, whereas
asynchrony describes whether the caller waits. Similarly, polling describes
how status is observed, not whether the work is batched. A queue can feed
individual jobs or batches; a stream can feed a batch consumer.

Async is not automatically better. If the caller needs an immediate
authorization decision or the operation is tiny and predictable, a bounded
synchronous call can be simpler and give a useful answer immediately. Async
adds durable state, retry logic, monitoring, delayed consistency and a way to
surface failure. Choose it when delay is acceptable and the availability,
capacity or latency requirement justifies these costs. An accepted task can
still end in failure. Retained streams are useful for multiple independent
consumers and replay, while a simple queue can be enough for a single work
distribution problem; neither name by itself guarantees exactly-once effects.

<details class="learning-answer">
<summary>Predict: can a queue with four jobs/second capacity keep up with ten arrivals/second?</summary>
<p>No. Backlog grows by six jobs per second until arrival rate falls or
capacity rises. A buffer only buys time.</p>
</details>

## 7. A report job: accepted is not done

For a long report, choose an authenticated job resource:

The following are header/body excerpts; authentication and HTTP framing
metadata are omitted to focus on the job's acceptance and status contract.

```http
POST /reports HTTP/1.1
Content-Type: application/json

{"courseId":"course-101"}
```

```http
HTTP/1.1 202 Accepted
Location: /reports/report-job-1
Content-Type: application/json

{"id":"report-job-1","status":"queued"}
```

Under this example contract, 202 means the job was durably accepted, not
that a report exists. The client polls the authorized `Location`; it might
observe `queued`, `running`, and eventually `succeeded` or `failed`. Some
states may be skipped between polls. A failed response should expose a safe
reason and recovery guidance, not a secret stack trace. If successful, the
resource can point to an access-controlled report with an expiry policy.
Optional SSE can announce status changes to an active client, but reconnect
and polling must still recover the current authoritative state.

Repeated POSTs can create duplicate reports unless this API defines a scoped
idempotency key and durable request fingerprint. Poll at a reasonable
interval and honor any server guidance. This HTTP status resource is not a
webhook: the client asks for status; the callback is a separate server POST.

<details class="learning-answer">
<summary>Predict: a report returned 202. Can its final status be failed?</summary>
<p>Yes. Acceptance means scheduled according to the contract, not successful
execution. Poll the job resource to learn the eventual outcome.</p>
</details>

## 8. Choose, practice and explore

Use webhooks when independent servers need event notification and can agree
on authentication, retry and recovery. Avoid them as the sole authority when
delivery gaps cannot be reconciled, or when the receiver cannot safely expose
an endpoint. Use a durable queue when deferred work needs controlled
distribution; a small synchronous operation may not warrant it. Use a
retained stream when independent groups need replay and its operational cost
is justified. Use batch when throughput or reconciliation benefits outweigh
latency and partial-failure complexity.

<details class="learning-answer">
<summary>Exercise: a worker sends email, crashes, and then retries. Is one email guaranteed?</summary>
<p>No. The remote provider might have accepted the first send. Use supported
provider idempotency, reconciliation, or accept and communicate duplicate risk.</p>
</details>

<details class="learning-answer">
<summary>Exercise: a signed event is valid but belongs to another tenant. Process it?</summary>
<p>No. Verify the sender's authorization for the tenant and event separately
from the cryptographic signature.</p>
</details>

<details class="learning-answer">
<summary>Exercise: the receiver returns 204 and its job permanently fails. Was 204 a lie?</summary>
<p>Not under this receipt-and-job contract, provided both were durable before
the response. Surface the later failure and reconcile; do not claim email was sent.</p>
</details>

Primary references: [HTTP semantics and 202](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3),
[HMAC](https://www.rfc-editor.org/rfc/rfc2104),
[GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
[Stripe webhook retries and ordering](https://docs.stripe.com/webhooks),
and [Kafka consumer concepts](https://kafka.apache.org/documentation/#intro_consumers).
Provider documentation defines its own policy; these examples do not override it.
This static lesson is free to study; real queues, storage, network delivery,
and WebRTC TURN infrastructure can incur costs.
