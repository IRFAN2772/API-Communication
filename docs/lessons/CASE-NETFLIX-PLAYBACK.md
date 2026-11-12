# Netflix-style design: authorized playback and media delivery

[Case-study hub](../GUIDED-CASE-STUDIES.md) ·
[Original case 3](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-3-design-netflix-staff-engineer-version) ·
[Topic library](../COURSE-CONTENT-MAP.md) ·
[Corrections ledger](../CONTENT-CORRECTIONS.md) ·
[Shared fixtures](../../assets/case-study-fixtures.mjs)

This fictional exercise is inspired by a familiar product, not a verified
description of Netflix architecture or users. Every workload, policy,
number, target, region and failure here is an assumption. No example proves
zero buffering, a startup percentile, or an availability guarantee. The course
and exercises are free; no student account, paid tool, hosting or service is
needed. Follow the reasoning offline; do not fetch or play actual video.

## Route and promises

We evolve one authorized play request into segmented delivery, adaptation,
recovery and regional operation. Ask at each step: who decides, what bytes
move, what is durable, and what observation is actually justified?

1. Begin with a single service and HTTP object.
2. Separate authorization from high-volume media delivery.
3. Trace an immutable manifest generation and a toy adaptation calculation.
4. Change access, networks and failures without inventing guarantees.
5. Add homepage, telemetry and multi-region ownership as separate branches.
6. Make a prediction before looking at each answer.

## 1. One title, one viewer

**Problem.** An eligible viewer wants to play a title on a supported device.
The product must not expose it to an ineligible viewer or in a region where
the fictional rights policy forbids it.

**Baseline.** An authenticated application checks current identity, title
rights, entitlement, region and device policy, then serves an authorized
media object over HTTP. One service and a private origin can be sufficient
at small load. The server has an explicit deadline and returns an error when
it cannot safely establish eligibility; a timeout is not permission.

**Worked exchange.** `playback-101` requests `movie-101`. The service derives
identity from a verified session, evaluates current policy and decides whether
to issue a narrowly scoped playback capability. It does not trust a claimed
viewer, location or device merely because the client supplied it.

```text
viewer -> application -> identity, entitlement, rights and device policy
viewer <- allow with limited capability, or explicit deny/unavailable
viewer -> authorized HTTP media endpoint -> bytes
```

The policy inputs and decision are separate from the media bytes. A positive
decision is not a statement that a segment was downloaded or watched.

**Changed requirement.** Many viewers request the same title from different
regions and connection speeds. The origin becomes a bandwidth bottleneck.

**Failure.** An unscoped shared cache of personalized state or a public
manifest granting access to protected bytes leaks authorization across viewers.
Even a correct authorization service cannot undo a byte already downloaded.

**Alternatives.** Keep proxying all bytes for simple control at a high
bandwidth cost, or use an edge cache with carefully scoped capabilities and
an origin-fill policy. Cache immutable media, not unrestricted user-specific
authorization decisions. Cache keys and TTLs must match the security model.

<details class="learning-answer">
<summary>Predict: does a successful play authorization prove playback occurred?</summary>
<p>No. It establishes only the scoped decision at that time. The client may never request, download, decode, or display any media.</p>
</details>

## 2. Two paths, two responsibilities

The **control API** authenticates a caller and evaluates rights, entitlement,
region, device eligibility and deadlines. It returns session metadata,
allowed generation and constrained delivery capability or an appropriate
denial. It might call internal services synchronously; bounded deadlines,
timeouts and a clear error contract prevent indefinite dependency waits.
Retry only safe operations with bounded backoff and an appropriate identity.

The **data path** fetches a manifest and subsequent segments over HTTP from
a CDN when that option is selected. An edge validates the chosen capability
before serving protected content. On a miss, the edge fetches from origin
under its own authorization; it is not true that the origin is never used.
The control service need not proxy every media byte.

```text
client -> control API -> policy authorities
client <- session + scoped manifest capability
client -> CDN -> origin on cache miss
client <- manifest and segments over HTTP
```

The diagram describes ownership and request direction, not actual network
topology. A CDN needs origin-fill capacity, cache hit/miss measurement,
eviction and invalidation procedures, capacity headroom, health checks and
failover. Geographic proximity and DNS choice alone do not ensure a healthy,
authorized or sufficiently provisioned path. A cold cache, regional outage
or thundering herd can overwhelm origin. Test capacity against assumed traffic
and origin fill, not a fantasy of unlimited edge capacity.

**Changed requirement.** Rights are revoked while a viewer holds a URL.
**Failure.** A signed URL with a future expiry generally remains usable until
expiry under its validation policy; signing is not instant revocation.
**Alternatives.** Short lifetimes reduce exposure but increase renewal
traffic and require a working control path. An edge authorization check,
revocation list, or key rotation can reduce the window but adds state,
latency and failure modes. Already delivered bytes cannot be recalled.
Define clock skew, cache behavior and revocation lag explicitly.

License and DRM systems, where used, involve key management, device support,
license policy and enforcement, not merely creating a URL. They are outside
this offline exercise. A capability is neither a reusable user password nor
an unscoped authorization cache; never put it in public logs.

<details class="learning-answer">
<summary>Predict: if rights are revoked now, is an already issued signed URL necessarily invalid now?</summary>
<p>No. It may remain valid until its expiry unless an independent revocation mechanism is checked. Previously delivered bytes cannot be recalled.</p>
</details>

## 3. A versioned manifest and immutable segments

The exact shared fixture is:

<!-- example: playback-case -->
```json
{
  "sessionId": "playback-101",
  "assetId": "movie-101",
  "assetGeneration": 7,
  "segmentSeconds": 4,
  "representations": [
    { "id": "low", "bitrateBitsPerSecond": 1000000 },
    { "id": "mid", "bitrateBitsPerSecond": 3000000 },
    { "id": "high", "bitrateBitsPerSecond": 6000000 }
  ],
  "estimatedThroughputBitsPerSecond": 4000000,
  "safetyFraction": 0.75
}
```

Assume the service selects a complete, verified generation 7. A manifest
identifies compatible representations and time-aligned segments. Its
generation-specific segment keys are immutable; publishing a replacement
uses a new generation rather than overwriting old cached bytes.
An illustrative mapping, not a real format or URL:

```text
movie-101/g7/manifest
movie-101/g7/low/segment-001
movie-101/g7/mid/segment-001
movie-101/g7/high/segment-001
```

A real HLS or DASH manifest has format-specific metadata, timing, codecs and
track relationships. Here it is a conceptual reference list, not a valid
manifest. HTTP requests obtain the manifest and segments; the generation
keeps a cache from silently mixing overwritten assets. Retain the prior
generation long enough for issued capabilities and in-flight sessions, or
provide an explicit recovery path. Immutable keys do not by themselves prove
the new generation has every required object.

**Changed requirement.** The network rate changes after a segment completes.
**Failure.** A single large fixed-rate download cannot adapt at a useful
segment boundary; fetching a high rate can drain the buffer.
**Alternative.** A player chooses a compatible representation for the next
segment and may switch at a safe boundary. This makes multiple encodes,
packaging, manifest consistency and player compatibility necessary.

HLS/DASH segmented HTTP delivery is different from a WebSocket live-control
channel. An SSE stream could synchronize session state or notify of a change;
it does not carry the video data in this design. Neither SSE nor WebSocket
automatically provides durable replay or media timing.
See [realtime recovery](REALTIME-RECOVERY-AND-FLOW.md) and
[WebRTC media](WEBRTC-MEDIA-AND-CONNECTIVITY.md) for different tradeoffs.

<details class="learning-answer">
<summary>Predict: can generation 8 overwrite the bytes under a generation 7 key?</summary>
<p>No in this design. New content needs new immutable keys; otherwise a cached manifest and a cached segment can describe different assets.</p>
</details>

## 4. A deliberately narrow ABR calculation

The toy assumes constant bitrates for each four-second segment. One byte
equals eight bits. It has no codec overhead, HTTP headers, rate distribution,
variable segment sizes, competing traffic, decoder restrictions or real player.

| Representation | Bits per second | Four-second payload |
| --- | ---: | ---: |
| low | 1,000,000 | 500,000 bytes |
| mid | 3,000,000 | 1,500,000 bytes |
| high | 6,000,000 | 3,000,000 bytes |

For example `1,000,000 × 4 ÷ 8 = 500,000` bytes.
The estimated throughput is `4,000,000` bits/s. The safety budget is
`4,000,000 × 0.75 = 3,000,000` bits/s. Choose the highest offered
representation not exceeding that budget: **mid**.
That is a selection rule for this one toy input, not a production ABR
algorithm or proof of startup latency, a p99, or zero buffering.
The estimate can be stale and the next segment can still arrive too late.

**Changed requirement.** Estimated throughput falls to 500,000 bits/s.
At the same safety fraction the budget is 375,000 bits/s. Even low requires
1,000,000 bits/s, so **no representation fits**. A finite buffer can defer
the effect but cannot sustain this load indefinitely. Surface a stall or a
quality/network error, possibly retry or offer a lower representation if one
actually exists. Do not label low playable merely because it is the lowest.

**Alternatives.** More low-rate encodes improve reach at storage and quality
cost; a larger buffer may absorb short dips at startup and latency cost.
Choosing a conservative safety factor lowers oscillation risk but can waste
available quality. Test real clients and a distribution of network
conditions before inferring any operating target.

<details class="learning-answer">
<summary>Predict: with 500 kbps throughput, does this fixture have a sustainable representation?</summary>
<p>No. The safety budget is 375 kbps, below the lowest 1 Mbps representation. The correct result is no fit and an explicit stall or quality error, not a fabricated fallback.</p>
</details>

## 5. Play session and failure boundaries

An illustrative exchange uses generation 7 without making a real request:

1. Client sends an authenticated play request with title and device context.
2. Control API checks identity, rights, entitlement, region and device policy.
3. On success it records or returns a session identity and an expiry-limited,
   asset-and-generation-scoped manifest capability.
4. Client fetches the manifest via authorized HTTP and chooses mid under the
   toy budget. The edge can fill from origin on a cache miss.
5. Client requests the first mid segment under the delivery policy.
6. The player can report a local observation through an authenticated endpoint;
   this is not evidence that a human paid attention.

If policy denies the request, return a documented denial and do not mint
the capability. If policy is unavailable or a deadline expires, return a
retryable unavailable response, not an authorization bypass. Expose enough
information for a legitimate client to recover without disclosing sensitive
policy data. A retry should respect expiry, backoff and admission limits.

If the manifest names a missing segment, do not treat a partial publication
as healthy. Check generation completeness and origin object existence;
retry a bounded number of times, select another verified generation only
when policy allows, or surface an error. If a capability expires during
playback, request renewal and re-evaluate the defined policy. A cached segment
must still be served only under the edge's authorization rules.

**Alternatives and tradeoffs.** A long-lived session can reduce control load
but extends policy staleness. Rechecking on every segment narrows that
window but can make the control service a critical high-volume dependency.
An explicitly bounded entitlement cache can be acceptable only when its
scope, invalidation, maximum staleness and fail-closed behavior are specified.
No single profile is mandatory or a claim about a company.

<details class="learning-answer">
<summary>Predict: if the rights service times out, should the application serve protected media anyway?</summary>
<p>Not under this example's fail-closed policy. Return an explicit unavailable result unless a separately specified, still-valid bounded decision is allowed by policy.</p>
</details>

## 6. Homepage and optional recommendations

**Problem.** The viewer also wants a useful homepage. A baseline can read
authorized catalogue metadata and a saved viewing position from their
respective authorities. Search and personal recommendations can be separate
features; do not couple a play decision to an optional model response.

**Worked change.** A recommendation dependency times out. The homepage may
show an explicitly labeled popular selection filtered against current
authorization, or a suitably scoped cached view with its freshness made
clear. If neither is safe, omit that optional section. Cached viewing status
can be stale; do not describe it as a fresh verified playback fact.

**Failure.** An old global popular list can contain a title the viewer is no
longer allowed to see, and an unscoped profile cache can expose someone
else's history. A recommendation result is not a rights decision.
If required rights cannot be established, the playback request fails closed
under this policy even when optional homepage content can degrade.

**Alternatives.** Compute personalized rankings synchronously for freshness,
or asynchronously refresh a permission-scoped cache for resilience. Both
need authorization at the appropriate read boundary, bounded stale data and
explicit behavior on failure. See
[caching and infrastructure](SHARDING-CACHING-AND-INFRASTRUCTURE.md) and
[REST caching](REST-COLLECTIONS-AND-CACHING.md).

<details class="learning-answer">
<summary>Predict: does a stale popular recommendation authorize a play?</summary>
<p>No. It is an optional candidate. Playback still requires the current rights and entitlement decision or a specifically permitted bounded decision.</p>
</details>

## 7. Viewing observations and durable intent

**Changed requirement.** The product asks for viewing progress and aggregate
quality measurements. A client reports observations, but it is untrusted:
a segment request, download, decode report or declared position does not
prove viewing or human attention. Separate meanings such as requested,
downloaded and client-reported progress. Do not treat them as equivalent.

Clients **never send directly to internal Kafka** in this design. They submit
authenticated, bounded HTTPS batches to an ingestion boundary. Validate
identity, session scope, event type and size; limit rate, handle consent and
retention, and treat reported timestamps and content as untrusted. A stable
event ID scoped to the session supports deduplication; changed content with
the same identity is a conflict, not a silent duplicate.

```text
client -> HTTPS ingestion -> [accepted event + durable local intent]
                                      |
                                      v
                              relay -> internal broker -> consumers
```

The brackets represent one local transaction, not atomicity across the broker.
A broker is an optional internal implementation behind the boundary, not a
thing a learner must operate. A relay can publish twice after an uncertain
acknowledgment; consumers use durable inbox/deduplication where needed and
make effects idempotent. Local persistence can fail: reject or explicitly
signal failure rather than acknowledging a nonexistent durable intent.
Bound queues, retention and retries; expose lag and drop policy.

For local offline reporting, a client can persist a bounded durable intent
before retrying, if its platform and privacy policy allow. Lost storage or
an expired retry window still permits missing events. Neither deduplication
nor a broker proves every user action was observed.
See [outbox and inbox](OUTBOX-INBOX-AND-WORKFLOWS.md),
[broker recovery](BROKERS-DELIVERY-AND-RECOVERY.md), and
[event models](EVENT-MODELS-AND-PROJECTIONS.md).

<details class="learning-answer">
<summary>Predict: an edge served a segment twice; how many minutes did the viewer watch?</summary>
<p>That cannot be inferred. Requests and delivered bytes are not proof of decoding, elapsed viewing, or human attention; retry traffic can also duplicate requests.</p>
</details>

## 8. Multi-region evolution

**Problem.** A single region can lose the control API or origin even when a
viewer and edge are healthy. Before adding regions, define which authority
owns entitlement, sessions, asset publication and telemetry, and what data
each region may read or write.

**Worked assumption.** Region A owns a title's publication metadata;
region B has replicated generation 7 and can serve an eligible viewer only
under a documented policy and sufficiently current rights data. A failover
runbook includes capacity headroom, policy freshness, manifest/segment
availability, compatible client protocols and a way to restore ownership.

**Changed requirement.** A regional outage occurs during replication.
**Failure.** DNS changes alone cannot make missing media, stale entitlement,
overloaded origin or incompatible control APIs available. Two writers can
also disagree on ownership without coordination and fencing.

**Alternatives.** A single active owner with a tested takeover favors a
clear write authority but requires a recovery window. Multiple active
regions can reduce distance but require conflict rules or partitioned
ownership, replication and compatible versions. Define an RTO (time to
recover service) and RPO (permitted data loss window) per data class as
planning objectives, not achieved facts. A saved viewing position may
accept more lag than a rights revocation; specify and verify each.

Simulation only: trace a lost owner, stale replica and cold cache on paper.
Decide whether each operation is allowed, unavailable, or delayed and which
operator reconciles later. Do not perform live chaos experiments here.
Capacity reserves and load shedding cost money but make a regional failover
less likely to overload remaining capacity. See
[regions and consistency](REGIONS-AND-CONSISTENCY.md) and
[reliability and incidents](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md).

<details class="learning-answer">
<summary>Predict: a DNS change points clients at region B; is the service recovered?</summary>
<p>Not necessarily. Region B also needs correct authority, compatible data and policy, available assets, and sufficient capacity. Measure recovery against the chosen objective.</p>
</details>

## 9. Metrics and explicit limits

Separate control availability, policy denial, entitlement latency and timeout
from media-path cache hits, origin fill, segment errors and observed stalls.
Use bounded dimensions and protect identifiers. Track capability renewal
failures, generation completeness and backlog age; alerts need an owner and
a response. A client-reported stall rate is useful but depends on sampling,
definition and trust, and is not the same as a universal guarantee.

For a planning exercise define a population, observation window and error
budget before quoting a percentile. The fixture has one throughput estimate;
it cannot calculate a p99 or start time. A measured SLO needs real observations
and a denominator, which this static lesson intentionally does not collect.
The [requirements and estimation](REQUIREMENTS-AND-ESTIMATION.md) lesson
shows how to separate inputs from derived quantities.

## 10. Source correction and transfer

The original is retained, not silently rewritten. Its line 580 says
“Zero buffering during playback (adaptive quality)”. Treat this as a desired
experience, not an achievable guarantee: the 500 kbps example has no fitting
representation and can stall. Lines 581–584 are scenario targets and
assumptions, not verified company availability, concurrency or topology.
The source's 250M subscriber description at line 564 is likewise not used
here as a current company statistic.

The original line 724 depicts `C->>K: ViewingEvent` directly from client
to Kafka. The revised boundary accepts authenticated, bounded HTTPS events
and persists a local intent before any optional internal broker relay.
Line 749 proposes “Fallback to next nearest edge, DNS failover”, and line 750
proposes “Active-active failover, DNS reroute to next region”. These are
starting points, not proof of capacity, correct rights, healthy origin fill,
replication or recovery. A chosen alternate must satisfy those conditions.

Transfer to an online course: a lesson entitlement decision may authorize a
generation-scoped asset while media delivery is separate. A course completion
event is a distinct, explicitly defined business event; downloaded content
is not proof that a learner completed it. Compare
[API contracts](API-CONTRACTS-AND-LIFECYCLE.md) and
[backpressure](BACKPRESSURE-AND-CAPACITY.md) for the boundary and recovery.

## Design review: changing the requirement

Imagine the product now needs a profile that works during intermittent
control-plane connectivity. Start by stating whether an existing session may
continue with an unexpired capability and how stale a rights decision may be.
For a strict revocation policy, fail closed when the necessary check cannot
be performed. For a bounded-offline policy, document the maximum exposure,
device scope, expiry and what the user sees when renewal fails.

The alternative is to require an online policy decision for every segment.
That improves the opportunity to enforce revocation but increases dependency
traffic and makes playback sensitive to policy-service availability. A
longer-lived capability reduces calls but permits a longer revocation window.
Neither option undoes already delivered bytes, and neither is universally
correct. Record the choice as a product and risk decision, not a protocol
property. Exercise the expiry boundary and compare availability and access
exposure in a simulation rather than asserting that either is perfect.

<details class="learning-answer">
<summary>Predict: does a longer capability lifetime improve immediate revocation?</summary>
<p>No. Without another revocation check it generally extends the time a previously issued capability can remain valid, even though it can reduce renewal traffic.</p>
</details>

## Practice: predict before reading

1. A segment is in edge cache but the capability is expired. Can it be served?
2. A rights check succeeds but the origin is overloaded on a cache miss.
   Does authorization ensure playback?
3. An SSE session-state message is missed. Is the media itself missing?
4. The estimated rate is 4 Mbps and the safety fraction is 0.75.
   Which fixture representation fits?
5. Region B has all segments but stale revocation information.
   Is a DNS change a complete failover?

<details class="learning-answer">
<summary>Check your predictions</summary>
<p>1. Not under the expiry-enforcing edge policy; renew or deny. 2. No; return or recover from a data-path failure. 3. Not necessarily; state recovery and HTTP media delivery are separate. 4. Mid fits the 3 Mbps budget in the toy model. 5. No; policy freshness, authority and capacity still matter.</p>
</details>

## Takeaway

The smallest useful design starts with a clear rights decision and a media
object. Segmentation, CDN caching, telemetry and regional redundancy each
solve a distinct changed requirement and introduce their own failure boundary.
Capabilities and caches have scoped lifetimes; immutable generations prevent
mixing but do not prove availability. Observe actual behavior honestly rather
than converting a request, a metric or a topology diagram into a guarantee.
