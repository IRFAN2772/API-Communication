# Uber-style design: dispatch, trips and payments

[Case-study hub](../GUIDED-CASE-STUDIES.md) ·
[Original case 4](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-4-design-uber-staff-engineer-version) ·
[Topic library](../COURSE-CONTENT-MAP.md) ·
[Corrections ledger](../CONTENT-CORRECTIONS.md) ·
[Shared fixtures](../../assets/case-study-fixtures.mjs)

This is a fictional **design exercise**, not a verified account of Uber's
internals. All scale numbers and potential SLOs are hypothetical planning
inputs, not current company facts or promises. This static course is free:
there are no accounts, new dashboard, real ride, provider or payment here.
The fare example is not course billing and is not an actual charge.

## Outcomes and route

Start with a single service and a single database. Then introduce location
freshness, candidate selection, an exclusive offer, trip facts and an
independent payment provider. For each changed requirement distinguish a
helpful approximation from an authoritative decision. A completed physical
trip is a historical fact, even if payment fails.

1. Request an authorized ride with a scoped retry identity.
2. Select a fresh candidate without confusing proximity with assignment.
3. Accept an unexpired offer atomically and protect both participants.
4. Recover disconnects, rejection, expiry and competing requests.
5. Commit trip completion and a charge intent, then reconcile uncertainty.
6. Compare options and transfer the reasoning to another domain.

## 1. Start with one local boundary

A rider wants transport from pickup to destination. A driver can accept at
most one active ride, and a rider can hold at most one active ride under this
example's policy. Start with one service, one transactional database and an
in-process worker. An authenticated rider submits a request; the service
verifies entitlement, location access and a bounded agreed quote. The database
stores the request and a local search intent. The worker looks for a driver.

HTTP request/response is a reasonable submission mechanism; polling can show
status. A live connection may improve freshness, but neither a socket nor a
push notification reserves a driver. There is no need to deploy a cluster or
broker before the load, resilience or ownership requirements justify one.

```text
rider -> authorized request -> [ride + request identity + search intent]
                                        one local transaction
                                                |
                                                v
                                   worker finds eligible candidates
```

The square brackets mark local atomic state, not the driver's device or a
payment provider. The rider sees `requested` after commit, not `matched`.
Our independent fixture names a single illustrative ride:

<!-- example: ride-case -->
```json
{
  "rideId": "ride-101",
  "riderId": "rider-1",
  "driverId": "driver-1",
  "requestKey": "ride-101-a",
  "offerToken": 7,
  "nowMs": 10000,
  "offerExpiresAtMs": 20000,
  "chargeKey": "charge-ride-101",
  "fareCents": 1500,
  "currency": "USD"
}
```

The 1,500 USD cents is an illustrative agreed quote for this scenario, not an
actual charge, payment authorization, price prediction or course payment.
The token and keys are identities, not authorization credentials. Real fare
calculation, taxes, jurisdiction and acceptance policies need their own
contract. No physical service is performed in this lesson.

<details class="learning-answer">
<summary>Predict: does accepting the rider's request assign driver-1?</summary>
<p>No. It commits a ride request and search intent. A separately authorized, unexpired offer must be accepted and atomically assigned.</p>
</details>

## 2. Request identity and quote consent

Derive `rider-1` from authentication, check entitlement and use only location
data the rider has authorized. Validate pickup, destination, supported area
and a quote's identity, currency, scope and expiration. In this example the
rider has agreed to a quote of 1,500 USD cents, valid at request time under
an explicitly bounded quote policy. The final fare may differ only under the
terms the rider accepted; never silently convert an estimate into a charge.

The ride request key is scoped to the authenticated rider and the request
operation. The semantic fingerprint binds the meaningful pickup, destination,
quote and ride intent. Member ordering or JSON whitespace is not intent.
Atomically commit the identity, fingerprint, result, ride and search intent.
A matching retry after a lost response returns the existing result. A reused
key with a changed destination or quote is a conflict. The same literal key
in a different rider's scope does not expose or deduplicate the first ride.
Check authorization on every retry; define key retention at least through the
allowed retry window, and apply durable business uniqueness as needed.

A database uniqueness constraint or conditional transaction enforces both
identity and the one-active-ride rule under concurrency. A read-then-insert
without isolation can race. The worker must also tolerate duplicate search
intents without creating multiple accepted assignments.

```text
request K -> commit request and search intent -> response lost
retry K with same semantic fields -> same ride-101 result
retry K with different destination -> conflict, not a second ride
```

A pricing outage does not justify applying an indefinitely stale multiplier.
An alternative is an already agreed quote with a defined maximum age and expiry,
valid for this exact route and terms, and only if policy permits honoring it.
Otherwise ask for a fresh quote and explicit consent or make the request
unavailable. Never charge a stale price without bounded prior agreement.

<details class="learning-answer">
<summary>Predict: a quote expired while pricing is down. May the service silently reuse it?</summary>
<p>No. A fallback needs an unexpired bounded agreed quote and appropriate consent for the exact terms; otherwise obtain a new quote or stop.</p>
</details>

## 3. Location is evidence, not assignment

The location fixture is a deliberately simplified local planar coordinate
system in kilometers. It is not latitude/longitude, global GPS, a road map or
an ETA predictor. Assume these observation times are synthetic trusted-server
observations, not untrusted device-supplied timestamps. A real location service
must authenticate drivers, validate plausible updates, manage clock and source
semantics, and respect location consent and retention.

<!-- example: location-case -->
```json
{
  "nowMs": 10000,
  "maxAgeMs": 5000,
  "rider": { "xKm": 0, "yKm": 0 },
  "drivers": [
    { "id": "driver-1", "xKm": 1, "yKm": 0, "observedAtMs": 9000 },
    { "id": "driver-2", "xKm": 0.1, "yKm": 0, "observedAtMs": 2000 }
  ]
}
```

Compute planar straight-line distance as `sqrt(dx² + dy²)`. The age is
`nowMs - observedAtMs`; this example accepts nonnegative ages up to and
including 5,000 ms. Reject future observations as outside this simplified
model rather than treating negative age as extraordinary freshness.

| Driver | Distance | Age at 10,000 ms | Decision |
| --- | --- | --- | --- |
| driver-1 | 1 km | 1,000 ms | Fresh candidate, not an assignment |
| driver-2 | 0.1 km | 8,000 ms | Closer but stale: reject from this search |

Straight-line distance ignores roads, one-way streets, traffic, accessibility,
driver preferences and ETA. A spatial index can accelerate discovery but can
be stale, so it only suggests candidates. Eligibility, online status, current
reservation and authorization are checked at the authoritative boundary.
Even a fresh observation does not prove a driver remains at that position.

<details class="learning-answer">
<summary>Predict: which driver can be offered this ride, and who is already assigned?</summary>
<p>Driver-1 is the fresh candidate; driver-2 is stale despite being closer. Neither is assigned merely by being selected.</p>
</details>

## 4. Offer is a bounded reservation

Assume the service reserves driver-1 for ride-101 under offer token 7 at
`nowMs = 10000`, expiring at `offerExpiresAtMs = 20000`. These are synthetic
server times in milliseconds. Define the valid interval as `now < expiry`;
at 20,000 the offer is expired. The authoritative database, not the client
clock or spatial index, validates the time and reservation state.

The driver receives an offer only after authorization: an authenticated driver
must be eligible, online, and permitted to see the minimum necessary ride
information. Delivery over a socket or push hint is not acceptance. Track a
single active reservation per driver and the ride's offer version. A token
identifies this offer and prevents an old acceptance from acting on a newer
one, but is not by itself a permission or a universal fencing implementation.

```text
ride requested -> offer(driver-1, token 7, expires 20000)
                          |
                authorized accept before expiry
                          |
             atomic guards + assignment commit
                          v
                      ride matched
```

One atomic acceptance transaction must verify all of:

- Authenticated actor is driver-1, still authorized and eligible.
- Ride-101 is still awaiting this exact offer and token 7.
- The authoritative time is before 20,000 and the offer is not revoked.
- Driver-1 has no other active assignment or conflicting reservation.
- Rider-1 has no other active assignment under this example's policy.
- The offer and ride transition together to matched with both guards held.

Enforce the last two rules with appropriate unique constraints or conditional
updates within the same transaction. The database must serialize competing
accepts; a stale cache or local mutex on one worker is insufficient. If any
check fails, no assignment commits. A duplicated acceptance after commit may
return the same result to the authorized driver, not assign the driver again.
An acceptance for a different driver, wrong token, cancelled ride, or expired
offer is rejected. Define the saved acceptance identity and retention.

<details class="learning-answer">
<summary>Predict: driver-1 accepts token 7 at exactly 20,000 ms.</summary>
<p>Reject it: this exercise defines validity as strictly before expiry. A later offer needs its own current token and authoritative reservation.</p>
</details>

## 5. Races, rejection and reconnect

A driver can reject or the offer can expire. The service atomically releases
only the matching reservation, transitions the offer to its terminal state,
and searches again while the ride deadline remains. Expand the radius in
bounded steps, with eligibility and freshness checks at every step. Set a
maximum radius, offer count and total search deadline. If no eligible driver
accepts, mark the ride `no-driver` and notify the rider. Search expansion is
not a guarantee that a driver exists.

If a rider cancels, atomically invalidate any live offer and release its
reservation. A delayed acceptance then fails the ride state or token check.
If a driver goes offline or loses entitlement, revoke or expire the offer
according to policy. A second offer must not overwrite an active one without
first resolving its reservation. Use monotonic offer versions or equivalent
authority; protect against delayed messages and worker failover.

A lost response after a successful accept is different from a rejected offer.
The driver reconnects and reads authorized authoritative state. Retrying the
same acceptance returns the committed match; do not make a new assignment.
If it never committed and the offer has expired, report expiry and continue
the search. Notifications and socket messages can be duplicated or delayed;
they are hints to refresh state, not the state itself. A rider reconnect uses
the same authorized status read or a scoped replay contract.

| Race | Required outcome |
| --- | --- |
| Two drivers accept one ride | At most one assignment commits |
| One driver accepts two rides | At most one active driver assignment commits |
| One rider requests two rides concurrently | At most one active ride under this policy |
| Cancellation wins before accept | Stale accept rejected; no assignment |
| Accept commits but reply is lost | Retry/status reveals the same committed match |
| Offer expires before accept | Reject old token and search within deadline |

An implementation that shards rides by ride ID still needs a mechanism for
the cross-ride driver and rider invariants. A per-ride transaction in an
isolated shard is not automatically enough. Co-locate authoritative state or
use a suitable coordination protocol with documented failure behavior.
See [consensus and coordination](CONSENSUS-AND-COORDINATION.md).

<details class="learning-answer">
<summary>Predict: the driver sees an old offer after cancellation. Does its token authorize acceptance?</summary>
<p>No. The authoritative ride state, authenticated driver, current token and expiry are all checked atomically; cancellation makes the offer stale.</p>
</details>

## 6. Journey states and location updates

Once matched, driver and rider can see authorized status changes. An example
lifecycle is `requested -> offered -> matched -> arrived -> in-trip ->
completed`; cancellation and no-driver are separate terminal branches before
the relevant cutoff. Specify which actor may make each transition and whether
it is reversible. An authenticated driver cannot complete another driver's
trip merely by naming its ID; the trip service checks the active assignment
and transition preconditions.

Locations can arrive over a persistent connection or periodically over HTTP.
Store or index a fresh latest observation for matching, with a retention and
privacy policy. A reconnecting observer can request the current authorized
state; a product requiring every location point needs an ordered retained log
and a gap-aware replay contract. A latest-value projection can coalesce old
positions, but it is not an audit history. Never use a location cursor as an
authorization token. The [real-time recovery lesson](REALTIME-RECOVERY-AND-FLOW.md)
explains consistent snapshot-to-stream handoff and bounded queues.

A spatial cell or geohash index narrows candidates; querying adjacent cells and
handling boundary skew are necessary implementation details. City-based
partitioning can reduce coordination distance but can create hot cities and
cross-boundary cases. ETA requires routes, travel times and uncertainty, not
our local Euclidean distance. Do not promise a 5-second match without a defined
population, measurement boundary, load and tested availability budget.

## 7. Physical completion precedes payment outcome

At dropoff, suppose the assigned driver submits a legitimate completion fact
and the server verifies the actor and transition. A physical trip that has
occurred must remain `completed` even if a subsequent charge is rejected or
unknown. A payment failure can change payment status, collection efforts and
driver liability; it cannot undo the historical trip or turn it into a
cancelled trip. A corrected trip fact is an explicit audited correction, not
a payment compensation.

The service computes the final fare under the rider's agreed terms and records
the result. For this independent illustration, assume the applicable final
fare is 1,500 USD cents; this is not an actual payment. In one local database
transaction it records the completed trip fact and a durable charge intent
with the separate `charge-ride-101` key. It also records completion request
identity to make retries safe. If the local transaction rolls back, neither
the local completed fact nor the charge intent is committed; reconciliation
must still recover and record the real-world completion. Never infer that the
physical trip did not happen because a database write failed.

```text
authorized driver -> complete trip
         |
         v
[completed trip fact + fare + completion identity + charge intent]
                          one local commit
                                 |
                          outbox relay
                                 |
                       payment provider (separate boundary)
```

A relay sends the stable charge key after local commit. The provider must
actually cooperate with its own scoped idempotency and retention contract;
a key generated locally alone cannot stop a duplicate charge. The ride
request key and charge key represent different operations and have separate
scopes, fingerprints and retention. An HTTP call cannot be rolled back merely
because a local database transaction rolls back. See
[distributed transactions and recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md)
and [outbox/inbox workflows](OUTBOX-INBOX-AND-WORKFLOWS.md).

<details class="learning-answer">
<summary>Predict: the charge is declined after a passenger reaches the destination. Is the trip cancelled?</summary>
<p>No. The physical trip remains completed. Record the payment failure and follow an explicit collection and driver-liability policy.</p>
</details>

## 8. Missing reply means unknown

Imagine the provider receives the charge, commits it, and its reply is lost.
The service cannot distinguish that from a request that never reached the
provider. It records `unknown`, preserves the original operation identity,
and reconciles by provider status lookup or safe same-key retry when the
provider contract supports it. A timeout is not a definitive decline and is
not permission to issue a new charge key. If the provider cannot safely
resolve uncertainty, escalate rather than falsely reporting success or failure.

| Payment state | Known fact | Appropriate action |
| --- | --- | --- |
| `pending` | Local charge intent exists | Dispatch under a bounded policy |
| `unknown` | Provider may have committed; reply missing | Reconcile or retry same key under provider rules |
| `succeeded` | Verified provider result recorded | Apply agreed settlement policy |
| `failed` | Verified definitive rejection recorded | Collection or support policy; trip stays complete |

The provider key retention must cover the retry/reconciliation horizon. If
it expires while the outcome remains unknown, do not assume retry is safe;
query, reconcile using provider references, or escalate. Record attempts,
provider response identity, timestamps and redacted diagnostics. An operator
needs an actionable queue and an explicit resolution deadline, not endless
retry or an unobservable dead-letter queue.

An authenticated provider result is validated against the operation, amount,
currency and state. Commit the receipt/inbox identity and local payment
transition together. Matching duplicates return the saved result and do not
repeat a local effect; the same receipt identity with conflicting content is
an error requiring investigation. A locally deduplicated receipt does not
make the external charge exactly once. An outbox, broker ACK and HTTP 200
each establish only their own boundary.

<details class="learning-answer">
<summary>Predict: the charge call timed out. Is a fresh charge key safer?</summary>
<p>No. The original charge may have succeeded. Preserve the same identity and reconcile using the provider's actual idempotency and lookup contract.</p>
</details>

## 9. Driver credit, liability and refunds

Driver earnings are a separate business obligation from rider collection.
The product must define who bears nonpayment risk, when credit becomes owed,
and which ledger balances and reserves back any payout. A charge success is
not automatically a driver payout; an internal driver credit, actual payout,
refund, dispute and chargeback are distinct operations with their own states,
identities, authorization and reconciliation.

For example, after a confirmed charge the system can record a local liability
under an explicit settlement policy; a later payout to a driver may involve a
separate external provider. If crediting fails, retry or reconcile that credit
and track the liability. Whether and when to refund the rider is a product and
accounting decision, not an automatic technical rollback. A refund may fail
or time out, and its success does not erase the original charge.

Do **not** refund the rider and then unconditionally pay the driver without
an explicit funded balance and liability policy. The platform may deliberately
bear that cost, but must record and fund it; otherwise this sequence can create
unbacked liability. If a refund is required, use a separate stable refund key,
authorized amount and provider-supported idempotency, then handle unknown and
definitive outcomes independently. A completed physical trip remains completed
through every branch.

```text
trip completed -> charge intent -> confirmed / failed / unknown
                         |
            agreed liability and balance policy
                 |                     |
          driver credit            possible refund
          separate state           separate state
                 |                     |
          payout may fail         refund may fail
```

This is a workflow of local commits and fallible external effects, not global
ACID isolation. Compensations are new operations, potentially costly and
irreversible. Define manual reconciliation and the accounting invariant before
claiming the saga repaired the outcome.

<details class="learning-answer">
<summary>Predict: if a refund succeeds, is the driver automatically entitled to an unconditional payout?</summary>
<p>Not from that fact alone. The agreed liability and funded balance policy determines what the platform owes and how it can settle the separate driver operation.</p>
</details>

## 10. Capacity and admission choices

As an illustrative original-case planning input, 20 million active drivers
sending one update every four seconds would imply five million updates per
second on average under that assumed cadence. This arithmetic is not a
measurement, current company fact, SLO or production sizing result. Actual
activity, bursts, regions, payload size, retries, replication and overhead
change the result. A smaller exercise can start with one worker and database.

A bounded ingestion queue protects memory; reject, slow or shed updates under
an explicit policy. For matching, coalescing older unprocessed locations can
be valid if only the latest state is required and the freshness timestamp is
preserved. It is not safe if every point is required for audit or billing.
Reserve capacity for ride state transitions and authorization rather than
letting location traffic starve them. Backoff and jitter reduce reconnect
storms. Monitor observation age, candidate rejection, queue age, matching
latency by outcome, expired offers, assignment conflicts and payment unknowns.

A spatial index, regional gateways, partitioned events and background
workers all have operational and recovery costs. Adding a broker does not
atomically publish a local trip completion; the outbox boundary is still
needed. A single leader per payment shard does not include an independent
provider in its transaction. A regional outage may force a deliberate choice
between availability and preserving assignment exclusivity. See
[backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md) and
[regions and consistency](REGIONS-AND-CONSISTENCY.md).

## 11. Security and privacy boundaries

Authenticate riders and drivers, authorize every ride, offer, location stream,
completion, receipt and payment action against its owning entity and current
state. A request key, offer token or cursor is not a bearer grant. Do not
allow a driver to read another driver's offers or arbitrary rider history;
release only the location and trip details needed for an authorized task.
On revocation or logout, terminate or reauthorize long-lived streams.

Limit collection, retention and logging of location and payment metadata.
Protect data in transit and at rest, restrict operational access, audit sensitive
operations and avoid storing provider secrets or raw payment credentials in
this lesson. Set a policy for consent, deletion, disputes and required records.
These controls require real product, legal and threat-model work; a diagram
or fictional identifier is not a security implementation.

<details class="learning-answer">
<summary>Predict: does knowing ride-101 let a driver complete it?</summary>
<p>No. The service must authenticate the driver and authorize the current assignment and state transition.</p>
</details>

## 12. Failure table: visible facts first

| Condition | Safe state or response | Cost or limitation |
| --- | --- | --- |
| Request reply lost | Same scoped key and fingerprint returns same ride | Retain identity and result |
| Nearest observation stale | Exclude it and consider fresh candidates | Freshness threshold may omit a nearby driver |
| Offer arrives after cancellation | Reject against authoritative state and token | Extra coordination on accept |
| Two accepts race | One atomic guarded winner at most | Availability may fall during authority failure |
| No driver accepts | Expand within deadline, then no-driver | More latency and possible failure |
| Completion transaction fails | Recover physical fact and charge intent together | Local state needs reconciliation |
| Charge reply missing | Unknown; same-key reconciliation | Requires provider cooperation and support |
| Definitive charge failure | Trip remains completed, payment failed | Liability/collection policy required |
| Driver credit or refund uncertain | Track each operation independently | Financial and operational reconciliation |
| Pricing unavailable | Honor only a valid bounded agreed quote, otherwise stop | Lower availability or renewed consent |

## 13. Practice: reason before adding machinery

1. Compute both planar distances and ages from the location fixture. Which
   driver is eligible for an offer and why is that not a match?
2. Token 7 expires at 20,000 ms. What happens at 19,999 and at 20,000 if all
   other conditions hold? What if the ride was cancelled at 19,998?
3. Two rides attempt to match the same driver concurrently. Name the
   authoritative guard and explain why two separate stale reads are not enough.
4. The completion commits and the provider processes the charge but the reply
   disappears. Which state is known, which is unknown, and which key is used?
5. Pricing is down and an old multiplier exists. Explain the bounded quote and
   consent conditions under which a fallback is valid, or why to stop.
6. A small town has five drivers and low traffic. Explain why one database and
   a worker might be better than a distributed event platform initially.
7. Transfer to dispatching a repair technician: substitute technician, job,
   reservation and invoice. Which physical completion fact remains true if
   an invoice is rejected? What differs about technician compensation?

<details class="learning-answer">
<summary>Check the candidate and offer predictions.</summary>
<p>Driver-1 is 1 km away and 1,000 ms old, a fresh candidate; driver-2 is 0.1 km away but 8,000 ms old and rejected. Token 7 can be accepted before 20,000 only if all guards hold; cancellation makes it invalid even at 19,999.</p>
</details>

<details class="learning-answer">
<summary>Check the lost payment reply and transfer.</summary>
<p>The trip is completed and the local charge intent exists; the provider outcome is unknown. Reconcile with the separate original charge key. A repair job's physical completion likewise remains a fact while its invoice and technician compensation follow separate policies.</p>
</details>

## 14. Source bridge and evidence boundary

The [original case](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-4-design-uber-staff-engineer-version)
remains intact. Its line 938 says “Cancel trip completion” when charge step 1
fails; this lesson keeps the physical completion fact and records payment
failure separately. Lines 942–943 say “Compensate: refund rider” and “Queue
retry for driver credit”; doing both requires an explicit funded liability and
balance policy, not an unconditional sequence. Line 965 proposes “Fallback
to last known surge multiplier, graceful degradation”; this lesson requires a
bounded agreed quote and consent, or stops. Line 967 says “Idempotency key on
ride creation” for duplicate charges; charge identity and provider cooperation
are separate from ride creation. Lines 873–882 choose a candidate and send an
offer but do not specify exclusive atomic acceptance, expiry or stale offers.
These corrections describe our exercise, not a real company's system.

The accompanying native tests parse the actual example blocks and exercise
small decision models. They do not prove a real ride system, provider,
concurrent network, financial ledger or external payment. The parent course's
local SQLite probe separately checks local atomicity; it is not a physical
trip or a live provider test.

Continue with [distributed transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md),
[consensus and coordination](CONSENSUS-AND-COORDINATION.md),
[outbox and inbox](OUTBOX-INBOX-AND-WORKFLOWS.md),
[real-time recovery](REALTIME-RECOVERY-AND-FLOW.md), and
[reliability and incidents](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md).
