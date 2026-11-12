# Other systems: transfer the constraint carefully

The [guided case studies](../GUIDED-CASE-STUDIES.md) use six familiar domains
to practice a method. This lesson gives the original other-system mappings
their own worked sections.
The [complete original source](../09-SYSTEM-DESIGN-CASE-STUDIES.md) remains
unchanged; “maps to” means a useful comparison, not proof of identical
company internals.

All identities, targets and quantities are fictional teaching inputs.
No account, paid API, payment, camera, real location, broker or streaming
service is required. The course and hosting remain free.
Use the [shared fixtures](../../assets/case-study-fixtures.mjs),
[topic library](../COURSE-CONTENT-MAP.md) and
[correction ledger](../CONTENT-CORRECTIONS.md) alongside each section.

Each transfer names a problem, a small baseline, an example, a changed
requirement, a failure, alternatives and a prediction.
Do not merge all their components into one “universal architecture.”

<span id="transfer-amazon"></span>
## 1. Amazon-style commerce and Prime-style media

### Start with a checkout invariant

**Problem.** A customer wants one item, a valid price and a clear order outcome.
An inventory hold and a payment result are different facts.
The name of a marketplace does not define your transaction boundary.

**Simple baseline.** One application and database can own catalogue,
inventory reservations and order state. Verify the caller, validate the
cart and price, then atomically reserve available stock and record the order
and any required publication intent.
If this boundary meets the workload and recovery objectives, keep it.

An external payment provider is outside that local transaction unless it
genuinely participates in a supported atomic-commit protocol.
Do not hide a card charge inside a database transaction and assume rollback
undoes it. See [distributed transaction recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md).

### Follow one uncertain payment

The fictional order `order-101` reserves one unit of `item-101`.
Its provider operation has a stable key associated with the accepted order
intent. A request to capture payment is dispatched, then the reply is lost.

| Local observation | Honest state | Next action |
| --- | --- | --- |
| Inventory reserved, payment not dispatched | Pending | Attempt within the bounded policy |
| Payment dispatched, result unknown | Payment unknown; fulfillment held | Reconcile the provider operation |
| Capture confirmed, inventory still valid | Eligible to continue | Commit the appropriate next order transition |
| Definitive rejection | Failed payment | Release the order's own hold once |
| Known capture but fulfillment cannot proceed | Compensation required | Track the confirmed refund/cancellation outcome |

The timeout is not a definitive decline. Automatically releasing inventory
and declaring failure can leave a charged customer with no item.
Blindly issuing a refund is also not a safe substitute for learning whether
a charge occurred. Every compensation has its own identity, limits and
reconciliation path.

**Changed requirement.** Payment, warehouse and delivery teams deploy
independently and their effects take time.

**Limitation.** A local transaction no longer owns the whole flow. A saga
does not supply global ACID isolation or make shipped goods reversible.

**Alternatives and costs.** Keep related state together when possible.
Otherwise use an explicit durable workflow, local outbox/inbox coupling,
business uniqueness, provider idempotency where supported and fallible
compensation. Orchestration can expose progress and recovery decisions;
choreography can suit a few independent reactions but obscure a long chain.
Choose by the invariant and operating ownership, not by brand or fashion.

<details class="learning-answer">
<summary>Predict: does a payment timeout allow us to declare that no charge exists?</summary>
<p>No. The provider may have committed. Keep the outcome unknown and reconcile
the stable operation before releasing stock or selecting compensation.</p>
</details>

### Transfer the other original components

| Component | Useful comparison | Additional rule to establish |
| --- | --- | --- |
| Product catalogue | Cached public course or media metadata | Price/stock freshness and private versus public fields |
| Order placement | Exclusive driver/seat reservation | Inventory, price and order identity inside the correct authority |
| Payment | Dispatch payment workflow | Provider outcome, funding and compensation policy |
| Inventory | Authoritative allocation | Local/cross-shard consistency and concurrent holds |
| Delivery tracking | Location/ETA updates | Location privacy, age, accuracy and who may track |
| Video | Segmented playback | Rights, manifest/codec compatibility and delivery capacity |
| Recommendations | Asynchronous features and cached views | Consent, freshness and an honest optional fallback |
| Notifications | Durable intent plus device hints | Acceptance is not receipt or human attention |

A catalogue cache can show an old description under a policy.
It must not authoritatively promise inventory or a stale price the customer
did not accept. A delivery map marker is a sample, not proof of an arrival
time. A signed media URL is a bounded capability, not infinite rights.

**Keep-simple check.** If the store is small and one database can own the
required inventory/order state, splitting that state into several services
may worsen recovery without improving the user outcome.

The [dispatch lesson](CASE-UBER-DISPATCH-AND-PAYMENTS.md) explains exclusive
claims and separately recorded payment outcomes.
The [playback lesson](CASE-NETFLIX-PLAYBACK.md) explains the media transfer
comparison; it is not an assertion that Prime Video is exactly Netflix.

<span id="transfer-linkedin"></span>
## 2. LinkedIn-style professional networks

### Begin with audience and relationships

**Problem.** A professional network has profiles, connections, posts,
messaging and search. A relationship does not automatically grant access to
every field or event about another person.

**Simple baseline.** Store profiles, permitted audience rules and relationships
in one application/database. For a feed request, retrieve candidate posts,
check current access and rank a bounded page.
Use stable pagination semantics and limits before adding a complex graph
store or materialized feed.

### Work one visibility change

A fictional viewer is connected to a profile owner and can see an
audience-limited post. A derived feed and search index contain references
to that post. The owner changes its audience or blocks the viewer.

The feed reference is not permission to disclose the post.
The serving path must apply the current authoritative policy according to
the product's stated revocation guarantee.
If that check cannot be performed, do not serve private cached content as
an availability fallback.

**Changed requirement.** Feed reads grow and a popular author has many
followers while ordinary accounts have few.

**Limitation.** Computing every timeline at read time can become costly.
Precomputing every recipient's feed can instead make one write enormous.
Both paths still need current audience enforcement.

**Alternatives and costs.** Evaluate read-time, write-time or hybrid fanout
with the observed activity distribution, not a universal follower cutoff.
Materialize references with unique logical task identities, deduplicate
merges, bound ranking work and define lag/cursor behavior.
Search indexes and counters can lag where the product permits; access policy
cannot silently become eventual merely because a cache is eventual.
See [timeline fanout](CASE-TWITTER-TIMELINES.md).

<details class="learning-answer">
<summary>Predict: does a cached feed reference permit a blocked viewer to read the post?</summary>
<p>No. It is a derived candidate. Enforce the current applicable audience
policy before serving content, including when a cache or search index is stale.</p>
</details>

### Messaging, jobs and endorsements are different effects

| Component | Baseline question | Failure to consider |
| --- | --- | --- |
| Feed/connections | Which relationship and audience rules apply now? | Materialization lags behind a block or deletion |
| Messaging | Which devices are authorized to receive? | Offline sync, duplicate delivery and lost acknowledgements |
| Job search | What may be indexed and returned to this caller? | Stale or unauthorized search results |
| Notifications | Which accepted action created this intent? | Duplicate notifications and unobserved device hints |
| Profile-view analytics | What collection is permitted and necessary? | Consent, retention and misleading attention metrics |
| Endorsements | What unique endorsement relation is valid? | A retry increments a score twice |

A stable endorsement key might include endorser, target and skill under
the chosen policy. A matching retry should not create a new logical
endorsement; changing the intended relationship is another operation.
Counts and event IDs need their own semantics and correction rules.
None of this follows automatically from using REST.

Messages need the [messaging lesson's](CASE-WHATSAPP-MESSAGING.md)
acceptance/device/read distinction and membership checks.
Profile analytics need privacy controls, bounded labels and a clear
definition of a view; a client event does not prove human attention.

**Keep-simple check.** If indexed read-time queries meet latency, cost,
privacy and recovery targets, do not add a fanout pipeline or specialized
graph database solely because the system is a social network.

<details class="learning-answer">
<summary>Predict: does replaying an endorsement event necessarily represent a second endorsement?</summary>
<p>No. A replay can describe the same accepted relationship. Stable business
identity and an atomic local effect prevent duplicate counting.</p>
</details>

<span id="transfer-snapchat"></span>
## 3. Snapchat-style expiry, capture and location

### Define what “expires” actually means

**Problem.** A product wants a photo or story to stop being available after
a stated time. “Disappearing” can refer to several independent boundaries.

**Simple baseline.** Persist the content's authoritative expiry and access
policy. At each applicable serving boundary, verify permission and compare
the trusted service time with that expiry. Schedule storage cleanup
separately and track its completion.

The following is a synthetic 24-hour serving-policy fixture.
Its clock values are illustrative, not a user's timestamps.

<!-- example: expiry-case -->
```json
{
  "contentId": "snap-101",
  "createdAtMs": 0,
  "expiresAtMs": 86400000,
  "nowMs": 86400000
}
```

At `nowMs == expiresAtMs`, the chosen policy treats the content as expired.
The service must not return it as currently available merely because
database cleanup, a cache or a replica has not removed its bytes yet.
Client-controlled timestamps must not extend the authoritative expiry.
Clock skew and distributed enforcement require an explicit policy and tests.

**Changed requirement.** Content is also present in CDN caches, replicas,
backups, mobile storage and a recipient's screenshots.

**Limitation.** A TTL in one store does not prove deletion from all those
places. Software cannot guarantee that a recipient never captured what
they were permitted to view. A screenshot notification, if supported,
does not prevent capture or establish complete detection.

**Alternatives and costs.** Define separately the serving cutoff, cache
eligibility, storage cleanup, backup retention and any lawful retention
exceptions. Bound capability lifetimes and make revocation behavior
explicit. Reconcile cleanup jobs with immutable generations and auditable
outcomes rather than claim universal erasure.
Minimize stored data and avoid private content in public caches or logs.

<details class="learning-answer">
<summary>Predict: at exactly the fixture's expiry time, may the service still advertise the content as active?</summary>
<p>No under this policy. The serving check uses now greater than or equal
to expiry. Background cleanup is a different process and may finish later.</p>
</details>

### Capture, conversation and location boundaries

| Feature | Transfer mechanism | Distinct rule |
| --- | --- | --- |
| Photos/video capture | Resumable authorized upload and guarded processing | Integrity/media validation before publication |
| Stories | Audience-aware media and expiry | Enforce the serving policy independently of cleanup |
| Messaging | Persisted envelopes and per-device sync | A notification hint is not a device or read receipt |
| Discovery | Candidate ranking and CDN delivery | Current audience and expiry still apply |
| Calls | Signaling, negotiated media transport and relay when needed | Connectivity and E2E properties must be established, not assumed |
| Location/map | Time-bounded samples and spatial queries | Explicit sharing consent, freshness and permitted audience |

The [photo/media lesson](CASE-INSTAGRAM-FEEDS-AND-MEDIA.md) covers staged
publication and derived representations.
The [upload lesson](CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md) covers byte
integrity and processing generations.
The [WebRTC lesson](WEBRTC-MEDIA-AND-CONNECTIVITY.md) covers calls:
STUN assists discovery/checks, TURN can relay, and neither guarantees a
connection under every network failure.

A location-sharing feature requires an explicit audience, collection
purpose and retention policy. A close map marker can be old or inaccurate;
do not call it a current exact position without evidence.
Revoke access and handle cached locations according to the agreed guarantee.
No real location data is used in these exercises.

**Keep-simple check.** If the requirement is only short-lived media sharing,
do not add a permanent location history or a global discovery pipeline.
Expiry does not require Kafka, Redis or a specific cloud product.

<details class="learning-answer">
<summary>Predict: does a successful TURN allocation prove a private end-to-end call?</summary>
<p>No. Connectivity, media encryption, key ownership and participant
authentication have separate requirements. Relay availability is not a
privacy or delivery proof.</p>
</details>

<span id="transfer-live-sports"></span>
## 4. Live-sports streaming, languages and ads

### A live stream is not just a cached VOD file

**Problem.** Viewers want a sports event close to its live moment.
Segments are produced over time; the newest segment may not exist yet,
and old segments can leave the advertised window.

**Simple baseline.** An authorized ingest publishes verified encoded
segments, then a compatible manifest advertises available media.
Clients retrieve manifests and segments through an appropriate HTTP/CDN
path. Separate the ingest protocol from delivery and from notification
or operator-control channels.

This finite window contains three produced four-second segments:

<!-- example: live-window-case -->
```json
{
  "firstSegment": 101,
  "lastSegment": 103,
  "segmentSeconds": 4
}
```

The window describes **12 seconds of advertised media**, not 12 seconds
of measured end-to-end live latency.
That latency includes capture, encoding, segment availability, distribution,
playlist freshness and client buffering.
HTTP delivery of segments is not the same as a WebSocket for chat or status.

### Change one request

| Requested segment | Observation in this model | Recovery choice |
| --- | --- | --- |
| 102 | Advertised and produced | Fetch under the access and cache policy |
| 104 | Not produced yet | Refresh/wait within a bounded player policy |
| 100 | Outside this window | Refresh to an available point or use a separately supported DVR path |

Do not respond with an old segment under a new segment's identity.
Publish a manifest only after its advertised artifacts are usable under
the delivery contract. Keep appropriate overlap for clients and caches
when advancing the window; cleanup and stale manifests can otherwise
advertise missing media.

**Changed requirement.** A large event attracts a sudden burst, viewers
use different languages, and the product inserts ads.

**Limitation.** Auto-scaling cannot instantly create all ingest, licensing,
origin, CDN, authentication and playback capacity. A nearest-edge routing
change does not guarantee a usable segment or rights grant.
“Three times another platform's scale” is not a justified workload model.

**Alternatives and costs.** Forecast request/bitrate distributions, test
recovery and rights paths, pre-position appropriate immutable content,
bound origin fills and reserve measured headroom.
Shed or degrade only where the product permits, with visible no-fit/stall
status when the lowest safe rendition cannot be delivered.
See [playback](CASE-NETFLIX-PLAYBACK.md) for the fixed bitrate model.

<details class="learning-answer">
<summary>Predict: does a 12-second playlist window establish the viewer's live latency?</summary>
<p>No. It states the duration of advertised media. Measure the full path
from capture to display; encoding, delivery, cache freshness and buffering
add different delays.</p>
</details>

### Language, advertisements and recommendation rules

| Feature | Contract to establish | Failure or tradeoff |
| --- | --- | --- |
| Multiple language tracks | Compatible codecs, timing and manifest selection | Switching can fail if tracks are not synchronized or supported |
| Ad insertion | Rights, splice/discontinuity rules and viewer policy | Incompatible timelines or personalization can invalidate naive caching |
| Ad telemetry | Eligibility, consent, stable event identity and reconciliation | Requested or downloaded bytes do not prove an impression |
| Recommendations | Authorized data, model/version, freshness and fallback | Optional suggestions can fail without fabricating playback rights |
| Event surge | Measured ingest, delivery and control-plane limits | Pre-warming and autoscaling do not guarantee arbitrary spikes |

Server-side stitching and client-side ad handling are different choices.
Personalized manifests require appropriate cache scope; immutable shared
segments do not imply the whole playlist can be publicly reused.
Define access and attribution before counting an impression or billing
any advertiser. All commercial examples here are hypothetical.

For DVR or replay, define retention, authorization, time selection and
whether old manifests remain valid. A live-only window does not automatically
promise a complete event recording. A current rolling manifest, a replay
asset and a chat event have different identities and retention.

**Keep-simple check.** If a small event fits one tested ingest/delivery path,
do not add every region, message bus and recommendation service in the
reference. Measure the actual bottleneck before distributing it.

<details class="learning-answer">
<summary>Predict: does downloading an ad segment prove a billable impression?</summary>
<p>No. Define an eligible impression, its observation and deduplication
policy, consent and reconciliation. Network requests alone can include
prefetches, retries and playback that never occurred.</p>
</details>

## Return to the method

Choose one transfer and explain it without looking:

1. What is authoritative and what may be derived or stale?
2. Which state is pending or unknown rather than complete?
3. What is the permitted audience now?
4. Which count represents logical work versus network attempts?
5. What measured requirement would justify a more complex design?

Compare the small design with one improvement and name its cost.
The [case-study hub](../GUIDED-CASE-STUDIES.md) and
[senior design guide](../GUIDED-SENIOR-DESIGN.md) provide the review route.
The [original chapter](../09-SYSTEM-DESIGN-CASE-STUDIES.md) preserves all
other component mappings for reference.
These exercises support reasoning; they are not evidence of production
competence, legal compliance or current company implementation details.
