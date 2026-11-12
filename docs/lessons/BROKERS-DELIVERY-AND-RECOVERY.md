# Brokers, delivery and recovery: what actually happened?

This standalone lesson follows `learner-7` in **API Fundamentals**
(`course-101`). In the independent post-enrollment timeline, the course has
29 seats remaining. Earlier preview progress does not allocate another seat
and 40% is not completion. A later completion action creates `completion-42`.
We will choose how to transport that fact and a separate email command.

Read the [guided async lesson](../05-GUIDED-ASYNC.md) and
[original async chapter](../05-ASYNC-APIS.md), then explore
[outbox, inbox and workflows](OUTBOX-INBOX-AND-WORKFLOWS.md),
[event models and projections](EVENT-MODELS-AND-PROJECTIONS.md),
and [guided realtime](../04-GUIDED-REALTIME.md).
The [content map](../COURSE-CONTENT-MAP.md),
[corrections](../CONTENT-CORRECTIONS.md), and
[shared async fixtures](../../assets/async-lesson-fixtures.mjs) provide context.

## 1. A fact is not a request

The Phase 4 completion fact is deliberately minimal. It says something
already happened; it does not request that a particular consumer do work.
This is the exact shared JSON body:

```json
{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

Separately, a notification workflow may issue a command asking its worker
to send an email. Its ID is not the completion event ID:

```json
{"id":"email-completion-42","type":"SendCompletionEmail","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

The command identifies the intended action; `completionId` links it to
the source fact. Another action, such as a certificate, has its own command
ID. Re-delivery of either object preserves its original producer ID.
An attempt number, broker receipt handle or log offset is not a new business
identity. Never silently replace the fact's body with a different envelope.

The hypothetical Course service commits the completion and an outbox record
in one local database transaction. A relay then publishes the outbox record.
This avoids a local database commit followed by a lost publish, provided the
relay is operated and retries; a relay crash can instead produce duplicates.
The workflow can derive an email command using a durable inbox and outbox,
again as a local transaction. No broker automatically creates that atomicity.

Text diagram, read left to right: each arrow can fail independently.

```text
completion + outbox -> broker -> workflow inbox + command outbox
                                  -> broker -> email inbox + send job
                                               -> email provider -> recipient
```

An authenticated, authorized consumer needs only the permitted identifiers;
do not place the email address or other private details in every event merely
for convenience. An authorized worker may resolve the current address using
an appropriate access-controlled service.

<details class="learning-answer">
<summary>Predict: does producing the completion fact send the email?</summary>
<p>No. The fact, command, local durable job, provider acceptance and actual
recipient delivery are distinct steps; any can fail or remain pending.</p>
</details>

## 2. Four boundaries, four different claims

1. **Broker acceptance:** the broker accepted a publish under its own rules.
   A routed destination, persistence and survival of a failure depend on the
   product, configuration and failure scenario.
2. **Producer confirmation:** the producer receives a success response or
   publisher confirm. A lost response leaves the producer uncertain even if
   the broker accepted the message; a retry can create another delivery.
3. **Consumer durable commit:** the consumer records an inbox entry and its
   local effect or durable job atomically, before acknowledging delivery.
   This is not a publisher confirm. The worker may still have work to do.
4. **External email:** the provider may accept a send request, but acceptance
   is not proof of mailbox delivery, reading, or exactly one email.

For RabbitMQ a publisher confirm is a broker-to-publisher signal; a consumer
ACK is consumer-to-broker. Neither implies the other. In SQS, deletion after
commit relinquishes the queued message. In Kafka, committing a group offset
records a position, not the state of an unrelated database.

Suppose the email worker commits a unique inbox record and durable job for
`email-completion-42`, then crashes before its consumer ACK. On redelivery
the same scoped ID and payload find the committed job; the consumer does not
create a second job and can acknowledge. If it ACKs **before** the local
transaction, a crash can lose the job permanently. A conflicting payload for
the same ID is not an ordinary duplicate: isolate and investigate it.

The inbox must be atomic with the effect it protects, enforce uniqueness
under concurrency, and live long enough for retries and authorized replay.
A plain in-memory set or a check followed by an unprotected write is not
sufficient. This protects the local job, not an external send by itself.
The send worker needs a stable provider idempotency key and a documented
provider contract, or a reconciliation procedure for ambiguous timeouts.
Without cooperation from the provider, an acceptance followed by a lost
response leaves a choice between possible duplicate email and possible loss.

<details class="learning-answer">
<summary>Predict: the publisher receives a confirm. Has the consumer committed?</summary>
<p>No. The confirm covers a broker-side publish boundary, not the separate
consumer transaction, its acknowledgement, or an external email.</p>
</details>

## 3. RabbitMQ: route to queues, then process

A producer publishes to an **exchange**. Bindings determine which queues
receive a routed copy. The exchange is not itself the worker's inbox.
The default exchange and other exchange types have distinct rules:

| Exchange | Binding decision | Course example |
|---|---|---|
| direct | Routing key equals a binding key; multiple queues can match | `course.completed` routes to each matching queue |
| fanout | Ignores routing key and routes to all bound queues | Completion copies to notification and analytics queues |
| topic | Dot-separated key matches binding pattern: `*` one word, `#` zero or more | `course.*` matches `course.completed` |
| headers | Matches configured message headers rather than routing key | Route by agreed tenant and event-type headers |

Routing is a configuration decision, not an authorization system. An
unroutable publish may be discarded depending on settings; mandatory
publishing and returned-message handling can expose that case. A confirm
alone does not prove that the intended queue received a message.

Queues are not all the same. A **classic queue** is a general-purpose queue;
its durability and failure behavior depend on its declaration, message
persistence and deployment. A **quorum queue** is a replicated queue using
Raft, designed for replicated data safety with an available majority;
replication costs resources and a quorum can be unavailable. A **stream**
is a persistent append-only log with retention and non-destructive reads,
supporting replay while retained; it is not just a classic queue with an ACK.
Choose queue type and semantics deliberately, including version-specific
limits and operations.

With ordinary classic or quorum queue consumption, an acknowledged message
is normally removed from that queue; do not assume an acknowledged queue
message can be replayed. That is not a product-wide claim that RabbitMQ has
no replay: streams have different retention-based semantics.

Durable queues, persistent messages, publisher confirms and appropriate
replication all contribute to a chosen durability boundary. A confirm's
meaning depends on queue type, routing and persistence; it is not a promise
against every correlated failure or operator mistake. Model broker disk loss,
network partitions, a lost confirm, and the actual failure assumptions.
Use manual consumer acknowledgements after the local durable effect or inbox
transaction, and limit outstanding deliveries with suitable prefetch.
If the consumer dies before ACK, an unacknowledged message can be redelivered.
Queue ordering can be affected by multiple consumers, redelivery and
application concurrency; a simple FIFO story is not an end-to-end ordering
guarantee.

<details class="learning-answer">
<summary>Predict: does an acknowledged classic-queue message remain available as a stream replay?</summary>
<p>Normally no. An ACK removes that queue's delivery; a RabbitMQ stream is a
different retained-log feature with its own retention and consumer behavior.</p>
</details>

## 4. Kafka: partitioned retained logs and positions

A Kafka cluster has brokers and topics. A topic has partitions, each an
ordered log with offsets; a producer appends a record to one partition.
An agreed stable key such as `learner-7/course-101/enrollment-42` can route
related records to the same partition under the chosen partitioner and
unchanged partition mapping. Adding partitions or changing the partitioner
can change that mapping; plan migrations if per-key order matters.
An offset is a position in one partition, not a global event ID.

For the fixture's **classic consumer group**, topic partitions P0 and P1
are assigned to three workers A, B and C:

| Group | P0 | P1 | Idle |
|---|---|---|---|
| notification | A | B | C |
| analytics | X | Y | none in this example |

Each classic group independently tracks committed offsets per partition.
The two groups can both read the same retained completion fact; workers
within one group share the partitions. With two partitions only two workers
in that group have assignments at a time; the third can take over on a
rebalance. Kafka Share Groups are a distinct feature: do not automatically
apply classic-group partition ownership restrictions to them.

If notification P0 processes offset 0 and commits **next offset 1**, it will
normally resume at 1. If its local work commits but the offset does not, a
rebalance or crash can redeliver offset 0; a durable inbox prevents a duplicate
local job. Committing offset 1 before that durable work can skip the job on
restart. With multiple records in flight, commit only the highest contiguous
position whose earlier records have also safely completed; don't jump over a
failed record. Rebalances require ownership and in-flight work to be handled
carefully; duplicate processing can occur around the transition.

The partition log has a definite record order. That does not automatically
mean application work finishes in that order: asynchronous handlers, retries
and a rebalance can interleave completion. Serialize per key where required
and fence stale owners or otherwise coordinate side effects. Different
partitions provide no global order.

Kafka retention bounds replay. Time/size deletion can remove old segments;
compaction can remove superseded values for a key and tombstones eventually
expire. A reset to offset 0 cannot recreate records already deleted or
compacted away, and availability also depends on the surviving replicas.
Replay can reconstruct only what is still present and meaningful under the
topic's policy; use an authoritative store or snapshot if full history is
required. Retention and sensitive-data deletion requirements need joint design.

Replicas follow a partition leader; the in-sync replica set (ISR) tracks
replicas sufficiently caught up under the broker's rules. With
`acks=all`, the leader waits for the current ISR, and
`min.insync.replicas` can reject writes when too few replicas remain in sync.
For example, replication factor 3 and minimum ISR 2 trade write availability
for stronger protection than accepting writes with only one in-sync replica.
Producer retries/idempotence, clean leader election, correlated failures and
operator actions still matter. This is not “no loss forever.”
Modern Kafka uses KRaft for metadata management; historical deployments used
ZooKeeper, so do not assume ZooKeeper is always part of the architecture.

<details class="learning-answer">
<summary>Predict: can three classic-group workers all own a partition when there are two?</summary>
<p>No. At most two have assignments in this example. Another independent
group has its own assignments and offsets; it does not steal these records.</p>
</details>

## 5. SQS: a managed queue with a visibility lease

SQS Standard offers at-least-once delivery and best-effort ordering: duplicate
and out-of-order deliveries must be handled. Receiving a message makes it
temporarily invisible under a visibility timeout; it is not a permanent lock.
Delete using the current receipt handle **after** committing the local inbox
and effect/job. Even during visibility, Standard duplicates remain possible.
If processing takes longer than the lease, extend visibility before expiry,
within service limits; if a worker crashes or renewal fails, the message can
become visible for another worker. A stale worker must not be trusted as the
sole owner of an external action. A delete or renewal response can be lost,
so retain idempotency and reconcile uncertain outcomes.

In this lesson's simplified clock example, a message is received at second 0
with a 30-second timeout. At second 29 it is invisible; without renewal it
becomes eligible for another receive at second 30. A renewal at second 20
setting a further 30 seconds moves the modeled expiry to second 50. Commit
the job before deleting; a crash between those steps causes a safe duplicate
only if inbox deduplication actually works.

FIFO queues order messages within a **message group**, not across all groups.
Their send deduplication window is five minutes: repeated sends with the
same deduplication ID within that window can be suppressed. This does not
make every external email end-to-end exactly once, especially across a
longer retry, visibility expiry, external timeout, or replay. FIFO ordering
also requires the application not to introduce out-of-order side effects.
Provider limits, quotas, pricing and delivery semantics vary; terms such as
ACK, retry and DLQ are not interchangeable guarantees across products.

<details class="learning-answer">
<summary>Predict: is the message safely finished just because it is invisible?</summary>
<p>No. Visibility is a time-limited lease, not a commit. Renew when needed,
commit the local work first, and delete with the receipt handle afterward.</p>
</details>

## 6. Name the guarantee and its boundary

For a defined broker-to-consumer boundary, **at-most-once** means an accepted
broker record is delivered zero or one times under the stated policy. For
example, advancing a position before processing can lose work on crash.
It says nothing about duplicate logical events independently produced upstream,
or a consumer repeating an external action; “no duplicates anywhere” is
not implied.

**At-least-once** aims for one or more deliveries within a defined boundary,
not magic indefinite survival. It requires the chosen durable publication,
retry and recovery policy, retention longer than the outage and enough
capacity, and failures inside the assumed fault model. Expiry, disabled
retries, an exhausted budget, an unoperated DLQ, or catastrophic loss can
prevent processing. Duplicate attempts are normal.

**Exactly-once effect** must identify the effect, scope and assumptions.
A transactional inbox plus local effect can make the local database result
once per scoped ID, if uniqueness, atomicity and retained dedup state hold.
This does not prove a single email. Kafka transactions can atomically commit
consumed offsets and Kafka output records for a properly configured
consume-transform-produce pipeline; transactional producers and
`read_committed` consumers are part of the required setup. Aborted records
are not visible to `read_committed` readers. That transaction does not
automatically include an external database or email provider. Those require
their own cooperation, transactional integration or idempotency and
reconciliation. Neither the label nor a retry alone supplies that cooperation.

<details class="learning-answer">
<summary>Predict: does deduplicating the local job prove exactly one mailbox delivery?</summary>
<p>No. It protects the local job only. Provider acceptance, ambiguous
timeouts and downstream delivery need their own contract and recovery plan.</p>
</details>

## 7. Validate first, then classify failure

Treat messages as versioned contracts. Agree on a schema version, required
fields, type and size limits, compatible changes and allowed event types.
The minimal completion fact above is the existing body; if adding version
metadata, negotiate a separate envelope or a new contract rather than
pretending the existing JSON already contains it. Validate source identity,
tenant and authorization independently of schema validity.

| Failure | Example | Response |
|---|---|---|
| Malformed or unsupported | Invalid JSON, missing ID, unsupported version | Quarantine with safe diagnostics; do not retry in a hot loop |
| Permission or policy | Producer lacks permission for learner/tenant | Reject or isolate, alert and investigate; don't grant access automatically |
| Temporary | Database unavailable or provider rate-limited | Retry with bounded backoff if safe and within deadline |
| Ambiguous external result | Send request timed out after possible acceptance | Reconcile or retry with a supported stable idempotency key |
| Conflicting identity | Same producer ID but different payload | Stop and investigate; never silently treat as the same operation |

A temporary authorization-system outage can itself be transient; an actual
authorization denial is not fixed by repeatedly sending the same request.
The policy must distinguish these cases without leaking sensitive details.
An invalid payload may be repaired by an authorized workflow, but don't
silently rewrite the original fact or reassign its producer ID.

For a lesson retry policy, allow at most five total attempts before the
15-minute deadline, whichever comes first. After a temporary failure choose
random jitter within a capped exponential delay, e.g. zero to 1, 2, 4 and
8 seconds after the first four attempts. Respect provider retry guidance
and rate limits. These are illustrative policy numbers, not product defaults.
Retries consume capacity and can amplify an outage; pause or reduce rate
when a dependency is failing. Immediate unlimited retries create a hot
poison-message loop and starve healthy work.

## 8. DLQ is isolation, not success

A dead-letter queue or equivalent quarantine holds messages that could not
be processed under a configured policy. Exact triggers differ: some products
provide native dead-letter routing, while others need an application-managed
retry/quarantine design. Moving an item is not a successful business effect.
The movement itself can fail, permissions can be wrong, retention can expire,
and an unmonitored DLQ simply hides the outage.

Store enough **safe** context to diagnose the item: original producer ID,
message type/version, source, failure class, attempt count, first/last failure
time and a sanitized error code. Restrict payload access, encrypt as required,
avoid credentials, raw provider responses and unnecessary personal data in
logs, and define retention and deletion. An attempt or DLQ wrapper may have
its own diagnostic ID, but must retain `email-completion-42` as the original
command ID. A DLQ entry is not a receipt proving the email was sent.

### A controlled redrive

1. Alert on DLQ count **and age**, assign an authorized owner, and inspect
   a sample and aggregate failure classes without exposing private data.
2. Identify and remediate the cause: restore a dependency, fix a consumer,
   negotiate schema compatibility, or resolve an authorization problem.
   Confirm the fix in a safe test; do not bypass access controls.
3. Verify retention, source identity, schema, current authorization,
   business eligibility and whether the event is stale. Decide whether
   ordering dependencies require earlier events, a rebuild, or reconciliation.
4. Select a small explicit batch, preserve original producer IDs and audit
   who selected it. Deduplicate against durable inbox/job and provider state;
   confirm dedup retention covers the old events. Do not send a second
   external email simply because a record was replayed.
5. Redrive at a limited rate with bounded attempts and a deadline. Watch
   successes, duplicates, failures, queue age, provider errors and external
   side effects. Increase gradually only within operational limits.
6. Stop on renewed errors, unexpected external actions, rising backlog age,
   privacy/authorization concerns, or inability to reconcile. Escalate,
   record outcomes, and handle expired or irreparable items explicitly.

An old completion may have been corrected, the learner may have withdrawn
consent, and a later event may already have changed state. “Put everything
back on the queue” is neither a safe ordering plan nor an authorization
check. Replay and redrive can be valuable, but they are business operations.

<details class="learning-answer">
<summary>Predict: a DLQ record is redriven after the inbox entry expires. Is it automatically safe?</summary>
<p>No. The deduplication evidence may be gone. Reconcile the original action,
authorization and provider state before deciding whether redrive is safe.</p>
</details>

## 9. Backlog, capacity and cost: calculate before scaling

Use the shared `queueBudget` fixture for a simple fluid model. Assume a
starting backlog of zero, steady rates, work-conserving processing, identical
jobs, no retries or limits, and no maximum queue retention:

| Interval | Arrivals/s | Processing/s | Net change/s | Duration | Backlog change |
|---|---:|---:|---:|---:|---:|
| overload | 10 | 4 | +6 | 60 s | +360 |
| recovery | 2 | 4 | -2 while backlog exists | 180 s | -360 |

After 60 seconds, backlog is `(10 - 4) × 60 = 360` messages.
At recovery, new arrivals continue at 2/s while service handles 4/s;
the net drain is 2/s, so 360 ÷ 2 = **180 seconds**. During those 180
seconds another 360 messages arrive and 720 are processed. Dividing by
4 would ignore continued arrivals. If capacity equals arrivals, backlog
does not drain; if capacity is lower, it grows. Real queues have burstiness,
variable work, concurrency constraints, retry traffic and retention limits.

Measure oldest-message **age**, not only length, plus arrival rate, processing
rate, error rate, retry rate, DLQ age, processing latency and downstream
health. A small backlog with one very old item can hide starvation; Kafka
lag is a position difference, not always wall-clock latency. Alert against
business deadlines and retention before work expires. To restore capacity,
reduce arrival rate, fix the dependency, increase safe parallelism, or
change work; verify that the bottleneck actually moves.

More classic-group consumers than two partitions do not increase partition
ownership in the two-partition example. More partitions can improve parallelism
for many keys, but a single hot key may still be constrained to one partition,
and repartitioning affects routing and ordering. Parallel handlers may also
break effect ordering. Scale only after checking skew, downstream capacity,
and semantics. Retry storms may make added consumers worsen a provider outage.

Costs include broker operations, storage and retention, replication, compute,
network transfer, requests, monitoring and staff time; managed services reduce
some operational work, not the need to operate the application. Provider
quotas, throughput, message size and region affect fit and cost; verify
current provider pricing. These examples are conceptual and require no
account, broker deployment, or live infrastructure.

## 10. Fit changes when requirements change

**Initial requirement:** completion must eventually create a single local
email job and the sender needs flexible routing to dedicated worker queues.
A RabbitMQ direct exchange with a durable, appropriately configured queue,
publisher confirms and consumer inbox is a plausible choice. The queue is
for work distribution, not an indefinite audit log. Its replication and
failure policy must match the service's actual availability requirement.

**Changed requirement:** analytics and certificates independently need
the same completion history and must rebuild their state for a bounded
window. A Kafka topic with separate groups, suitable keying, retention and
replication is a plausible fit. Each group can replay only retained data;
the email group still needs protection from replaying external side effects.
Kafka's operational complexity and retention costs may outweigh the benefit
when only one small work queue is needed.

**Changed constraint:** the team wants AWS-managed queue operations for a
single worker pipeline and accepts provider integration and limits.
SQS Standard with idempotent jobs is a plausible fit. If ordering within a
specified group is required, consider FIFO and its throughput and dedup
scope; neither queue type proves email delivery. A managed queue is not an
indefinitely replayable event store, and the application still owns retries,
inbox, privacy and redrive.

**Counterexample:** choosing Kafka only because “all consumers finish in
partition order” fails when one consumer runs concurrent handlers or a
rebalance repeats unfinished work. Choosing SQS FIFO only because “five
minutes of dedup means one email forever” fails after that window or after
an ambiguous provider timeout. Choosing RabbitMQ only because “publisher
confirm means the email was sent” confuses broker and external boundaries.
Any one of these products can be a bad fit if the required boundary, cost,
order, replay window or operational ownership is missing.

The original chapter's company stories are illustrative scenarios, not
verified descriptions of any company's private current architecture.
Make the decision from measured workload and an explicit failure model, not
from a company name or a generic product ranking.

## 11. Practice and check

1. The broker accepted a command but the publisher never saw the confirm.
   What ID should a retry carry, and what must the consumer protect?
2. A Kafka group completed P0 offsets 0 and 2, but offset 1 is still failing.
   Can it safely commit next offset 3?
3. A Standard queue's visibility expires after the job commits but before
   delete. What should the second worker do?
4. A DLQ contains 500 old commands after a provider outage. Describe the
   first batch and two reasons to stop.
5. At 10 arrivals/s and 4 completions/s for a minute, how large is the
   backlog? How long to drain when arrivals fall to 2/s?

<details class="learning-answer">
<summary>Check your reasoning</summary>
<p>1. Preserve <code>email-completion-42</code>; deduplicate an atomic local
job and separately protect/reconcile the external action.
2. No: do not advance past an incomplete earlier record.
3. Find the committed inbox/job and avoid a second job; then acknowledge
according to the queue's rules.
4. Remediate and validate first, redrive a small authorized, rate-limited
batch with original IDs and deduplication; stop for renewed failures or
unexpected external actions (also stop for privacy, ordering, or age risks).
5. 360 messages; at net 2/s, 180 seconds.</p>
</details>

## Primary references

These are public product references, not deployment instructions:

- [RabbitMQ exchanges](https://www.rabbitmq.com/docs/exchanges),
  [consumer acknowledgements and publisher confirms](https://www.rabbitmq.com/docs/confirms),
  [quorum queues](https://www.rabbitmq.com/docs/quorum-queues),
  [classic queues](https://www.rabbitmq.com/docs/classic-queues), and
  [streams](https://www.rabbitmq.com/docs/streams).
- [Apache Kafka documentation](https://kafka.apache.org/documentation/),
  including its producer, consumer, broker and topic configuration;
  [Kafka design](https://kafka.apache.org/documentation/#design) covers
  replication, delivery semantics and transactions.
- [Amazon SQS Standard queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html),
  [FIFO delivery logic](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-understanding-logic.html),
  [visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html),
  and [dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html).

Check the documentation for your product version and configuration before
making a production claim. Service limits and prices can change.
