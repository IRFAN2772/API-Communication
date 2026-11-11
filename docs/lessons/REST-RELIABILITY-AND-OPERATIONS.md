# REST lesson: reliability and operations

The fictional Course API offers `course-101`, **API Fundamentals**, with 30
available seats. `learner-7` sends an enrollment request; a successful
commit creates `enrollment-42` and leaves 29 seats. This is a teaching
model, not a production implementation or a claim about a real provider.
Each scenario states its own snapshot and assumptions.

Read [HTTP contracts](REST-HTTP-CONTRACTS.md) and
[collections and caching](REST-COLLECTIONS-AND-CACHING.md) for message and
cache semantics. Also see [authentication and evolution](REST-AUTH-AND-EVOLUTION.md),
the [guided REST journey](../01-GUIDED-REST.md),
[original REST reference](../01-REST-APIS.md),
[Phase 0 and its deeper lessons](../00-GUIDED-FUNDAMENTALS.md),
[content map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md).

## 1. A timeout is a limit on waiting, not proof of failure

A **request timeout** limits how long a particular operation or attempt
waits. An end-to-end **deadline** is the latest time by which the caller
needs the overall result, including waiting, retries and downstream work.
Propagate the remaining deadline to dependencies, accounting for transport
and response overhead; a per-attempt timeout must not extend past the
remaining overall budget. Cancellation is a request to stop work, not
proof that a remote side effect did not already commit.

The browser sends:

This header excerpt omits the authentication credential. The server must
still verify learner-7's identity and permission; a retry key alone does
not establish either.

```http
POST /courses/course-101/enrollments HTTP/1.1
Host: learn.example
Idempotency-Key: enroll-7-a
Content-Length: 0

```

In this timeline the client cannot observe the server's middle steps:

| Time | Server reality | Client knowledge |
| --- | --- | --- |
| 0 ms | Request sent | Waiting |
| 100 ms | Enrollment-42 and seat decrement commit | Still waiting |
| 150 ms | 201 response is lost | Still waiting |
| 500 ms | Client attempt times out | Outcome unknown |

Another possible timeline is that the request never arrived and no
enrollment exists. Both can look identical to the client at 500 ms.
Blindly repeating a POST may duplicate an effect. A status lookup or a
documented replay contract can resolve uncertainty; a timeout alone cannot.

<details class="learning-answer">
<summary>Predict: after the timeout, are 30 seats definitely still available?</summary>
<p>No. The client does not know whether the request arrived or committed. In the illustrated timeline the commit already created enrollment-42 and left 29 seats, even though its response was lost.</p>
</details>

## 2. Make a logical enrollment retry identifiable

HTTP idempotency describes intended effect, not identical response bytes.
GET, PUT and DELETE have idempotent method semantics; POST does not
automatically. An application can add a **replay contract** for this
particular POST using a key that identifies one logical intent.
Reusing the same key for the same intent is different from generating a
new key for another intent. A key is not authorization or a secret.

Our contract scopes `enroll-7-a` to authenticated `learner-7` and the
enrollment operation family, not to an individual course. The request has
no body: its semantic fingerprint includes the course target and
authenticated learner. For an operation with a body, define canonicalization
and bind all meaningful payload fields as well. A key reused with a
different fingerprint returns this example API's `409 Conflict`, not a
universal HTTP rule.

For example, after a request to `POST /courses/course-101/enrollments`
claims `enroll-7-a`, the same learner using that key for
`POST /courses/course-102/enrollments` encounters the same scoped record.
The course target changes the fingerprint, so the API returns `409` and
does not create an enrollment in course-102 or change either seat count.
The learner must use a new key for a genuinely new enrollment intent.

The original successful response is:

```json
{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"}
```

In our contract a matching completed retry returns the recorded `201`,
Location and body, without another seat decrement. A replayed 201 reports
the recorded outcome; it does not mean another enrollment was created.

### Concurrency and crash boundaries

Two requests can arrive at once. A naive sequence of “check key absent,
perform effect, save key” lets both pass the check, or allows a crash after
the effect but before the record. A unique constraint or equivalent
coordination must ensure one owner for a scoped key.

For this entirely local enrollment, a transaction can couple the unique
claim, fingerprint, seat availability check, enrollment, decrement and
completed result. The atomic outcome is all committed or none committed;
the database must also enforce the seat invariant under concurrent distinct
keys. If an architecture makes a durable in-progress claim separately,
it needs an ownership/lease and recovery protocol that prevents a second
owner from repeating a committed effect. A matching concurrent request
can wait or receive a documented in-progress response; it must not start
another effect. A different fingerprint conflicts even while in progress.

| Situation | Contract outcome |
| --- | --- |
| Crash before local transaction commits | No enrollment or completed record; retry may perform the first commit. |
| Commit succeeds, response is lost | Matching retry replays enrollment-42; seats remain 29. |
| Matching request arrives during processing | Wait or report in progress under the documented policy; no second effect. |
| Same scoped key, different fingerprint | 409 under this policy; no new effect. |
| Key expires after documented retention | Deduplication is no longer guaranteed; lookup or reconciliation may be necessary. |

Retention must cover the intended retry horizon and be communicated to
clients. A new key may represent a new intent; additional uniqueness rules
for one learner per course are separate business invariants.

<details class="learning-answer">
<summary>Predict: two identical requests arrive concurrently with the same key. Is checking a cache before writing sufficient?</summary>
<p>No. Both can observe a missing key. The server needs a unique claim and a recoverable atomic relationship between the claim, result, enrollment and seat change; an in-progress duplicate must not perform another effect.</p>
</details>

## 3. Remote effects do not fit inside a local transaction

Suppose enrollment later includes a hypothetical external payment. A local
database transaction cannot atomically commit both a remote provider's
charge and the local replay record. Persist a recoverable intent, use the
provider's documented idempotency mechanism where available, record the
outcome, and reconcile uncertain or missing results. The exact protocol,
key retention and query capabilities depend on that provider. If the
provider cannot deduplicate or report an outcome, do not claim exactly-once
charging: design manual or automated reconciliation and user-visible
pending states.

A separate hypothetical UPI transfer illustrates the same uncertainty:
the app shows “processing,” the network fails, and the transfer may or may
not have completed. A transaction reference and the payment system's
documented status/reconciliation process can help resolve it. This is a
conceptual example, not a verified description of any particular UPI
provider's architecture or a guarantee about its implementation.

<details class="learning-answer">
<summary>Predict: does a local transaction guarantee an external charge occurs once?</summary>
<p>No. The provider may complete the charge before the local process records its result. Provider cooperation, durable recovery and reconciliation are needed; their guarantees depend on the actual provider contract.</p>
</details>

## 4. Retry only when both outcome and time permit

Retries can recover transient failures but also amplify load. Classify
failure before retrying: malformed input, a denied permission, and a
payload conflict normally require a change rather than repeating the same
request. A transient connection failure, selected 5xx, or a 429 after the
server's applicable `Retry-After` delay may be retryable if the operation
is safe to retry and there is sufficient remaining deadline and budget.
An ambiguous write needs a replay contract or status resolution, not an
assumption that a timeout means failure.

Use a bounded **retry budget**, exponential backoff and jitter so clients
do not synchronize. Respect the remaining deadline, limit total attempts,
and choose one layer to own retries; independently retrying at multiple
layers multiplies attempts. A retry budget limits extra calls; a token
bucket can implement one by replenishing retry tokens over time and
allowing a bounded burst. A retry token is not the same thing as an OAuth
access token.

Worked policy: total deadline 1000 ms, at most two attempts, and at least
200 ms must remain to start the next attempt. The first attempt times out
at 400 ms. A selected jittered delay of 100 ms leaves 500 ms, so a matching
key retry can start. If instead the first attempt ends at 850 ms, even a
100 ms delay leaves only 50 ms: do not start a second attempt.
These are illustrative policy numbers, not universal timeouts.

<details class="learning-answer">
<summary>Predict: should the client retry a 403 immediately with the same credentials?</summary>
<p>No. A permission denial is not normally transient. Repeating it adds load without changing authority; the caller needs an appropriate policy or credential change, not automatic retry.</p>
</details>

## 5. Circuit breakers, bulkheads, and overload

A circuit breaker protects a caller and dependency from repeated work when
recent failures cross a configured threshold. In **closed** state calls
flow and outcomes are measured. In **open** state calls fail fast or use a
safe fallback for a defined interval. In **half-open** state only limited
probe calls are allowed; sufficient success closes the breaker, and failure
reopens it. Thresholds, sampling windows, recovery and fallback behavior
are operational choices. An open circuit is not evidence that every
individual request would fail.

A **bulkhead** instead isolates resources: for example, reserve separate
connection pools or worker limits so a slow notification dependency cannot
exhaust all enrollment workers. It bounds blast radius even before a
breaker opens. Neither mechanism replaces timeouts, admission control,
capacity planning, or correct retry behavior.

Consider a measured planning estimate: 100 external requests/second,
each fans out to 3 downstream calls, and a mean 1.2 attempts per downstream
call includes retries. The estimated downstream offered load is
`100 requests/second × 3 calls/request × 1.2 attempts/call = 360 attempts/second`.
This is an average, not a burst or tail-latency guarantee. If the dependency
can safely sustain 300 attempts/second at the required latency, 360 exceeds
that assumption; reduce fanout/retries, shed work, or increase tested
capacity. Retries during overload can make the gap worse.

Shed early rather than accepting unlimited queues. `429 Too Many Requests`
can signal a caller-specific rate limit; `503 Service Unavailable` can
signal temporary service-wide unavailability, optionally with `Retry-After`.
Policies differ, and neither response automatically makes an unsafe POST
safe to repeat. Communicate whether work was accepted and preserve the
idempotency contract where outcome can be ambiguous.

<details class="learning-answer">
<summary>Predict: if 100 requests per second each make three calls and average 1.2 attempts per call, is downstream load 120 per second?</summary>
<p>No. The fanout matters: 100 times 3 times 1.2 is 360 downstream attempts per second. It is an estimate of the mean load, not a bound on bursts or p99 latency.</p>
</details>

## 6. Rate limiting has a time model

A rate limit describes a principal or other scope, a rate, a period,
burst rules, and the response when exceeded. Distributed enforcement
requires coordination or an explicit approximation; counting by IP alone
may unfairly group many users behind one address. Limits protect resources
and fairness but do not replace authentication or per-object authorization.

For a fixed window of two requests per minute, assume windows start exactly
at minute boundaries. A client sends two at 12:00:59 and two at 12:01:00:
all four can be accepted in roughly one second because they occupy two
different windows. This boundary burst is a property of that algorithm,
not a bug in every rate limit or a universal bound of two requests in every
rolling minute.

A sliding-window log counts requests in the preceding rolling interval,
reducing that boundary artifact at storage/coordination cost. Approximated
sliding counters have their own error. A token bucket has capacity B and
refills at rate r; each accepted request consumes a token. It intentionally
allows a burst up to available tokens while controlling long-run average
rate, subject to initial state and refill rules. Pick based on fairness,
burst tolerance and operational cost rather than declaring one universally
best.

<details class="learning-answer">
<summary>Predict: can a two-per-minute fixed window admit four requests near a boundary?</summary>
<p>Yes. Two just before the boundary and two just after are in separate fixed windows. A rolling window or a differently configured token bucket offers different burst behavior.</p>
</details>

## 7. Deferred work: commit, publish, process, acknowledge

Suppose the learner need not wait for an enrollment confirmation email.
The API can commit the enrollment and an outbox record for a confirmation
job in the same local transaction, then return `201`. This means the job is
recorded, not that the learner has received an email. A publisher reads the
outbox and publishes to a durable queue; a worker handles the job.

| Crash window | Recovery requirement |
| --- | --- |
| Before enrollment and outbox commit | Neither is durable; the enrollment retry can start again. |
| After commit, before publish | Publisher must find and publish the pending outbox record. |
| After publish, before marking published | Publisher can publish again; consumers must tolerate duplicate delivery. |
| After worker effect, before queue acknowledgement | Broker can redeliver; effect can repeat without deduplication. |
| After acknowledgement but before the effect | Work can be lost; acknowledge only after the appropriate durable work. |

When the effect and deduplication record live in one transactional database,
the worker can commit both together before acknowledging. An external email
provider is outside that transaction: a crash after sending but before
recording success may cause a duplicate. Provider idempotency, durable
intent and reconciliation can help, but a broker alone cannot guarantee an
exactly-once external effect. Monitor backlog, failed jobs, retries, age of
oldest item and dead-letter/recovery procedures. A queue adds operational
complexity; do not introduce it when a synchronous action meets the need.

<details class="learning-answer">
<summary>Predict: does acknowledging a queue message prove the email was received exactly once?</summary>
<p>No. An acknowledgement concerns the broker's delivery state, not the recipient's external outcome. Crashes can cause loss or redelivery depending on acknowledgement timing, and provider cooperation or reconciliation is needed for external effects.</p>
</details>

## 8. Gateways are useful boundaries, not automatic security

One Course API and one database can serve the platform well. If several
services later need a shared edge, an API gateway can route requests,
terminate TLS, enforce an authentication or rate policy, and propagate
tracing context. It may also introduce a bottleneck, misconfiguration,
availability dependency and additional trust boundary.

The gateway must be configured and operated correctly. Backends still
validate the identity context they trust, enforce object/action permission,
and protect direct network paths; a gateway merely existing does not make
the system safer. Preserve end-to-end deadline and request semantics through
the gateway and make cache and version routing behavior explicit.

<details class="learning-answer">
<summary>Predict: can the Course API skip authorization because a gateway authenticated the caller?</summary>
<p>No. Authentication at the edge does not establish permission for each course and action. The service must trust and validate the forwarded context appropriately and enforce its own relevant policy.</p>
</details>

## 9. Observe symptoms without exposing credentials

**Logs** describe discrete events; **metrics** aggregate measurements; a
**trace** connects spans for one request across components. Correlation IDs
can connect records, but a trace ID is not a verified identity or an
authorization credential. Incoming trace identifiers may be untrusted.

The RED signals are request **rate**, **errors**, and **duration**.
For enrollment, measure attempt rate, success/error classes and latency,
alongside seat conflicts, replay counts, queue age and dependency health.
Choose an SLI such as the proportion of eligible enrollment requests
completed successfully within a stated duration, define an SLO and window,
then alert on actionable error-budget burn. A dashboard without an owner
and response procedure is not a recovery plan.

Log minimal, purpose-limited structured fields: route template, status,
duration, service and correlation identifier. Avoid raw Authorization
headers, cookies, passwords, bearer tokens and sensitive request bodies;
redact at collection and restrict access and retention. Avoid user IDs as
high-cardinality metric labels; trace sampling and propagation need privacy
and security review. A trace can be missing or sampled, so absence of a
trace is not proof the request never happened.

<details class="learning-answer">
<summary>Predict: can a trace ID authorize a user or safely replace an authenticated principal?</summary>
<p>No. A trace ID correlates observations and can be supplied or propagated by an untrusted client. Identity and authorization require their own verified evidence and policy.</p>
</details>

## 10. Budget latency and assign ownership

An illustrative 1000 ms end-to-end deadline might allocate 100 ms to the
edge, 200 ms to API work, 500 ms to a serial dependency, and 200 ms to
response/overhead. These are planning allocations, not p99 guarantees.
Serial elapsed times add; parallel calls overlap, so their critical path is
approximately the slowest branch plus coordination overhead, not their sum.
For example, parallel branches of 200 ms and 300 ms contribute roughly
300 ms, whereas serial calls take roughly 500 ms before overhead.

Percentiles do not generally add: two component p99 values do not prove an
end-to-end p99, especially with correlation, queueing and fanout. Measure
end-to-end latency and realistic load, test that the deadline and retry
policy are feasible, and reserve room for overhead and variance. Fanout
can increase the chance that at least one branch is slow.

Give each service an owner, on-call path, SLO, runbook, alert thresholds,
capacity review and rollback/recovery plan. Start with a single service and
ordinary instrumentation when sufficient. A service mesh can help manage
cross-service policy and telemetry at scale, but adds complexity and is
not an automatic requirement or guarantee of reliability.

<details class="learning-answer">
<summary>Predict: do 200 ms and 300 ms parallel calls necessarily consume 500 ms?</summary>
<p>No. If they begin together, the critical path is approximately 300 ms plus coordination overhead. Serial calls would take approximately 500 ms; neither calculation establishes a p99 guarantee.</p>
</details>

## References for further study

- [RFC 9110: idempotent methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2), [503](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4), and [Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3); [RFC 6585: 429](https://www.rfc-editor.org/rfc/rfc6585.html#section-4).
- [AWS Builders' Library: timeouts, retries, backoff and jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
- [AWS Builders' Library: idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
- [Google SRE: handling overload](https://sre.google/sre-book/handling-overload/) and [monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/).
- [AWS: transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
