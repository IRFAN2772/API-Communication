# Sharding, caching and infrastructure: who owns this write?

[← Guided senior design](../GUIDED-SENIOR-DESIGN.md) |
[Original senior guide](../07-SENIOR-DESIGN-GUIDE.md) |
[Course library](../COURSE-CONTENT-MAP.md) |
[Correction ledger](../CONTENT-CORRECTIONS.md) |
[Senior fixtures](../../assets/senior-lesson-fixtures.mjs)

This fictional exercise is a design model, not a deployed cache, database,
broker, gateway, or migration. The guided senior companion and complete
original guide remain available through the links above.
`course-101` is **API Fundamentals**, with 29 seats in the shared snapshot.
`learner-7` has `enrollment-42` and the shared completion fact
`completion-42`; none of the examples re-enrolls the learner, changes the
seat count, or invents a completion.

We introduce a **separate internal tenant metadata model** solely to reason
about ownership: `(org-a, course-101)` has a reporting label. The label
changes from `daily` at record version 1 to `weekly` at version 2.
This is not a new HTTP field, enrollment, or seat update. Tenant ownership
and authorization in this example are explicit assumptions, not facts
automatically supplied by the existing course contract.

<!-- example: shard-migration-case -->
```json
{
  "tenantId": "org-a",
  "courseId": "course-101",
  "source": "shard-a",
  "target": "shard-b",
  "initialEpoch": 7,
  "nextEpoch": 8,
  "initialRecordVersion": 1,
  "nextRecordVersion": 2,
  "initialLabel": "daily",
  "changedLabel": "weekly"
}
```

## Outcomes

After working through the example, you can:

- distinguish scaling stateless request handlers from dividing data ownership;
- route a verified tenant and resource to a home shard and enforce a fence;
- explain why a stale backfill must not replace a newer update;
- specify what may be cached, for whom, and for how long;
- distinguish a connection registry, event log, work queue and database;
- diagnose partial migration and infrastructure failures without inventing success.

## 1. Begin with the problem, not the product

Suppose a course service initially has modest traffic and one relational
database. The application stores course and enrollment records and enforces
the relevant business invariants in local transactions. It can also store
our hypothetical tenant metadata alongside them. A backup and a tested
restore, measured latency, indexes, capacity limits and on-call ownership
are useful before introducing another distributed system.

A learner requests the course; a backend checks the request and reads the
database. An authenticated enrollment operation must apply its business
rules and return only a committed or safely replayed result. The request
can time out after a commit, so the client must not infer the result from
the timeout. See [REST reliability](REST-RELIABILITY-AND-OPERATIONS.md)
and [contracts and lifecycle](API-CONTRACTS-AND-LIFECYCLE.md).

Add a load balancer and multiple **stateless API replicas** when handler
capacity or instance availability justifies them. Each eligible replica
can receive a request and use the same authoritative database. The
balancer chooses a server, not a separate ownership shard for the data.
Replicas do not make a single database infinitely scalable or available,
and shared dependencies can fail all replicas together.

External session storage can permit a request to land on another replica,
but needs its own security, availability and expiry policies. A JWT is a
credential format, not a substitute for verified claims or object
authorization. Sticky sessions can reduce movement but do not protect
against node loss and must not be the sole durable state mechanism.

```text
clients -> load balancer -> API replica A --+
                         -> API replica B --+-> one authoritative database
```

The arrows show request distribution, not two copies of the database.
Use readiness and draining to stop assigning new requests to a departing
instance; existing work may still fail. Round robin counts selections,
not work. Least connections can misjudge multiplexed HTTP/2 streams.
IP affinity can concentrate many users behind the same NAT on one node
and may change when a client changes networks.

<details class="learning-answer">
<summary>Did adding replica B shard the course data?</summary>
<p>No. Both replicas use the same authoritative database. Request distribution and data ownership are different decisions.</p>
</details>

## 2. A measured reason to divide data

If the database remains the bottleneck after query/index work, caching of
eligible reads and appropriate capacity improvements, separating data
ownership may be worthwhile. First measure per-tenant request rate,
latency, storage, write contention and operational load. Read replicas
can spread reads, but their lag changes read guarantees and they do not
automatically spread writes. A partitioned data design adds routing,
cross-shard operations, migrations, backup and recovery costs.

In the hypothetical model, a durable routing map assigns a fixed home for
each `(tenantId, courseId)` metadata aggregate. Initially:

| Tenant | Resource | Write owner | Epoch | Stored label | Record version |
| --- | --- | --- | ---: | --- | ---: |
| `org-a` | `course-101` | `shard-a` | 7 | `daily` | 1 |

This row is internal metadata, not the public course or enrollment.
The map must be authoritative enough for the promised write semantics;
clients can cache a route only with a defined refresh and rejection
protocol. A shard checks authority at the protected write boundary.
A stale client route is not permission to write.

The owner serializes and commits updates to the aggregate with a durable,
monotonic record version. One possible implementation uses a transaction
that checks the active epoch and expected version and commits the new
record and any local outbox intent together. Both predicates must be
enforced at the resource, not only in a router or process memory. The
illustrative version increments for an accepted change, not for a retry
that merely returns a previous result.

For a scoped read, derive the tenant from verified context, look up the
home and apply the object policy. A wrong or unknown mapping is an
unavailable or rejected operation, not a reason to search all shards
and return the first plausible row. The router and authorization layer
must agree on resource identity. Define what happens when map access
fails or a client sees an obsolete epoch.

<details class="learning-answer">
<summary>Does knowing that org-a lives on shard-a authorize a read?</summary>
<p>No. Routing locates data; verified membership and the relevant object and action authorization still decide whether the caller may read it.</p>
</details>

## 3. Routing choices and their limits

A fixed mapping is easy to inspect and can isolate a tenant, but an
authoritative map must be maintained and made available. A hash of the
tenant and resource can distribute many keys without an individual map
entry for every key; modulo by shard count can remap many keys when the
count changes. Consistent hashing typically remaps fewer keys when
membership changes, not zero. Virtual nodes may smooth distribution;
their count and placement still need measurement.

Neither hashing scheme physically copies records, fences an old writer,
or resolves a partially completed move. A routing change must be paired
with a migration and recovery protocol. Different systems can use a
directory, ranges, hash slots or a combination; the best choice depends
on workload and operations, not a universal ranking.

A hot key is a single aggregate whose traffic dominates a shard. Adding
shards or virtual nodes may spread *other* keys while that key remains
on one owner. Cache safely shareable reads, coalesce requests, rate-limit,
isolate resources or rethink the aggregate if semantics allow. Splitting
one aggregate across owners makes its invariants and recombination more
complex. A tenant-wide partition key can also make a large tenant a
noisy neighbor even when many smaller tenants are balanced.

If a resource needs a transaction with another aggregate on another
shard, a local transaction no longer covers both. Reconsider the boundary
or use an explicitly designed workflow and reconciliation; do not claim
that a router turns cross-shard operations into one transaction. See
[distributed transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md).

## 4. Changed requirement: move a hot aggregate

Assume `org-a/course-101` becomes hot enough that operations staff decide
to move its metadata to `shard-b`. The change is a *worked migration*,
not a claim that the actual course needs sharding. Before starting,
identify a migration owner, durable control state, source and destination,
copy watermark, audit trail, capacity and a recovery plan.

The safety invariant is at most one accepted write owner for this
aggregate; a successfully acknowledged update must not disappear during
the move. A record version orders committed changes to this record.
An epoch represents ownership authority; it is not the record version.
An epoch alone does not move bytes or prove that a destination is current.

### A concrete sequence

1. **Start:** `shard-a` owns writes at epoch 7 and holds version 1,
   label `daily`. `shard-b` is a write-disabled migration destination.
   Record the migration and its copy position durably.
2. **Backfill:** copy version 1 (`daily`) from A to B while normal
   epoch-7 writes still go to A. This copy is a snapshot, not evidence
   that no later update exists.
3. **Concurrent change:** A accepts a valid epoch-7 update to version 2,
   label `weekly`. The committed change must appear in an ordered,
   durable change tail or equivalent recoverable mechanism.
4. **Block early promotion:** B still has version 1. It cannot become
   the active owner yet: promoting it now would lose version 2. A
   preliminary catch-up may run while writes continue, but that alone
   cannot establish a final cutover point.
5. **Fence and quiesce A:** stop admitting epoch-7 writes, drain or abort
   in-flight transactions, and durably establish the old-owner fence at
   the actual write boundary. An acknowledged write must either commit
   before the final source watermark or be rejected. Confirm the final
   watermark and copy the tail *after* this step.
6. **Catch up B:** apply the remaining source changes through that final
   watermark. B now has version 2, label `weekly`. Verify the record,
   watermark and any required dependent state before activation.
7. **Establish B and publish:** establish epoch 8 at B's protected write
   boundary and enable B as write owner only under the controlled
   transition. Then publish the epoch-8 route to B. Clients refresh on
   stale-route rejection. B accepts current-epoch writes only after the
   preconditions are verified.
8. **Reject stale work:** old epoch-7 writers must be rejected at A,
   even if they missed the route update. A delayed version-1 backfill
   must not replace B's version 2. Validate the epoch and compare record
   versions atomically with the mutation, including in copy workers.

The sequence intentionally creates an unavailable write interval between
fencing A and activating B. A source must enforce its own fence: merely
announcing epoch 8 or teaching B to reject epoch 7 cannot stop an
isolated A from accepting old writes. If A cannot be fenced or its final
watermark cannot be established, **do not promote B**.

One possible destination rule accepts a copy only in migration mode,
under an authorized migration identity, and only if its version is newer
than the stored version. A same-version identical replay is a no-op;
same-version different content is a conflict for investigation, not an
overwrite. After promotion, stale copy jobs are fenced or disabled; a
version comparison remains defense in depth. A writer must satisfy both
the current ownership epoch and its expected record version. Merely
having a larger record version must not bypass an obsolete epoch.

<details class="learning-answer">
<summary>Can B be promoted immediately after copying daily/version 1?</summary>
<p>No. A committed weekly/version 2 after the snapshot. Fence and quiesce A, capture the final tail, and verify B has caught up before establishing epoch 8 and publishing the route.</p>
</details>

### Partial failure is part of the design

There is no magic atomic transaction across two independent databases
and the routing map in this story. Durable transition states and
idempotent steps make a controlled recovery possible, not instantaneous.

| Failure point | Safe response |
| --- | --- |
| Backfill or tail interrupted | Keep A as owner while its fence has not been applied; resume from a durable watermark and verify. |
| Cannot prove A fenced | Fail closed for promotion; resolve uncertain in-flight writes and source authority before proceeding. |
| A fenced, B incomplete | Writes remain unavailable; resume catch-up or reconcile from the authoritative source. Do not serve B as current. |
| B established, route publish uncertain | Keep A fenced; inspect durable B and map state, then idempotently finish publishing or use a separately designed rollback. |
| Old route reaches A | Reject epoch 7; refresh the map and retry only if the operation is safe and its outcome is known or idempotent. |
| Tail has a gap, conflicting version, or corrupt row | Stop activation and reconcile against source evidence; alert an owner. |

A rollback after B has accepted writes is another ownership migration,
not simply republishing A's old route. Fence B, recover its committed
tail to the intended destination, establish a newer epoch and publish
only after verification. If the source or control plane is lost, the
recovery point, backups and any replicated durable log determine what can
be recovered. If correctness cannot be established, keep writes closed
and declare the uncertainty. A lease expiry or a successful health check
is not sufficient proof that an old database writer is fenced.

<details class="learning-answer">
<summary>If the route publish fails after B is ready, should A resume epoch 7?</summary>
<p>No. A remains fenced. Inspect and reconcile the durable transition; any return to A requires a safe new ownership transition, especially if B may have accepted writes.</p>
</details>

## 5. Tenant scope follows the data

For a request selecting `/organizations/org-a/...`, the URL organization
ID is untrusted selection input, not proof of membership. Authenticate the
principal, verify membership from trusted context, and authorize the
particular resource and action. A JWT does not automatically isolate
tenants: verify issuer, signature, audience, expiry and relevant claims,
and apply membership and object policy. Revocation and cache freshness
need explicit requirements.

Use the verified tenant in SQL predicates, tenant-aware joins, foreign and
unique keys, indexes, background jobs and cache keys. For example:

```sql
SELECT m.label, m.record_version
FROM course_metadata AS m
JOIN courses AS c
  ON c.tenant_id = m.tenant_id AND c.course_id = m.course_id
WHERE m.tenant_id = :verified_tenant
  AND m.course_id = :course_id;
```

This is illustrative SQL for the separate internal model, not a published
endpoint or a complete authorization implementation. An index beginning
with `(tenant_id, course_id)` supports this access pattern. The join must
carry tenant identity on both sides; a lookup by course ID alone can cross
an isolation boundary. Tenant-scoped keys prevent collisions but are not
themselves authorization. Check administrative tools, exports and async
consumers too; see [tenancy and governance](TENANCY-USAGE-AND-GOVERNANCE.md).

At the edge, strip untrusted identity headers, authenticate and forward
verified context only over a restricted, authenticated TLS-protected hop.
Backends enforce their own object policy and validate alternate paths.
Validate input size and shape, apply admission controls and keep secrets
out of logs and shared caches. These are existing boundary lessons, not a
new vulnerability audit: [gateway](GATEWAYS-BFFS-AND-LOAD-BALANCING.md)
and [service mesh and trust](SERVICE-MESH-AND-TRUST.md).

## 6. Cache a representation, not a promise

A cache saves a representation or derived state so a later permitted read
can avoid repeated work. Before using it, define the source of truth,
scope, freshness bound, invalidation, eviction and failure behavior.
For internal metadata, an illustrative immutable versioned key is:

```text
metadata:org-a:course-101:epoch-8:version-2
```

It includes tenant, resource, ownership epoch and record version. In a
real encoding, avoid delimiter collisions using structured or length-
prefixed fields; include representation and authorization-relevant scope
where needed. Epoch prevents an old route's cached value being mistaken
for the new ownership generation, while version separates data changes.
Neither establishes the current epoch or version by itself.

How does a reader know which version to use? It may obtain an authoritative
current version or a reliably maintained pointer with an explicitly bounded
freshness contract. A stale pointer can still select version 1 despite the
existence of a version-2 key. Strong read-after-write or authorization
promises require an authoritative or otherwise sufficiently strong check;
TTL alone does not make an old value current. Authenticate and authorize
before returning sensitive cached data.

For an illustrative public optional recommendation list, a product may
permit a bounded stale result if its own view contract labels it
`stale` and includes its as-of time. If no suitable value exists, label
it `unavailable`, not an empty successful list. Do not fabricate a
confirmed enrollment, seat count or completed action when its required
source is unavailable. Credentials and private enrollment data do not
belong in a public shared cache.

### The write and the invalidation

At the owning database, commit the metadata change and an invalidation
publication intent in the same **local transactional outbox**. A relay
publishes the intent later and retries; consumers handle duplicates and
out-of-order delivery using scoped version/epoch rules. Monitor lag and
reconcile missed invalidations. An outbox makes that database mutation
and its intent atomic locally; it does not make an external cache and
database dual write atomic. Even a successful publish is not proof every
cache has applied it.

Between commit and invalidation, stale values can be served unless the
read protocol checks current authority/version or the contract explicitly
allows the bounded staleness. A cache outage can fall back to the source
only within source capacity; protect it with request coalescing, rate
limits and bounded concurrency. If strong checks or the owner are
unavailable, reject or report unavailable rather than promise freshness.
Do not silently remove authorization checks to keep a cache hit rate high.

<details class="learning-answer">
<summary>Does writing version 2 and publishing an invalidation make every cache instantly fresh?</summary>
<p>No. The outbox records the intent atomically with the local write, but publication and cache application are separate and may lag or fail. Strong reads need a suitable current-state check.</p>
</details>

## 7. Communication method changes the caching boundary

| Method | Potential reuse | Boundary and caution |
| --- | --- | --- |
| REST/HTTP | Eligible public course representation, validators and conditional requests | GET is not automatically public or cacheable; respect `Cache-Control`, authorization, `Vary`, validators and freshness. A `304` has no representation body. |
| GraphQL | Normalized client objects, carefully scoped fields or eligible persisted-query responses | Operation, variables, principal and field policy affect a result. Batching is not a shared cache; query cost and N+1 remain relevant. |
| gRPC | Application-level data or results with explicit keys and policy | HTTP/2 transport does not provide generic HTTP response caching for RPC semantics. Unary calls and long-lived streams have different lifecycles. |
| WebSocket/SSE | Latest state, presence or retained events in an appropriate store | The connection itself is not a cache; a state snapshot may be stale and a reconnect needs a separate resume policy. |
| Async consumers | A materialized read model updated from retained events | Projection lag, duplicate delivery, ordering and replay retention constrain what it can claim. |

See full [REST collections and caching](REST-COLLECTIONS-AND-CACHING.md),
[GraphQL cost and caching](GRAPHQL-COST-CACHING-AND-EVOLUTION.md),
[gRPC lifecycle](GRPC-LIFECYCLE-AND-OPERATIONS.md),
[realtime recovery](REALTIME-RECOVERY-AND-FLOW.md), and
[event models and projections](EVENT-MODELS-AND-PROJECTIONS.md).
A synchronous response does not imply strong consistency: a handler can
read a lagging replica or cache. An asynchronous projection can have
specific useful freshness guarantees, but they must be designed and
observed rather than inferred from the protocol.

<details class="learning-answer">
<summary>Can every GET response be put in a shared cache?</summary>
<p>No. Cacheability and scope depend on the response policy, representation and authorization. Personalized enrollment data must not leak through a public shared cache.</p>
</details>

## 8. Connections have owners, not durable authority

Stateless request replicas and long-lived connection gateways have
different scaling units. A WebSocket connection is owned by a particular
gateway process until it closes; a load balancer usually selects the
gateway at connection establishment. It cannot transparently move an
established socket to another process. An HTTP/2-aware balancer may
distribute RPCs differently from a layer-4 connection balancer; consult
the actual proxy and stream behavior.

A gateway-owned registry can associate an authenticated user's
connections with gateway IDs, connection IDs, region, generation and
expiry. It is a routing hint for delivering a notification, **not
authentication proof**. Each new connection authenticates and authorizes
its subscriptions; the delivery path checks current permission as
required. One user can have multiple devices and multiple connection IDs.
A user-to-single-node map silently drops those other devices.

Heartbeats renew bounded TTLs. Crashes can leave stale entries until
expiry; an entry may also expire during a pause even while a socket exists.
An old disconnect must conditionally delete only its own connection and
generation, not a new connection's replacement. A generation or unique
connection ID guards stale cleanup, but registry loss or TTL expiration
still requires recovery and cannot prove delivery. Handle failure to
register or route explicitly.

For planned shutdown, mark a gateway unready, stop new connections, drain
existing sockets where possible, and close remaining ones at a deadline.
Clients reconnect with backoff and jitter, reauthenticate, resubscribe
and resume from a cursor only if the service has an authorized retained
history and defines its ordering and retention. Otherwise fetch a current
snapshot and report any unrecoverable gap. Registry presence or pub/sub
alone is not replay or a guarantee that every device saw a message.

<details class="learning-answer">
<summary>Can a registry entry authenticate a reconnecting learner?</summary>
<p>No. It is a possibly stale routing hint. Authenticate the new connection and authorize subscriptions independently, then register its new identity and generation.</p>
</details>

## 9. Partition events by the invariant

For related events that require per-aggregate ordering, choose a stable
key such as the scoped `(tenantId, courseId)` metadata aggregate, or an
enrollment ID for an enrollment's own sequence. A tenant-only key may
unnecessarily serialize unrelated courses and make a hot tenant worse.
An unscoped course ID may collide across tenants. The key must match
the business invariant; no key provides a global order across partitions.

A partition log orders its records, not automatically completion of
concurrent handlers, retries, external effects or durability. To preserve
an effect order, serialize or coordinate per key, track versions, fence
stale workers and handle duplicates. Producer acknowledgements,
replication, retention and consumer commit behavior determine the
separate durability boundary. A consumer offset is a position, not a
business acknowledgement or proof an email was sent.

Changing partition count or the partitioner can change key-to-partition
mapping, allowing old and new records for a key to coexist in different
partitions. Plan a drain, versioned routing or other ordered migration;
do not assume adding partitions automatically preserves prior ordering.
A hot key remains a bottleneck on its partition. Broker queue types also
differ: RabbitMQ streams support retained replay, unlike an ordinary
acknowledged classic queue. Their partitioning and ordering behavior must
be checked for the chosen stream topology and product version.

[Brokers, delivery and recovery](BROKERS-DELIVERY-AND-RECOVERY.md) covers
producer confirms, consumer ACKs, durable inboxes and retained positions.
[Outbox and inbox](OUTBOX-INBOX-AND-WORKFLOWS.md) explains local effects
and external side effects. More consumers do not overcome every ordering
or downstream capacity limit.

<details class="learning-answer">
<summary>Does one partition key make every handler finish in event order?</summary>
<p>No. The log has an order, but concurrent handlers, retries and external effects can finish differently. The application must enforce the required per-key effect ordering.</p>
</details>

## 10. Infrastructure roles are alternatives, not a mandatory stack

The following comparisons answer different questions. A real design may
use none, one, or several of these roles, depending on measured need.
Every choice includes deployment, configuration, access control,
backups where relevant, monitoring, upgrades and on-call ownership.

### Redis: fast access to selected state

A course service might send cache lookups for eligible public course data,
or a gateway might record expiring presence for connected devices. Redis
can also hold session data or rate-limit counters with carefully defined
atomic operations and expiry. Distributed locks require lease assumptions
and a resource-enforced fencing token; lock acquisition alone cannot stop
a paused former holder. Avoid storing credentials in shared cache keys or
logging session values.

In-memory state can be lost or evicted. Persistence and replication modes
and failover configuration change the recovery point and availability;
replication is not an unconditional durable commit. Redis Streams are
retained stream data with consumer semantics and configured trimming;
Redis Pub/Sub is ephemeral delivery to currently subscribed clients, not
replay. A disconnect can therefore lose a Pub/Sub notification. Neither
feature automatically proves a downstream business effect.

Do not adopt Redis just to make a small, well-indexed database read look
architecturally sophisticated. Capacity, hot keys, eviction, persistence,
failover, recovery and invalidation require operations. An optional stale
public view may tolerate loss; a seat invariant or authorization decision
cannot silently depend on an evictable value without stronger guarantees.

### Kafka: retained partition logs

A service might send the already committed `completion-42` fact to a
topic so analytics and certificates independently consume it. Kafka
stores records in partition logs for configured retention; independent
consumer groups track offsets. An ordered partition is not an ordered
completion of all application side effects, and retention or compaction
limits replay. Configure replication, acknowledgements and recovery
according to the actual failure model; a broker acceptance is not a
certificate issued or an email delivered.

Kafka may be useful for multiple independently replaying consumers and
high sustained throughput. Do not adopt it solely for a small low-volume
email job if a simpler queue meets the requirements. Partition planning,
rebalance handling, retention storage, disk, network, schema governance,
consumer lag and operations all cost money and attention.

### RabbitMQ: routed work and also streams

A workflow can send a completion-email command to an exchange that routes
it to a worker queue. Bindings decide routing. A classic queue typically
removes an acknowledged delivery; publisher confirms and consumer ACKs
cover different boundaries, and neither proves external email delivery.
Durability depends on queue type, message persistence, configuration and
failures. Quorum queues offer a different replicated queue tradeoff.
Workers need idempotent durable effects and bounded retries.

RabbitMQ **streams** are a distinct retained-log feature with replay
within retention: do not say all RabbitMQ messages are non-replayable.
Choose queue or stream semantics deliberately, including routing and
ordering limitations. Do not choose classic queues as an indefinite
history, or a complex broker for a trivial workload without a recovery
owner. Queue depth and oldest age, unacknowledged deliveries, dead letters,
disk and replication require monitoring.

### Cassandra: query-oriented storage

Cassandra is a distributed database behind an API, not an API protocol or
a replacement for REST or gRPC. A hypothetical high-volume notification
history can be stored in tables designed around known tenant and query
patterns. The partition key determines placement and the clustering
design affects accessible ordering; an excessively large or hot partition
can overwhelm a node. Include tenant isolation and retention in the
model and enforce authorization separately.

Consistency is configurable per operation and depends on replication,
consistency level, topology and failure assumptions. Do not label every
Cassandra deployment universally AP or assume any setting provides all
strong transaction guarantees. Evaluate query limitations, repairs,
compaction, tombstones, backup and restore, capacity and operational
expertise. Do not adopt it when a single relational database satisfies
the workload and needed transactions more simply.

<details class="learning-answer">
<summary>Which one of these four products must every course API use?</summary>
<p>None. They serve different roles; choose only when a requirement and failure model justify the operational cost. Cassandra is storage, not a communication protocol.</p>
</details>

## 11. Observe the boundary that can fail

Track request rate, error rate and duration alongside utilization,
saturation and errors. For sharding, inspect per-shard traffic, skew,
write rejects by bounded reason, migration watermark and lag, fence
failures, routing mismatches and time spent in each transition state.
Alert on a stalled or inconsistent migration, not merely a low cache hit
ratio. Avoid unbounded tenant IDs as metric labels; restrict detailed
tenant diagnostics and keep credentials and unnecessary personal data
out of logs and traces.

For caches measure hits, misses, evictions, age, invalidation/outbox lag
and source load after cache failure. For gateways track active connections,
heartbeat failures, registry expiry, drain duration, reconnect rate and
resume gaps. For brokers track oldest work age, lag, retries, dead-letter
age, partition skew and downstream processing time. A low queue depth
does not prove timely completion, and a high hit rate does not prove
freshness or tenant isolation.

Set deadlines, bounded retry budgets and jitter. Retry only when an
operation is known safe or has a durable idempotency contract; a timeout
can hide a completed write. Isolate optional recommendations from
required enrollment paths with bulkheads and explicit degraded status.
Exercise failure of the routing map, cache, source database, registry and
broker; practice reconciliation and restore rather than relying on a
dashboard. See [reliability and incidents](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md)
and [backpressure](BACKPRESSURE-AND-CAPACITY.md).

## 12. Decision and practice

Start with one database and stateless replicas when they satisfy the
measured load. A public cache can reduce repeated reads when its policy
and freshness are acceptable. A metadata shard move becomes a candidate
only after the bottleneck and added operating costs are demonstrated.
Retained events, task queues, connection registries and databases are
separate roles; none is a prerequisite for the others.

Before approving the move, ask who owns the routing map, fencing, change
tail, backup, restores, version checks, cache policy and incident runbook.
Estimate copy throughput, additional storage, write-unavailability
window, hot-key behavior, cross-shard query cost and staff time. Set
revisit thresholds and name a rollback/reconciliation decision maker.

1. A route cache still points at A after publication of epoch 8. What
   stops its old writer?
2. B has version 2 when a late version-1 copy arrives. What happens?
3. A public recommendation is stale but the enrollment lookup failed.
   What may the UI honestly say?
4. Two devices reconnect while an old cleanup task runs. How should the
   registry avoid deleting the new entries?
5. A Kafka consumer commits an offset after invoking an email provider.
   What remains uncertain?

<details class="learning-answer">
<summary>Check the migration and cache cases</summary>
<p>A's protected write boundary must already reject epoch 7. B rejects or ignores an older version rather than overwriting version 2. A stale optional recommendation may be labeled stale under its contract; an unconfirmed enrollment must not be invented.</p>
</details>

<details class="learning-answer">
<summary>Check the connection and broker cases</summary>
<p>Use per-connection identities and conditional generation-aware cleanup; authenticate each new connection. An offset records a log position, not whether an external provider delivered exactly one email.</p>
</details>

## Source bridge and corrections

The [original senior guide](../07-SENIOR-DESIGN-GUIDE.md) sections 16–19
and 28 supply the sharding, caching, load-balancing, consistency and
product comparison topics. Sections 20, 22 and 24 supply failure and
observability context. These precise original statements need the
qualifications developed above; originals are preserved:

| Original location and exact quotation | Safer interpretation |
| --- | --- |
| 16.2, line 1593: “Shard by:” | Connection ownership is a registry and routing concern; user IDs can have multiple connections, and routing is not authorization or durable data sharding. |
| 16.3, line 1641: “Wrong partition key can destroy ordering guarantees.” | A suitable key is necessary for the intended partition scope but does not serialize handlers or guarantee durable effects, especially after repartitioning. |
| 17.4, line 1739: “WebSocket is not usually cached.” | A live connection is not a cached response; separately stored state or retained history has its own freshness and replay policy. |
| 18.1, line 1771: “Easy:” | Stateless HTTP request distribution is often straightforward, but health, skew, state and shared dependencies still need design. |
| 19.3, line 1898: “Otherwise events may arrive out of order.” | A single key alone cannot guarantee ordered application effects; concurrency, retry, failover and partition changes matter. |
| 28.3, lines 2636–2638: “Not ideal for:” / “long-term replayable event log” | This is reasonable for ordinary acknowledged queues, not a blanket claim about RabbitMQ streams, which have retention-based replay. |

Continue with [consensus and coordination](CONSENSUS-AND-COORDINATION.md)
for fencing and quorum limits and [regions and consistency](REGIONS-AND-CONSISTENCY.md)
for read guarantees and partitions. Tests of the small teaching model are
not proof that any production system implements these controls.
