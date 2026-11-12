# Regions and consistency: decide what a partition may change

[← Expert journey](../07-GUIDED-EXPERT-DESIGN.md) |
[Original modules 7.3 and 7.7](../08-EXPERT-API-DESIGN.md) |
[Course library](../COURSE-CONTENT-MAP.md) |
[Corrections](../CONTENT-CORRECTIONS.md)

This is a fictional, static design exercise; no paid infrastructure,
account, broker or live cluster is needed. Start with the shared
[fixtures](../../assets/expert-lesson-fixtures.mjs): `course-101`,
**API Fundamentals**, has 29 available seats, and `learner-7` already has
`enrollment-42`. The examples below do not change that baseline or enroll
that learner again. The [architecture journey](../06-GUIDED-ARCHITECTURE.md)
provides the gateway, replica, failure and ownership context.

## 1. Start with a need, not another region

A learner far from the API experiences network round trips. Ten serial
requests each spending a hypothetical 250 ms on a round trip can spend
about 2.5 seconds on network time alone; requests may overlap, and
processing and variable routing add their own costs. Measure the actual
critical path and user distribution before assuming this arithmetic is a
latency prediction.

For static course images and cacheable public descriptions, a CDN near
users can remove origin round trips. Choose cache keys, TTL, invalidation
and authorization deliberately: a shared cache must not expose one
learner's private enrollment to another. A cached seat count may be stale
and is not an authorization to reserve that seat.

A read replica can offload catalogue queries without a second writable API
region. Measure replica lag and route correctness-sensitive reads to the
authority when needed. A user's session affinity can reduce version
regressions while one replica stays healthy, but cannot repair a replica's
missing write, guarantee failover, or itself provide read-your-writes.

Only add another region when measured latency, disaster recovery, legal
placement or an explicit availability goal justifies its operational and
data-consistency cost. A CDN, replica and affinity are independently
useful; none is automatically a multi-region write strategy.

<details class="learning-answer">
<summary>A learner sees an old private enrollment after failover. Is sticky routing enough?</summary>
<p>No. Affinity can keep the learner on one replica, but failover or lag can
still hide a write. Route to an authority or use a verified session version
and wait or fall back until that version is visible.</p>
</details>

## 2. Traffic reaches a region before data becomes correct

```text
learner -> recursive DNS resolver -> cached regional address
        -> global load balancer -> healthy regional API
                                  -> selected data authority
                                  -> replicas / cache
```

Geo DNS answers based on available signals, often the recursive resolver's
location rather than the learner's. Resolver caching and TTL mean a new
answer may not reach every client immediately. Client DNS behavior, VPNs,
anycast, and provider-specific client-subnet support all affect routing.
Do not promise that DNS always finds the nearest user or the lowest
latency path.

A global load balancer can use health checks, geographic policy, latency
measurements, weights or failover rules. A probe proves only what it
actually checks: a reachable HTTP endpoint might still be unable to write
to the database. Routing to a healthy API does not promote a data replica,
transfer write ownership, recover lost commits, or fence an old writer.
Separate traffic failover from data failover in the runbook.

**Change.** Mumbai's API becomes unhealthy or possibly isolated, while
Virginia's asynchronous database replica is behind. Routing clients to
Virginia does not make its copy current or transfer write authority.
Virginia must not accept last-seat writes as the new owner until a safe
promotion establishes ownership and fences the old writer.

<details class="learning-answer">
<summary>Why can DNS failover be slower than a health check?</summary>
<p>Resolvers and clients can retain an earlier answer until their cache
expires or is refreshed. The health check and the DNS cache are different
mechanisms, and neither alone transfers data ownership.</p>
</details>

## 3. Active-passive is a policy, not an idle copy

In an illustrative active-passive design, Mumbai owns course writes.
Virginia can receive replicated data and run a tested standby API. A
promotion procedure first determines the latest safe recoverable state,
prevents the old primary from writing, promotes the standby, and then
changes traffic routing. Authentication and authorization remain enforced
in both regions; a valid session in one region is not a bypass elsewhere.

During a partition the old primary might merely be isolated, not dead.
Promotion without fencing can leave both sides accepting conflicting
writes. If the old authority cannot be fenced and no quorum can safely
elect the new one, refuse writes rather than inventing certainty. Test the
recovery procedure before relying on it, including stale DNS, credentials,
secrets, schema compatibility and draining in-flight requests.

```text
normal:   clients -> Mumbai [write owner] --replicate--> Virginia [standby]
failure:  clients -> Virginia [promoted only after safe ownership transfer]
                    old Mumbai writer fenced; not merely unreachable
```

An actively served read replica can coexist with a passive write owner.
Calling both regions “active” at the HTTP layer does not establish
multi-primary database semantics.

## 4. Active-active requires explicit authority

In an active-active API, both regions serve traffic. For each data type
decide who can write, authenticate requests, and enforce invariants.
One option assigns each course a home region: both APIs accept requests,
but forward seat changes to that course's single write authority. During a
partition the remote region cannot complete those writes; local cached
catalogue reads may still work.

Another option uses a consensus-backed write group spanning regions.
It can maintain an ordered decision when a quorum communicates, but adds
cross-region latency and loses write availability on a minority side.
Running two independent primaries for the same last seat without
coordination permits overselling. “Multi-master” is a topology, not a
conflict-resolution policy; ownership, concurrent updates, and conflict
resolution must be specified per record and operation.

Some data admits mergeable writes: independent reaction counts or append
events might use carefully designed commutative operations, with duplicate
handling and convergence rules. A seat allocation is not made safe merely
by picking the latest timestamp after both learners were promised it.
Compensation may handle a business mistake, but cannot retroactively make
two exclusive promises correct.

<details class="learning-answer">
<summary>Can two active API regions share one write owner?</summary>
<p>Yes. Both can serve requests while forwarding a course's writes to the
owner. That improves access paths, not write availability across a
partition that isolates the owner.</p>
</details>

## 5. RTO and RPO make recovery testable

**Recovery time objective** (RTO) is the target maximum interruption
from the incident's agreed starting point to restoration of the defined
service. **Recovery point objective** (RPO) is the target maximum age of
data that may be lost, measured backwards from the failure to the latest
recoverable point. They are objectives, not observations or guarantees.
Define which operations and dependencies count as restored.

Suppose the policy says RTO 15 minutes and RPO 5 minutes. A drill starts
at 10:00, restores the defined write service at 10:12, and recovers data
through 09:57. The observed recovery time is 12 minutes and the observed
loss window is 3 minutes, within those illustrative targets. A single
successful drill does not prove every incident meets them. Record the
timeline, check actual records, repeat under representative failures, and
report failed drills.

An asynchronous replica acknowledges a primary write before the remote
copy necessarily has it. Its lag is a measurement, not a fixed “two
seconds”; if telemetry is missing or the link is broken, lag may be
unknown and can grow. A synchronous remote acknowledgement can reduce
acknowledged-data loss for the specified durable replicas and failure
model, at the cost of latency and potentially unavailable writes. It does
not make every disaster's RPO zero: correlated loss, configuration errors,
durability and recovery procedures still matter.

Backups and restore tests protect against corruption or accidental
deletion that replication can faithfully copy. Audit replication health,
restore point age, failover timing and application correctness, not only
whether servers are running.

<details class="learning-answer">
<summary>Does a synchronous replica automatically establish RPO zero?</summary>
<p>No. It limits loss of acknowledged writes only under the stated
acknowledgement, durability and failure assumptions. Test recovery and
include correlated failures and backup recovery in the policy.</p>
</details>

## 6. A separate last-seat snapshot

The following is an **independent hypothetical snapshot**, not the current
29-seat fixture and not a new enrollment for `learner-7`. It explores a
different moment with one remaining seat and two different learners.
The fields exactly reproduce the shared partition fixture.

<!-- example: partition-snapshot -->
```json
{
  "courseId": "course-101",
  "initialSeats": 1,
  "learners": ["learner-8", "learner-9"],
  "replicas": ["A", "B", "C"],
  "term": 12
}
```

**Invariant.** At most one successful reservation may consume this
particular last seat. Each request also needs authentication,
authorization and a stable idempotency key scoped to its intent.
This exercise does not imply a new public response schema.

**Normal path.** A write authority serializes both requests. If
`learner-8` wins, it records the decision and zero seats atomically;
`learner-9` receives a no-seat outcome. Reverse scheduling could make
`learner-9` the winner. The ordering is a decision, not a property of the
learner identifier.

**Change.** Network connectivity divides A and B from C. The A/B majority
can continue only if it has a valid leader and the necessary data, while
C cannot independently commit a conflicting seat decision in the chosen
majority protocol. A request at C must be forwarded when possible or
return a retryable failure; it must not claim a successful reservation.

**Failure.** A write commits but the response is lost. The client cannot
infer failure from a timeout. It retries the *same* intent key; a durable
deduplication record returns the original outcome. A new key would describe
a different intent and must not silently overwrite the original result.
External effects need their own idempotency or transactional handoff.
See [transactions and recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md)
and [consensus and coordination](CONSENSUS-AND-COORDINATION.md).

## 7. CAP is about a specific impossibility

For CAP, **consistency** means linearizability: completed operations appear
to take effect at one instant between invocation and response, in an order
respecting real-time precedence. It is not generic correctness, ACID
consistency, or merely “all replicas match eventually.”

CAP **availability** means every request sent to a non-failed node
eventually receives a non-error response, even while messages between
partitioned nodes are lost. The response must fulfill the specified valid
operation, rather than simply return any HTTP status. For example, a
documented no-seat business outcome can fulfill a reservation operation
even if represented as HTTP 409; that status alone does not establish CAP
unavailability. HTTP 503 because the node cannot coordinate, or an
indefinite wait, does not fulfill the operation. This is not a percentage
uptime SLO, nor a promise of immediate responses. **Partition tolerance** concerns the
system continuing under communication loss between nodes, not surviving
all imaginable disasters.

Under a partition, a replicated read/write service cannot in general
guarantee both linearizability and that availability for all such
requests. It can refuse or delay an operation to preserve linearizability,
or respond on both sides and allow histories that are not linearizable.
“Choose any two” is misleading: network partitions are a failure condition,
not a freely disabled feature; neither CAP nor the labels require every
operation in a whole product to have the same policy.

```text
A/B majority: accept ordered seat write -> committed decision
             X partition X
C minority:   reject / wait rather than promise another last seat
```

The diagram describes one chosen consistency-preserving write policy,
not a proof that every response or read from that system is linearizable.
To claim linearizable reads, use the protocol's specified read mechanism,
including leadership validation and ordering, not a random replica read.

<details class="learning-answer">
<summary>Does returning HTTP 503 satisfy CAP availability?</summary>
<p>No, if 503 means the node cannot coordinate and fulfill the valid
operation. By contrast, a documented no-seat outcome may fulfill the
operation even if its HTTP status is 409. CAP availability concerns the
specified operation, not an HTTP status class alone.</p>
</details>

## 8. Read guarantees are different contracts

Suppose A confirms a profile update at version 5, while B still has version
4. A read from B can be stale. With eventual consistency, replicas
converge if updates stop and replication and conflict resolution eventually
succeed; the term alone gives no bounded convergence time.

**Read-your-writes** says a session sees its own successful writes in later
reads. A version token can let a replica wait until it has applied at
least that version, or redirect to an authority; if neither can satisfy
the token, the service must wait or fail rather than lie. Scope the token
to the object and authorization context and define expiration.

**Monotonic reads** says once the session has observed version 5, later
reads in that session do not go backwards to version 4. Track the maximum
observed version, not only versions written by this learner. This is
different from read-your-writes: a user can observe another user's version
5 and later regress even without writing anything.

These are session guarantees, not global linearizability. They do not
order all clients' concurrent operations or ensure a client sees another
client's completed write. Session affinity can help when a single replica
is caught up, but is not a proof, especially after failover. Version
tokens, authority routing and server-side waiting have latency and
availability costs.

| Requirement | Example | Possible response under lag |
| --- | --- | --- |
| Eventual | Public description may be old | Serve old value, converge later |
| Read-your-writes | See my own confirmed profile edit | Wait, authority, or fail |
| Monotonic reads | Never regress from version 5 to 4 | Wait, authority, or fail |
| Linearizable | Respect completed writes from all clients | Validated ordered read or fail |

<details class="learning-answer">
<summary>Can a session see its own write and still lack linearizability?</summary>
<p>Yes. Its own writes can be visible while it misses a different
client's completed write. Read-your-writes is scoped to the session;
linearizability constrains the global history and real-time order.</p>
</details>

## 9. Quorum overlap helps; it is not the whole protocol

For a fixed set of N replicas, read quorum size R and write quorum size W
overlap when R + W > N. With N=3, R=2, W=2, every read pair intersects
every write pair. With R=1 and W=2, a reader can select the third replica
and miss the write. Larger quorums trade latency and availability for
more overlap.

Intersection alone does **not** establish linearizability. A read must
identify the right version and return or repair it according to a correct
protocol. Concurrent writes need a consistent ordering or conflict rule;
acknowledgements must mean durable state; failures and reconfiguration
must preserve the relevant overlap. A replica contacted by both quorums
may carry an older or conflicting value, or a read may race a write.
Membership changes need a safe transition, not just recalculation of N.

```text
N=3: write {A,B}; read {B,C} -> overlap B
Overlap reveals a possible evidence path, not a complete ordering proof.
```

The [consensus lesson](CONSENSUS-AND-COORDINATION.md) explains why election
rules, durable votes, log matching and commit rules matter in addition to
majority intersection. A quorum read/write scheme and a Raft replicated
log are related ideas, not interchangeable APIs.

<details class="learning-answer">
<summary>Why is R + W &gt; N insufficient on its own?</summary>
<p>Overlap identifies a shared replica but does not specify which version
it stores, how concurrent writes are ordered, whether acknowledgements are
durable, or how membership changes preserve safety.</p>
</details>

## 10. Patterns and product claims need scope

The original uses checkout, banking, social feeds and recommendations to
motivate different tradeoffs. These are design examples, not claims about
the current internals of Amazon, Netflix or any bank. A checkout might
require an ordered inventory decision while showing a cached product
description; the same product can have multiple consistency policies.

Do not label Cassandra, Dynamo-style stores, Redis, Spanner, or any other
product simply “CP” or “AP” without naming its deployment, operation,
replication mode, read/write settings and failure assumptions. A system
can offer stronger and weaker paths, and its behavior can change with
configuration. Consult its version-specific documentation before turning
an illustrative classification into an operational guarantee.

Multi-region improves resilience only if dependencies, credentials,
network paths, capacity, state and recovery have been tested. Two regions
sharing a single control plane or bad deployment can share the same
failure. Separate blast radii where justified and rehearse rollback.

## 11. Design review: make the tradeoff observable

Imagine the team adds a Virginia read replica and leaves Mumbai as the
write owner. First establish a baseline: measure end-to-end read latency
from representative client networks, origin load, response error rate,
and freshness of the version actually served. A fast answer is not useful
evidence if it belongs to another tenant or violates a freshness promise.

Next route only public catalogue reads to Virginia. Compare regional
latency and origin capacity against the baseline. Include cache hit ratio,
replication delay where measurable, and the number of reads that fall back
to the owner. Describe missing lag telemetry as unknown, not zero; alert
when lag cannot be measured or exceeds the policy threshold.

Now interrupt replication in a tabletop exercise. Public catalogue reads
may keep serving a labeled old description under an explicit freshness
budget. When that budget expires, the chosen policy must either return an
error, route to an authority, or explicitly relax the product promise.
The replica must not decide that a seat remains available merely because
its copy says one. The write owner still checks the invariant.

Finally interrupt Mumbai itself. A regional load balancer can direct
requests to Virginia, but the service should distinguish “API responds”
from “write authority is safely promoted.” Track time to safe write
restoration separately from time to first healthy HTTP response. Compare
the latest recoverable data point with the RPO target and exercise
rollback if the old primary returns.

This sequence has a cost: waiting for a fresh read adds latency and
potentially fails requests, while serving an old read risks misleading
users. Present the choice to the product owner with a named data field,
maximum acceptable staleness and observed failure rate rather than a
generic “eventual is fast” claim.

<details class="learning-answer">
<summary>What should a freshness dashboard show when the replica is disconnected?</summary>
<p>Show that lag is unknown or increasing, together with the time of the
last verified applied update and any policy-driven fallback or error.
An absent measurement is not evidence that the replica is current.</p>
</details>

## 12. Practice: choose, change, defend

1. The public catalogue needs low-latency reads; a five-minute-old
   description is acceptable. Choose a cache policy and invalidation
   strategy, then explain how you will measure freshness.
2. The seat request must not oversell during a regional partition. Name
   the authority, operation that commits, and minority response.
3. A client sees a confirmed enrollment but gets an old replica next.
   Propose a session version or authority route and explain its failure
   behavior.
4. Your failover exercise recovers at 10:21 with data through 09:51 after
   a 10:00 incident. Compare the observed 21-minute recovery and
   nine-minute data-loss window with the illustrative objectives above.
5. A team says 2-of-3 reads and writes guarantee linearizability.
   Describe one missing mechanism and a membership-change concern.

<details class="learning-answer">
<summary>Check the failover exercise.</summary>
<p>Both targets are missed: 21 minutes exceeds the 15-minute RTO, and
nine minutes exceeds the five-minute RPO. Investigate the observed
timeline and recoverable records; do not report the objective as a result.</p>
</details>

<details class="learning-answer">
<summary>Check the last-seat decision.</summary>
<p>A quorum-backed authority can commit one reservation, while the
isolated minority waits or fails. Retries reuse a durable intent identity;
the choice protects the stated invariant by sacrificing minority writes.</p>
</details>

## 13. Source bridge and next steps

Module 7.3 introduced geography, replication, read replicas, multi-master,
active-passive, active-active, RTO and RPO. Module 7.7 introduced
partitions, CP/AP choices, eventual and session consistency, and quorum
reads and writes. The examples here retain those ideas while making their
assumptions and limitations explicit.

The original's line 2212 says “Nearest region selection” for Geo DNS;
resolver location and caching make that an approximation. Lines 1972–1975
give “2 seconds” for replication; treat that as a hypothetical example,
not a bound. Lines 4575–4576 say “Every read returns latest write” and
“Every request gets a response”; the CAP definitions above specify
real-time linearizability and non-error responses at non-failed nodes.
Lines 4803–4805 state “During a partition, you must choose consistency or
availability”; this is an impossibility for the stated guarantees, not a
whole-product classification or a requirement to choose blindly.

Continue with [consensus](CONSENSUS-AND-COORDINATION.md) for the replicated
decision, [transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md) for
multi-service recovery, [reliability](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md)
for measured objectives, and [gateway routing](GATEWAYS-BFFS-AND-LOAD-BALANCING.md)
for the boundary between traffic and application state.
