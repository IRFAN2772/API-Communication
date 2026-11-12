# Tenancy, usage and governance

[← Expert journey](../07-GUIDED-EXPERT-DESIGN.md) |
[Original expert modules](../08-EXPERT-API-DESIGN.md) |
[Course library](../COURSE-CONTENT-MAP.md) |
[Corrections](../CONTENT-CORRECTIONS.md)

This lesson is a fictional design exercise, not a deployed authorization
system, billing provider or contract verification. Its
[shared expert fixtures](../../assets/expert-lesson-fixtures.mjs) retain
`course-101`, **API Fundamentals**, with 29 seats, and the existing
`enrollment-42` for `learner-7`. The course stays entirely free.

The original reading map assigns modules 7.9 and 7.10 to this lesson. The
quick reference also promises platform thinking and API governance. We cover
both and explicitly separate an optional commercial transfer example from
the free course. None of the examples silently changes the current closed
v1 HTTP response.

## Outcomes

You should be able to:

- derive tenant scope from verified membership and authorize the object;
- compare pooled and separate storage while considering noisy neighbors;
- model usage as logical events rather than counting transport retries;
- separate product entitlement from permission to read an object;
- give standards, exceptions and deprecation plans operational owners;
- communicate measured tradeoffs and uncertainty in a design review.

## 1. What a tenant boundary means

A tenant is an organizational isolation boundary chosen by a product. In
this example, `org-a` and `org-b` are separate fictional organizations.
The same deployed code can serve both, but sharing code does not imply
sharing data or a right to access another organization's objects.

The canonical course and enrollment already exist. For this lesson only,
consider an explicit **storage and authorization model extension** that
associates the enrollment with `org-a`. This is not a new field in the
published v1 HTTP response. The
[current contract](../contracts/course_api.openapi.json) has a closed
enrollment representation; adding `tenantId` to that response would require
an explicit compatible evolution, not a quiet documentation change.

<!-- example: tenant-record -->
```json
{
  "tenantId": "org-a",
  "id": "enrollment-42",
  "courseId": "course-101",
  "learnerId": "learner-7"
}
```

This is an illustrative internal record. The learner remains enrolled; the
29 seats are course domain data, not a per-tenant request quota. No transfer
or billing is needed to read the free course.

## 2. Authenticate, select scope, authorize the object

A client may send a tenant selection header, but that header is untrusted
input, not proof of membership. Verify the principal's credentials, resolve
membership from a trusted source, and check that the requested tenant is one
the principal may act in. Then load the object within that verified tenant
scope and check ownership or an explicit grant for the requested action.

For example, `learner-7` has verified membership in `org-a` and owns
`enrollment-42`. A read may be allowed if that membership is active and
the action is permitted. A different principal in `org-a` is not automatically
the owner: an instructor or administrator needs an explicit role or grant
whose policy permits this particular read. Conversely, `learner-7` cannot
select `org-b` merely by supplying a header.

Membership and grants can change while a request or export is in flight.
Define how quickly revocations take effect, which policy version is checked
and whether a long-running operation must recheck before delivering data.
Short-lived caches reduce exposure but do not by themselves guarantee
instant revocation; document and measure the actual consistency boundary.

A mismatched tenant or absent grant is denied, even if the caller knows the
object ID and has a paid product entitlement. Depending on the API's
documented enumeration policy, the external error can avoid revealing whether
the object exists. Audit a bounded decision reason internally without logging
credentials or unnecessary personal data. The example is a policy model, not
proof that a real authentication provider has been integrated.

<details class="learning-answer">
<summary>Predict: may learner-7 read an org-b enrollment by sending an org-b header?</summary>
<p>No. The header is a selection request, not verified membership. Resolve the principal and tenant from trusted evidence, then check the object and the action.</p>
</details>

## 3. Carry the boundary into storage

In a pooled relational model, tenant-scoped identity must appear in keys,
queries, joins and indexes. For illustration, a composite primary key
`(tenant_id, enrollment_id)` identifies an enrollment inside its tenant.
An index on `(tenant_id, learner_id)` supports tenant-scoped learner lookups.
Foreign keys to tenant-owned records should include tenant scope as well,
preventing an accidental cross-tenant association.

The following query is pseudocode for a storage model, not an API or a
complete authorization implementation:

```sql
SELECT enrollment_id, course_id, learner_id
FROM enrollments
WHERE tenant_id = :verified_tenant
  AND enrollment_id = :enrollment_id;
```

The tenant parameter comes from verified authorization context, never
directly from an unchecked header. After loading, enforce ownership or the
relevant grant. If row-level security is used, configure it fail-closed and
set and reset the tenant context safely when reusing pooled connections.
Test background jobs, exports and administrative paths as well as web reads;
an unscoped maintenance job can bypass an otherwise careful request path.

Cache and index keys need the same boundary. A cache entry keyed only by
`enrollment-42` could return another tenant's object if identifiers collide
or scoping changes. A conceptual key includes tenant, resource type and ID;
include authorization-relevant representation scope where necessary.
Always authorize before serving a sensitive cached object. A cache key is not
itself an authorization check. Invalidation must use the same scope and
handle membership or grant revocation.

<details class="learning-answer">
<summary>Predict: is a tenant-prefixed cache key sufficient permission to read?</summary>
<p>No. It prevents some collisions but does not prove that the principal belongs to the tenant or may read the object. Perform both checks on every applicable access.</p>
</details>

## 4. Isolation choices and noisy neighbors

Pooled tables with a tenant column can share capacity efficiently, but depend
on consistent query scoping and defense in depth. Separate schemas can improve
namespace separation while still sharing a database engine and its resources.
A database per tenant gives a stronger administrative and operational
boundary in some designs, but increases provisioning, migrations, backup,
observability and fleet management costs. No choice automatically guarantees
security or prevents contention in shared infrastructure.

Evaluate the actual threat model, regulatory requirements, recovery point,
restore granularity, data residency and tenant scale. Consider who can access
backups and administrative tools, how keys are managed, and how migrations
are rolled out and reversed. An outage in a shared identity service can still
affect every separate database. A pooled design with verified isolation can
be appropriate when its risks and operational controls are accepted.

A noisy neighbor consumes shared CPU, connections, cache space or queue
slots and harms another tenant. Use per-tenant admission limits, fair
scheduling, bounded queues and isolated pools for critical paths where
justified. Monitor aggregate saturation and bounded per-tenant operational
views with appropriate access; do not put arbitrary tenant IDs into
unbounded public metric labels. A quota sets a usage allowance over a
window; a rate limit constrains request rate. Neither replaces data access
checks or guarantees physical isolation.

<details class="learning-answer">
<summary>Predict: does a separate database prevent all noisy-neighbor impact?</summary>
<p>No. Shared compute, network, identity and operational systems can still be saturated. Measure shared bottlenecks and add suitable capacity and admission controls.</p>
</details>

## 5. Entitlement is not object authorization

An entitlement answers whether a tenant or principal may use a product
capability under a plan or policy. Authorization answers whether this
principal may perform this action on this specific resource in this
context. Both may be necessary, but an entitlement never grants blanket
access to another tenant's enrollment.

The course remains free for every learner. To explore commercial metering,
imagine a completely separate optional **transfer product** that exports
an organization's own catalogue data to its external system. It may have a
fictional paid plan and a `catalogue.read` usage unit. This example does not
charge for course access, enrollment, completion, or the course itself.
Prices and policy are illustrative, not claims about a real provider.

The transfer service first authenticates, verifies tenant membership,
checks the transfer entitlement, and authorizes the source data. Only an
accepted logical usage operation can create a usage event. Quotas can
restrict consumption of that product without changing who owns the data.
Define what counts as accepted, how partial work is handled and when a
reversal or correction is appropriate.

## 6. Meter logical work, not HTTP attempts

The shared fixture represents one accepted logical operation with three units:

<!-- example: usage-event -->
```json
{
  "id": "usage-42",
  "tenantId": "org-a",
  "operation": "catalogue.read",
  "units": 3
}
```

This is a usage event for the optional fictional transfer product, not a
bill for the free course. Its ID identifies the logical usage event, not an
HTTP request attempt. A retry of the same accepted operation must retain the
same event identity and semantics. Two attempts delivering `usage-42` for
`org-a` therefore contribute three units once, not six.

Choose and publish a uniqueness scope, for example
`(tenant_id, event_id)`, with the operation and units bound to its semantic
payload. Persist that unique key and the units atomically with the usage
ledger entry. A duplicate with identical payload
is a replay and returns the existing result; a duplicate key with different
units or semantic content is a conflict to investigate, not an overwrite.
The same event ID in another tenant is a distinct key, but only after its
own independently authorized operation; it is not permission to move usage
between tenants.

The logical operation's creation must itself be idempotent, including the
mapping from a client operation key to a stable event ID. Deduplicating only
delivery of event IDs is insufficient if each HTTP retry creates a new event
ID. Use an outbox or equivalent durable transaction to associate accepted
work with its event; consumers enforce their own ledger uniqueness.
If acceptance and event publication cannot be atomic, explicitly reconcile
missing and duplicate events rather than assuming exactly-once transport.

Define a finite deduplication retention period from the maximum documented
retry, replay and settlement horizon, plus a safety margin. Reject or route
late replays to reconciliation instead of quietly counting them again after
the key expires. Retaining a durable ledger identity through a longer
financial or audit period can support that check, subject to privacy and
retention rules. Do not promise deduplication forever without specifying
the storage, policy and operational cost.

<details class="learning-answer">
<summary>Predict: what happens when the same usage event is delivered twice?</summary>
<p>For the same tenant and event ID with matching operation and units, the ledger counts three units once. A changed operation or payload under that key is a conflict, not a second charge.</p>
</details>

## 7. Reconcile and correct usage

Imagine the transfer operation completes, but its response is lost. The
client retries with the same operation key; the service finds the accepted
operation and returns its existing result. Event delivery may also be
retried, but the ledger unique key prevents a second entry. If the event
arrives before settlement, the ledger shows three units.

If a later audit discovers the work was not actually billable, do not erase
history or mutate the original silently. Create an authorized, uniquely
identified adjustment referring to the original event, and record its reason,
approval and settlement period. Reconcile the accepted-operation log,
outbox, ledger and invoice totals; investigate differences and late arrivals.
There is no real payment provider or live charge in this model.

For production, specify clock and billing period boundaries, unit precision,
rounding, free allowances, caps, refunds and retention before implementation.
Grant finance and support only the least access needed. Financial obligations
and data protection requirements depend on the actual jurisdiction and
agreement; a design sketch is not legal advice.

<details class="learning-answer">
<summary>Predict: can counting HTTP 200 responses establish billable usage?</summary>
<p>No. A retry may return a second 200 for the same operation, and a lost response may hide completed work. Record and reconcile unique accepted logical usage instead.</p>
</details>

## 8. Standards need ownership

Governance is how people make and evolve shared decisions, not merely a
document declaring every API identical. Identify an owner for each API,
its contract, availability objectives, data classification and support
channel. Maintain a consumer inventory with responsible contacts, versions
and last-observed usage. Telemetry may miss offline or infrequent consumers,
so supplement it with declared registrations and direct outreach.

Standards should express outcomes and minimum controls: authenticated
identity, object authorization, a documented contract, bounded errors,
observability, ownership and a deprecation policy. Provide reusable examples,
automation and paved paths that make the safe choice easy. Evaluate a rule
against concrete consumer needs and operational cost rather than adding
process for its own sake.

An exception should name the affected rule and scope, rationale, risk,
compensating control, accountable approver, expiration date and review
trigger. Track exceptions centrally and revisit them. A permanent exception
without a review or owner silently becomes an undocumented new standard.
Different risks can justify different controls; an exception is not a bypass
of mandatory legal or security requirements.

<details class="learning-answer">
<summary>Predict: is a policy effective simply because it appears in a portal?</summary>
<p>No. It needs an owner, adoption and evidence of enforcement, plus a reviewable exception process. A portal is a discovery tool, not proof of security.</p>
</details>

## 9. Deprecate with consumers, not a surprise deletion

1. **Inventory:** identify the operation, consumers, owners, dependencies
   and limitations of the usage evidence.
2. **Announce:** communicate the reason, supported replacement, migration
   guidance, dates and support channels to affected consumers.
3. **Observe and assist:** measure migration and reach out to consumers who
   have not moved; account for rarely used or offline clients.
4. **Restrict only as announced:** use a documented sunset and escalation
   process, with tested rollback where possible.
5. **Retire:** remove the old behavior after the agreed conditions and
   preserve necessary records, ownership and operational runbooks.

The developer portal can publish contracts, examples, ownership contacts,
changelogs, migration guides and status. Access to the portal does not prove
the API enforces authentication, authorization, privacy, compatibility or
availability. Verify those independently. Contract and consumer testing
are described in [contract evolution](CONTRACT-EVOLUTION-AND-CONSUMERS.md);
this lesson does not claim that Pact or a provider has been run.

<details class="learning-answer">
<summary>Predict: is zero observed traffic for a week enough to remove an API?</summary>
<p>Not necessarily. Infrequent or offline consumers may be absent from telemetry. Combine inventory, outreach, the announced timeline and the agreed retirement criteria.</p>
</details>

## 10. Run a useful staff-level design review

State the decision and requirements before naming a technology. For a
tenant-aware transfer, the review could compare pooled tables with separate
databases using expected tenant count, workload distribution, isolation
requirements, operating budget and restoration objectives. These are
assumptions to validate, not universal facts about either architecture.

Measure request error rate, latency, saturation and per-tenant fairness;
measure migration effort, recovery time and cost as well. Choose bounded
metrics and access-controlled diagnostics. Specify how to detect a missed
tenant predicate, a revoked membership with cached data, and a usage-ledger
disagreement. Use synthetic cases and independent checks rather than assuming
the developer portal proves controls work.

Record the decision, alternatives, evidence, uncertainty, owners and
revisit triggers in an architecture decision record. Communicate a short
summary to product, security, operations, finance and affected consumers:
what changes, what stays free, what failure looks like, and who owns the
mitigation. Explicitly identify decisions that require further approval.
Revisit the design when scale, threat model, consumer needs or measured
cost changes.

<details class="learning-answer">
<summary>Predict: what should a staff engineer say when workload measurements are unavailable?</summary>
<p>State the assumptions and uncertainty, compare plausible alternatives, assign owners to gather evidence, and set a decision or revisit trigger rather than presenting a guess as a fact.</p>
</details>

## Worked access review: follow a single request

Consider a request for the internal record of `enrollment-42`. The caller
selects `org-a`. The service authenticates a principal, checks an active
trusted membership in `org-a`, and queries using that verified tenant and
the enrollment ID. It then checks whether the principal owns the enrollment
or has a grant for this read. Only after these conditions are met can the
service construct the representation allowed by the actual API contract.

Change one fact at a time:

| Case | Decision in this model | Reason |
| --- | --- | --- |
| `learner-7`, active `org-a` membership | Allow the authorized read | Tenant matches and the learner owns the record. |
| `learner-7` selects `org-b` without membership | Deny | A header cannot establish membership. |
| Another `org-a` learner without a grant | Deny | Membership alone does not establish object permission. |
| Instructor with a matching read grant | Allow if membership is active | The grant is scoped to the tenant, object and action. |
| Instructor with a grant from `org-b` | Deny | A foreign tenant's grant does not authorize an `org-a` record. |
| Owner whose membership was revoked | Deny | The owner identity alone does not restore tenant access. |

These are simplified decisions for instruction. Real policies must also
consider grant expiry, delegated administration, emergency access and
revocation consistency. Policy enforcement should be tested at each entry
point, including asynchronous exports and support tooling. A permissive
background worker can undermine an otherwise correct front door.

If the denial response intentionally hides object existence, keep its
external shape consistent under the documented policy. Internally, log a
bounded reason and correlation ID for diagnosis, with access and retention
controls. Avoid logging tokens or full enrollment payloads. A request
correlation ID is not a trusted principal.

## Worked metering review: follow one logical operation

The optional transfer client submits an authorized logical operation with a
stable client operation key. The service persists the operation identity
and the accepted result with an outbox event in one local transaction.
For this example the event is `usage-42`, scoped to `org-a` and
`catalogue.read`, with three units. The event is about the separate optional
transfer product; `course-101` remains free.

The response is lost, so the client submits the same operation key again.
The service checks the key's original scope and semantic payload, finds
the accepted operation and returns the original result. It does not create
a second event identity. The outbox delivers the event twice after a worker
restart. The ledger's unique scope accepts the first delivery and treats
the second identical delivery as a replay, leaving three units in total.

If the second delivery claims four units for that same identity, the ledger
does not guess which value is correct or overwrite history. It records a
conflict for investigation. If a distinct, independently authorized `org-b`
operation happens to use the same event ID and operation name, the tenant
portion of the key makes it a different ledger identity. It does not give
either tenant access to the other's usage records.

Deduplication has an operational horizon. A bounded key-retention policy
must cover the documented retries and replays; late deliveries require a
durable-ledger lookup or a reconciliation workflow rather than automatic
new charges. A correction is a separate uniquely identified adjustment,
not a deletion of the original evidence. On settlement, compare accepted
operations, outbox records and ledger entries; investigate any gap before
issuing a fictional invoice.

## Design review: make the tradeoffs testable

For pooled storage, the review might ask whether every read and join has
the verified tenant key, whether a tenant-scoped unique constraint is
present, and how connection context is cleared. A useful negative test
attempts a read with a valid user but the wrong tenant, and another uses the
right tenant with the wrong owner and no grant. A third checks a matching
grant. Passing a small model test is educational evidence, not proof that
a deployed service implements these controls.

For separate databases, ask how credentials, backups and migrations are
isolated, and what remains shared. Estimate provisioning and restore work at
the expected tenant count. Test the plan for a tenant-specific restore without
assuming that a separate database resolves every authorization problem.
Measure the impact of a shared dependency failure in both designs.

For governance, inspect whether the contract owner can identify consumers,
whether a deprecation notice has a supported migration path, and whether
exceptions have actual expiration and review dates. A portal makes this
information discoverable; it does not enforce the controls it describes.
When evidence is missing, record that gap, an owner, a date and a decision
point instead of asserting compliance.

## Review checklist

- Is tenant scope derived from verified membership rather than a header?
- Are object owner or explicit grant and action checked after scoping?
- Do queries, joins, indexes, caches, exports and jobs retain the boundary?
- Are isolation and noisy-neighbor controls evaluated at shared dependencies?
- Is entitlement separate from authorization?
- Is the free course clearly separate from the optional transfer product?
- Are logical usage identity, conflict, retention and reconciliation defined?
- Are standards owned and exceptions time-bounded and reviewed?
- Are consumers contacted through a staged deprecation?
- Are measurements, uncertainty, tradeoffs and decision owners explicit?

## Continue reading

- [Reliability, observability and incidents](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md)
  covers SLOs, resource bounds and incident recovery.
- [Backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md) develops bounded
  admission and queue behavior.
- [Distributed transactions and recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md)
  explains durable handoff and reconciliation.
- [Regions and consistency](REGIONS-AND-CONSISTENCY.md) explores another
  set of isolation, availability and recovery tradeoffs.
- [Consensus and coordination](CONSENSUS-AND-COORDINATION.md) distinguishes
  coordination guarantees from tenant authorization.
