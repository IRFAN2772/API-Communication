# Backpressure and capacity

Capacity is the amount of work a particular system can complete under specified conditions.
Backpressure gives a producer a signal or constraint that reflects downstream ability to accept work.
Neither term means “add an infinite queue.”
This lesson measures a stable observation, then explores an independent overload model.
Both use the [canonical architecture fixtures](../../assets/architecture-lesson-fixtures.mjs).
The catalogue and enrollment interface is the same fictional platform used in
[API contracts and lifecycle](API-CONTRACTS-AND-LIFECYCLE.md).

## Outcomes

You will be able to:

- apply Little's Law only with a defined boundary and stable long-run means;
- calculate a small deterministic queue's growth and drain;
- distinguish flow control, admission policies and fault isolation;
- choose an honest overload response and design bounded retries;
- measure queue health and protect critical user journeys.

## Start with the shared course

The architecture fixture identifies `course-101`, titled `API Fundamentals`, with 29 seats.
Its enrollment response is `enrollment-42` for `learner-7`.
That course is the same one used by the contract lesson.
The 29 seats are domain data, not a capacity limit on HTTP requests or workers.
The models below do not describe how seats are allocated.
Enrollment still needs authorization, correct concurrency and idempotent retry handling.
The documentation website does not implement these example endpoints.

## Stable observation: Little's Law

Choose a boundary first: arrival into a request system through completion or exit.
Count all requests inside that boundary, including those waiting and those in service.
Over a stable long-run observation, let:

- `λ` be the mean throughput across that same boundary in requests per second;
- `W` be the mean time spent inside it in seconds per request;
- `L` be the mean number of requests inside it.

Little's Law states `L = λ × W` for a stable system under suitable long-run averaging.
The fixture's observation is 40 arrivals per second and mean time 0.125 seconds.
Assume the same boundary, stable flow, and long-run arrivals equal departures.
Then `L = 40/s × 0.125 s = 5 requests`.
This includes both waiting and active requests within the boundary.
It is a mean, not a peak, queue capacity, individual latency, or p99.
The observation does not identify a service concurrency limit.
It also does not determine the queue length without separating waiting from service.
Units cancel: requests/second times seconds gives requests.

If the boundary changes, all three quantities must describe that new boundary.
For example, queue-only wait time pairs with the mean number waiting, not active requests.
If arrivals and departures are unequal for a sustained interval, accumulation matters.
Do not take unstable overload arrival rate and one transient latency sample
and assert that their product is a stable queue size.
Account for work still inside the boundary when measuring time-window samples.
Warm-up and drain effects can bias short observations.

<details class="learning-answer">
<summary>Predict: Does L equal five mean every request takes 125 ms?</summary>
<p>No. Five and 125 ms are long-run means for the specified stable boundary; individual and tail latencies can be much larger.</p>
</details>

## An independent deterministic model

Now deliberately switch to a separate model, not an inference from the observation above.
Four workers run concurrently, each job takes exactly 0.05 seconds of service.
Assume work-conserving workers, continuous fluid arrivals, no other bottleneck and no overhead.
Each worker can finish `1 / 0.05 = 20` jobs per second.
Ideal total service capacity is `4 × 20 = 80 jobs/s`.
The waiting queue has room for 40 jobs in addition to the four active jobs.
Arrivals offered to the model are 100 jobs/s.
Start with all four workers busy and an empty waiting queue.

| Time | Offered arrivals | Service | Waiting queue before rejection |
| --- | --- | --- | --- |
| 0 s | 100/s | 80/s | 0 jobs |
| 1 s | 100/s | 80/s | 20 jobs |
| 2 s | 100/s | 80/s | 40 jobs, the limit |

Before the bound is reached, backlog grows by `100 - 80 = 20 jobs/s`.
Starting empty, `40 / 20 = 2 seconds` reaches the waiting limit.
This is a fluid approximation, not an exact discrete-arrival scheduler trace.
After the limit, an admission policy must reject, delay upstream, or otherwise bound work.
An unbounded queue merely converts overload into memory use and later timeouts.

For recovery, suppose the waiting queue is full, workers remain busy, and
offered arrivals fall to 60 jobs/s without new rejection.
The queue drains at `80 - 60 = 20 jobs/s`.
Its 40 waiting jobs drain in `40 / 20 = 2 seconds`.
Active jobs are still in service at that instant; queue drained does not mean system empty.
The fixture calls 60/s the recovery arrival rate.
This is a drop *to* 60/s, not a claim that dropping 60 jobs/s caused recovery.

Real service times vary, and CPU, database locks, network, pools and downstreams can bottleneck.
Context switching, scheduling, uneven work, retries and failures reduce or alter throughput.
Measure actual capacity under representative workload and operating conditions.
Do not advertise the ideal 80/s model as a production throughput guarantee.
Queues can exist at the client, gateway, load balancer, thread pool, broker and database.
Bounding one of them does not automatically bound all the others.
Measure jobs and bytes: a count bound alone does not bound memory if requests are huge.
Enforce request-size limits as well as a bounded number of active and waiting requests.

<details class="learning-answer">
<summary>Check: If arrivals stay at 100/s after the queue fills, what happens?</summary>
<p>The offered rate exceeds ideal service by 20/s, so a finite system must reject or hold work upstream rather than keep accepting it indefinitely.</p>
</details>

## What sends the pressure signal?

Backpressure connects a consumer's ability to receive with the producer's sending behavior.
For example, a consumer can request a limited number of items.
A producer that honors the signal stops sending after that demand is exhausted.
The signal needs a defined boundary and a producer capable of responding to it.
If the producer cannot slow down, the system must buffer within a bound, reject, or discard.
Tell the caller which outcome occurred; “we have a queue” is not a complete policy.

Flow control regulates transfer over a particular channel.
TCP's receive window limits bytes the receiver is prepared to accept on that connection.
It does not bound an application's entire outbox, broker backlog, or business-work queue.
The application can keep accumulating work elsewhere while a socket is blocked.
It must also decide how long to wait and what to do when its own capacity is exhausted.
Transport-level progress is not proof of a business transaction.

Reactive Streams demand allows a subscriber to request a number of items.
The publisher must honor the protocol and requested demand.
The configured prefetch and buffers still matter for the end-to-end memory budget.
Not every producer or integration observes that protocol.
Demand alone does not guarantee no data loss across crashes, persistence or network failure.
Durable storage, acknowledgments, replay and deduplication are separate design choices.
Even delivery of a downstream callback is not a durable acknowledgment by itself.
Define what has actually been committed before acknowledging work.

<details class="learning-answer">
<summary>Predict: Does TCP flow control keep the application's entire backlog bounded?</summary>
<p>No. It limits bytes on a connection; application outboxes and other queues need their own bounds and admission policies.</p>
</details>

## Compare the mechanisms

| Mechanism | Controls | Useful fit | Limitation |
| --- | --- | --- | --- |
| Backpressure | Producer sending in response to downstream readiness | Cooperative stream | An uncooperative source may still need rejection or bounded storage. |
| Flow control | Transfer within a channel | TCP bytes or stream windows | It does not by itself cap all application work. |
| Rate limiting | Offered requests per caller or policy interval | Fairness and abuse control | A fixed limit alone may not adapt to a failing downstream. |
| Load shedding | Work denied or dropped to protect capacity | Overload admission | Rejection must be explicit and measured. |
| Circuit breaker | Calls to an unhealthy dependency | Avoid repeated likely failures | It is not a replacement for a queue or quota. |
| Bulkhead | Resources isolated by class or dependency | Limit failure blast radius | An isolated pool can still fill. |

Rate limiting can be continuous policy rather than an emergency response.
Backpressure can also be continuous, such as credit-based demand in normal operation.
A circuit breaker typically opens after a failure condition and later probes recovery.
Bulkheads reserve separate resources so one slow dependency does not consume all capacity.
These mechanisms can be combined, but their scopes and signals must be documented.
For example, a per-user quota and a global bounded worker pool solve different problems.
Neither proves that a database can sustain the resulting admitted workload.

## Design a bounded admission point

Consider a service with four worker slots and 40 waiting slots from the model.
This is a teaching configuration, not a recommended production setting.
At the entrance, check identity and a size limit before consuming expensive resources.
Then enforce per-caller quotas where appropriate and attempt to reserve bounded capacity.
An available worker can begin immediately; otherwise a request may occupy a waiting slot.
Do not accept more waiting work once the queue reaches its limit.
Set a deadline and check the remaining deadline before enqueueing and before dispatch.
If the likely wait exhausts the budget, reject rather than promising work too late.
Keep active and waiting limits separately visible.
Account for memory occupied by headers, body, metadata and downstream buffers.
Release slots on completion, rejection, cancellation and error.
Coordinate slot ownership so race conditions cannot exceed the configured bound.

An illustrative admission sequence is:

1. Authenticate and authorize enough to apply the right policy.
2. Reject a request that exceeds the body-size limit.
3. Check caller quota and the remaining time budget.
4. Reserve a worker or waiting slot atomically.
5. If no slot is available, shed explicitly before accepting work.
6. Dispatch only while the request remains useful.
7. Release the reservation and record the outcome.

“Accepted” must be defined for the particular protocol.
An HTTP response that says work was accepted is not proof that it completed.
A durable job acceptance should only be reported after the durable handoff is committed.
If the request has not been accepted, the caller can make a reasoned retry decision.
Once a write has been dispatched, an apparent timeout may hide a successful commit.
Cancellation requests that remaining work stop, but it does not roll back completed side effects.
Propagate deadlines and cancellation where supported, while checking the actual outcome.
For enrollment, retain the same idempotency key and replay the recorded result on retry.
Implement atomic key and outcome storage; the header by itself does not provide it.

### Choose the response deliberately

Use 429 when a caller-specific rate or quota policy rejects the request.
Use 503 when service capacity is temporarily unavailable rather than a caller quota.
These statuses are not interchangeable explanations of the underlying condition.
Where useful and justified, send a `Retry-After` hint and publish retry guidance.
Both rejection responses must be honest about whether work was accepted.
If a response is lost after dispatch, the client must treat a write as uncertain.
Preserve idempotency replay for this case; do not generate a new key for the same intent.
Rejections should be observable without exposing credentials or sensitive user information.

<details class="learning-answer">
<summary>Check: Does a timeout prove the enrollment failed?</summary>
<p>No. The server may have committed after the client stopped waiting; retry the same intent with the same idempotency key under the documented retention policy.</p>
</details>

## Retry amplification

Suppose 100 incoming requests/s each initiate three downstream calls.
If every downstream call makes two total attempts, offered downstream traffic becomes:

`3 calls × 2 attempts × 100 requests/s = 600 attempts/s`.

Two attempts means one initial attempt and one retry, not two retries after the initial call.
The baseline without retries is 300 attempts/s.
If retries target an already saturated dependency, they can worsen the incident.
The example is not evidence that the dependency can handle 600 attempts/s.
Compare offered attempts with actual measured dependency capacity.
Include fan-out, timeouts and any retries in gateways, clients and service libraries.
Choose one retry owner per call path so multiple layers do not multiply attempts.
Use a bounded attempt budget, exponential backoff and jitter to spread synchronized retries.
Respect remaining deadlines, retry hints and a limit on total retry traffic.
Retry only errors and operations for which doing so is safe.
For writes, use explicit idempotency semantics rather than assuming a timeout means failure.
Stop retrying when the budget is exhausted and surface a meaningful failure.

<details class="learning-answer">
<summary>Predict: If each of two layers independently retries, is the attempt count still two?</summary>
<p>No. Nested attempts can multiply; assigning one retry owner and a shared budget prevents that accidental amplification.</p>
</details>

## Priorities, fairness and degradation

Not all work has the same user value.
Separate enrollment and progress from optional recommendations where practical.
Reserve bounded capacity for critical paths instead of relying on one shared queue.
If recommendations are overloaded, return an explicit unavailable status for that feature.
The user can still continue the critical enrollment or progress journey when available.
Do not invent a recommendation result and label it fresh.
Do not return fake zero progress or pretend enrollment succeeded when it did not.
Partial results need clear status and a contract that clients understand.

Strict priority can starve lower-priority work indefinitely.
Use quotas, weighted scheduling or aging to provide an appropriate minimum share.
Observe both high- and low-priority wait times and rejection rates.
An urgent class should not be allowed to exhaust every resource without a policy.
Bulkheads can limit damage from a failing optional dependency, but they consume reserved capacity.
Decide what happens when reserved capacity is idle and when demand returns.
Protect fairness between callers as well as between operation classes.
For hot keys or large tenants, global averages can hide concentrated overload.
Measure per-tenant or per-partition distributions with privacy and cardinality controls.

## Observe the whole boundary

Instrument offered, admitted, rejected, started, completed, failed and cancelled work.
Define each event at a precise point so retries are not silently counted as new users.
Track active slots, queue depth, oldest queue age and bytes held.
Queue age can reveal stuck work even when depth looks small.
Queue depth alone cannot tell whether old work is making progress.
Measure processing and waiting separately, plus end-to-end latency.
Histograms support aggregating latency distributions across instances.
Report a mean and useful percentiles such as p95 and p99 with their time window.
Do not calculate a fleet p99 by averaging individual instance p99 values.
Little's Law uses compatible means, not a p99 substituted into its formula.

For Kafka, offset lag is an offset difference, not inherently elapsed queue age.
It can vary with partition rates and does not by itself establish event freshness.
Measure age or event-time delay separately and inspect hot partitions.
Dead-letter queues and retries can hide work from a simple consumer-lag chart.
Backlog accumulation is a change over time, not just one dashboard number.
Compare admission and completion rates across the same defined boundary.
Distinguish accepted traffic from rejected offers when choosing a denominator.

For an availability SLI, write down whether all eligible offered requests count,
or only admitted requests count, and how rejected requests are classified.
An accepted-only success ratio can appear healthy while most users are rejected.
Show rejection rate alongside it and include a user-facing measure of failed attempts.
Document exclusions, windows, retry counting and ownership.
Changing an SLI definition changes the meaning of the measurement.
It is not by itself an API versioning or backward-compatibility guarantee.
Alert on sustained growth, old queue age and user impact, not just a single transient spike.

<details class="learning-answer">
<summary>Check: Can an accepted-only success ratio hide overload?</summary>
<p>Yes. It excludes rejected offers, so pair it with an explicitly defined user-facing denominator and rejection metrics.</p>
</details>

## Native streaming versus HTTP APIs

The [protobuf contract](../contracts/course_api.proto) describes a parallel native gRPC interface.
It defines message fields and RPC methods rather than the OpenAPI HTTP representations.
Streaming can apply flow control to bytes while the application processes individual messages.
HTTP/2 flow-control windows do not bound every producer queue or business backlog.
Bound message sizes, pending sends and application buffers independently.
Observe client and server deadlines and propagate cancellation.
An acknowledged transport write is not necessarily a persisted progress update.
Business acknowledgment, replay and idempotency need their own protocol.
OpenAPI documentation and the website UI do not implement a gRPC stream.
Choose native streaming for its actual bidirectional or incremental requirements,
not merely because a UI contains a live-looking counter.

## Failure walkthrough

Suppose recommendation latency rises while enrollment is still healthy.
If both share an unbounded pool, slow recommendations occupy the workers.
Waiting enrollment requests then time out even though their own dependency is healthy.
Retries multiply incoming demand and raise queue age further.
Separating pools bounds the optional dependency's blast radius.
At the recommendation limit, reject or degrade with explicit unavailable status.
Keep enrollment admission bounded too, and preserve its idempotency behavior.
Measure offered and rejected traffic per class before claiming recovery.
If the critical pool is itself saturated, return an honest overload response.
No priority policy creates additional database capacity.

Another failure: a client times out after an enrollment commits.
Cancelling the request cannot undo that already committed result.
A new idempotency key can accidentally initiate another intent.
The same key lets the service return the durable recorded outcome within its retention window.
This requires actual persistence and concurrency control, not merely a declared header.

## Choosing an approach

Choose backpressure when an upstream producer can honor a downstream demand signal.
Choose explicit shedding when requests cannot safely wait and the admission bound is reached.
Choose rate limits for caller quotas and fairness, including normal operation.
Choose bulkheads for resource isolation and a circuit breaker for failing dependencies.
Use durable queues when delayed work remains useful and persistence is required.
Even durable queues need bounded retention, monitoring, recovery and a full-disk policy.
Choose the combination by measuring the bottleneck and the end-to-end deadline.
Avoid a single universal “best” mechanism independent of workload.

## Quick self-check

1. What boundary and averaging conditions make the stable `L = 5` calculation meaningful?
2. Why is the separate model's service rate only ideal?
3. How quickly does its queue fill and drain under the stated assumptions?
4. Where can work accumulate even if TCP's receive window is closed?
5. How do you bound both number of jobs and bytes?
6. Which response distinguishes a caller quota from temporary service overload?
7. Why is cancellation not proof of rollback?
8. What denominator exposes rejected users in an SLI?

<details class="learning-answer">
<summary>Check: What is the central capacity design rule?</summary>
<p>Bound and measure work at each relevant boundary, then signal, reject or degrade honestly when that bound is reached.</p>
</details>

## Continue

- [Guided architecture](../06-GUIDED-ARCHITECTURE.md)
- [Original architecture chapter](../06-API-ARCHITECTURE.md)
- [API contracts and lifecycle](API-CONTRACTS-AND-LIFECYCLE.md)
- [Gateways, BFFs and load balancing](GATEWAYS-BFFS-AND-LOAD-BALANCING.md)
- [Service mesh and trust](SERVICE-MESH-AND-TRUST.md)
- [Course content map](../COURSE-CONTENT-MAP.md)
- [Content corrections](../CONTENT-CORRECTIONS.md)
- [Canonical architecture fixtures](../../assets/architecture-lesson-fixtures.mjs)

The numbers in the two models have different assumptions and must not be mixed.
Measure the real boundary before using either model to make a capacity decision.
