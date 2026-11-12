# Instagram-style exercise: feeds, media, and privacy

[Case-study hub](../GUIDED-CASE-STUDIES.md) ·
[Original case 2](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-2-design-instagram-staff-engineer-version) ·
[Topic library](../COURSE-CONTENT-MAP.md) ·
[Corrections ledger](../CONTENT-CORRECTIONS.md) ·
[Shared fixtures](../../assets/case-study-fixtures.mjs)

This fictional Instagram-style exercise teaches design choices, not verified
company architecture or current company statistics.
Numbers below are invented assumptions, not measurements.
This free course needs no account, upload, hosted service, or paid software.
Read the [original case collection](../09-SYSTEM-DESIGN-CASE-STUDIES.md)
as historical learning notes, not an implementation specification.

## 1. Start with a visible outcome

A person creates a private photo post.
Approved followers can eventually see it in a home feed, like it, and receive
relevant activity notifications.
The author's post should not appear with broken or unvalidated media.
An unfollow, block, privacy change, or delete must take effect at read time,
even while a derived feed, cache, or search index is behind.

Separate the success conditions:

- The author owns a draft record and can inspect processing status.
- Published means validated source and every required representation exists.
- A feed is a list of candidates, not a grant to read those candidates.
- A notification is a hint, not proof that the content remains accessible.
- Availability does not justify revealing a private post.

The original contains more features than a first release needs.
The narrow exercise uses a single still image, a chronological feed, and likes.
Stories, direct messages, discovery, and video introduce additional rules later.
We do not build a production service or decode real images in this lesson.

## 2. Carry one fixture through the design

The next block is the exact shared fixture.
The source version identifies an immutable generation, not a mutable filename.

<!-- example: photo-case -->
```json
{
  "photoId": "photo-101",
  "authorId": "author-1",
  "uploadId": "photo-upload-101",
  "sourceVersion": 1,
  "sourceObject": "photos/photo-101/source-v1",
  "requiredVariants": ["thumbnail", "display"]
}
```

For this example the author creates `photo-101` as private and unpublished.
Its required variants are the thumbnail and display image for source version 1.
The version belongs in every processing result and receipt key.
It is not a request to create a real storage object.

<details class="learning-answer">
<summary>Predict: can the feed show the draft after only the thumbnail exists?</summary>
<p>No. The display variant is also required, and source validation must have succeeded. The owner may see a processing status, but a placeholder is not a completed published image.</p>
</details>

## 3. Begin with a simple write path

The authenticated author sends a metadata request.
The service checks identity, ownership, a bounded caption, and the intended
visibility; it stores a private `DRAFT` with a stable photo ID.
In this exercise a request key is scoped to the author and operation.
The same key and semantic payload return the original result;
a reused key with a different payload is a conflict.

The response describes the upload and processing state.
The service then issues a short-lived upload capability for precisely the
expected object key, maximum size, and allowed content type.
The capability is a bearer credential with limited authority, not a bypass of
authentication, ownership, publication, or read authorization.
An attacker who obtains it may use its limited grant until it expires, so never
log or expose it and choose a short lifetime.
The storage provider must enforce the grant; checking only in the client is
insufficient.

The client sends bytes directly to storage using that capability.
It tells the application when it believes upload completed.
An object-store callback may arrive first, late, repeatedly, or not at all.
Neither a successful client response nor a callback proves the object is safe.

## 4. Validate before publication

Bind completion to `photo-101`, `photo-upload-101`, version 1, and its expected
object key.
Fetch trusted object metadata or otherwise verify that the immutable version
exists, its size is within policy, and its checksum matches the expected
checksum.
Inspect actual media bytes using a trusted decoder with resource limits;
an advertised MIME type alone is not validation.
Reject unsupported formats, malformed payloads, and dangerous decompression
ratios before treating the source as valid.
The storage checksum must refer to the immutable object actually processed.

For our offline examples, a registry of test vectors stands in for these
checks; it is **not** a real JPEG decoder or object store.
It does not demonstrate real security validation or durable external storage.
At runtime an implementation must perform and monitor those operations.

After validation the state can advance to `PROCESSING`.
Workers produce version-scoped thumbnail and display objects.
The application confirms the existence and expected metadata of *each*
required variant, not just a successful worker message.
An object written by a worker but not verified is not a confirmed variant.

<details class="learning-answer">
<summary>Predict: the worker says success, but display is absent. Publish?</summary>
<p>No. Keep the post unpublished, record the missing variant and retry within policy. Worker completion is evidence to verify, not proof that every required object exists.</p>
</details>

## 5. Show the states, including failure

Use explicit transitions rather than one ambiguous boolean:

1. `DRAFT`: metadata exists and only the owner may inspect it.
2. `UPLOADING`: a bounded capability has been issued.
3. `VALIDATING`: the service is checking the exact immutable source.
4. `PROCESSING`: the source passed validation; variants are outstanding.
5. `READY`: source and all required variants have been confirmed.
6. `PUBLISHED`: a local finalization transaction made it feed-eligible.
7. `FAILED`: validation or processing failed; display a useful owner status.

`FAILED` can allow a controlled retry or require a new version.
An abandoned draft can expire under a documented cleanup policy.
The system never reports fake `READY` just because a placeholder is visible.
If a previously verified object later disappears, serving must fail safely,
report an unavailable image, and schedule repair rather than pretend success.

## 6. The storage boundary is not a transaction

Object storage and the metadata database are not one atomic transaction.
Writing a variant and then crashing before recording it can leave an orphan.
Recording a job without a durable object can leave missing work.
Record the observed object version and checksum; reconcile both directions.
Lifecycle rules can remove unreferenced objects after a safe retention period.
Never delete a version still referenced by an active publication.

Once confirmation exists for all requirements, the database performs a
conditional finalization in one local transaction:

1. Lock or compare-and-swap the current generation and unpublished state.
2. Verify the validated source and the complete confirmed variant set.
3. Set publication state and insert a uniquely identified outbox event.
4. Commit both changes, or neither.

A relay can later deliver the outbox event at least once.
The transaction does not atomically write an object, call a broker, or
guarantee delivery to every consumer.
Monitor relay age and reconcile stranded pending rows.
See [outbox and inbox](OUTBOX-INBOX-AND-WORKFLOWS.md) and
[background jobs](WEBHOOKS-AND-BACKGROUND-JOBS.md).

## 7. Make repeated work safe

Store an inbox receipt for a callback or job in the same local transaction as
the state change it triggers.
Scope it by consumer, event identity, photo, and source generation.
A duplicate callback for generation 1 must not schedule duplicate effective
work; a duplicate worker completion must not duplicate publication.
If a worker can run twice, write deterministic generation-scoped variant keys
and check the desired state before recording its result.

Suppose the author replaces the source with generation 2 while a generation 1
worker is still running.
The worker's output may be retained temporarily as an orphan, but the
conditional update must reject it as the current variant.
Only generation 2's validated source and its own confirmed variants can
finalize generation 2.
Comparing a version at job submission time alone is insufficient.

<details class="learning-answer">
<summary>Predict: can a late version 1 display callback complete version 2?</summary>
<p>No. The callback is scoped to version 1. A conditional current-generation check rejects its state transition even if the old object exists.</p>
</details>

## 8. Read the simplest feed first

Start with pull on read: query the authoritative following relation, then find
published posts by followed authors using an index over author and stable
publication order.
The author can see their own posts under an explicitly defined owner rule.
Batch a bounded number of candidate IDs, hydrate metadata, and evaluate current
visibility, follow, block, and deletion rules before returning each post.
Use `(published_at, post_id)` as a deterministic ordering key.
The opaque cursor carries the last key and an agreed snapshot or upper bound;
ties break on post ID.
Authorization still uses current policy, even when pagination uses an older
snapshot.

If filters remove candidates, scan additional bounded batches to fill a page.
Return a continuation cursor when a scan budget is exhausted rather than
claiming a partially scanned timeline is definitively empty.
Do not leak filtered IDs, counts, thumbnails, or captions in the response.
The [collections and caching lesson](REST-COLLECTIONS-AND-CACHING.md)
explains cursor and HTTP representation choices.

## 9. A changed condition: repeated expensive reads

Measure candidate scans, database load, latency distribution, follower counts,
and read/write rates before adding a precomputed feed.
If repeated reads dominate and the measured cost warrants it, an asynchronous
worker can push post *references* to follower-specific candidate lists.
This trades extra write amplification, queue lag, memory, and repair work for
faster candidate lookup.
A hybrid may pull high-fanout authors and push ordinary authors.
Merge both sources by the same stable post ID and ordering key; deduplicate.
Do not sort by worker completion time.

The original line 519 says “Fan-out on read for users with >1M followers”.
Treat 1M as an illustrative historical assumption, not a universal threshold.
Choose an operational boundary from the actual read/write distribution,
fanout backlog, active audience, capacity, and freshness target.
If reads are infrequent or the follow graph is small, retain pull instead.

## 10. Candidate lists never authorize content

A private follower can be revoked while a cached candidate remains.
On every serving request check current follow, block, visibility, and deletion
policy against authoritative data or an authorization source with an explicit
correctness guarantee.
When the required authority is unavailable, fail closed for revoked or
possibly revoked followers; return an explicit error or omit candidates under
a documented partial-result contract, never a successful unauthorized item.
The same rule applies to search hits and media URL issuance.

Do not put private feeds in a publicly shared cache.
Use private or no-store response directives as appropriate, partition any
server cache by principal and policy, and secure object access separately.
A previously issued media capability may outlive revocation until expiry;
use short lifetimes or an authorization-enforcing media gateway if immediate
revocation is required.
Avoid logging credentials and recognize already downloaded copies cannot be
recalled.

For example, `reader-1` was once approved and the cached candidate list
still includes `photo-101`.
After the author revokes that approval, the next request must consult current
policy before returning even the thumbnail or a short caption.
If the policy service times out, the server cannot distinguish the revoked
reader from a still-approved reader using stale candidate membership alone.
An error is less convenient than a feed, but it does not disclose the image.

<details class="learning-answer">
<summary>Predict: search returns an old private post after a block. Show it?</summary>
<p>No. A search result is only a candidate. Current authorization must reject the blocked viewer even when the index has not caught up.</p>
</details>

## 11. Cache changes capacity, not policy

Cache stable public metadata where safe and cache authorized private results
only with isolation and explicit expiry and invalidation policy.
Use TTL with jitter to spread refreshes, and bounded singleflight to coalesce
concurrent refreshes for a key.
Limit cache entries, waiter counts, work queues, and backend concurrency.
Coalescing does not create backend capacity, and independent keys can still
overload the database.
Use load shedding, budgets, and metrics to handle that case.

An explicitly permitted stale, still-authorized result may be served for a
bounded period when its policy permits it.
Stale authorization itself must not turn a failure into success.
When current authorization cannot be established, fail closed.
See [sharding and caching](SHARDING-CACHING-AND-INFRASTRUCTURE.md).

## 12. Like means one user's relationship

Model a like as the relationship `(user_id, photo_id)`, with a unique
constraint.
`PUT /photos/photo-101/likes/me` means “my like exists” and repeating it has
the same intended effect.
`DELETE` removes that relationship; authorize the caller each time.
Alternatively, a `POST` may be made retry-safe with a caller-and-operation
scoped idempotency key and payload conflict checking.
REST does not make arbitrary POST operations idempotent.

A separate aggregate count is a projection: it may lag or require repair.
Update it from uniquely identified committed changes, not from every retried
request.
Concurrent likes by different users remain distinct.
The UI can distinguish a pending local action from an authoritative result.
See [HTTP contracts](REST-HTTP-CONTRACTS.md) and
[REST reliability](REST-RELIABILITY-AND-OPERATIONS.md).

## 13. Pick a response shape with evidence

An initial REST feed endpoint can return bounded post summaries and cursors.
A mobile screen might also need stories and profile summaries.
Measure response bytes, extra round trips, tail latency, and backend query
counts before replacing or supplementing this shape.
GraphQL can aggregate exactly the requested fields, while a REST BFF can
provide a purpose-built aggregate; neither removes backend work automatically.

GraphQL field resolvers can create an N+1 query pattern.
Request-scoped DataLoader batching can combine and deduplicate lookups within
one request; it is not a global authorization-safe cache.
Enforce field-level authorization, depth and complexity budgets, bounded lists,
timeouts, and careful cache keys regardless of protocol.
Compare failure behavior and operational cost, not just payload size.
See [GraphQL execution](GRAPHQL-EXECUTION-AND-BATCHING.md) and
[GraphQL cost](GRAPHQL-COST-CACHING-AND-EVOLUTION.md).

## 14. Live hints and recovery

A notification may say that new activity exists; it must not be the only copy
of a like or post.
SSE can deliver server-to-client hints, while a WebSocket can support
bidirectional interactions at the cost of connection state and recovery.
Mobile push may be delayed, duplicated, suppressed, or delivered after access
has been revoked.
Use minimal payloads and reauthorize when the user opens the resource.

On reconnect, resume from a durable cursor if it is retained and authorized.
Otherwise obtain an authorized snapshot and reset the cursor.
Deduplicate event IDs, handle gaps and backpressure, and cap retry loops with
backoff and jitter.
Transport delivery is not proof that a person saw the content.
[Realtime recovery](REALTIME-RECOVERY-AND-FLOW.md) and
[push delivery](PUSH-NOTIFICATION-DELIVERY.md) examine those boundaries.

## 15. Direct messages and presence are different

A feed hint can be discarded because the feed can be fetched again.
A direct message needs its own durable message identity, authorization,
per-device delivery state, retry, ordering, and retention contract.
Do not infer exactly-once delivery from a persistent socket.
Presence is a short-lived estimate based on leases or heartbeats;
absence of a heartbeat does not prove a person is offline.

For a fuller connected example, see
[messaging and recovery](CASE-WHATSAPP-MESSAGING.md).
The social feed's candidate cache is not a substitute for a message inbox.
Define privacy and abuse controls separately for both features.

## 16. Stories and deletion

Suppose a story has an expiry time.
Enforce that time at the serving boundary even if a cleanup worker is late.
TTL can make a row or cache entry unavailable, but it does not prove physical
deletion of every object, replica, backup, CDN copy, or screenshot.
Document retention, deletion propagation, backup expiry, legal exceptions,
and capability lifetimes separately.
A screenshot already held by a recipient cannot be reliably recalled.

The original line 310 describes “Stories (ephemeral 24h content)”.
That is a product visibility example, not a guarantee of total erasure after
24 hours.
Tests here simulate time and policy; they do not prove physical deletion.

## 17. Search and discovery

Build search from published events only after the simple feed works.
An asynchronous index can be incomplete or contain deleted candidates.
On search, rehydrate and authorize each candidate against current policy.
Ranking must not promote private or blocked posts through snippets, counts, or
recommendation side channels.
Separate eligible candidates from scoring and track index lag.

If indexing lags, say results may be incomplete.
Do not silently treat search as the source of truth for publication or
authorization.
Bound query work and protect against abusive request volumes.
The [event projections lesson](EVENT-MODELS-AND-PROJECTIONS.md)
explains why a read model can be behind.

## 18. Failure walk-through

Consider this sequence for `photo-101`:

1. The authenticated author creates private metadata.
2. Upload version 1 is recorded, but a callback is duplicated.
3. Validation confirms the source, size, checksum, and media policy.
4. The thumbnail exists; the display worker temporarily fails.
5. The owner sees `PROCESSING` or an explicit failure, not a public image.
6. A retry creates and confirms the display object for version 1.
7. A single conditional transaction publishes and records an outbox event.
8. A follower reads the post through an authorization-checked feed.
9. The author blocks that follower while a candidate remains cached.
10. The next read filters the candidate despite the stale cache.

If the database is unavailable at step 7, no publication is acknowledged.
If a relay crashes at step 7, its outbox row remains for retry.
If policy authority is unavailable at step 10, do not return the private post.
If object verification fails at step 6, retain a failure status and reconcile.

<details class="learning-answer">
<summary>Predict: does publishing atomically include sending a notification?</summary>
<p>No. The local transaction commits publication and its outbox record together. Notification delivery happens later and may be retried or fail independently.</p>
</details>

## 19. Operational choices and limits

Measure source validation failures, missing variant age, orphan object count,
processing queue age, duplicate receipts, outbox age, and publication latency.
Measure feed candidate scan cost, policy-check failures, cache hit rates,
filtered candidates, and user-visible freshness.
Alert on sustained lag and errors; do not alert only on infrastructure CPU.
Run recovery drills that compare database state to storage inventory.

Set timeout and retry budgets for each dependency.
A poison media item needs a bounded retry and an owner-visible failure path.
Apply per-user upload quotas and rate limits without logging private media.
Disaster recovery needs a documented order for restoring metadata and object
versions, then reconciling publication invariants.
Backups and encryption key handling deserve separate operational designs.

## 20. Transfer and compare

The [timeline exercise](CASE-TWITTER-TIMELINES.md) develops fanout arithmetic
and stable hybrid pagination.
The [playback exercise](CASE-NETFLIX-PLAYBACK.md) separates
authorization from media-byte delivery.
The [video upload exercise](CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md) applies
generation and processing ideas to longer-running media workflows.
These are separate exercises, not evidence about real companies.

<details class="learning-answer">
<summary>Changed condition: a small private classroom has ten posts a day. Keep push fanout?</summary>
<p>Probably not. Pulling indexed, authorized posts is simpler if measured latency and load meet the classroom's needs. Add a derived feed only when evidence justifies its write and recovery cost.</p>
</details>

<details class="learning-answer">
<summary>Transfer: how would a medical-document portal reuse this design?</summary>
<p>Validate immutable uploaded document versions and publish only after required checks complete. Recheck current patient and clinician authorization when serving each document; a search index or notification is only a candidate or hint. Domain-specific retention and legal obligations need their own policy.</p>
</details>

## 21. Offline practice and next steps

The companion test uses in-memory SQLite and fixture-sized registries to probe
publication, duplicate receipts, candidate privacy, and unique likes.
It does not run an object store, real image decoder, broker, media processor,
network service, or contract-verification product.
Run the selector from the repository root:

```sh
node --test tests/case-photo-feeds.test.mjs
```

Change one test assumption at a time: remove the display confirmation, replace
the source generation, or revoke a follower.
Predict the state before running it, then explain which boundary enforced it.
For broader design practice return to
[requirements and estimation](REQUIREMENTS-AND-ESTIMATION.md) and
[case-study transfers](CASE-STUDY-TRANSFERS.md).
