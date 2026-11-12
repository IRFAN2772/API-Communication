# Phase 7 — Grow expert design from a working API

This is a fictional learning journey, not a running service or a promise of
production characteristics. Start with one application and add a mechanism
only when a changed requirement justifies its cost. Each step describes a
decision that can be reversed when evidence changes.

The independent current state is `course-101`, **API Fundamentals**, with
29 available seats. Authenticated and authorized `learner-7` already has
confirmed `enrollment-42` and has completed the course. Completion and
notification are not new enrollments. No step silently resets this state.
The [expert fixtures](../assets/expert-lesson-fixtures.mjs) and
[reading map](../assets/expert-reading-map.mjs) capture the examples and route.

Read this guide alongside the complete
[original Phase 7](08-EXPERT-API-DESIGN.md), the
[course library](../README.md), and the
[corrections ledger](CONTENT-CORRECTIONS.md). The original is retained, not
rewritten; its named companies are illustrations, not evidence for current
deployments. The [course contract](contracts/course_api.openapi.json) is a
teaching contract, not a server.

## How to use this route

First predict an outcome without opening the answer. Follow a branch when its
new requirement applies; do not treat the branches as a mandatory stack.
The following links preserve the original topic families while correcting the
route where the original quick reference and body differ.

| Requirement | Guided branch | Original body |
| --- | --- | --- |
| Existing consumers must survive a change | [Contract evolution and consumers](lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md) | 7.1–7.2 |
| Geography or partitions affect reads and writes | [Regions and consistency](lessons/REGIONS-AND-CONSISTENCY.md) | 7.3, 7.7 |
| User experience needs measurement and recovery | [Reliability, observability and incidents](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md) | 7.4, 7.6 |
| A workflow crosses transactional boundaries | [Distributed transactions and recovery](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md) | 7.5 |
| Replicas must agree on an ordered decision | [Consensus and coordination](lessons/CONSENSUS-AND-COORDINATION.md) | 7.8 |
| A separate product serves organizations | [Tenancy, usage and governance](lessons/TENANCY-USAGE-AND-GOVERNANCE.md) | 7.9–7.10 |

**Source navigation correction.** The original quick reference lines 17–20
label 7.7 consensus, 7.8 tracing, 7.9 chaos, and 7.10 governance. Its actual
body headings at lines 4497, 5020, 5721 and 6350 are respectively CAP and
consistency, consensus, monetisation and multi-tenancy, and staff design.
The labels are not interchangeable. Tracing and chaos remain useful: the
reliability branch covers tracing and resilience experiments; governance is
addressed in the tenancy/governance branch. The original named topics are not
deleted or replaced.

<span id="expert-baseline"></span>
## 1. Start with the small application

**Problem.** Learners need a catalogue and a reliable way to discover their
existing enrollment. The team needs an understandable boundary before it
chooses distributed infrastructure.

**Simple baseline.** One application handles authenticated requests and
uses one transactional database. It validates inputs, authorizes access to
private learner data, maintains backups and monitors failures. A single
database is a dependency and can fail; simple does not mean invulnerable.

**Worked exchange and state.** A catalogue request returns the current
course representation. An authorized read of `enrollment-42` finds the
existing enrollment; the completion record is already present. Neither read
changes capacity. The contract does not claim an enrollment-read endpoint:
the latter is a hypothetical application operation.

```http
GET /courses/course-101
```

```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 29
}
```

**Changed requirement.** A mobile client is released independently of the
web application and may remain installed for months. Server deployment can
no longer assume all clients update on the same day.

**Limitation.** A database transaction protects local changes, not a mobile
client's interpretation of a response. An unchanged field name can still
break behavior if its meaning or default changes.

**Alternatives and tradeoffs.** Keep the single app while managing its
contract; separating services will not itself fix compatibility. Monitor
consumer versions before considering parallel representations. The
[compatibility lesson](lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md) works
through both directions of the exchange.

<details class="learning-answer">
<summary>Predict: does reading the completion consume another seat?</summary>

<p><strong>No.</strong> The enrollment is already confirmed and the completion
is already recorded. A read does not create an enrollment, so the available
seat count remains <code>29</code>.</p>
</details>

<details class="learning-answer">
<summary>Exercise: when is the simple application still appropriate?</summary>

<p>Keep it when measured availability, workload, deployment coordination and
recovery needs are met. Preserve authorization and backups rather than adding
replicas or services merely because a diagram looks more sophisticated.</p>
</details>

<span id="expert-evolution"></span>
## 2. Change a contract with mixed clients

**Problem.** A new catalogue screen wants a `summary`, but the old mobile
app may validate the response strictly and cannot be upgraded immediately.

**Simple baseline.** Continue returning the existing representation. Make
the new screen work with the old title while measuring which clients are
actually present. Ask each client owner what it accepts.

**Worked exchange.** `GET /courses/course-101` returns `id`, `title`, and
`seats`. The published `Course` schema has `additionalProperties: false`.
Adding `summary` to that response fails the old closed schema, even if a
particular tolerant consumer would ignore it.

**Changed requirement.** The new screen must display curated summary text
without forcing every installed client to migrate at once.

**Limitation.** “Additive” is not a universal compatibility guarantee.
Response fields, request requirements, status codes, defaults, enum values,
cursor behavior and business meanings all have consumers. A schema-only
check cannot observe all of them.

**Alternatives and tradeoffs.** Negotiate a separate v2 representation, or
use a new endpoint with an explicit compatibility period. The cost is two
representations and an eventual retirement decision. A provider and consumer
can also agree on a tolerant subset contract, but that does not alter the
existing closed OpenAPI contract. Expand, migrate, observe and contract only
after an owned deprecation period and a tested rollback.

<details class="learning-answer">
<summary>Predict: can the same new JSON satisfy a tolerant subset consumer and fail the old schema?</summary>

<p><strong>Yes.</strong> A consumer may only inspect <code>id</code>,
<code>title</code> and <code>seats</code>, while the old published closed
schema rejects the additional <code>summary</code>. These are different
contracts and neither observation proves every installed client works.</p>
</details>

<details class="learning-answer">
<summary>Exercise: transfer this decision to a shipping API.</summary>

<p>A new delivery estimate field can break a strict old shipment response.
Inventory client versions, define a separate compatible representation and
measure migration before retirement. Do not silently reinterpret an existing
delivery status to mean something else.</p>
</details>

<span id="expert-observe"></span>
## 3. Define a user-facing reliability target first

**Problem.** Some learners report that catalogue reads are slow or fail.
The team wants to know whether the experience meets its objective before
choosing replicas, regions or any new infrastructure.

**Simple baseline.** From the user's perspective, define an eligible
`GET /courses/{courseId}` request and count it good only when it succeeds
with the expected representation within the agreed latency threshold.
Choose an illustrative rolling 30-day SLO of 99.9% good eligible requests;
this is an internal objective, not a contractual SLA.

**Worked window.** Of 1,000,000 eligible requests, 2,000 are bad.
The observed good fraction is 998,000 / 1,000,000 = 99.8%, below
99.9%. The 30-day allowance is 1,000 bad requests, so this window has
exceeded it by 1,000. Sampling, exclusion rules and clock boundaries need
agreement before using these figures for decisions.

**Changed requirement.** Operators need earlier warning than a 30-day
aggregate can provide. In a separate five-minute window, 50 of 10,000
requests are bad: 0.5%, or five times the 0.1% error budget rate.

**Limitation.** A five-minute burn rate is not a prediction that the next
30 days will have identical traffic. A low overall mean latency can hide a
slow tail, and a server-only metric misses failures before a request arrives.
Choose windows and alert thresholds based on traffic and response capacity.

**Alternatives and tradeoffs.** Instrument at a client or edge and reconcile
with server measurements. Correlation IDs and traces help locate a failure;
they are not the SLO itself. Synthetic probes cover paths with little
traffic but do not replace real-user measurement. Protect sensitive fields
and apply retention controls to telemetry.

<details class="learning-answer">
<summary>Predict: does a 99.8% observed good rate meet a 99.9% SLO?</summary>

<p><strong>No.</strong> The difference is 1,000 bad requests in this
one-million-request window. The objective concerns the defined eligible
user-facing requests, not simply whether the database process was running.</p>
</details>

<details class="learning-answer">
<summary>Exercise: transfer the measurement to a train timetable app.</summary>

<p>Define eligible timetable lookups, an acceptable correctness and latency
threshold, and a measurement window. An HTTP success with stale, misleading
departure information need not count as a good user outcome.</p>
</details>

**Incident response.** When a budget burns quickly, compare the affected
versions and dependencies, mitigate user impact, and communicate the scope.
Bound retries and use jitter so clients do not turn an outage into a retry
storm. Record a timeline and follow-up owner after recovery; avoid blaming
individuals for systemic conditions.

**Resilience experiment.** Only after defining the expected steady state,
inject a bounded fault in a safe environment, set a stop condition and
observe both user-facing outcomes and recovery. A successful experiment is
evidence about that fault under those conditions, not proof of universal
resilience. See the [reliability branch](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md).

<span id="expert-distance"></span>
## 4. Add distance only for a demonstrated need

**Problem.** Distant learners experience high latency and the business asks
about recovery from a regional outage. These are separate requirements:
faster reads and surviving a regional loss need not imply the same design.

**Simple baseline.** A single region serves requests and has tested backups,
restore procedures, a recovery time objective (RTO), and a recovery point
objective (RPO). RTO is the target time to restore service; RPO bounds
acceptable data loss measured in time. Neither is achieved just by writing
it in a document.

**Worked state.** The primary database records 29 seats. A read replica
may briefly show an earlier value when replication lags. A learner seeing a
stale catalogue count is not evidence that a seat was reserved; only the
authoritative write result makes that decision.

**Changed requirement.** A regional outage must not prevent service longer
than the agreed RTO. A warm standby with replicated data and rehearsed
failover may reduce recovery time, at the cost of infrastructure and
operational complexity. An asynchronous copy may lose recent writes on
failover, which must fit the RPO.

**Limitation.** Multiple regions introduce propagation delay, routing,
failover and split-brain risks. Active-active writes need an explicit
conflict and ownership model. DNS changes and health checks are not a proof
that old writers have stopped.

**Alternatives and tradeoffs.** A CDN or local cache can accelerate public
catalogue reads with an explicit freshness budget. A standby can improve
recovery without independent active writes. A globally coordinated write
path can improve ordering at the price of latency and reduced availability
during failures. Use the
[regions and consistency branch](lessons/REGIONS-AND-CONSISTENCY.md) to
compare these choices.

### An independent last-seat partition thought experiment

This is **not** the current 29-seat state and does not change it. Assume a
separate hypothetical starting state of exactly **one available seat** in
`course-101`, with candidates `learner-8` and `learner-9`. Replicas A, B,
and C were previously synchronized. A network **PARTITION** isolates C
from the mutually reachable A and B; messages across the split cannot be
relied on in this window.

If A independently accepts learner 8 and isolated C accepts learner 9
using their local copies, each can report success, but together they assign
two people to one seat. Later reconciliation cannot make both promises
true. The alternative is to require an authoritative decision: if A and B
form a valid majority and the protocol permits progress, they may decide
one request; isolated C must refuse or wait. This preserves the invariant
at the cost of availability on C. The exact outcome depends on the system's
protocol and which requests arrive; the example does not assume a winner.

CAP concerns behavior **during a partition** for the relevant operations
and its specific consistency/availability definitions. It is not a rule
that every database must pick exactly two labels in all circumstances.
Read-your-writes, eventual consistency, linearizability and durability are
distinct properties that should be stated per operation.

<details class="learning-answer">
<summary>Predict: can both isolated sides promise the single seat safely?</summary>

<p><strong>Not without further coordination or preallocated rights.</strong>
If both independently accept one request, they violate the one-seat
invariant. A majority-based authority can make one side wait or reject,
assuming the protocol and its prerequisites are actually implemented.</p>
</details>

<details class="learning-answer">
<summary>Exercise: transfer the partition scenario to a library copy.</summary>

<p>With one physical copy and two isolated branches, independent promises
can conflict. Centralize the allocation or preallocate a valid right to one
branch; either choice constrains availability and requires a recovery plan.</p>
</details>

<span id="expert-atomicity"></span>
## 5. Separate local atomicity from a distributed workflow

**Problem.** A hypothetical partner now requires an external license
reservation before a new learner can use paid partner content. This is a
separate workflow, not another enrollment for learner 7 and not a charge
for this free course.

**Simple baseline.** If the application owns all relevant rows in one
database, one local transaction can atomically check and update its rows.
The database commit makes those local writes all-or-nothing; it cannot
atomically commit an unrelated partner's service.

**Worked timeline.** In an independent hypothetical continuation from the
29-seat state, one local transaction creates our seat reservation
`reservation-8` for `learner-8`, records the intent `reserve-license-8-a`
and an outbox message, and holds one seat: 29 → 28. A worker sends the
partner a request associated with that local reservation and the provider
key `license-reservation-8`. The partner returns a result associated with
those identifiers; `reservation-8` is not an ID first created by the partner.
A verified grant finalizes the local enrollment without a second decrement,
so seats remain 28. A definitive rejection releases the hold once, returning
28 → 29. A timeout is an unknown outcome, not a rejection: keep the hold
and reconcile before deciding. If the worker crashes after the partner acts
but before recording the response, the outcome is likewise unknown locally.
Retrying with the same key is useful only if the partner actually provides
durable idempotency.

**Changed requirement.** The business asks to release an external license
after a verified grant if a later step fails. This business compensation is
not time travel. If a hold has a deadline, define how expiry, reconciliation
and a late grant interact before releasing it.

**Limitation.** An outbox atomically stores state and publication intent in
one database; it does not guarantee exactly-once external effects. A relay
may publish twice, so use stable IDs, consumer deduplication and durable
progress. A compensation can fail, expire or be impossible; escalation and
reconciliation are part of the design.

**Alternatives and tradeoffs.** Two-phase commit (2PC) coordinates
transactional participants that support prepare/commit, but can block on
coordinator failure and adds operational coupling. A saga commits local
steps and uses compensations with visible intermediate states; it provides
no global isolation. Orchestration centralizes workflow decisions, while
choreography distributes them and can make causal tracing harder. Choose
the simplest solution that satisfies the actual invariant.

<details class="learning-answer">
<summary>Predict: does a committed outbox row prove the partner reserved a license?</summary>

<p><strong>No.</strong> It proves that the local transaction durably recorded
an intent to publish. The worker, transport and partner may still fail;
retries, idempotency, reconciliation and observable outcomes are required.</p>
</details>

<details class="learning-answer">
<summary>Exercise: transfer this workflow to ticket delivery.</summary>

<p>A ticket database can atomically store a ticket and an email intent. It
cannot atomically make an independent email provider deliver the message.
Track attempts and unknown outcomes; do not describe an outbox as delivery.</p>
</details>

The [transactions and recovery branch](lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md)
examines timeout, compensation and recovery paths in more detail.

<span id="expert-coordination"></span>
## 6. Coordinate only when an ordered shared decision is needed

**Problem.** If the business genuinely requires one authoritative ordering
of allocations despite some replica failures, an individual replica's local
view is insufficient. This requirement is different from ordinary
asynchronous publication or a user interface preference.

**Simple baseline.** A single database primary owns the authoritative local
write boundary. Use atomic conditional updates and appropriate isolation to
protect the invariant; a generic database does not automatically make all
transactions serializable. Start there when its availability and recovery
meet the objectives. An application lock without a durable shared authority
is not a substitute for a database invariant.

**Worked decision.** In the independent one-seat thought experiment,
replicas A, B and C can use an implemented quorum-based replicated log.
With appropriate leader election, terms, log matching and majority
commitment, A and B may commit an allocation while isolated C cannot
commit a conflicting one. C must not accept a write just because it still
believes it is leader; safe authority depends on the protocol's checks.

**Changed requirement.** The system must continue ordered decisions when
one of three replicas fails. Provision independent failure domains and
test election, storage, network and recovery assumptions.

**Limitation.** Consensus is not a generic availability switch. A majority
must communicate for progress; quorum loss prevents new commits. Consensus
does not make downstream email exactly once, fix a bad state-machine
command, or automatically give every read linearizable semantics. A leader
lease also requires explicit timing assumptions and safe fencing.

**Alternatives and tradeoffs.** A single primary with tested recovery may
be enough; partitioning ownership or preallocating rights can avoid some
global decisions but adds rebalancing complexity. A replicated consensus
system trades latency, operational cost and minority-side availability for
an ordered durable decision under its stated assumptions. Use the
[coordination branch](lessons/CONSENSUS-AND-COORDINATION.md) when those
prerequisites exist.

<details class="learning-answer">
<summary>Predict: can isolated C safely commit its own conflicting allocation?</summary>

<p><strong>No.</strong> In the stated majority protocol C alone lacks a
quorum. It must wait or reject until it can participate safely; a stale
leader claim is not sufficient authority.</p>
</details>

<details class="learning-answer">
<summary>Exercise: keep the simple design when ordering is local.</summary>

<p>For a small inventory managed in one database, use an atomic conditional
update and test recovery first. Introduce replicated consensus only if the
required availability and ordered-state guarantees justify its complexity.</p>
</details>

<span id="expert-tenancy"></span>
## 7. Explore tenancy as an optional product branch

**Problem.** Imagine a separate commercial platform offering its own API
to multiple organizations. The original free course is not being charged
and its existing learner state is unchanged.

**Simple baseline.** For one organization, authenticate the caller and
authorize access to each resource. Record an audit trail without putting
credentials or private content in logs. A separate deployment per customer
can make isolation straightforward, though it costs more to operate.

**Worked state.** In the separate product example, a verified principal
for `org-a` and `learner-7` accesses an organization-scoped record. A
request claiming `org-b` in an untrusted header does not change the
principal's tenant. The lookup and authorization include the verified
tenant, and a cache key must not mix results across tenants.

**Changed requirement.** Several organizations share an application and
need independently enforced quotas and reconciled usage records. The
illustrative usage event `usage-42` records three `catalogue.read` units for
`org-a`. It is an accounting input, not a proof of an invoice or payment.

**Limitation.** A tenant ID column alone is not isolation. Every query,
object store path, cache, background job, trace and administrative path
must preserve the boundary. Duplicate usage events can overcount; missing
events can undercount. Audit corrections rather than silently rewriting
accounting history.

**Alternatives and tradeoffs.** Separate databases improve isolation and
can simplify customer-specific recovery, at operational cost. Shared
storage is cheaper to aggregate but demands disciplined enforcement and
testing. Quotas protect capacity; rate limits and authorization solve
different problems. A governed API needs owners, review, version policy,
documentation and an exception process rather than only a style checklist.

<details class="learning-answer">
<summary>Predict: should the header <code>org-b</code> grant an org-a caller access to org-b?</summary>

<p><strong>No.</strong> Tenant context must derive from verified identity and
authorization. An untrusted header can be a selector only after the caller
is authorized for the selected tenant.</p>
</details>

<details class="learning-answer">
<summary>Exercise: transfer isolation to a shared school portal.</summary>

<p>Use verified school membership on every student lookup and cache key.
Test a cross-school request, background export and administrative access;
do not trust a school identifier merely because a browser sent it.</p>
</details>

The [tenancy and governance branch](lessons/TENANCY-USAGE-AND-GOVERNANCE.md)
explores optional commercial concerns without changing the course's price.

<span id="expert-next"></span>
## 8. Choose the next decision, not a technology checklist

**Problem.** A design review asks for “expert architecture,” but neither a
pattern name nor a diagram proves that a user requirement is met.

**Simple baseline.** State the current invariant, workload, failure
assumptions, ownership and measurable objective. Start with the one-app
design, current contract and a recovery plan. Document what would trigger
the next decision.

**Worked decision.** If the observed 99.8% rate misses the 99.9% SLO,
inspect failure causes and user impact before buying a multi-region system.
If the dominant cause is a bad deployment, a reversible rollout and safer
testing may be a better first investment than a second region.

**Changed requirement.** An organization needs demonstrably faster regional
recovery, independent mobile releases and a reliable partner workflow.
Now compare a standby, a versioned contract and a durable saga against
their costs, failure modes, ownership and exit criteria.

**Limitation.** Contract checks do not prove a system is available;
replication does not make an application bug correct; a passing game day
does not cover every failure. A design should make residual risk visible.

**Alternatives and tradeoffs.** Keep or revert a mechanism if its measured
benefit does not justify its complexity. Track decisions and revisit them
when evidence changes. Different teams may reasonably choose differently
under different constraints.

<details class="learning-answer">
<summary>Predict: is multi-region the automatic answer to a missed SLO?</summary>

<p><strong>No.</strong> The observed failures and their causes determine
the intervention. A second region cannot automatically fix a defective
release deployed to both regions.</p>
</details>

Continue with the [guided senior design companion](GUIDED-SENIOR-DESIGN.md)
and its [complete original reference](07-SENIOR-DESIGN-GUIDE.md).
The [guided case studies](GUIDED-CASE-STUDIES.md) and their
[complete original reference](09-SYSTEM-DESIGN-CASE-STUDIES.md) provide transfer
practice. Completing the route is not a certification of mastery. Practice stating assumptions,
predicting failures and explaining why a simpler choice remains sufficient.
