# Phase 5 — Follow a completion beyond the request

The [guided realtime journey](04-GUIDED-REALTIME.md) distinguished a browser
update from a background job. Now decide what must happen before an API
responds, and what can happen afterward. This fictional course has no running
endpoints; HTTP examples are explanatory excerpts, not complete wire messages.

This is an **independent post-enrollment timeline**. Authenticated and
authorized `learner-7` has `enrollment-42` in `course-101`, **API Fundamentals**.
The course has **29 seats available** after that enrollment. The earlier
independent 30-seat preview reset does not carry over. Preview progress was
20%, then 40%; neither value means the course is complete. A later,
separate authorized business action records `completion-42`.
The [async fixture](../assets/async-lesson-fixtures.mjs) fixes these values.

Use the [complete original Phase 5](05-ASYNC-APIS.md),
[course content map](COURSE-CONTENT-MAP.md), and
[corrections ledger](CONTENT-CORRECTIONS.md) alongside this guide.
Examples of named companies in the original are illustrative teaching
scenarios, not verified claims about their present production systems.

## Route through the complete original

The original has **174 headings**. This map groups all their families,
including nested examples and summaries, rather than reproducing every
heading. The original remains the complete reference.

| Original heading families | Guided route | Complete source |
| --- | --- | --- |
| Quick reference and contents; Part 1: why queues, analogy, actors, first architecture, decoupling, messages and benefits | [Choice](#async-choice), [message](#async-message) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 1: async processing, ordering, durability, lifecycle, ACK, database versus queue and API, company examples, recap | [Publication](#async-publication), [delivery](#async-delivery) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 2: evolution and family tree; RabbitMQ exchanges, Kafka topics, partitions and offsets, SQS standard, FIFO and visibility timeout | [Consumers](#async-consumers), [broker lesson](lessons/BROKERS-DELIVERY-AND-RECOVERY.md) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 2: groups, ordering, durability, comparisons, decision framework, company examples, recap | [Consumers](#async-consumers), [next](#async-next) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 3: perfect versus real world, at-most-once, at-least-once, exactly-once and its limits, idempotency | [Delivery](#async-delivery), [workflow lesson](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 3: retries, backoff, poison messages, DLQ, examples, interview scenario, cheat sheet and progress | [Capacity](#async-capacity), [delivery](#async-delivery) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 4: Kafka origin, log, brokers, topics, partitions, offsets, groups, replication, leaders and broker failure | [Consumers](#async-consumers), [broker lesson](lessons/BROKERS-DELIVERY-AND-RECOVERY.md) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 4: retention, replay, rebalance, ordering, throughput, examples, recap and progress | [Consumers](#async-consumers), [capacity](#async-capacity), [next](#async-next) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 5: event-driven thinking, events versus commands, choreography and orchestration, event sourcing, event store and snapshots | [Message](#async-message), [next](#async-next), [event models](lessons/EVENT-MODELS-AND-PROJECTIONS.md) | [Original Phase 5](05-ASYNC-APIS.md) |
| Part 5: CQRS, outbox, dual writes, distributed transactions, saga, summaries, examples and next phase | [Publication](#async-publication), [next](#async-next), [workflows](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md) | [Original Phase 5](05-ASYNC-APIS.md) |

<span id="async-choice"></span>
## Step 1 — Decide what the response promises

**Problem.** The learner completes a course and expects confirmation.
The service also wants to send a completion email. Must email be finished
before the learner gets a response?

**Simple approach.** If volume is small, email is required for the result,
and bounded response latency and provider availability are acceptable, the
backend can call the provider synchronously with a timeout. It must define
what failure means if completion was committed but the provider failed.
A provider accepting email still does not prove a learner read it.

For example, the backend validates the learner's authorization and the
enrollment, records the completion, calls the provider, and reports a result
according to the documented contract. A timeout is ambiguous: the provider
may have accepted the request even if the response never arrived. Retrying
blindly can produce two emails.

The synchronous option does not mean unlimited waiting. Set an explicit
deadline and consider what the user sees when it expires. If the completion
was committed first, reporting only a generic failure can invite a duplicate
submission. A subsequent authorized lookup and a stable request identity
help distinguish an already-created completion from a new attempt.

**Changed requirement.** Completion confirmation must remain responsive when
email is slow, and the business accepts the email arriving later. Now
background work is a candidate, but only if its infrastructure, monitoring,
retry and recovery costs are justified. A queue is not required merely because
the provider is a separate service.

If only the email is deferred, this example API records the business
completion and its publication intent durably before replying. This
illustrative response excerpt means completion was created, not that email
was delivered:

```http
POST /courses/course-101/completions

HTTP/1.1 201 Created
Location: /completions/completion-42
Content-Type: application/json

{"id":"completion-42","status":"completed","emailStatus":"pending"}
```

In a real exchange these are separate request and response messages, with
authentication, valid framing and other required headers. `pending` describes
the example's durable intent, not an email provider acknowledgement.
Repeated completion requests require an explicit idempotency policy, including
what to do after a lost response and whether the same request already
created a completion.

If the **whole completion operation** is deferred instead, `202 Accepted`
can identify a durable job and its status resource. Its documented states
can include `queued`, `running`, `failed`, and `completed`. A 202 is not
proof that the business completion exists. The status endpoint needs
authorization, failure details safe for the caller, a retry policy, and a
retention/expiry policy. A failed job is not a successful completion.

The job record and actual completion are separate state; a worker may crash
after creating completion and before updating job status. Recovery must
reconcile them, and a retry needs the same operation identity.
Do not report `completed` merely because a job was queued.

<details class="learning-answer">
<summary>Predict: if an immediate email is required and the provider fits the latency budget, must we introduce a queue?</summary>
<p>No. A bounded synchronous call can fit. Its timeout, ambiguous outcome and failure contract still need attention; deferral is useful only when delay is acceptable and the operating cost is justified.</p>
</details>

<span id="async-message"></span>
## Step 2 — Separate a fact from a request

**Problem.** A completion can trigger several activities. A message should
say whether it reports something already true or asks someone to do work.

The authoritative completion record identifies `completion-42` and
`enrollment-42`; the latter is available through an authorized lookup by
completion ID. The original completion event deliberately contains only
course and learner in `data`, not the enrollment or every database field:

```json
{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

This is the exact earlier webhook payload, with `id`, `type`, and `data`.
It is a **fact**: the business completion has already been committed.
The event ID is a stable producer-assigned identity for that fact.
An authorized consumer that needs enrollment context must look it up;
it must not invent an enrollment ID from the course and learner fields.

The receiver should authorize that lookup for its integration and the
specific completion. A broker subscription or possession of an opaque ID
is not, by itself, authorization to retrieve personal data. Minimize
message contents and retention according to the receiving service's need.

Here is a distinct **command**, an intent to perform work:

```json
{"id":"email-completion-42","type":"SendCompletionEmail","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

This asks an email worker to send, not reports that the email was sent.
The certificate worker can receive a different command:

```json
{"id":"certificate-completion-42","type":"IssueCertificate","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

Neither command ID is a new delivery-attempt ID. A retry of the same
logical command keeps its ID. Delivery metadata can change per attempt
without changing the producer's logical message identity.

In this fixture there is one enrollment, but a real learner may enroll again
or have multiple valid completion records. Do not define uniqueness as
one completion per learner and course forever unless the business explicitly
enforces that rule. Scope deduplication to the actual operation and tenant.

**Changed requirement.** Another system needs enrollment-specific information.
Use an authorized completion lookup or a separately versioned, explicitly
agreed event contract. Quietly adding fields to the old signed webhook
changes its bytes and may break consumers. See
[webhooks and background jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md).

<details class="learning-answer">
<summary>Predict: does receiving SendCompletionEmail prove that the learner received mail?</summary>
<p>No. It is an instruction, not a fact of delivery. The consumer may not have run, the provider may reject it, and even provider acceptance does not prove the learner read it.</p>
</details>

<span id="async-publication"></span>
## Step 3 — Record the fact and publication intent together

**Problem.** The service writes completion to its database and publishes the
event. What if it crashes between those two actions?

If the database commit succeeds but publication never happens, consumers
miss a real completion. Publishing first is no better: a consumer may see a
completion whose database transaction later rolls back. These are dual writes
across different systems, not one atomic transaction.

For this design, put the completion row and the outbox row containing the
exact fact in the **same database transaction**. Commit both or neither.
A separate publisher reads committed outbox rows and sends them to the
configured broker; after broker confirmation it records publication progress.
The broker does not create an outbox or provide database atomicity for us.

```text
completion transaction: [completion-42 + outbox fact] --commit--> database
publisher:              outbox fact --publish--> broker --deliver--> consumer
```

Text alternative: one database transaction saves completion and its outbox
fact together. A separate publisher later sends the fact to a broker, which
can deliver it to a consumer. These are different failure boundaries.

Suppose the broker accepts the fact, then the publisher crashes before
marking the outbox row as published. On restart it may publish that same
fact again. Stable message ID `completion-42` lets a consumer identify the
duplicate; the outbox does not prevent duplicate delivery.

The broker's acceptance is only what its configured acknowledgement,
persistence and replication policy promises. It is not proof that a consumer
received the message, committed a database effect, or reached an external
provider. A queue name alone does not establish durability.

**Changed requirement.** If lost notifications are tolerable and repair by
periodic reconciliation is acceptable, a direct call or a simpler design
may be enough. If the event must eventually be published, budget for the
outbox publisher, storage, retries, alerts and cleanup. The detailed
[outbox, inbox and workflows lesson](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md)
examines the boundaries.

The outbox table needs access control because it contains learner data.
Monitor oldest unpublished age as well as publisher failures; a healthy
database transaction does not imply a healthy publisher. Retention and
cleanup must preserve records long enough for recovery and audit needs.

Treat publication progress as operational state, not the business completion
itself. An outbox row waiting for publication should be visible to operators
even though the learner's completion is already valid. If the publisher is
unavailable for a long time, storage limits and an escalation policy matter.

<details class="learning-answer">
<summary>Predict: can a successful database commit alone prove that the broker has the fact?</summary>
<p>No. It proves the completion and outbox row were committed together. Publication is a separate operation and must be monitored and retried.</p>
</details>

<span id="async-delivery"></span>
## Step 4 — Follow the message through failure

**Problem.** A broker can deliver the same message more than once, including
when the worker finishes a local effect but crashes before acknowledging it.
What does each milestone actually establish?

| Milestone | What it establishes in this design | What it does not establish |
| --- | --- | --- |
| Database commit | Completion and outbox fact exist together | Broker accepted a publication |
| Broker acceptance | Broker accepted according to configured policy | A consumer received or processed it |
| Consumer delivery | A worker received an attempt | Its effect was committed |
| Local transaction commit | Defined local effect and inbox receipt committed | External email was accepted |
| Broker ACK or group offset commit | The client advances delivery progress as configured | Learner read email, or arbitrary external work completed |
| Email provider acceptance | Provider accepted its request under its contract | Inbox delivery or human reading |

ACK semantics differ by product and client configuration. A consumer can
acknowledge too early or crash before it acknowledges. A Kafka group offset
is a position, not inherently an application-level acknowledgement of every
business effect. At-most-once can lose work; at-least-once can repeat work.
Claims of exactly-once must specify the transactional scope and assumptions.

For a **local database effect**, store an inbox receipt keyed by consumer
and stable producer message ID in the same transaction as the effect.
If the transaction rolls back, neither receipt nor effect is committed;
if a duplicate arrives after commit, skip the already-applied effect.
Check for conflicting payloads for the same ID and investigate rather than
quietly discarding them. ACK after commit according to the broker's policy.

For example, a certificate consumer can atomically insert a local
certificate row and inbox receipt if both live in that same database.
If issuing a certificate requires a separate external service, that call is
another boundary and is not included in the local transaction.

An inbox key should distinguish consumers with different purposes: an
analytics receipt must not suppress the certificate consumer's effect.
An identifier reused with different content is a contract violation to
quarantine. A fresh delivery tag on retry must not defeat deduplication.

Email is external: a database inbox cannot atomically commit with an
independent email provider. If the provider accepts and the worker crashes
before recording that outcome, retry is ambiguous. Use a provider-supported
idempotency key such as the stable command ID when its documented scope and
retention fit; otherwise reconcile with provider records where possible and
accept or mitigate remaining duplicate/loss risk. Never claim universal
exactly-once email without provider cooperation.

**Changed requirement.** If a duplicate reminder is harmless, a simpler
retry policy may be acceptable. If duplicates have legal or monetary impact,
the provider contract and reconciliation procedure matter as much as the
queue. Specify the business effect, not only the transport guarantee.

<details class="learning-answer">
<summary>Predict: if the email worker commits an inbox receipt before calling the provider, can it safely skip every retry?</summary>
<p>No. A crash after the receipt but before the call would suppress the email. A local transaction cannot include an independent provider; use provider cooperation or reconcile the ambiguous outcome.</p>
</details>

<span id="async-consumers"></span>
## Step 5 — Give independent reactions independent delivery

**Problem.** Now certificate generation and analytics both need to react
to the completion. Two workers competing for one ordinary work queue share
the work; they do not each automatically receive every message.

Use separate queues/subscriptions fed by a fanout exchange or pub/sub
topic, or independent groups on a retained stream, when each reaction must
receive its own copy. Each has its own failures, retry policy and capacity.
Email, certificate and analytics can proceed independently; one failing
consumer should not silently erase the others' work.

For a **classic Kafka consumer group**, suppose a topic has two partitions
and three consumers in the same group. At a stable assignment each partition
belongs to at most one consumer in that group, so at most two consumers have
partitions and one is idle. Another group can read the same retained records
at its own position. It does not get a third partition within the first group.
Rebalances move assignments and can pause progress; crashes and retries can
repeat processing.

This is the classic group model, not a claim about every Kafka configuration.
Kafka Share Groups and other products/configurations have different assignment
and acknowledgement semantics. Consult the chosen deployment's contract.
RabbitMQ, Kafka and SQS are alternatives with different operational
models, not a RabbitMQ → Kafka → SQS upgrade ladder.

A retained stream is useful when independent consumers or bounded replay
justify storing history. Retention may be limited by time, size or other
configuration; an offset older than retained data cannot magically recover
the missing history. Replication, acknowledgement settings and failure
handling determine actual durability, not the word “stream.”

The two-partition example limits parallel assignment within a classic
group, not the number of independent groups. Adding consumers alone cannot
increase that group's assignment parallelism beyond its partition count.
Adding partitions changes capacity and may change future key assignment;
evaluate ordering, migration and operational consequences first.

Ordering is also scoped. With a consistent key and partitioning policy,
records for that key can be read in partition order. There is no global
order across partitions. Asynchronous processing inside one consumer can
finish later records first, so serialize the relevant key or otherwise
enforce business order when effects require it. Retries and rebalances
must preserve that policy too.

Monitor consumer lag, oldest message age, failed attempts, rebalances and
crashes. Lag is a signal of distance from a position, not a count of
successfully completed external effects. For a fuller comparison see
[brokers, delivery and recovery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md).

**Changed requirement.** If only one job must be executed by any one worker
and no replay is needed, a simple work queue may be cheaper and easier than
a retained stream. Choose the delivery contract first.

<details class="learning-answer">
<summary>Predict: can three consumers in one classic group process three partitions at once when the topic has only two?</summary>
<p>No. At most two consumers receive partitions in the stable assignment; the third is idle. A separate group has its own position, not an extra partition.</p>
</details>

<span id="async-capacity"></span>
## Step 6 — Calculate the backlog and plan recovery

**Problem.** A queue absorbs a burst only while storage, time and operating
limits allow it. It does not make insufficient processing capacity disappear.

Assume the fixture's fixed-rate fluid model, starting with no backlog:

| Interval | Arrival rate | Service rate | Calculation | Result |
| --- | ---: | ---: | --- | ---: |
| Overload, 60 seconds | 10/s | 4/s | `(10 - 4) × 60` | 360 queued |
| Recovery | 2/s | 4/s | `360 / (4 - 2)` | 180 seconds to drain |

This ignores startup, batching, retries, service variation and resource
limits. During recovery the workers still serve new arrivals, so the net
drain rate is **2/s**, not 4/s. If arrival stays at or above 4/s, this
fixed-rate model never drains the existing backlog.

Bound the buffer by count, bytes and age, and set a policy for overload:
admission control, backpressure, rate limits, scaling or explicit rejection.
Alert on oldest age as well as depth; even a small queue can contain an
unacceptably old job. Scaling depends on partition parallelism, downstream
capacity and provider rate limits, not just worker count.

For example, raising worker concurrency while the provider throttles requests
can make retries increase rather than decrease backlog. Track both accepted
throughput and failure rate, and give downstream systems a sustainable
budget. The arithmetic is a planning model, not a production forecast.

Use bounded retries with exponential backoff and jitter for transient
failures, respecting provider limits. A poison message or exhausted retry
budget can be isolated in a configured dead-letter queue (DLQ), **not
ignored**. A DLQ is not a universal broker guarantee: routing, retention,
permissions, transfer failure and alerting all require configuration.
Inspect and correct the cause, then use a controlled, idempotent redrive;
record outcomes and prevent an immediate retry storm.

Some failures should be rejected or quarantined immediately rather than
retried, such as a malformed payload or an authorization violation.
Deleting a DLQ entry without resolution is data loss for required work.
An operator needs a documented owner and escalation path.

**Changed requirement.** A one-minute notification delay may be acceptable,
while a ten-minute delay may violate the promise. Measure age against that
promise; if sustained demand exceeds service, increase capacity or reduce
admissions rather than treating a larger queue as a permanent solution.

<details class="learning-answer">
<summary>Predict: with 360 queued and recovery arrivals at 2/s, does a 4/s worker clear the backlog in 90 seconds?</summary>
<p>No. New work continues arriving, so the net drain is 4 minus 2, or 2 per second. Under the fixed-rate assumptions, clearing 360 takes 180 seconds.</p>
</details>

<span id="async-next"></span>
## Step 7 — Study the branches; adopt them only for a requirement

**Problem.** The first queue does not require adopting every event-driven
architecture pattern. Choose the next branch by the problem it solves.
Each branch is learning material you can study independently, even if the
platform does not need that implementation. Choosing not to adopt a pattern
is not a reason to leave its behavior or trade-offs unexplained.

| Need | Option, value and cost | Complete branch |
| --- | --- | --- |
| Database change plus eventual publication | Outbox; avoids a local dual-write gap but requires a publisher and duplicate handling | [Outbox, inbox and workflows](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md) |
| Independent reactions with replay | Separate subscriptions or a retained stream; adds operations and bounded retention | [Brokers, delivery and recovery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md) |
| Rebuild a business state from historical facts | Event sourcing and an event store; requires versioned events, concurrency rules, migrations and replay discipline | [Event models and projections](lessons/EVENT-MODELS-AND-PROJECTIONS.md) |
| Different read and write models | CQRS; read projections can lag and require rebuild/reconciliation | [Event models and projections](lessons/EVENT-MODELS-AND-PROJECTIONS.md) |
| Multi-service business workflow | Saga with choreography or orchestration; define timeouts, compensations and irreversible steps | [Outbox, inbox and workflows](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md) |

A notification that `course.completed` happened is **not** event sourcing.
The source of truth here is the completion database; the event reports a
fact for others. A saga does not provide a global rollback: compensation is
a new business action and an already delivered email cannot be unread.
CQRS can be used without event sourcing, and none of these patterns is a
prerequisite for an ordinary work queue.

An alternative event-store model in the fixture uses an aggregate ID and
versions. These are separate from the original webhook envelope:

```json
[
  {"id":"progress-20","type":"course.progress-recorded","aggregateId":"learner-7/course-101/enrollment-42","version":1,"data":{"courseId":"course-101","learnerId":"learner-7","percentComplete":20}},
  {"id":"progress-40","type":"course.progress-recorded","aggregateId":"learner-7/course-101/enrollment-42","version":2,"data":{"courseId":"course-101","learnerId":"learner-7","percentComplete":40}},
  {"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"},"aggregateId":"learner-7/course-101/enrollment-42","version":3}
]
```

The versions order events **within this aggregate**, not across all
aggregates. They are not broker offsets or wall-clock timestamps. Version 2
is still 40% progress; version 3 is the separate completion fact.
Applying these events to a pure projection can reconstruct its view.
Rebuilding that projection must not send old completion emails again;
separate replayable state updates from external side-effect handlers.
Handle schema evolution, duplicate events and version gaps explicitly.

When a projection sees version 3 before version 2, the application needs a
defined gap policy: defer and fetch missing history, rebuild from a trusted
snapshot and retained events, or report a failure for repair. Sorting opaque
IDs or timestamps is not a substitute for aggregate version validation.
Snapshot creation and event retention must be coordinated with recovery.

**Transfer: library returns.** A small library needs immediate return
confirmation and has no notification requirement. A bounded synchronous
database update may be enough; keep it if it meets the latency and
availability needs. If a later requirement permits a delayed patron reminder
and reliable independent catalog analytics, consider an outbox and separate
subscriptions, with the same failure and operating costs discussed above.
Do not assume the patron has read a reminder when a provider accepts it.

<details class="learning-answer">
<summary>Predict: should rebuilding a completion projection resend the learner's old email?</summary>
<p>No. A pure projection replay rebuilds local read state. External email is a separate side effect and needs its own live-delivery, idempotency and reconciliation policy.</p>
</details>

Return to the [complete original Phase 5](05-ASYNC-APIS.md) for all 174
heading families, or revisit the [previous guided journey](04-GUIDED-REALTIME.md).
For broader architecture context, continue to the
[guided architecture journey](06-GUIDED-ARCHITECTURE.md), with the
[original Phase 6](06-API-ARCHITECTURE.md) still available in full. The
[content map](COURSE-CONTENT-MAP.md) and
[corrections ledger](CONTENT-CORRECTIONS.md) help navigate the library.
