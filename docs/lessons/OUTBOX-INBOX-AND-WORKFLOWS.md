# Outbox, inbox, and workflows: boundaries are the design

## Fast path: one fact, several separate promises

In the independent post-enrollment timeline, **API Fundamentals**
(`course-101`) has 29 available seats after `enrollment-42`. The authenticated
learner is `learner-7`. The earlier 20% and 40% previews are not completion;
**40% is not completion**. A later action records `completion-42`.
The shared [async fixtures](../../assets/async-lesson-fixtures.mjs) define:

```json
{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

This fact says something happened; it does not itself send an email or issue a
certificate. The fixture's `emailCommand` and `certificateCommand` are separate
instructions, with IDs `email-completion-42` and `certificate-completion-42`.
Their types are `SendCompletionEmail` and `IssueCertificate`, respectively.
They reference the completion, course, and learner:

```json
{"id":"email-completion-42","type":"SendCompletionEmail","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

```json
{"id":"certificate-completion-42","type":"IssueCertificate","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

The fact deliberately has no enrollment ID. A consumer that needs enrollment
context must look it up from an authoritative source using an appropriately
scoped reference. It must not infer that a learner can complete a course only
once forever. Our teaching policy enforces **one completion per enrollment**;
a later re-enrollment can legitimately have its own completion.

Authenticate the event source and authorize its tenant, course and learner
scope before acting. Payload identity alone is not evidence of permission.
The [webhook lesson](WEBHOOKS-AND-BACKGROUND-JOBS.md) describes one signed
delivery policy; an event bus likewise needs producer authentication and ACLs.

**Read first:** a local transaction can join a completion record with an
outbox row; a relay publishes later. A consumer can join its inbox receipt
with its own database effect. Neither transaction includes arbitrary external
email or a broker. For the event model and replay, continue with
[event models and projections](EVENT-MODELS-AND-PROJECTIONS.md).

Text diagram, read left to right: the first pair shares one local transaction;
the relay and consumer are separate boundaries.

```text
completion + outbox --commit--> relay --publish--> inbox + certificate effect
     local database                  broker          consumer database
```

<details class="learning-answer">
<summary>If the fact is valid JSON, is it automatically authorized?</summary>
<p>No. Authenticate the source and authorize its scope independently, then
validate the content and resolve any needed enrollment context.</p>
</details>

## 1. Two ways a dual write breaks

Suppose the completion handler writes its database, commits, then publishes
the completion fact directly. The database commit succeeds; the broker is
unavailable, or the process exits before publish. The learner is completed,
but no subscriber is informed. Returning success for the database write does
not make the publication durable.

Reversing the order does not fix this. Publish first and a certificate reactor
may act on the event. If the database transaction subsequently rolls back,
the certificate describes a completion that never committed. Even publishing
inside an open database transaction does not enlist the broker in that
transaction. The fact may escape before the commit outcome is known.

Retries by themselves cannot repair every window. A retry needs durable
knowledge of *what* remains to be sent. Nor does an optimistic response from
a broker make a failed local commit true. The problem is atomicity across
independent resources, not merely network latency.

<details class="learning-answer">
<summary>Why not publish first and roll back the broker if the database fails?</summary>
<p>A normal broker publish is not part of the database rollback. Consumers
may already have observed it; a later corrective event is a new business fact,
not an erasure of what they saw.</p>
</details>

## 2. Completion and outbox: one local commit

The handler checks authorization and completion criteria, resolves the
enrollment, and opens a transaction in the completion database. It inserts the
completion with a unique enrollment key and inserts the exact fact into an
outbox row with a stable event ID. Both writes commit or both roll back.
The unique enrollment constraint, rather than a prior check alone, resolves
concurrent completion attempts. On a conflict, return or reconcile the
already committed completion under the API's policy.

An outbox row normally also tracks creation time, publication state, attempt
count and a claim/lease. Its payload is an integration contract; protect it
and minimize personal data. The event ID remains stable through retries.
Do not silently regenerate IDs for the same logical fact.

This transaction guarantees a committed completion has a durable publication
intent **in that database**, subject to its actual durability configuration.
It does not prove that the relay will run, the broker will accept the message,
the consumer will process it, or a learner will receive an email.
Monitoring, operational ownership, backup and recovery still matter.

| Failure point | Local result | Next action |
| --- | --- | --- |
| Before commit | Neither completion nor outbox row | Retry the command safely |
| Commit succeeds, relay not yet run | Both rows exist | Relay can later publish |
| Publish accepted, mark not committed | Row remains eligible | Relay can publish again |
| Mark committed after acceptance | Intent recorded as sent | Consumer may still be delayed |

The last row does not certify end-to-end business success. An operator should
measure age of oldest pending row, failed attempts, lease expiry and publication
latency, and alert on stuck work. Retry with bounded backoff and jitter; handle
permanent schema or authorization failures with quarantine and a repair path.
Retention and cleanup must preserve the evidence required by recovery policy.

<details class="learning-answer">
<summary>Can an outbox guarantee a single broker delivery?</summary>
<p>No. If publication succeeds but the relay dies before marking the row,
retry can publish the same stable event again. Consumer idempotency is needed.</p>
</details>

## 3. Relay claims and the duplicate window

Several relay workers can atomically claim available rows, for example by
locking rows or assigning an owner and lease expiry. They publish outside the
short claim transaction, await the broker's configured acknowledgement, and
mark the row sent only if they still own the claim. A dead worker's lease
expires so another can retry; renewal and fencing prevent a stale owner from
incorrectly changing the row after another worker has claimed it.

Even fencing cannot retract an earlier successful publish. A slow worker can
publish after lease expiry while the new worker also publishes. Both may be
accepted. Include the same event ID on each attempt and make receivers safe
against duplicates. Broker acknowledgement is scoped to the broker's
configured durability and replication semantics, not proof of a downstream
effect. Ordering requires an explicit per-key sequencing and relay policy;
parallel claims alone do not ensure it.

If publication repeatedly fails, leave a durable failure record, surface it
to operators and allow controlled re-drive. Do not mark the row sent merely
to make a dashboard green. If a transaction containing a completion rolls
back, no matching outbox intent should escape from that transaction.

## 4. Inbox: one local effect, not a magic delivery guarantee

Suppose the certificate service receives the fact twice. Its inbox stores a
unique `(consumer group, source event ID)` key, plus a fingerprint of the
validated event. Resolve any required remote source data before opening the
short local transaction; a remote lookup does not join that transaction.
In **one transaction**, insert the inbox claim, recheck local business
constraints and insert the local certificate effect, with its own uniqueness
constraint. Commit before acknowledging the delivery. A decision that needs
stronger cross-service freshness or atomicity requires an additional protocol.
After a crash after commit but before acknowledgement, redelivery finds the
matching fingerprint and does not issue another local certificate.

The fingerprint must use a documented canonical representation or the exact
agreed bytes; ordinary JSON property order is not a universal canonical form.
For the same scoped ID with a different fingerprint, quarantine and investigate
instead of treating the message as a harmless duplicate. Different consumer
groups maintain independent receipts because email and certificate reactors
each need to process the fact. Retain receipts for at least the documented
redelivery and replay horizon, and have a policy for older replays.

A naive `SELECT` for an ID followed by an insert and update is unsafe:
two consumers can both see no row. A database unique constraint makes the
claim atomic. A receipt committed separately from the certificate can also
lose the effect if the worker crashes between commits; an effect committed
first can be duplicated if the receipt is not yet committed. Local atomicity
and constraints close those windows, not the mere existence of an inbox table.

If the same business completion is accidentally emitted with another event
ID, inbox deduplication alone is insufficient. A unique certificate key for
the appropriate enrollment/completion and a reconciliation policy protect
the business invariant. A new enrollment is not a duplicate of an earlier one.

<details class="learning-answer">
<summary>Why scope the inbox key by consumer group?</summary>
<p>Each independent group has its own effect. Sharing a single receipt across
groups could make the certificate consumer skip a fact already read by email.</p>
</details>

## 5. The email boundary is different

The inbox database cannot atomically commit an arbitrary email provider's
send. If a worker sends email and dies before recording success, it cannot
know whether a retry sends a second message. Recording success first creates
the opposite risk: no email if the process dies before calling the provider.

One design commits an email job and inbox receipt together, then calls the
provider with a stable idempotency key if the provider actually supports it.
Understand the provider's key scope and retention period. On timeout, query
provider status when possible or reconcile using provider records and a
durable attempt ID. If neither deduplication nor status lookup is available,
the system must explicitly choose and communicate a duplicate-versus-loss
trade-off; human review may be needed. No general exactly-once email claim
follows from an inbox.

Provider acceptance is not proof of delivery, and delivery is not proof that
the learner read the message. Keep personally identifying payloads and logs
restricted, protect credentials, and record only the evidence needed to
recover or investigate. Costs and provider limits also shape retry policy.

<details class="learning-answer">
<summary>A provider times out after the send request. Is it safe to resend?</summary>
<p>The outcome is unknown. Use a provider-supported idempotency key or
reconcile its status; otherwise a resend can create a second email.</p>
</details>

## 6. Choreography and durable orchestration

In choreography the completion fact is published once logically and
independent email and certificate reactors decide what actions to perform.
Each owns its state, inbox and error handling. Adding a new analytics reactor
does not require the completion service to call it directly. The trade-off is
that a complete business workflow can be hard to see: ownership, causality,
timeouts and missing reactions need explicit observability.

In orchestration a workflow service owns durable state such as
`completion-received`, `email-pending`, `certificate-issued`, and failures.
It issues the two commands and records replies; each target remains an
independent service with its own local transaction and deduplication. The
orchestrator persists its state transitions and outgoing intents atomically,
recovers after restart, correlates responses and handles timeouts. Its state is
not a distributed lock on every service and does not make calls atomic.

Choose by business needs. Independent reactions with no joint outcome may be
simpler as choreography; explicit deadlines, dependencies and a visible
overall result may favor orchestration. Neither is automatically preferred.
Define whether the business outcome requires both certificate and email, and
whether email provider acceptance is sufficient. Show `pending` until that
policy is met rather than presenting a fact receipt as completed delivery.

## 7. A different hypothetical: paid enrollment saga

Now consider a **separate hypothetical** in the same learning platform, not
the already completed enrollment timeline. A learner requests a paid seat.
The desired final success is: one valid seat reservation is consumed into an
active enrollment, the payment is confirmed charged, and the same operation
cannot allocate or charge twice. Availability must never become negative.
A pending reservation temporarily reduces availability; it is not an active
enrollment. A failed operation is not fully settled until any known charge is
refunded and its reservation is safely released.

If seat allocation and activation are in the same backend database and can
be committed together at the right moment, prefer a local transaction there.
The external payment provider remains a separate boundary. Do not introduce
a saga just because code has multiple functions.

For illustration, the workflow reserves a seat, requests authorization,
captures a charge, then activates enrollment. Payment state is `pending`,
`authorized`, `charged`, `refunded`, or `unknown`. A `pending` request is not
proof of payment; `authorized` is not a captured charge. `unknown` is an
epistemic state after an ambiguous response, not a declaration of failure.
Persist the provider operation ID, idempotency key, reservation expiry and
workflow state before retrying or deciding on compensation.

| Observation | Safe next decision |
| --- | --- |
| Authorization definitively declined | Release reservation, mark failed |
| Charge confirmed and activation succeeds | Consume reservation, mark success |
| Charge confirmed, activation fails | Request idempotent refund; track until confirmed |
| Charge outcome unknown | Reconcile provider status; do not blindly refund or release |
| Refund request times out | Keep refund pending/unknown; reconcile or retry safely |

The unknown case is important: blindly releasing the seat and declaring
failure could leave a charged learner without enrollment. Blindly refunding
could also be invalid if no charge exists or the provider's API interprets it
differently. Hold or extend the reservation according to a bounded policy,
reconcile with the provider, and escalate if no answer arrives. If a hold
expires before reconciliation, the recovery policy must still protect the
learner, for example by securing another seat or arranging a confirmed refund.

<details class="learning-answer">
<summary>Does a timeout mean the charge failed and the seat can be released?</summary>
<p>No. The provider may have charged despite a lost response. Keep the
outcome unknown and reconcile before choosing a safe next action.</p>
</details>

## 8. Compensation is another operation

Compensation is a business action, not database time travel. A refund may
arrive days later, incur a fee, or fail; releasing a reservation does not
undo a notification someone already read. Each compensation needs its own
durable state, stable idempotency key, retry and escalation path. A repeated
refund request must not refund twice, and a successful refund must be
confirmed before treating the financial part as settled.

The workflow may temporarily expose mixed states: a reserved seat and an
unknown charge, or a confirmed charge while activation is pending. UI and
support tools must call these **tentative**, not final success or final
failure. Concurrent workflows require constraints and isolation in each
local service; a saga does not provide global ACID isolation. Operator
intervention, audit records and reconciliation may be the only safe route
when provider status cannot be determined.

For the completion reactors, failure to send an email is not automatically
grounds to undo an earned completion or revoke a certificate. Business rules
decide which compensations, if any, are appropriate. Retry an email job or
escalate separately rather than pretending the completion never happened.

## 9. Two-phase commit is a different trade-off

Two-phase commit (2PC) asks participating transactional resources to prepare,
then a coordinator records and distributes commit or abort. With compatible
participants and recovery, it provides an atomic commit decision over that
specified set. Prepared participants can hold locks and block while the
coordinator's decision is unavailable; recovery and operational complexity
matter. Atomic commit is not a promise that every external side effect is
reversible or immediately visible.

An arbitrary HTTP payment provider is not necessarily a 2PC participant.
Do not assume XA support or that a database coordinator can roll back a
credit-card charge. When all resources genuinely support the protocol, assess
its cost and failure behavior; otherwise use explicit workflow and
compensation with the limits above. Neither 2PC nor saga is a universal winner.

<details class="learning-answer">
<summary>Is a saga's refund the same as a database rollback?</summary>
<p>No. A refund is a new, observable action that can fail or differ in
effect; a rollback aborts uncommitted changes within its transaction scope.</p>
</details>

## 10. What to test and what it cannot prove

The companion tests exercise pure projection and workflow decisions and
validate examples. A separate built-in SQLite in-memory transaction probe can
demonstrate rollback of completion plus outbox and a unique inbox/certificate
effect. It demonstrates local transaction behavior only: it is not a live
broker, disk-crash durability test, payment provider, or real email delivery.
Production confidence additionally needs integration tests with the actual
database, relay, broker configuration and provider contract, including
failure injection and recovery exercises.

## Original claim ledger and further reading

The original is retained; these are boundaries, not replacements for it:

* [Original async chapter](../05-ASYNC-APIS.md), lines 4236–4250: “Order
  exists / Event missing” correctly illustrates commit then publish failure.
  Lines 4269–4297 place business write and outbox in one transaction and
  publication later; the duplicate window above is the missing qualification.
* Lines 2045–2055 say “Never lose message” for at-least-once. That depends on
  configured storage, acknowledgements, retry and retention assumptions, not
  an unconditional end-to-end promise.
* Lines 2252–2258 say “Exactly-once EFFECT”; lines 2293–2310 suggest an ID
  alone suffices. The receipt and local effect need atomicity and uniqueness;
  external email requires provider cooperation or reconciliation.
* Lines 4364–4377 call saga “The modern solution”; it is one option, not an
  automatic choice. Lines 4435–4438 call it “Business-level rollback”:
  compensation is a new fallible business action, not ACID rollback.

Primary references:
[AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
discusses atomic writes, duplicate publication and idempotent consumers;
[Microsoft saga](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)
and [compensating transaction](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
describe local transactions and fallible compensations;
[Microsoft 2PC](https://learn.microsoft.com/en-us/host-integration-server/core/two-phase-commit2)
describes prepare, commit and the in-doubt state.

Continue: [guided async](../05-GUIDED-ASYNC.md),
[broker delivery and recovery](BROKERS-DELIVERY-AND-RECOVERY.md),
[guided realtime](../04-GUIDED-REALTIME.md),
[course content map](../COURSE-CONTENT-MAP.md), and
[content corrections](../CONTENT-CORRECTIONS.md).
