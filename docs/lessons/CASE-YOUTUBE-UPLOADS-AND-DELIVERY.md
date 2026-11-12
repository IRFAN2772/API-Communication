# YouTube-style design: uploads, processing and delivery

[Case-study hub](../GUIDED-CASE-STUDIES.md) ·
[Original case 6](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-6-design-youtube-staff-engineer-version) ·
[Topic library](../COURSE-CONTENT-MAP.md) ·
[Corrections ledger](../CONTENT-CORRECTIONS.md) ·
[Shared fixtures](../../assets/case-study-fixtures.mjs)

This fictional exercise is not a verified description of YouTube's private
architecture, policies or user statistics. Numbers below are assumptions or
derived from assumptions, not facts about a company. The free static course
needs no student account, paid tool, hosting or deployed service. Work through
the examples offline; do not upload, decode or play a real video.

## Route and invariant

The central invariant is: a source is not published as playable until its
verified version has all required verified outputs and a valid manifest,
and an authorized publisher has made the separate publication decision.
Acceptance of bytes, processing readiness, visibility and actual viewing are
different facts.

1. Start with one private upload and explicit states.
2. Resume numbered parts without changing their meaning.
3. Verify source bytes and create a durable processing intent.
4. Make generation-scoped jobs repeatable and publish only complete outputs.
5. Separate readiness, privacy, viewing, recommendations and counts.
6. Calculate scale with dimensions and test failure predictions.

## 1. Small baseline: private upload and status

**Problem.** A creator wants to upload an asset despite a network interruption,
process it, then choose who may see it. A simple application with a database,
private object storage and a worker can suffice for a small workload.

The application authenticates the owner, checks quota and upload policy, and
creates a private upload record. It returns a scoped, expiring capability
for an upload operation, not a permanent permission to read or publish the
result. The backend owns the authoritative state; a client assertion that a
file is complete is only a request to verify it.

```text
creator -> authenticated upload service -> upload record
creator -> scoped upload endpoint -> private object storage
worker  -> verified source -> derived objects
creator -> publication decision -> authorized viewers
```

The path is conceptual; direct-to-storage uploads can be an alternative to
proxying bytes, provided the object-store capability is scoped to the upload,
part and expiration. No storage callback alone grants publication rights.
Public-read access, if permitted at all, is a separate policy decision.

**Changed requirement.** A large transfer is interrupted and must resume.
**Failure.** A single unversioned overwrite can lose progress or combine
bytes from incompatible attempts. Network retries can repeat a successful
write when its response was lost.
**Alternative.** Number the parts, bind each to identity and hash, persist
their status, and allow matching retries. This adds metadata, retention and
cleanup; a single request may still be sufficient for tiny objects.

<details class="learning-answer">
<summary>Predict: does possession of an upload capability mean permanent permission to publish?</summary>
<p>No. It permits only its scoped upload action within its lifetime. Processing, ownership, privacy and publication have separate checks.</p>
</details>

## 2. Synthetic fixture: not a video

The exact shared fixture is:

<!-- example: upload-case -->
```json
{
  "uploadId": "upload-101",
  "videoId": "video-101",
  "ownerId": "uploader-1",
  "parts": [
    { "number": 1, "body": "abc" },
    { "number": 2, "body": "def" }
  ],
  "expectedBytes": 6,
  "requiredVariants": ["low", "high"]
}
```

These are six synthetic UTF-8 bytes: `abc` followed by `def`. They are not a
valid video and no example performs real decoding or encoding. The named
variants are symbolic output identities, not encoded media.
`upload-101` and `video-101` are identifiers, not credentials.

**Worked exchange.** Owner `uploader-1` creates an upload for `video-101`.
Part 1 has bytes `abc`, part 2 has bytes `def`. For each part the service
binds `(upload identity, part number)` to the authenticated owner, byte
length, object version and a server-verified SHA-256 digest. The owner asks
for the committed parts and resumes missing part 2 after interruption.

The hash of a part is checked against the bytes actually stored, not just
against a client assertion. A retry of the same numbered part with the same
content is accepted as the existing part. The same number with changed
content conflicts; it must not overwrite previously committed bytes.
An unauthorized actor cannot read part state or reuse the upload identity.
Different uploads can independently contain the same part numbers.

```text
owner -> service: part 1, "abc"
owner <- committed part 1 (response lost)
owner -> service: part 1, "abc" again
owner <- same committed result
owner -> service: part 1, "xyz"
owner <- conflict, original part remains
owner -> service: part 2, "def"
```

The system needs conditional storage writes and unique metadata constraints to
arbitrate concurrent attempts; a sequential example alone is not isolation.
Allow narrowly scoped retry identity for the permitted window, enforce size
limits and clean abandoned multipart data according to a documented policy.
The [REST reliability lesson](REST-RELIABILITY-AND-OPERATIONS.md) explains
retry scope and semantic conflict in more detail.

<details class="learning-answer">
<summary>Predict: the response for part 1 was lost. What happens when its identical bytes are retried?</summary>
<p>The authenticated retry returns the original committed part result. Changed bytes for that same upload and part number conflict rather than silently replacing it.</p>
</details>

## 3. Finalize only a verified source

Finalization requires every declared part exactly once in order, total byte
length `6`, and verification of the full assembled source hash against the
expected digest. The source must be bound to the exact immutable object
version that was checked. For these six bytes SHA-256 of `abcdef` is:

```text
bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721
```

Hashing part digests concatenated together is not the same as hashing the
assembled source bytes. Re-read or use a trustworthy storage checksum with
documented semantics and bind the result to the object version. A missing
part, wrong length, source hash mismatch, changed object version or failed
authorization prevents finalization. A matching finalize retry returns the
same accepted generation; a changed finalization intent conflicts.

**Outside the toy.** Enforce authenticated ownership, type and container
validation, size and duration limits, quotas, malware or abuse checks where
appropriate, durable storage policy and safe parsing before accepting real
media. An advertised MIME type or checksum alone does not establish a safe
or decodable file. Validation failures produce failed or quarantined state,
not a fabricated playable asset.

**Changed requirement.** Source storage succeeds but a process crashes before
processing is scheduled. **Failure.** A database update and external queue
publish are not one atomic operation. A source may be orphaned, or the
processing message may be lost.

**Improvement.** In one local database transaction record the verified source
reference, its immutable version and generation, the processing state and
a durable outbox intent. A relay later submits the work. If the transaction
fails, the storage object may still exist; reconcile and clean or reattach
it under an explicit retention policy. The database and object store are
not atomically committed together.

```text
verified object version -> [source reference + processing state + outbox]
                                    local DB transaction
                                                |
                                                v
                                      relay -> worker jobs
```

The outbox makes a committed obligation visible to a relay, not exactly-once
delivery. If a relay publishes and crashes before recording progress, the
job can repeat. Workers use a durable inbox and idempotent outputs.
See [outbox and inbox](OUTBOX-INBOX-AND-WORKFLOWS.md),
[background jobs](WEBHOOKS-AND-BACKGROUND-JOBS.md) and
[broker recovery](BROKERS-DELIVERY-AND-RECOVERY.md).

<details class="learning-answer">
<summary>Predict: both parts exist but the final object version differs from the verified version. Can it finalize?</summary>
<p>No. Verification must bind the full hash and length to the exact immutable object version referenced by the transaction. Reverify or reject the changed object.</p>
</details>

## 4. Processing is generation-scoped

Use explicit states such as `UPLOADING`, `PROCESSING`, `READY`, `FAILED`
and `QUARANTINED`. A pending operation may remain `PROCESSING` while work
is retrying. Failed and quarantined assets do not become READY through a
timeout or a default value. Owners need a useful status and recovery path.

**Worked change.** Finalization creates generation 1 for the verified
source. Worker jobs identify `(videoId, generation, variant)`. Each worker
reads the expected source version, produces a deterministic object identity
or immutable version, and records verified artifact metadata. The fixture
requires **both** `low` and `high`. The output is illustrative: neither
variant is actually encoded in this course.

An idempotent repeated job for the same generation and variant accepts a
matching already-recorded artifact; conflicting bytes or metadata require
investigation rather than overwrite. A later source replacement creates a
new generation. A late generation 1 worker must not advance generation 2.
Leases can expire, so conditional database updates and generation fencing
are still required. If a worker crashes after object write but before its
database acknowledgment, retry or reconcile the orphaned output.

The readiness owner verifies that the current generation has both required
variant records, that the referenced artifact versions actually exist and
pass their defined checks, and that a valid manifest references exactly the
appropriate generation and compatible artifacts. A record named `manifest`
is not sufficient evidence of a valid manifest. Real implementations need
actual format and media validation; here a testable boolean is a placeholder
for those checks, not a decoder.

Only then does a **local database transaction** conditionally transition the
current generation from processing to READY, write metadata and verified
artifact/manifest references, and insert a `VideoReady` outbox event when
that event is relevant. These local writes commit together. The transaction
does not atomically commit the external objects. The relay may emit more
than once; a consumer records event identity in its own inbox transaction.

```text
source g1 -> jobs (g1, low) and (g1, high) -> verified object versions
                                                |
                                                v
                          [READY + metadata + references + VideoReady intent]
                                          local DB commit
```

**Failure.** One output exists but the other fails; or the manifest points
at a stale generation; or artifacts disappear. Do not mark READY. Retry
with bounded attempts and a failure state, alert on stuck work, and reconcile
object-store inventory against authoritative records. Because storage and DB
are separate, reconciliation must discover orphan objects, missing references
and stale outputs without deleting a still-in-use version.

**Alternatives.** One job per output gives parallelism but more queue and
coordination overhead. One job for all outputs reduces coordination but
makes a failed long job more expensive to retry. Both need a completeness
gate. See [distributed transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md)
and [contract evolution](CONTRACT-EVOLUTION-AND-CONSUMERS.md).

<details class="learning-answer">
<summary>Predict: low succeeded, high failed, and the worker sent a success notification. Is the asset READY?</summary>
<p>No. Both required outputs, their artifact checks and a valid generation-matched manifest must pass before the guarded READY transaction. A notification is not a readiness proof.</p>
</details>

## 5. Privacy, publication and playback

`READY` means processing met this design's technical gate; it does not mean
public. The owner or delegated publisher must have current authority to
publish and choose a privacy policy. A policy change can remove future access
while a previously issued capability remains usable until its expiry unless
an independent revocation mechanism applies. Previously downloaded bytes
cannot be recalled.

**Worked exchange.** Owner chooses a private visibility setting for READY
generation 1. A viewer requests metadata. The service authenticates as
required, checks the current visibility policy, then grants a scoped,
time-limited playback capability only if eligible. HTTP manifest and segments
flow through the data path; entitlement and privacy stay control decisions.
A CDN miss still requires origin fill and adequate origin capacity.

**Changed requirement.** The creator changes visibility after a cached
recommendation was produced. **Failure.** A cached candidate or old search
index entry is not current permission. Serving a stale private title or its
unscoped metadata leaks information.
**Alternatives.** Filter candidates with the current authorization policy
at read time, or use bounded, invalidated permission-aware caches with an
explicit maximum stale window and fail-closed behavior. Recheck at playback.
Index removal and CDN cache invalidation have lag and operational costs.

The [playback lesson](CASE-NETFLIX-PLAYBACK.md) develops segmented HTTP,
adaptive rates, expiry, CDN fill and regional failure. Search indexing and
recommendation ranking are asynchronous projections, not the authority
for publication or access. Neither ranking nor a CDN makes a title public.

<details class="learning-answer">
<summary>Predict: if processing reports READY, may every visitor watch?</summary>
<p>No. READY is a technical processing state. Current publication and privacy policy must independently authorize the viewer and the requested asset.</p>
</details>

## 6. The dimensions of upload scale

The fixture uses teaching assumptions, not measured company statistics:

<!-- example: upload-scale -->
```json
{
  "uploadedHoursPerMinute": 500,
  "minutesPerDay": 1440,
  "averageVideoDurationHours": 0.25,
  "resolutions": 5,
  "formats": 3,
  "sourceBytesPerHour": 1000000000
}
```

| Quantity | Calculation | Illustrative result |
| --- | --- | ---: |
| Source duration per day | 500 hours/minute × 1,440 minutes/day | 720,000 hours/day |
| Videos per day | 720,000 hours/day ÷ 0.25 hours/video | 2,880,000 videos/day |
| Outputs per video | 5 resolutions × 3 formats | 15 outputs/video |
| Jobs per day | 2,880,000 videos/day × 15 jobs/video | 43,200,000 jobs/day |
| Source bytes per day | 720,000 hours/day × 1 GB/hour | 720 TB/day |

Use decimal `1 GB = 1,000,000,000 bytes` and `1 TB = 10^12 bytes`.
The 720 TB/day figure is a simple assumed source-size model, described here
as uncompressed-model source volume, not a claim about actual source
encoding or YouTube storage. Real uploaded video size depends on bitrate,
codec and content; derived outputs, replicas, retry traffic, retention and
metadata are extra. The 15-output jobs result assumes exactly one job per
output; batching or multi-stage processing changes the job count.

**Changed assumption.** If the average video lasts **one hour**, the same
720,000 uploaded hours/day yields 720,000 videos/day and, at 15 jobs per
video, 10,800,000 jobs/day. That is a conditional calculation, not a
conversion from hours to videos without an average.

The original line 1191 says “Video uploads: 500 hours/min = 720K videos/day”;
the left side alone implies 720,000 **hours/day**, not a video count.
Line 1192's “720K × 15 = 10.8M transcoding jobs/day” follows only with the
one-hour average and one-job-per-output assumptions. Line 1195's
“1GB/hr = 720TB/day raw upload” is an assumed size model, not an observed
statistic. The original source is unchanged. The source's line 1165 user
figure and line 1183 workload are scenario inputs, not verified here.

<details class="learning-answer">
<summary>Predict: can 500 hours per minute alone determine the number of videos per day?</summary>
<p>No. It determines 720,000 hours per day. A video count also requires an average duration; at 0.25 hours it is 2,880,000 per day.</p>
</details>

## 7. Capacity, queues and backpressure

**Problem.** Processing demand is bursty, video lengths vary, and jobs have
unequal cost. Average jobs/day is not a peak queue size or worker count.
One long asset may consume much more compute than many short ones.

**Baseline.** Admit uploads under owner quotas and place durable jobs in a
bounded queue. Measure oldest-job age, throughput, retries, failure rate and
resource saturation. Give the owner an honest processing state and retry
expectation rather than a guaranteed completion time.

**Changed requirement.** A sudden burst exceeds worker throughput.
**Failure.** Unlimited retries and queue growth can amplify load and exhaust
storage. Marking pending work READY to hide lag is incorrect.
**Alternatives.** Rate-limit admission, prioritize fairly, scale within
capacity, pause low-priority jobs or ask clients to retry later. Dead-letter
or quarantine repeated failures with an operator-owned recovery process.
Choose queue retention and reprocessing policy intentionally; preserve
source versions for the needed retry window.

Capacity calculations should use a measured service-time distribution,
concurrency, peak factor, retry rate and redundancy. An illustrative average
does not size a fleet, estimate a p99, or prove a service objective.
See [backpressure](BACKPRESSURE-AND-CAPACITY.md) and
[requirements and estimation](REQUIREMENTS-AND-ESTIMATION.md).

<details class="learning-answer">
<summary>Predict: a worker crashes after writing an output but before acknowledging the job. Must the output be produced twice?</summary>
<p>The job may be delivered again, but an idempotent generation-scoped write or reconciliation can reuse a matching verified artifact. The external write and database acknowledgment are not atomic.</p>
</details>

## 8. View counts and recommendation pipeline

**Problem.** The service wants an approximate count and useful recommendations
without putting ranking on the upload's critical path.
An authenticated, bounded HTTPS ingestion endpoint can accept client-reported
events with session-scoped identities and an explicit schema. Clients do not
send directly to internal brokers. Persist accepted events and local outbox
intent together; consumers may receive replays and use durable inbox
identities and idempotent effects. A client report is untrusted.

**Worked definition.** A view-count policy specifies an eligible event,
identity scope, deduplication key, window and late-arrival handling. Within
that window, replay of the same event contributes at most once to the local
projection. New events or identities can still be fraudulent, missing or
ineligible. A counted view is not proof of human attention or billing.
Define corrections and reconciliation when policy changes or late events
arrive; eventual consistency does not say exactly when every replica agrees.

**Changed requirement.** Recommendations should respond to interactions
asynchronously. A feature consumer processes eligible events, a separate
ranking job builds candidate lists, and a cache stores a versioned result.
Outbox and inbox boundaries make work recoverable, not instantaneous or
exactly once end to end. At read time check current permissions before
showing any candidate, including fallback popular lists.

**Failure and alternatives.** Lag makes results stale; a worker outage can
leave an old list or no list. Display a clearly scoped cached result within
its permitted freshness or omit the optional section. A synchronous
ranking call can be fresher but puts more dependencies and latency on the
request. Measure lag and privacy leaks separately. Search, moderation and
comments also require their own contracts and access checks; none is a
verified description of YouTube's implementation.

See [event projections](EVENT-MODELS-AND-PROJECTIONS.md),
[schema and consumers](CONTRACT-EVOLUTION-AND-CONSUMERS.md) and
[reliability](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md).

<details class="learning-answer">
<summary>Predict: the same view event is replayed three times. Does the count increase by three?</summary>
<p>Not within a correctly implemented deduplication window for the same event identity. Eligibility and fraud checks still matter, and the result is not billing proof.</p>
</details>

## 9. Optional live branch

Live media has a different timing and retention problem from uploading a
complete source. An optional profile might ingest using RTMP or WebRTC and
deliver a rolling HLS/DASH window over HTTP. Another profile could choose
different transports based on latency, audience and compatibility. These
are alternatives, not requirements for every product or company claims.

WebSocket notifications can carry state or chat, not automatically the
media stream. A live window can expire while a slow viewer falls behind;
define whether to jump to a current segment, replay from retained storage,
or show an explicit error. Handle ingest interruption, timestamp continuity,
capacity, authorization and CDN origin fill. The exercise does not run a
live stream. See [WebRTC media](WEBRTC-MEDIA-AND-CONNECTIVITY.md) and
[realtime recovery](REALTIME-RECOVERY-AND-FLOW.md).

<details class="learning-answer">
<summary>Predict: does adding a WebSocket notification channel replace the live media delivery protocol?</summary>
<p>No. Notifications and timed media delivery have different responsibilities. A selected live media profile still needs its own ingest and delivery protocols.</p>
</details>

## 10. Practice and source transfer

1. Part 1 is repeated with different bytes. What is the result?
2. Both parts exist, but the verified source version changed. Finalize?
3. Low and high exist, but the manifest fails validation. READY?
4. The owner has not published a READY asset. Can an arbitrary viewer play?
5. A replayed event has the same ID inside the deduplication window.
   Is it evidence of another view?
6. With the fixture average, how many jobs per day are implied by one
   job per output?

<details class="learning-answer">
<summary>Check your predictions</summary>
<p>1. Conflict. 2. No; verify the exact immutable version. 3. No; require a valid generation-matched manifest and verified artifacts. 4. No; readiness is not publication. 5. No; deduplicate it and still apply eligibility. 6. 43,200,000 illustrative jobs per day.</p>
</details>

The original line 1261 compresses processing into “Update metadata (status:
READY)”. This lesson expands that step into a completeness gate and a local
transaction while preserving the original as source. Its line 1325 suggests
“DNS failover to next nearest edge”; DNS alone cannot establish healthy
capacity, permissions or origin availability. Its queue and notification
arrows do not by themselves guarantee atomicity or unique delivery.

Transfer the same design to a course assignment: a durable uploaded file is
not a graded submission, and a processing status is not permission to share.
Give every transition an authority, a verified input version and a recovery
rule. Avoid conflating a count, a candidate, a permission and a durable fact.
