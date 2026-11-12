# Distributed transactions and recovery

A transaction has a boundary. Before choosing a distributed protocol, draw that
boundary and name the invariant that must survive a failure.
One service and one database can be the best solution when they can own the
required state. Splitting a working application is not a prerequisite for
learning this lesson.

This is a complete branch from the
[expert journey](../07-GUIDED-EXPERT-DESIGN.md).
The [original expert chapter](../08-EXPERT-API-DESIGN.md), especially module 7.5,
remains available with every original explanation and example.
The [earlier workflow lesson](OUTBOX-INBOX-AND-WORKFLOWS.md) establishes the
completion/outbox example; here we examine a new reservation invariant and
the difference between atomic commit and fallible business recovery.

## What you should be able to explain

- Which changes a local rollback can actually undo.
- What a prepared two-phase-commit participant has promised.
- Why a timeout is not a definitive external failure.
- How an outbox, inbox and workflow state solve different problems.
- Why compensation does not provide global ACID isolation.
- Which recovery record makes a retry safe, and when human reconciliation is needed.

## 1. Keep the existing confirmed record

Our current platform has `course-101`, **API Fundamentals**, with
**29 available seats**. `learner-7` already has `enrollment-42`; completion
and an email do not reserve another seat.
These values remain in the
[shared expert fixtures](../../assets/expert-lesson-fixtures.mjs).

For the following independent product branch, **learner-8** requests a new
enrollment. Suppose this fictional enterprise-training product requires an
external lab license before that new enrollment is confirmed.
This requirement does not apply to the documentation website.
The course, hosting and teaching tools remain free; there is no real license
provider, account, payment, or deployed enrollment endpoint here.

The new invariant is:

> A confirmed new enrollment must own one seat and a confirmed lab license.
> While the external outcome is unknown, expose a tentative state, not success.

One seat can be reserved temporarily, so the example moves **29 → 28**.
Confirmation consumes that reservation without decrementing again.
A definitively failed request can release its own reservation once,
moving **28 → 29**. The existing learner-7 enrollment is never deleted.

The stable intent is:

<!-- example: reservation-intent -->
```json
{
  "intentId": "reserve-license-8-a",
  "learnerId": "learner-8",
  "courseId": "course-101",
  "reservationId": "reservation-8",
  "providerKey": "license-reservation-8"
}
```

These are fictional identifiers. `providerKey` identifies an operation;
it is not a credential or permission to enroll.
In a real service, identity, authorization and seat policy are checked before
the reservation. A client cannot grant itself a license by sending this JSON.

<details class="learning-answer">
<summary>Predict: should confirmation reduce 28 seats to 27?</summary>
<p>No. The reservation already accounts for this new learner's one seat.
Confirmation changes its status, not the number of seats reserved.</p>
</details>

## 2. The simplest useful transaction

If one database owns courses and reservations, it can atomically record:

1. A guarded seat decrement.
2. A reservation with a unique logical intent.
3. An outbox command requesting the external license.

The outbox does not contain proof that the license was granted.
It records that the application must attempt that work.

The following SQL illustrates the write boundary used by the local probe.
The full schema, parameter bindings and checks are in the
[transaction validator](../../scripts/validate-expert-transactions.mjs).
The application verifies that the guarded update changed exactly one row.

```sql
BEGIN IMMEDIATE;
UPDATE courses
SET seats = seats - 1
WHERE id = ? AND seats > 0;
INSERT INTO reservations
  (id, intent_id, learner_id, course_id, provider_key, fingerprint, status)
VALUES (?, ?, ?, ?, ?, ?, 'awaiting-provider');
INSERT INTO outbox (reservation_id, payload)
VALUES (?, ?);
COMMIT;
```

If any statement fails before commit, rollback restores **all three local
changes**. The database's uniqueness constraint and transaction isolation
must coordinate concurrent attempts. A prior unprotected “does it exist?”
lookup is not enough across processes.

The intent fingerprint binds the key to the meaningful operation.
JSON member order alone should not make the same request conflict.
Reuse with a different learner or course is a conflict, not another seat.
Define key scope, retention and expiry behavior; the example does not imply
deduplication forever.

### What is outside this boundary?

An HTTP call to a license provider is outside the SQLite transaction.
The same is normally true of charging a card or sending an email.
Putting `Charge Payment` between `BEGIN` and `COMMIT` does not make that
external action rollbackable.

A local database transaction can undo an uncommitted **payment record** it
owns. It cannot automatically undo a payment already accepted by a separate
provider. Transactional-resource participation must be explicit.
This qualifies the original monolith sketch; it does not remove its useful
point about keeping related local writes together.

<details class="learning-answer">
<summary>Predict: does rolling back the reservation also undo an HTTP license call?</summary>
<p>No. A separate provider is outside the database transaction unless it
genuinely participates in a supported atomic-commit protocol. Avoid issuing
that external effect before the local intent is safely recorded.</p>
</details>

## 3. Follow the outbox beyond commit

```text
Seat + reservation + outbox: one local commit
                     |
                 relay reads
                     |
             request license with stable key
                     |
            provider may commit its own effect
                     |
             relay records dispatch progress
```

Text alternative: the local commit preserves the seat, reservation and
request intent together. A relay later sends the command to a separately
transactional provider. Recording dispatch progress is another local action.

Consider this failure:

1. The reservation/outbox transaction commits.
2. The relay sends `license-reservation-8`.
3. The provider grants the license.
4. The response or the relay's progress marker is lost.
5. A retry sends the request again.

An outbox prevents losing the **intent** between business commit and
publication. It does not eliminate this duplicate window.
The provider must implement a suitably scoped idempotency/replay policy,
or the application needs reconciliation and duplicate-effect repair.
An application-generated key alone does not make a provider idempotent.

Do not mark a request sent before making the external call and infer that
the effect happened. Conversely, “sent” is not “granted,” and a broker ACK
is not proof of the final business result.
Monitor outbox age, attempts, rejection, retry exhaustion and reconciliation.
Bound storage and retry traffic; durable intent cannot overcome a permanently
unavailable provider or a full disk.

## 4. Make uncertainty visible

The reservation has explicit states:

| State | What is known | Seat | Safe action |
| --- | --- | --- | --- |
| `awaiting-provider` | Local reservation committed; terminal result not recorded | Reserved | Dispatch within the bounded policy |
| `unknown` | A request may have taken effect but no terminal result is known | Reserved | Reconcile provider state |
| `confirmed` | A verified grant and local enrollment were recorded | Consumed | Return the confirmed result |
| `released` | A definitive rejection allowed local compensation | Available again | Report failure, not enrollment success |

`unknown` is a statement about knowledge, not a provider result.
The provider might have granted the license, rejected it, or still be working.
Do not map a timeout to a synthetic `rejected` receipt.

An API could expose a reservation/status resource with a documented pending
representation. It must distinguish that from a confirmed enrollment.
The existing seven-operation OpenAPI file does not define this new interface;
it would need its own reviewed contract before implementation.

### Timeout walkthrough

1. The local reservation reduces seats to 28.
2. The license request times out after dispatch.
3. Record `unknown`; retain the reservation under its bounded policy.
4. Query the provider using the stable operation identity, or replay safely
   if its contract supports that.
5. A verified terminal result determines the next local transaction.

A hold cannot last forever without a product policy.
Specify expiry, renewal, reconciliation deadlines and escalation.
If expiry releases a seat before a late grant arrives, recovery must either
reacquire an appropriate seat or cancel the license according to the
provider's confirmed state. It cannot simply claim the invariant still holds.

<details class="learning-answer">
<summary>Predict: is releasing the seat immediately after the timeout always safer?</summary>
<p>No. A late or already committed license could then exist without a seat.
Keep the uncertainty explicit and use the documented reconciliation and hold
policy rather than guessing success or failure.</p>
</details>

## 5. Commit the receipt and local effect together

A verified `LicenseGranted` fact is not a command to grant another license.
It reports a provider result. `GrantLicense` would be a distinct command.
Similarly, `PaymentCompleted` is not automatically an instruction to charge again.
Message type, producer authority and intended effect must be clear.

For a terminal receipt:

1. Validate its trusted source and operation association.
2. Find the reservation it belongs to.
3. Compare its logical identity and semantic fingerprint.
4. In one local transaction, record the inbox receipt and apply the local
   enrollment or release transition.
5. Acknowledge only after the required local commit.

```text
Receipt: LicenseGranted(reservation-8)
             |
        validate provenance + intent
             |
        BEGIN local transaction
        Inbox receipt + enrollment-8 + confirmed reservation
        COMMIT
             |
        acknowledge / advance processing
```

Text alternative: receipt identity and the local enrollment effect are
committed together. A repeated receipt then finds the same recorded outcome.
An inbox committed separately before the effect can suppress necessary work;
an effect committed before the inbox can repeat that work.

The new local result is `enrollment-8` for learner-8.
`enrollment-42` for learner-7 remains intact.
Seats stay at 28 because confirmation does not allocate a second seat.

Reject a reused receipt ID with a conflicting terminal result.
Do not silently discard the conflict as an ordinary duplicate.
Two different messages can also describe one logical operation, so retain
business uniqueness constraints in addition to delivery-ID deduplication.

The inbox protects this **local** transition.
It does not atomically include the separately owned license provider.
The full workflow still has tentative states, recovery and a fault model.

## 6. Compensation is a new transaction

Suppose a verified provider result is definitively `LicenseRejected`.
The service can atomically record the receipt, mark its reservation released,
and return its one reserved seat.

If the local release transaction fails, retry it.
If the result is delivered twice, the second delivery must not make seats 30.
Use the reservation's state transition and the receipt/business identity,
not an unconditional `seats = seats + 1`.

For a known external grant followed by another failure, canceling that
license would be a separate provider operation with its own identity and
recovery. A cancellation timeout becomes another unknown outcome.
Do not declare all compensation complete before those outcomes are confirmed.

The original refund example remains valuable as a transfer case:

- A refund is a new observable payment operation.
- It can fail, take time, incur a fee, or require reconciliation.
- A successful refund does not erase the historical charge.
- Canceling an order does not unread an email or reverse a shipped parcel.

Sagas compose **local commits and business compensation**.
They do not make every intermediate state invisible or supply global ACID
isolation. Concurrent workflows still require local constraints and product
rules about pending state, reservations and conflicting actions.

<details class="learning-answer">
<summary>Predict: what protects the seat count when rejection is delivered twice?</summary>
<p>The receipt and guarded reservation transition are committed together.
The second matching delivery finds an already processed result and does not
release another seat.</p>
</details>

## 7. Choreography or orchestration?

Both styles can implement the same workflow; neither solves uncertain outcomes
or idempotency merely by choosing a communication style.

| Style | Who directs progress? | Useful fit | Cost |
| --- | --- | --- | --- |
| Choreography | Participants react to named facts | Few independently meaningful reactions | Hidden dependencies and hard-to-follow event chains |
| Orchestration | A workflow owner records and directs steps | Explicit multi-step recovery and visibility | Durable workflow ownership, recovery and availability |

For choreography, distinguish `ReservationCreated` from `GrantLicense`.
A participant must know why it is permitted to act and which result to emit.
Define failure, compensation and terminal states, not only the happy event chain.

For orchestration, persist the workflow and step identities.
A restarted orchestrator must reconcile a dispatched-but-unknown step rather
than create a fresh license operation.
An orchestrator is not necessarily a single unreplicated process, but multiple
workers still need safe ownership, concurrency control and fenced actions.
See [consensus and coordination](CONSENSUS-AND-COORDINATION.md) for a different
problem: agreeing on replicated state or coordination authority.

Use the simplest style whose progress and failure paths your team can explain.
For a few local writes, one transaction can remain simpler than either style.

## 8. Two-phase commit asks a different question

Two-phase commit (2PC) coordinates an **atomic commit decision** across a
specified set of participating transactional resources.
It is not a protocol that any arbitrary HTTP service automatically supports.
An external license, email or payment API may not be an eligible participant.

### Prepare

The coordinator asks each participant to prepare.
A YES means more than “the endpoint seems healthy.”
The participant has validated the transaction and preserved enough state to
honor the eventual commit decision under the supported recovery model.
Prepared resources can retain locks and other obligations.
The exact logging, persistence and isolation depend on the implementation.

### Record and distribute the decision

If all required participants prepare, the coordinator can record COMMIT,
then send that decision. If a participant refuses before a commit decision,
the coordinator can choose ABORT.
The authoritative decision must survive the supported failures; an in-memory
flag is not a production durability guarantee.

```text
Coordinator          Participant A       Participant B
PREPARE -----------> prepare YES
PREPARE --------------------------------> prepare YES
record COMMIT
COMMIT ------------> commit
COMMIT ---------------------------------> commit
```

Text alternative: participants first promise to honor the outcome; the
coordinator records one decision and communicates it to all of them.
Messages and recovery may be delayed. Atomic commit does not mean every
client observes every participant's result at the exact same instant.

### Coordinator failure after prepare

If a prepared participant cannot learn whether COMMIT was recorded, it
cannot safely substitute “timeout means abort.”
Another participant might already have committed.
Classical 2PC can block while the decision is unavailable; recovery retrieves
and follows the recorded decision.
Availability, locks, logging, network round trips and operating ownership
are real costs.

2PC's atomicity is distinct from an isolation level such as serializability.
It does not automatically provide the application's entire “strong consistency”
requirement or undo uncoordinated external effects.
Some databases and controlled deployments support it; popularity is not a
reason to rule it out, nor a reason to force it onto incompatible services.

<details class="learning-answer">
<summary>Predict: can a prepared participant independently abort because the coordinator timed out?</summary>
<p>Not when a commit decision might exist elsewhere. It must recover the
authoritative decision according to the protocol; the in-doubt interval is
one reason classical 2PC can block.</p>
</details>

## 9. Do not confuse atomic commit with consensus

2PC asks participating transactions to agree to one commit or abort outcome.
Raft/Paxos-based systems solve agreement over replicated values or logs under
their membership and failure assumptions.
A replicated coordinator can use consensus to protect its decision record;
that does not make every unprepared external participant transactional.

A consensus-backed seat store can serialize supported seat decisions.
It cannot by itself atomically include an unrelated license provider.
An outbox can bridge durable intent to that provider, but retries and
reconciliation still have their own boundary.
The concepts can cooperate without becoming an “increasingly advanced”
technology ladder.

## 10. Choose by the invariant, not the company name

| Situation | First approach to evaluate |
| --- | --- |
| Related state can be owned by one database | One guarded local transaction |
| Multiple compatible transactional resources require atomic commit | Supported distributed transaction/2PC, including blocking and recovery |
| A long-running business flow includes separately committed effects | Explicit saga/workflow with compensation and uncertainty policies |
| A local commit must eventually initiate external work | Outbox with relay recovery and duplicate handling |
| Repeated delivery must not repeat a local effect | Inbox plus atomic effect and business uniqueness |
| Replicas need one ordered decision history | Appropriate consensus-backed storage, with its actual consistency guarantees |

Named company examples in the reference are teaching illustrations, not
verified current descriptions of those companies' private implementations.
Explain the required behavior and operating cost before selecting a protocol.

## 11. Check the examples, and understand the limit

The built-in SQLite probe exercises real local transactions in memory:

- Failure before reservation/outbox commit restores seats to 29.
- A matching intent replay does not reserve another seat.
- A changed intent under the same key is rejected.
- An ambiguous dispatch records unknown without releasing or confirming.
- Inbox and local enrollment/release transitions rollback together.
- A matching duplicate terminal receipt does not repeat its local effect.

It also exercises a small abstract 2PC decision/recovery model.
That is not a distributed transaction implementation or liveness proof.
No broker, provider, cluster, disk crash, or actual multi-region deployment
is tested. In-memory transaction rollback is not disk-durability evidence.
Production confidence needs the actual resources, recovery configuration,
integration tests and controlled failure exercises.

## 12. Recall and transfer

Without looking, draw the boundary around the seat, reservation and outbox.
Put the provider outside it. Mark where a timeout becomes unknown.
Then explain how a repeated grant fact can cause one local enrollment.

For a bookstore transfer, replace seat/license with inventory/payment.
If the charge is unknown, do not guess that compensation succeeded.
If a confirmed charge requires a refund, track that refund as another operation.

Changed condition: the license requirement disappears and the database can
own all required enrollment state. Explain why one local transaction may now
be preferable to retaining the workflow machinery.

<details class="learning-answer">
<summary>Predict: does removing a requirement mean we should keep the saga because it is more advanced?</summary>
<p>No. Remove unnecessary coordination when the simpler design preserves
the actual invariant and has better understandable failure behavior.</p>
</details>

## Continue

- [Expert journey](../07-GUIDED-EXPERT-DESIGN.md)
- [Complete original expert reference](../08-EXPERT-API-DESIGN.md)
- [Regions and consistency](REGIONS-AND-CONSISTENCY.md)
- [Consensus and coordination](CONSENSUS-AND-COORDINATION.md)
- [Reliability, observability and incidents](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md)
- [Earlier outbox/inbox and workflows](OUTBOX-INBOX-AND-WORKFLOWS.md)
- [Course topic library](../COURSE-CONTENT-MAP.md)
- [Corrections and distinctions](../CONTENT-CORRECTIONS.md)

Primary background:
[transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html),
[saga](https://microservices.io/patterns/data/saga.html),
and [compensating transactions](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction).
