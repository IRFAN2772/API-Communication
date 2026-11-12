# Event models and projections: history is a choice

## Fast path: distinguish the message from the source of truth

Our independent post-enrollment timeline has **API Fundamentals**
(`course-101`), 29 seats after `enrollment-42`, and `learner-7`. Preview
progress moved from 20% to 40%; **40% is not completion**. Later, an
independent completion action created `completion-42`. The canonical fact in
the [fixture](../../assets/async-lesson-fixtures.mjs) is:

```json
{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

The fact does not carry an enrollment ID. A consumer that needs it must
resolve authorized enrollment context from an authoritative source. Completion
uniqueness is per enrollment, not per learner/course forever: re-enrollment
can create another legitimate completion. Authenticate the source and enforce
its tenant and resource ACL; learner IDs in payloads are not authorization.

The fixture's `emailCommand` and `certificateCommand` are separate
instructions, not facts:

```json
{"id":"email-completion-42","type":"SendCompletionEmail","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

```json
{"id":"certificate-completion-42","type":"IssueCertificate","completionId":"completion-42","courseId":"course-101","learnerId":"learner-7"}
```

The shortest useful distinction is: a **command** requests an action; a
**fact** records an accepted occurrence. An **event notification** can tell a
consumer where to look for current data. A **state-carrying event** includes
selected data for consumers. **Event sourcing** makes a stream of domain
facts the authoritative write history for a particular aggregate. Publishing
an event, even a rich one, does not by itself make a system event-sourced.

Read this core, then choose the deeper sections on version gaps, replay and
CQRS. For the write/publication boundary and workflows, see
[outbox, inbox, and workflows](OUTBOX-INBOX-AND-WORKFLOWS.md).

Text diagram: the write model accepts a command; a fact can feed two
independent read models. Replay builds views without executing external
actions.

```text
command -> authoritative write -> facts -> learner progress view
                                     -> reporting view
                         safe replay -> rebuilt views only
```

<details class="learning-answer">
<summary>Does publishing a completion event make the event log authoritative?</summary>
<p>No. A conventional database can remain authoritative and publish an event
after a transaction. Event sourcing is a separate choice of write model.</p>
</details>

## 1. Start with current state and a notification

A simple Course database can store the current enrollment and completion
records. A learner query reads current state; a completion command validates
business rules and changes it. This is often sufficient, and it can maintain
an audit table without making events the source of truth. If no other
component needs the change, no broker or event store is necessary.

When email and certificate services need to react independently, the Course
service can publish a completion notification through a transactional
outbox. The notification decouples the timing of the receivers from the
command handler, but it does not eliminate dependency on a contract or a
source for additional information. Receivers may look up authoritative
enrollment context. Lookup availability, authorization, privacy, retries and
the possibility that current state has changed since the notification are
real design costs.

Alternatively, a state-carrying event includes the selected data consumers
need at the time of the occurrence. That can reduce synchronous lookups but
creates copies, increases schema and privacy obligations, and may propagate
stale information. Neither event style is automatically superior. A fact is
not a command just because one consumer reacts to it by creating a command.

<details class="learning-answer">
<summary>Can a notification consumer safely assume lookup returns historical state?</summary>
<p>No. A current-state lookup can return a later version. Include a version or
an explicitly contracted historical query if the business decision needs one.</p>
</details>

## 2. A deliberately different envelope

The fixture supplies `projectionEvents` as an **alternative event-store
envelope**, not a change to the Phase 4 signed webhook body. Its aggregate
is `learner-7/course-101/enrollment-42`; its version numbers are sequence
positions within that aggregate, not timestamps, broker offsets or globally
ordered IDs. The source fact retains its exact `id`, `type`, and `data`.

```json
[
  {
    "id": "progress-20",
    "type": "course.progress-recorded",
    "aggregateId": "learner-7/course-101/enrollment-42",
    "version": 1,
    "data": {"courseId": "course-101", "learnerId": "learner-7", "percentComplete": 20}
  },
  {
    "id": "progress-40",
    "type": "course.progress-recorded",
    "aggregateId": "learner-7/course-101/enrollment-42",
    "version": 2,
    "data": {"courseId": "course-101", "learnerId": "learner-7", "percentComplete": 40}
  },
  {
    "id": "completion-42",
    "type": "course.completed",
    "aggregateId": "learner-7/course-101/enrollment-42",
    "version": 3,
    "data": {"courseId": "course-101", "learnerId": "learner-7"}
  }
]
```

Signing an altered webhook body would require a separately agreed contract
and signature over the actual bytes. Adding `aggregateId` and `version` here
does not silently alter that existing contract. Event ID is useful for
deduplication; aggregate version is useful for ordered application and
concurrency. They are related but cannot substitute for each other.

The aggregate envelope supplies enrollment context for this teaching stream.
Do not assume all notifications carry it. Validate the aggregate's identity
against the authenticated producer's allowed scope before applying events.
An attacker who can choose a payload ID must not thereby gain access to
another learner's records.

<details class="learning-answer">
<summary>Does version 3 say that three seconds have passed?</summary>
<p>No. It is the third event in this aggregate's sequence. It is neither a
clock time nor a position in every partition of a broker.</p>
</details>

## 3. Why make event history authoritative?

Suppose product and compliance now require an auditable sequence of changes,
including how a learner's state developed. A domain-specific authoritative
event store is an option if its benefits justify operational complexity.
The write handler loads an aggregate's history (or a trusted snapshot plus
later events), checks business invariants, and appends new facts.
It does not merely copy a current row into an analytics queue.

To prevent lost updates, the handler appends with `expectedVersion`: append
version 3 only if the stored stream is still at version 2. Two writers that
both read version 2 cannot both successfully append version 3. The loser
reloads and re-evaluates the command and its invariants; blindly retrying the
same decision can be wrong. The store must atomically enforce the check and
append for that aggregate. Cross-aggregate invariants need their own design.

The log must durably contain the relevant accepted facts, in the intended
order, under a defined schema and producer authority. “History” is complete
only for events actually captured, retained and interpreted correctly.
Schema changes require versioned readers or upcasters, compatibility tests,
and a plan for historical data. A corrupted or missing event can make replay
wrong; auditability is not automatic proof of truth.

PII in immutable history is a serious lifetime obligation. Minimize payloads,
restrict access, encrypt where appropriate and design retention and legal
erasure before adoption. Subject IDs may still be personal data. Externalizing
sensitive data or cryptographic erasure may help under a specific policy but
does not automatically satisfy every legal requirement. Discuss trade-offs
with the relevant privacy and compliance owners.

<details class="learning-answer">
<summary>Two commands read version 2 and both want to append version 3. What now?</summary>
<p>The store atomically accepts at most one expected-version append. The
other must reload, recheck invariants and decide whether its command remains
valid.</p>
</details>

## 4. Snapshot cutoff and replay

Reconstructing a long aggregate history for every command can be expensive.
A snapshot stores aggregate state **and its exact cutoff version**. A trusted
snapshot at version 2 here has 40% progress and `completed: false`. To rebuild
version 3, load that snapshot and apply only events with versions greater
than 2 in order. A snapshot is an optimization, not a new unversioned fact
or a license to skip the tail. Validate its schema and source; rebuild it
from retained history if it is corrupt or incompatible.

The snapshot must correspond to the same aggregate and the state produced
through its recorded version. A version 2 label on version 1 state would
silently omit the second progress event. If history has been compacted or
expired, a rebuild from version zero may be impossible; checkpoint and
retention policies must explicitly state which recovery guarantees remain.

An event store need not contain every event from every service. Retention,
legal constraints, migrations and domain scope bound what can be reconstructed.
Likewise, a queue's transient delivery history is not automatically a durable
authoritative event store, and most queue-based applications do not need
event sourcing.

## 5. A pure projection and an explicit teaching policy

For this lesson only, choose a business rule: the completion fact sets
`percentComplete` to 100 and `completed` to true. Real completion criteria
are domain-specific; a percent alone is not universal proof of completion.
The initial projection is version 0, percent 0, and not completed:

| Applied version | Input | Progress | Completed |
| --- | --- | --- | --- |
| 0 | Initial state | 0% | false |
| 1 | `progress-20` | 20% | false |
| 2 | `progress-40` | 40% | false |
| 3 | `completion-42` | 100% | true |

A reducer receives state and a validated event and returns new state. It has
no network call, database write, random number, current clock, email send or
payment operation. Given the same inputs in the same order, it produces the
same result. The companion Node test applies the actual fixture events and
checks the policy, duplicate handling, gaps and replay.

Keep the deduplication index with the checkpoint: for each applied event,
record both ID and version with a fingerprint of its agreed canonical
content. A repeated ID **and** version with identical content is a no-op.
An existing ID with different content or a different version, or an existing
version with another ID or fingerprint, is a conflict to quarantine and
investigate. Checking only the event ID, only the version, or ignoring a
conflict can conceal corruption. Include aggregate identity in the scope.

Persist the resulting read model, fingerprint index and checkpoint
atomically in the projection store. If a process crashes after applying
the event but before acknowledging it, redelivery is safely recognized.
Independent consumers each have their own checkpoint and retention horizon.

<details class="learning-answer">
<summary>Does a second copy of version 2 move the progress forward again?</summary>
<p>An identical, already applied ID/version/fingerprint is a no-op. A
conflicting payload or identity is an error, not a duplicate to ignore.</p>
</details>

## 6. Gaps, reordering and bounded recovery

If version 3 arrives while the projection is at version 1, applying it and
setting the checkpoint to 3 silently discards version 2. Instead detect the
gap. Buffer out-of-order events only within an explicit size and time limit,
then fetch the missing version from a trustworthy retained source, or pause
and alert. Once version 2 is applied, drain version 3 in sequence. If
recovery cannot obtain the missing event, do not claim a complete replay.

When the sole requirement is a **current view**, a service may instead fetch
an authoritative current snapshot with an explicit version and replace its
view under a well-defined policy. That does not reconstruct historical
intermediate state or authorize a missing side effect. A historical audit or
event-sourced write model generally needs the missing facts, not a silent
jump. Buffer limits prevent a missing event from causing unbounded memory use.

For example, a consumer receives versions 1, 3, then 2. It applies 1,
buffers 3, applies 2 and finally applies 3. If 2 never arrives and recovery
cannot retrieve it, it remains behind or uses the separately authorized
current-view recovery path. It must not pretend version 3 proved version 2.

<details class="learning-answer">
<summary>Can the consumer just apply version 3 because completion is more important?</summary>
<p>Not for ordered replay. Detect and recover the gap; a current-state-only
replacement is a different, explicit policy with different guarantees.</p>
</details>

## 7. Multiple views and CQRS

The learner-progress projection can show percentage and completion status;
a reporting projection might count completions by course. Each has a
different shape and checkpoint, and a bug in one need not corrupt the other.
A correction or schema migration can rebuild one view from retained history
without changing the original events. Restrict reporting access and avoid
exposing learner identities where aggregates suffice.

CQRS separates command and query responsibilities/models. The write model
enforces invariants; read models serve query shapes. The separation can exist
in the **same database**, with different logic and tables, or in separate
stores. CQRS does not require microservices, two databases, asynchronous
events, or event sourcing. Even without CQRS, a service can publish events.
More models create synchronization and operational costs, so use them where
query needs justify the complexity.

An asynchronously updated view may lag a successful command. That is not
proof that the command failed. One policy returns the accepted write version
in the command response and shows a pending UI until the read model reports
at least that version. Another reads the authoritative write state for
read-your-write behavior, subject to authorization and availability.
A version-wait can time out; show an honest pending state or offer refresh,
not an infinite spinner or a fabricated success. Define the user-facing
consistency policy rather than promising instant convergence.

<details class="learning-answer">
<summary>Must CQRS use one database for writes and another for reads?</summary>
<p>No. Separate read and write models can share a database. Asynchronous
separate stores are one option, with additional lag and recovery concerns.</p>
</details>

## 8. Replay is not a request to email again

Replaying historical facts into a pure projection is safe only when replay
has no external effects. A side-effect consumer that sends email or calls a
payment API must not be blindly attached to a replay stream as if old facts
were new requests. Separate projection code and credentials from effect
handlers, use explicit replay modes and destination isolation, and verify
operational controls before a rebuild.

For an effect consumer recovering from an interruption, a durable checkpoint
and effect-specific deduplication can allow it to resume from an agreed
position. Persist consumer state and local effects atomically when possible;
honor per-aggregate ordering and protect against duplicate delivery.
External providers need their own idempotency or reconciliation contract.
Do not simply erase an effect consumer's checkpoint to force a replay:
that may trigger actual historical actions again.

Replay feasibility is bounded by the retained log, schemas and permissions.
If source events expire or compaction removes intermediate records, rebuilds
may require a valid snapshot plus retained tail or an authoritative current
state. Some historical questions then cannot be answered. Keep checkpoint,
deduplication, snapshot and source-retention horizons aligned; “events are
available forever” is an operational and legal choice, not a default.

<details class="learning-answer">
<summary>Can a replay that rebuilds a read model send the old completion email?</summary>
<p>It must not. The pure reducer rebuilds state; effect consumers require
separate recovery and idempotency controls for any real action.</p>
</details>

## 9. Investigation: a misleading projection

Imagine the UI shows 40% after the completion command succeeds. First
compare the command response's write version with the view's checkpoint.
If the write is version 3 but the view is version 2, inspect projection lag,
consumer health, missing events and permissions. Do not retry completion
solely because a read replica has not caught up.

If the view says version 3 but still shows 40%, inspect the reducer and the
lesson-specific completion rule. Also check that a version 3 fingerprint
matches the source; a conflicting duplicate is not harmless. If the event
cannot be recovered, decide whether current-state replacement meets the
actual requirement. For an auditable history, state replacement cannot prove
the missing sequence. Document the incident and the remaining uncertainty.

## 10. Decision and operational boundaries

Choose current-state storage first when it satisfies the business. Add
notifications when independent consumers benefit from decoupling, with an
outbox when the database write and publication intent must travel together.
Choose state-carrying events when their reduced lookup cost outweighs schema,
security and privacy obligations. Consider authoritative event sourcing
only when historical reconstruction and domain needs justify expected-version
concurrency, durable retention, replay, evolution and operating costs.

The Node tests use pure in-memory reducer and workflow examples; they do not
simulate a live broker or establish disk durability. A separate SQLite
in-memory probe can exercise actual local transactions, but cannot prove
provider or broker behavior. Production verification needs the actual
storage and delivery configuration, access controls, retention, recovery
procedures, and load/failure tests. Managed services can incur costs.

## Original claim ledger and further reading

The original is retained, with these precise qualifications:

* [Original async chapter](../05-ASYNC-APIS.md), lines 4053–4061 calls event
  sourcing “Complete audit history” and “Perfect event history.” Completeness
  depends on domain coverage, correct capture, retention and interpretation;
  no store guarantees the facts themselves are true.
* Lines 4121–4132 correctly suggest a snapshot followed by recent events;
  the snapshot needs an aggregate and cutoff version, and replay needs the
  retained tail. Lines 4451–4454 summarize it as “Store all events”:
  the authoritative domain stream and its retention are explicitly scoped.
* Lines 4142–4152 contrast “Same DB” with “Separate them.” CQRS separates
  read and write responsibilities/models, not necessarily databases; it does
  not require event sourcing. Lines 4457–4460 use the more useful shorthand
  “Separate reads and writes,” which still needs that qualification.
* Lines 2252–2265 describe an “Exactly-once EFFECT” despite duplicate
  messages. A local projection can achieve a bounded deduplicated effect with
  atomic checkpointing; that does not make arbitrary email exactly once.

Primary references:
[Microsoft event sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
explains the authoritative append-only store and its trade-offs;
[Microsoft CQRS](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
describes distinct models including a single shared data store;
[AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
describes publication intent and duplicate delivery.

Continue: [guided async](../05-GUIDED-ASYNC.md),
[broker delivery and recovery](BROKERS-DELIVERY-AND-RECOVERY.md),
[guided realtime](../04-GUIDED-REALTIME.md),
[course content map](../COURSE-CONTENT-MAP.md), and
[content corrections](../CONTENT-CORRECTIONS.md).
