# Senior API design: a requirements-first companion

This companion revisits the complete [original senior guide](07-SENIOR-DESIGN-GUIDE.md).
It is **not Phase 8** and does not replace a chapter or prescribe a technology ladder.
Its examples are fictional design exercises, not a running service or evidence of
the documentation site's traffic. Follow the branch whose changed requirement
actually applies; a working system does not need every box in a diagram.

The shared current state is `course-101`, **API Fundamentals**, with 29 available
seats. Authorized `learner-7` already has `enrollment-42` and has completed the
course. A read, notification or certificate does not re-enroll the learner.
Nothing in this journey silently resets the state. A historical progress value of
40% is not completion. See the [fixtures](../assets/senior-lesson-fixtures.mjs),
the [reading map](../assets/senior-reading-map.mjs),
the [course content map](COURSE-CONTENT-MAP.md), and the
[corrections ledger](CONTENT-CORRECTIONS.md).

The [OpenAPI contract](contracts/course_api.openapi.json) describes seven
operations, including a public course read and enrollment creation. It is a
teaching contract, not an implemented service. Private enrollment reads,
progress reads and dashboard operations discussed below are **hypothetical** and
outside that seven-operation contract. They require their own reviewed contracts;
do not infer routes or field types from the story.

## Route and prerequisites

Read each problem, predict the result, and then open its closed answer.
Original sections 1–4 establish questions and estimates; sections 13–15 and 27
illustrate options and contracts; sections 29–33 summarize a larger architecture.
Their examples are useful comparisons, not a required deployment sequence.
The original's internal enterprise and book references are retained historical
text, not evidence that this companion inspected those materials.

| Question | Decision |
| --- | --- |
| What must work and what must never happen? | [Requirements](#senior-requirements) |
| What works before adding boundaries? | [Baseline](#senior-baseline) |
| What do workload assumptions imply? | [Estimates](#senior-estimates) |
| Does a changed data shape justify another interface? | [Contracts](#senior-contracts) |
| How fresh and in which direction? | [Freshness](#senior-freshness) |
| What can complete later and recover? | [Work](#senior-work) |
| When does ownership or workload justify distribution? | [Partitions](#senior-partitions) |
| What evidence and risk survive review? | [Review](#senior-review) |

Use the complete guided foundations:
[0 Fundamentals](00-GUIDED-FUNDAMENTALS.md),
[1 REST](01-GUIDED-REST.md),
[2 GraphQL](02-GUIDED-GRAPHQL.md),
[3 RPC and gRPC](03-GUIDED-RPC-AND-GRPC.md),
[4 realtime](04-GUIDED-REALTIME.md),
[5 async](05-GUIDED-ASYNC.md),
[6 architecture](06-GUIDED-ARCHITECTURE.md), and
[7 expert design](07-GUIDED-EXPERT-DESIGN.md).
The original [09 case studies](09-SYSTEM-DESIGN-CASE-STUDIES.md) are next,
not rewritten here.

<span id="senior-requirements"></span>
## 1. Clarify what success means

**Problem.** A learner must find a course and see their own completion.
The team also needs a reliable way to tell the learner when a certificate is
ready. Different consumers and different consequences require different
contracts, even if they initially share one application.

**Simple baseline.** Ask who calls, what they may see, and which actions change
state. The browser requests the public course; a hypothetical private view
checks the authenticated learner's authorization before returning their record.
Completion is an existing fact, not a second enrollment.

**Worked example.** The current public representation is:

```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 29
}
```

The confirmed enrollment belongs to `learner-7` and references this course.
The service must not expose that private record to a different learner.
Reading it does not allocate a seat or create a certificate.

**Changed requirement.** Product asks for a dashboard that is no more than
five minutes stale after reconnection, including on mobile networks.
That is an illustrative target to agree and measure, not an existing SLO.

**Failure.** An unqualified promise of “real time” says nothing about a
disconnected learner, missing updates, authorization or stale state.
The user could see an old status without knowing it needs reconciliation.

**Options and costs.** Agree a freshness budget, define which record is
authoritative, and decide how a client refreshes after a gap.
Polling has request cost; a push connection has connection and recovery cost.
Protect private data in every representation and log without leaking it.
State expected availability and latency at the boundary, with a denominator
and observation window, rather than inventing a blanket percentage.

**Prediction.** A completed learner refreshes the dashboard twice. What
happens to seats?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>Nothing changes.</strong> Reads do not re-enroll the learner or consume another seat. The existing completion and 29 available seats remain unchanged.</p>
</details>

The [requirements and estimation lesson](lessons/REQUIREMENTS-AND-ESTIMATION.md)
shows how to turn questions into measurable targets, assumptions and tests.
The [access and evolution lesson](lessons/REST-AUTH-AND-EVOLUTION.md) covers
authorization and compatibility rather than treating identity as a UI concern.

<details class="learning-answer">
<summary>Check: is a freshness target the same as an availability target?</summary>
<p><strong>No.</strong> A successful response may still be stale. Define both the allowed age and the fraction of eligible requests or time that must satisfy the service objective.</p>
</details>

<span id="senior-baseline"></span>
## 2. Establish the working boundary

**Problem.** The catalogue must return a course while preserving existing
enrollment and completion state.

**Simple baseline.** One backend serves REST over HTTP and uses a transactional
database. The database is the authority for enrollment and completion.
Use authentication for private operations, authorization per learner,
validated input, backups, restore exercises, timeouts and useful telemetry.
“One backend” is a design boundary, not a promise of zero downtime.

**Worked example.** The published contract includes this course read:

```http
GET /courses/course-101
```

The returned course is the representation above. The existing enrollment
and completion are application state, not an implied public API operation.
The public GET is a read; it neither grants enrollment nor changes the seats.
The published enrollment creation operation is not called in this story.

**Changed requirement.** A team wants independently deployed internal
components because ownership and release schedules have genuinely diverged.

**Failure.** A process split creates a network boundary. A call may time out
after a remote write succeeded; a local database transaction does not make
the remote effect atomic. Latency and partial failures now affect the user.

**Options and costs.** Keep one application if release coordination and
measured load are acceptable. Otherwise split along an owned domain boundary,
define authoritative data and a contract, and budget remote calls and failures.
Internal HTTP can be sufficient. Typed internal gRPC is an optional alternative
when compatible schemas, tooling, streaming or measured efficiency justify
its cost; it is not mandatory for service-to-service communication.

**Prediction.** Does introducing a new service automatically improve
reliability?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> It introduces independent failure and coordination paths. Demonstrate isolation benefits and recovery, and compare them with the operational cost of the split.</p>
</details>

Follow the full [REST HTTP contracts](lessons/REST-HTTP-CONTRACTS.md),
[API contracts and lifecycle](lessons/API-CONTRACTS-AND-LIFECYCLE.md), and
[gRPC lifecycle](lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md) lessons.
The complete [protobuf contract](contracts/course_api.proto) is a separate
teaching artifact; adopting it does not silently extend the OpenAPI contract.

<details class="learning-answer">
<summary>Check: what must be verified before trusting a backup?</summary>
<p>Restore it in a representative exercise, measure recovery time and data loss, and verify that authorization and the relevant enrollment and completion invariants still hold.</p>
</details>

<span id="senior-estimates"></span>
## 3. Estimate a different, imaginary platform

**Problem.** A design review needs an order-of-magnitude planning envelope
before any large deployment or protocol choice.

**Simple baseline.** Record inputs, units and uncertainty rather than calling
the observed course's 29 seats an API capacity. The following fixture is an
**independent imaginary large platform**, not actual site statistics and not
the independent illustrative capacity model in Phase 6.

**Worked example.** Assume 10 million daily active users each make 100
requests a day: 1 billion requests/day. Divide by exactly 86,400 seconds:
about 11,574.07 requests/s average. A 5× multiplier gives about 57,870.37
requests/s peak; round conservatively to 60,000 requests/s for byte examples.
This is a planning input, not a benchmark or proven service capacity.

At decimal 1 KB = 1,000 bytes, 60,000 responses/s × 5,000 bytes =
300 MB/s = 2.4 Gb/s of response bodies. At 50,000 bytes it is 3 GB/s =
24 Gb/s. Headers, transport, retransmissions and request traffic are extra;
compression and caching may change the observed wire rate.

**Changed requirement.** The same planning exercise asks for one million
simultaneous live connections and a recoverable event history.

**Failure.** Requests/s, concurrent connections and events/s are different
units. Multiplying one by another without a model invents load.
State retained per connection is not the memory footprint of a whole service.
Fanout, retries and duplicate deliveries can multiply downstream work.

**Options and costs.** One million × 50,000 bytes = 50 GB of connection
state only. If 1% reconnect uniformly over 20 seconds, that adds 500
reconnects/s, not 500 active connections. If 5% of daily calls produce one
event, 50 million events/day × 2,000 bytes = 100 GB/day of payload.
Seven days at three copies gives 2.1 TB of replicated payload lower bound,
not total storage: indexes, metadata, backups, duplicates and overhead add
space; compression and retention behavior affect actual results.

**Prediction.** Does 60,000 requests/s prove that a server can sustain it?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> It is a rounded planning rate. Representative benchmarks must establish capacity at the required latency, errors, payload, dependencies and failure conditions.</p>
</details>

The full [estimation lesson](lessons/REQUIREMENTS-AND-ESTIMATION.md) publishes
the exact fixture inputs, derives the separate burst calculation, and shows
how to vary assumptions. The [capacity lesson](lessons/BACKPRESSURE-AND-CAPACITY.md)
explains its own independent stable observation and queue model.

<details class="learning-answer">
<summary>Check: why can the same number of events yield more deliveries?</summary>
<p>One event may fan out to multiple consumers and may be delivered again after failure. Events produced, delivery attempts and successful consumer effects need separate counts.</p>
</details>

<span id="senior-contracts"></span>
## 4. Compare data shapes and contracts

**Problem.** The public course read is simple, stable and already described
by OpenAPI. A hypothetical private dashboard also wants course, enrollment
and progress information for the authorized learner.

**Simple baseline.** Keep the existing REST course read and use the smallest
authorized backend composition that can serve the dashboard. Measure client
round trips, response bytes, tail latency, database queries, and the number
of independently needed shapes. Do not treat unmeasured over-fetching as a
fact.

**Worked example.** A dashboard may need the course title and the learner's
completion, while an admin view has different needs. Neither private view is
among the seven published operations. First prototype a hypothetical REST
aggregate representation with its own contract and authorization policy.
It can avoid multiple client requests without introducing a query language.

**Changed requirement.** Measurements show several independently released
clients need materially different combinations, and the aggregate becomes
expensive to evolve or regularly transfers unused data.

**Failure.** One rigid aggregate can carry unused bytes, force extra requests,
or grow into a large response. Conversely, GraphQL does not automatically
make backend queries efficient: nested resolvers can cause N+1 queries and
unbounded work, and field-level authorization remains essential.

**Options and costs.** Compare a REST aggregate and GraphQL on the same
representative screens, data, cache behavior, bytes, p95/p99 latency, backend
queries, operations and developer cost. REST can use familiar HTTP caching;
GraphQL offers client-selected shapes but needs schema ownership, batching,
depth or cost limits, authorization and compatibility discipline. Keep REST
if it meets the target. An internal typed gRPC boundary is another separate
choice for a justified internal interaction, not a prerequisite for either.

**Prediction.** A GraphQL screen makes one network request. Does that prove
it makes one database query?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> Resolvers may issue many backend queries. Measure and batch where appropriate while preserving per-field authorization.</p>
</details>

Read the complete [GraphQL execution lesson](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md),
[GraphQL cost and caching](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md),
[REST collections and caching](lessons/REST-COLLECTIONS-AND-CACHING.md),
and [contract evolution](lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md).
No proposed private dashboard schema or SDK is asserted as an existing contract.

<details class="learning-answer">
<summary>Check: is an additive response field always compatible?</summary>
<p><strong>No.</strong> A strict consumer or a closed schema may reject it. Test the actual published contract and consumers, then plan migration if their expectations differ.</p>
</details>

### The existing enterprise boundary

A partner's legacy LMS needs to consume our course catalogue through an
agreed SOAP profile. The LMS is the caller; our SOAP adapter provides the
course read using the existing catalogue authority. This is an integration
constraint, not an upgrade from REST or a reason to convert the public API.
The adapter validates XML, applies the agreed caller authentication and
authorization policy, and maps results and faults without creating completion.
WSDL, XML namespaces, actions, endpoint, fault behavior and versioning are
part of the integration agreement; inspect the full
[SOAP and enterprise contracts lesson](lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md)
and its linked XSD and WSDL. The actual partner's security policy and
deployment must be verified separately.

<span id="senior-freshness"></span>
## 5. Choose freshness, direction and recovery

**Problem.** The learner wants to notice that the already-completed course's
certificate has become ready. A status may change while the page is open.

**Simple baseline.** An authorized page reads the current status when opened,
then polls at an agreed interval while visible. On reconnect, it fetches
authoritative state. A slower polling interval saves requests but increases
expected age. Define server load and client battery as well as freshness.

**Worked example.** A learner disconnects before a status change and returns.
The page fetches the latest authorized state. It does not interpret a missed
notification as proof that no change occurred. No enrollment is created.

**Changed requirement.** Product now requires a much shorter update delay
while the page remains open, measured across representative networks.

**Failure.** More frequent polling can raise request load and battery cost;
push without reconnect and replay or snapshot reconciliation can silently
miss changes. A permanently open connection also consumes resources.

**Options and costs.** Compare polling first with server-to-client SSE when
one-way updates and its browser constraints fit. Define an event identifier,
retention window and a snapshot fallback when a gap cannot be replayed.
WebSocket is useful when *this feature* needs sustained bidirectional
messages, but adds connection lifecycle and flow-control work. A separate
client request can still send commands when using SSE. Do not add a chat
feature merely to justify WebSocket. A webhook instead serves an external
server receiver, not an ordinary browser push channel.

**Prediction.** A disconnected SSE client returns after retained events
expired. Is replay alone sufficient?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> The client needs an authorized authoritative snapshot or another defined reconciliation path, then resumes from a suitable cursor.</p>
</details>

See [realtime recovery and flow](lessons/REALTIME-RECOVERY-AND-FLOW.md),
[webhooks and background jobs](lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md),
and [push notification delivery](lessons/PUSH-NOTIFICATION-DELIVERY.md).
Push delivery is a hint, not proof the learner received or read an update.

<details class="learning-answer">
<summary>Check: does a course status screen require a bidirectional socket?</summary>
<p><strong>No.</strong> Choose from its measured freshness, direction, client constraints and recovery needs. Polling or one-way SSE may be sufficient.</p>
</details>

<span id="senior-work"></span>
## 6. Separate facts from requested work

**Problem.** Certificate generation and email can be slow or temporarily
unavailable. The learner's completion must remain recorded independently.

**Simple baseline.** Keep the already-recorded completion visible in the
authoritative database. If no delivery guarantee exists yet, an operator can perform
and reconcile follow-up work explicitly rather than hiding failure.

**Worked example.** The existing completion fact is `completion-42`,
of type `course.completed`, about `learner-7` and `course-101`.
It states something that happened. `IssueCertificate` and
`SendCompletionEmail` are commands asking for specific work; they are not
the completion fact and are not themselves proof of successful external
delivery. The fixtures retain `certificate-completion-42` and
`email-completion-42` as distinct command identities; neither creates another
completion for learner-7.

**Changed requirement.** Completion and reliable scheduling must survive a
process crash without requiring an operator to rediscover missing work.

**Failure.** Writing the database and separately publishing a message creates
a dual-write gap. A crash after commit but before publish loses the signal;
retrying after publish but before acknowledgement may duplicate it.

**Options and costs.** For a newly completed enrollment, write its completion
and an outbox record atomically in the same database transaction. Our current
completion is already recorded: reconcile any missing follow-up intent with
its existing identity rather than completing learner-7 again.
A relay retries publication; consumers deduplicate
by stable identity and commit their local effect with an inbox record where
possible. Commands need retry limits, status, monitoring and a recovery owner.
For external email or certificate providers, use their idempotency support
where available and reconcile unknown outcomes; a local inbox alone cannot
guarantee exactly-once external effects.

**Prediction.** The relay publishes a completion fact and crashes before
marking it sent. What can the consumer see after restart?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p>The fact can be delivered again. The consumer must recognize the duplicate and avoid applying the same local effect twice; external effects need their own idempotency and reconciliation strategy.</p>
</details>

Study the full [outbox and workflows lesson](lessons/OUTBOX-INBOX-AND-WORKFLOWS.md),
[event models and projections](lessons/EVENT-MODELS-AND-PROJECTIONS.md),
and [broker delivery and recovery](lessons/BROKERS-DELIVERY-AND-RECOVERY.md).
Events, commands, delivery attempts and actual effects are separate counts.

<details class="learning-answer">
<summary>Check: does progress at 40% mean the course was completed?</summary>
<p><strong>No.</strong> It is a historical progress observation, not the completion fact. The current example already has a separately recorded completion.</p>
</details>

<span id="senior-partitions"></span>
## 7. Add infrastructure only for a demonstrated constraint

**Problem.** A single owned database and backend need sufficient performance,
recoverability and access isolation for their actual workload.

**Simple baseline.** Index measured queries, bound requests and concurrency,
restore backups, and monitor latency and saturation. A cache or shard is not
automatically an improvement. Maintain a clear authority for completion and
enrollment; 29 course seats are not a throughput estimate.

**Worked example.** A measured read-heavy catalogue may justify a cache with
an explicit freshness policy and invalidation or expiry. Private learner
data requires cache keys and access controls that prevent cross-user leakage.
Test a stale cache, invalidation failure and recovery to the authority.

**Changed requirement.** An independently measured workload or ownership
constraint exceeds what a single database can reasonably support, even after
query and capacity improvements. A team proposes partitioning the data.

**Failure.** A hot tenant or course can overload one shard even if average
load is low. Cross-shard operations add coordination and failure modes.
Moving a record without fencing writes can lose updates or create two owners.
Caching, replication and load balancing do not themselves establish a
single authoritative write owner.

**Options and costs.** Compare vertical capacity, indexes, cache, replicas
and sharding under the actual workload. If partitioning is justified, select
a key, define routing, ownership, skew limits, migration and rollback.
Fence and quiesce the old owner, catch up and verify the destination, establish
its protected new ownership epoch, then publish its route. A failed migration may
require an explicit reverse migration, not an unsafe flip of a stale route.
Use gateways, meshes and multiple regions only for requirements their
operational cost actually addresses.

**Prediction.** The source accepts a write after a snapshot is copied but
before cutover. May the destination safely become owner immediately?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> Fence the source and catch up and verify the later write before promoting the destination. Otherwise the new owner can miss committed state.</p>
</details>

Work the complete [sharding, caching and infrastructure lesson](lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md),
including its independent migration example, then consult
[regions and consistency](lessons/REGIONS-AND-CONSISTENCY.md) and
[gateways and load balancing](lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md).
Neither more replicas nor a service mesh automatically supplies transaction
serializability or a safe ownership transfer.

<details class="learning-answer">
<summary>Check: should a team shard solely because another company does?</summary>
<p><strong>No.</strong> Show the workload or ownership constraint, compare simpler options, and test the new routing, consistency and operational obligations.</p>
</details>

<span id="senior-review"></span>
## 8. Close with a design review

**Problem.** A design must be explainable, testable and operable, not just
illustrated with every available protocol.

**Simple baseline.** Present the current system first. The smallest diagram
captures the primary request path and authoritative data:

```text
Authorized learner/browser
          |
          v
   REST backend ------ transactional database
```

The public course read also uses this backend. The private enrollment,
progress and dashboard views are hypothetical and outside the published
seven-operation OpenAPI contract. Optional branches are not shown as if
they were already deployed.

**Worked example.** Review the existing completed learner's read: identify
the caller, authenticate and authorize the private operation, read the
authority, and return a representation under its own agreed contract.
Verify that this path does not enroll again, change seats or send an email.

**Changed requirement.** The reviewer asks whether the service can keep its
promises through crashes, stale clients, overload and a partner failure.

**Failure.** A diagram that simply labels components “reliable” cannot prove
recovery. A successful response can be stale; a timeout can leave the result
unknown; a full queue cannot absorb an unlimited arrival rate.

**Options and costs.** Include only justified branches and explain their
failure behavior. For example, an outbox is justified when completion and
durable follow-up scheduling must survive a crash; a SOAP adapter is justified
only by the existing LMS contract. A database, relay or partner can still fail.
Specify an owner, detection, bounded retries and a recovery path for each.

**Prediction.** Can a protocol selection matrix replace a design review?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> A matrix suggests candidates; the review must establish the requirements, invariants, evidence, operational costs and remaining risks for this system.</p>
</details>

### Review record

| Category | Evidence to bring |
| --- | --- |
| Requirements | Named callers, operations, authorization, freshness, latency and availability targets with windows and denominators. |
| Invariants | Existing enrollment and completion remain intact; reads consume no seats; only authorized learners see private data. |
| Validation evidence | Contract and consumer tests; restore drill; representative load and tail-latency measurement; duplicate, disconnect and crash-recovery tests. |
| Residual risk | Database outage, stale cache, unknown external effect, replay expiry and overloaded dependencies; owners and mitigations. |
| Decisions | Compare realistic alternatives and costs, record assumptions and the evidence that would reopen each decision. |

Tests and benchmarks provide evidence for their stated conditions, not
mathematical proof of all future production behavior. Review access controls
and sensitive logs as well as throughput. The
[reliability and incident lesson](lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md)
covers service objectives, monitoring and recovery.

<details class="learning-answer">
<summary>Transfer: when should the team leave the design alone?</summary>
<p>When measured requirements and recovery exercises are met and the proposed change has no demonstrated benefit exceeding its new complexity and risk. Revisit when evidence or requirements change.</p>
</details>

Return to the [complete original senior guide](07-SENIOR-DESIGN-GUIDE.md)
for all retained sections and the [content map](COURSE-CONTENT-MAP.md) for
the full course. Continue with the
[guided case studies](GUIDED-CASE-STUDIES.md), with their
[complete original reference](09-SYSTEM-DESIGN-CASE-STUDIES.md) still available.
