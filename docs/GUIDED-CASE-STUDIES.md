# Case studies: transfer the reasoning, not the boxes

You have followed a course request through contracts, failure, recovery and
ownership. Now use that reasoning in different domains.
These are **illustrative designs inspired by familiar products**, not
verified descriptions of their current private architectures.
Every population, target, timing and capacity here is an explicit assumption
or a finite teaching example unless a linked public source states otherwise.

This is a companion, not another numbered protocol phase or certification.
The [complete original case-study chapter](09-SYSTEM-DESIGN-CASE-STUDIES.md)
remains unchanged. Its diagrams, examples, caveats and estimates are still
available. The [source reading map](../assets/case-study-reading-map.mjs)
keeps all 90 original headings and their destinations.
Use the [topic library](COURSE-CONTENT-MAP.md) and
[correction ledger](CONTENT-CORRECTIONS.md) to distinguish retained shorthand
from the more precise lessons.

The course remains entirely free and static. No exercise asks you to create
an account, send a real payment, operate a broker, upload private media,
enable a camera, or run a large deployment.
The [shared fixtures](../assets/case-study-fixtures.mjs) contain fictional
identities and small test data, not information about real users.

## Choose a case by the question

Each case has its own complete lesson. Read one deeply before comparing
another; their order is not a technology or career ladder.

| Case | Problem you will trace | Complete lesson |
| --- | --- | --- |
| WhatsApp-style messaging | What does accepted, device-delivered or read actually mean? | [Messaging and recovery](lessons/CASE-WHATSAPP-MESSAGING.md) |
| Instagram-style photos | When may an uploaded photo become visible, and to whom? | [Feeds, media and privacy](lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA.md) |
| Netflix-style playback | Which path authorizes playback, and which path carries bytes? | [Playback and streaming](lessons/CASE-NETFLIX-PLAYBACK.md) |
| Uber-style dispatch | Who can claim a driver, and what happens after an unknown charge? | [Dispatch and payments](lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md) |
| Twitter-style timelines | When is precomputing a feed worth its write and privacy costs? | [Timelines and fanout](lessons/CASE-TWITTER-TIMELINES.md) |
| YouTube-style uploads | How do partial bytes become an authorized, playable asset? | [Uploads and delivery](lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md) |

The original other-system mappings also have worked transfer sections:

- [Amazon-style checkout and delivery](lessons/CASE-STUDY-TRANSFERS.md#transfer-amazon).
- [LinkedIn-style professional feeds and messaging](lessons/CASE-STUDY-TRANSFERS.md#transfer-linkedin).
- [Snapchat-style expiry, capture and location](lessons/CASE-STUDY-TRANSFERS.md#transfer-snapchat).
- [Live-sports streaming, languages and ads](lessons/CASE-STUDY-TRANSFERS.md#transfer-live-sports).

Those are substantive extensions of the method, not an unexplained appendix.
They do not claim that one company's implementation is “exactly” another's.

<span id="case-method"></span>
## 1. Carry forward an invariant

**Problem.** A design question often begins with a familiar product name.
That name does not specify the workload, required operations, access policy
or failures your answer must handle.

**Simple approach.** Replace the brand name with one concrete user action
and one invariant. Start with an application and a database when they can
own the required state.
Use the [guided senior companion](GUIDED-SENIOR-DESIGN.md) as a reusable
review method, not a shopping list.

**Worked transfer.** In the learning platform, a completion was an authoritative
fact, and a pending email did not undo it. In a dispatch system, a physically
completed trip is a fact; an unknown payment result does not make the trip
unhappen. Both require separate fact and follow-up-work identities.
The domains are different, but the transaction and recovery question transfers.

In messaging, a server's acceptance means a specific local handoff succeeded,
not that a recipient device read the message. That resembles the distinction
between recording a completion and knowing an email was read.

**Changed requirement.** The designer must now serve users during a worker
failure or disconnected device.

**Limitation.** Adding a queue or persistent connection does not define
which effect was committed or how a retry is recognized.
A product logo cannot supply the missing invariant.

**Possible improvement.** State the acknowledgement boundary, stable
operation identity, durable local effect and reconciliation path.
Then compare an outbox, inbox, bounded retries or a snapshot against the
actual requirement. Each introduces storage, retention and operating costs.

<details class="learning-answer">
<summary>Predict: does an accepted message prove that the recipient read it?</summary>
<p>No. Server acceptance, delivery to each authorized device and a read
receipt are different observations. A push hint or transport ACK does not
establish human attention.</p>
</details>

## 2. Use the simplest honest baseline

Begin with the main operation before adding the full reference diagram.

| Case | Baseline to evaluate | Reason to change it |
| --- | --- | --- |
| Messaging | Authenticated message store and bounded delivery/sync | Independent devices, offline history or measured delivery load |
| Photos | Private upload record, verified source, explicit processing status | Larger media, independent workers or different derived sizes |
| Playback | Authorized metadata plus HTTP delivery of immutable media | Origin bandwidth, regional access or adaptive quality needs |
| Dispatch | Current candidates plus an authoritative exclusive claim | Higher location volume, stale data or independent payment effects |
| Timeline | Read followed authors' authorized posts from indexed storage | Read/write volume or a hot broadcaster makes another path worthwhile |
| Uploads | Resumable bytes, verified finalization and guarded processing state | Larger files, interruption, output variants or publication controls |

A small service can expose several interfaces without splitting into
microservices. A browser's request count is not its database-query count.
A CDN is not an authorization service. A cache is not a source of truth
merely because it responds quickly.

**Worked comparison.** A timeline can initially read followed authors'
posts directly. If three followers consume an author's posts, precomputing
three references can be cheap. If a broadcaster has one million followers,
one post can cause one million candidate insertions.
The [timeline lesson](lessons/CASE-TWITTER-TIMELINES.md) compares read-time,
write-time and hybrid work rather than prescribing a universal threshold.

**Changed requirement.** Read traffic grows while author traffic stays
modest, or one author becomes much hotter than the rest.

**Limitation.** The same fanout rule may no longer fit both distributions.
Average load can hide a single expensive key.

**Improvement and costs.** Measure the operation mix and candidate count.
Precompute selected references, merge others at read time, deduplicate and
recheck current access policy. That improves one cost while adding materialized
state, lag and invalidation work.

<details class="learning-answer">
<summary>Predict: must every timeline use a cache, Kafka and write-time fanout?</summary>
<p>No. An indexed read-time design may meet a smaller workload more simply.
Choose materialization only when its measured benefit justifies its update,
privacy and recovery obligations.</p>
</details>

## 3. Trace one operation before estimating the whole world

For each case, fill this worksheet:

1. **Caller:** who is making the request, and what was actually verified?
2. **Intent:** which logical operation does a retry refer to?
3. **Authority:** which component decides ownership, permission or completion?
4. **Local commit:** what becomes atomic within one resource?
5. **External boundary:** which object store, device, provider or queue is outside it?
6. **Acknowledgement:** exactly what does a successful response establish?
7. **Changed state:** what can happen before the next request or retry?
8. **Recovery:** which record, cursor, checksum or status resolves ambiguity?

**Worked upload.** The video fixture has two synthetic three-byte parts.
Receiving part 1 does not finalize the upload. A matching retry of part 1
is not a second part; a changed payload under that part identity is a conflict.
Only both parts, six expected bytes and the required verification allow
finalization. That still does not mean the six bytes are a valid video.
Processing and all required output artifacts have another readiness boundary.

**Changed requirement.** A worker restarts after writing one variant but
before recording or acknowledging its work.

**Limitation.** Repeated work can create duplicate state or claim readiness
while another variant is missing. A broker receipt does not prove playable media.

**Improvement and costs.** Use generation-scoped jobs, verified immutable
source identity, per-variant outcome records and a guarded readiness transition.
Reconcile orphaned objects and stale processing reports. The
[upload lesson](lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md) explains those
steps without claiming a media decoder or a running object store.

<details class="learning-answer">
<summary>Predict: do all uploaded bytes mean the video is playable?</summary>
<p>No. Integrity, media validation, authorization, required processed variants
and a usable manifest are separate checks. A complete synthetic byte fixture
tests a state boundary, not a real video pipeline.</p>
</details>

## 4. Keep the units and populations separate

The [requirements and estimation lesson](lessons/REQUIREMENTS-AND-ESTIMATION.md)
provides the general method. Apply it per case.

- Daily active users are not simultaneous connections.
- Messages produced are not device deliveries or read receipts.
- Followers are not active readers; candidate fanout is not successful display.
- Uploaded hours are not a video count without an average duration.
- Encoded bitrate is not guaranteed segment size for variable-rate media.
- Location samples are not current positions or confirmed assignments.
- A charge attempt is not a confirmed charge or completed settlement.
- A cache hit is not necessarily an authorized, fresh result.

**Worked units.** Under the upload planning fixture, 500 uploaded hours/minute
times 1,440 minutes/day gives 720,000 uploaded hours/day.
At an assumed 0.25 hours/video, that is 2,880,000 videos/day.
Five resolutions times three formats gives 15 output jobs/video if the
model schedules one job per output: 43,200,000 jobs/day.
The original 720,000 videos/day would require the additional assumption
of one hour per average uploaded video.

These inputs are not claims about current YouTube traffic.
Job counts do not reveal encoding CPU time, throughput or operating cost.
The source-volume estimate likewise needs an explicit bytes-per-hour model.

**Changed requirement.** Average upload duration or format count changes.

**Limitation.** Reusing an old count without changing its assumptions produces
an apparently precise but wrong capacity plan.

**Improvement and costs.** Recalculate, record distributions and measure a
representative mix. Include overhead, failures, retries, fanout, retention,
privacy controls and recovery. Label modeled throughput separately from
measured capacity.

<details class="learning-answer">
<summary>Predict: can 720,000 uploaded hours determine the number of videos?</summary>
<p>No. Divide by an explicitly assumed or measured average duration per
video. Hours and videos are different units.</p>
</details>

## 5. Change one failure at a time

First understand the successful boundary, then introduce one failure.
Do not solve five new problems with one impressive diagram.

| Change | What to predict | What cannot be assumed |
| --- | --- | --- |
| Message reply is lost | Same intent resolves to the accepted message | Timeout means not stored |
| Feed worker repeats | One candidate reference per logical task | Every delivery is a new post |
| Viewer loses bandwidth | Lower quality, wait or explicit failure | Adaptive quality guarantees zero buffering |
| Driver sample is stale | Exclude or revalidate the candidate | A close map marker is an available driver |
| Payment reply is lost | Keep unknown and reconcile the stable provider operation | Cancel the completed physical trip |
| Upload worker reports a stale generation | Reject or quarantine the report | A READY string is proof of current media |
| Private access is revoked | Current serving policy prevents disclosure | A precomputed cache entry grants access |
| Region is unavailable | Use verified recovery ownership and capacity | DNS change fixes state or spare capacity |

Retries need bounded attempts, concurrency, deadlines and idempotency
semantics. Cancellation does not undo a committed effect.
A fallback is acceptable only when the product permits its meaning and
the response labels the degraded state.
An unavailable recommendation list is not proof that no recommendations exist.

**Worked example.** A stale location can still be syntactically valid.
The dispatch fixture rejects a closer driver's old sample before considering
the fresh candidate. An authoritative conditional claim then checks
availability. Fresh location by itself cannot prevent two matching workers
from assigning the same driver.

**Changed requirement.** The same worker's offer or result arrives after
another decision or an expiry.

**Limitation.** A local “I think I own it” flag cannot protect an independently
owned driver or payment record.

**Improvement and costs.** Use scoped offer generations, expiry, conditional
claims and result identities at the protected resource. Give unknown outcomes
a status and recovery owner. The [dispatch lesson](lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md)
keeps assignment and payment separate from the physical trip.

<details class="learning-answer">
<summary>Predict: does a driver's GPS update reserve that driver?</summary>
<p>No. It is a candidate signal whose freshness and trust need checking.
An authoritative assignment operation must enforce exclusivity.</p>
</details>

## 6. Separate the control path from the data path

**Problem.** Large media bytes overwhelm a small application server even
when metadata requests are modest.

**Simple approach.** The application authenticates and authorizes the
request and returns a bounded media capability or manifest reference.
HTTP media transfer can then use an appropriate delivery path.
This is not an excuse to bypass upload limits or playback rights.

**Worked playback.** The Netflix-style fixture has four-second segments.
At a fixed 3 Mb/s modeled representation, one segment is 1.5 MB of payload.
An estimated 4 Mb/s path with a 0.75 safety fraction gives a 3 Mb/s
selection budget. The toy policy selects the middle representation.
It does not implement a production adaptive player or guarantee startup latency.

**Changed requirement.** Available throughput falls below even the lowest
representation, or rights expire while a viewer retains a cached URL.

**Limitation.** No representation fits the first condition. A URL alone
does not solve the second; capability lifetime and revocation policy matter.

**Improvement and costs.** Report no-fit or buffering explicitly, manage
buffer and retry budgets, and define rights enforcement at delivery/license
boundaries. Immutable generation keys prevent a manifest from mixing outputs
from incompatible asset versions.
The [playback lesson](lessons/CASE-NETFLIX-PLAYBACK.md) separates metadata,
authorization, manifest delivery, segments and telemetry.

<details class="learning-answer">
<summary>Predict: should a browser publish viewing events directly to an internal Kafka broker?</summary>
<p>No. Use the defined authenticated, bounded ingestion boundary. Internal
broker access, schema validation, durable handoff and privacy are server-side
responsibilities, not public client credentials.</p>
</details>

## 7. Transfer a constraint, not a company label

The [other-system lessons](lessons/CASE-STUDY-TRANSFERS.md) carry these
questions into checkout, professional networks, ephemeral media and live sports.

A new constraint can change the design:

- Inventory/payment needs reservation, unknown-state and compensation policies.
- Professional profile visibility must follow current consent and relationship policy.
- Expiry hides content at a defined serving boundary; it does not erase screenshots.
- Live sports need current ingest and playback latency, not just a cached VOD file.
- Language tracks and ads need compatible manifests, rights and measurable outcomes.

**Worked contrast.** A video-on-demand viewer can retry a cached immutable
segment. A live viewer can request a segment that is not produced yet or
has left the rolling window. The protocol may be related, but the freshness,
retention and recovery behavior are different.

**Changed requirement.** A replay, legal hold, blocked relationship or
regional rights rule changes what may be retained and served.

**Limitation.** Reusing a branded architecture drawing does not define the
new policy.

**Improvement and costs.** Reuse the relevant mechanisms, then state the
different authoritative rule, failure behavior and verification.
Do not force all systems into CDN + gateway + GraphQL + gRPC + Kafka + shards.

<details class="learning-answer">
<summary>Predict: does an expiry TTL prove that every copy was deleted?</summary>
<p>No. Serving eligibility, storage cleanup, replicas, backups, caches,
device copies and screenshots are different boundaries. State the actual
policy and verification instead of promising impossible erasure.</p>
</details>

## 8. Review what the evidence supports

For one case, produce a short explanation without looking:

1. Define the user action, access policy, invariant and expected outcome.
2. Draw the small baseline and name its authority.
3. Trace request, commit, handoff, response and ambiguous failure.
4. Change one requirement and compare at least two viable choices.
5. Calculate quantities with explicit assumptions and units.
6. State the operational owner, rejected cases and recovery path.
7. Describe what tests establish and what remains unverified.

The local model probes use synthetic data, actual local SQLite transactions,
hashes and finite decision checks. They do not run messaging encryption,
media codecs, a CDN, a broker, a map service or a payment provider.
Finite examples are not a distributed safety proof or measured production SLO.

Reading every lesson gives you material to reason with.
Recall, prediction, transfer, implementation and representative testing are
different evidence of learning. No page count or passing content check proves
that you can design and operate every system at billion-user scale.

Return to the [guided senior design](GUIDED-SENIOR-DESIGN.md),
[full case-study source](09-SYSTEM-DESIGN-CASE-STUDIES.md) and
[complete topic library](COURSE-CONTENT-MAP.md) when a decision is unclear.
You may keep the simple design when its measured requirements are met.
