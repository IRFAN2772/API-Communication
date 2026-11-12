# Twitter-style exercise: timelines and fanout

[Case-study hub](../GUIDED-CASE-STUDIES.md) ·
[Original case 5](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-5-design-twitterx-staff-engineer-version) ·
[Topic library](../COURSE-CONTENT-MAP.md) ·
[Corrections ledger](../CONTENT-CORRECTIONS.md) ·
[Shared fixtures](../../assets/case-study-fixtures.mjs)

This fictional Twitter-style exercise is not a verified company architecture,
traffic report, or description of present-day operations.
All numerical rates and targets are hypothetical inputs for reasoning.
The free course requires no account, broker, hosted service, or paid software.
The [original case collection](../09-SYSTEM-DESIGN-CASE-STUDIES.md) remains
historical notes; we will make some assumptions and boundaries explicit.

## 1. Define the outcome before the components

A person publishes a short post.
A follower can find authorized posts from followed authors in a home timeline.
An author can inspect their own post, and a user can unfollow or block.
Deleting a post or changing its visibility must stop unauthorized serving even
if a candidate list or search index still contains a reference.
The product should communicate delayed results rather than fabricate an empty
feed when a derived timeline is behind.

Start with a chronological list, a bounded page size, and explicit visibility.
Ranking, trends, live updates, and search are later features with their own
semantics.
A timeline response must not expose unauthorized text, metadata, or counts.
Availability goals are useful only after correctness boundaries are stated.

## 2. Carry one fixture through the design

The following is exactly the shared fixture.
The recipients are example follower IDs, not real accounts.

<!-- example: fanout-case -->
```json
{
  "postId": "post-101",
  "authorId": "author-1",
  "requestKey": "post-101-a",
  "recipients": ["reader-1", "reader-2", "reader-3"],
  "ordinaryFollowers": 3,
  "broadcasterFollowers": 1000000,
  "postsPerSecond": 20
}
```

In the ordinary case the author has three followers.
For a separate hypothetical stress calculation, imagine one broadcaster with
one million followers writing at the assumed rate of 20 posts per second.
The fixture does not establish a real user's behavior or system capacity.

## 3. First solution: compute on read

Authenticate a reader and query the authoritative following relation.
Fetch published posts from those authors using a post-store index ordered by
publication key, then filter against current policy.
The post store is authoritative for post existence, deletion, and content;
the social graph and visibility policy determine whether the reader may see it.
Batch bounded author and post lookups to avoid an unbounded query.
This is fanout on read: work is proportional to the relevant follow set and
candidate volume for each read.

Return an opaque cursor encoding the last stable ordering key and a snapshot
or upper bound.
Break equal timestamps using a stable post ID.
When authorization removes a candidate, scan further within a bounded budget.
If the budget ends, return a continuation rather than asserting no more posts
exist.
Even for snapshot pagination, check *current* policy at every serving request.
See [REST collections](REST-COLLECTIONS-AND-CACHING.md).

<details class="learning-answer">
<summary>Predict: should a ten-person club start with a fanout queue?</summary>
<p>Not by default. Pulling from indexed posts and following relationships is simpler if measured read cost and freshness meet the club's requirements.</p>
</details>

## 4. Safely create the post

The author authenticates and submits a post with `post-101-a` as a request key.
Scope the key to the author and creation operation.
Store a fingerprint of the semantic payload.
A retry with the same scope and payload returns the original post;
the same key with changed content conflicts.
Different authors may use the same key without sharing results.

In one local database transaction write the post, idempotency record, and
outbox event, or commit none of them.
A lost response after commit can therefore be retried without creating a
second post.
This is an application contract, not a claim that every POST is idempotent.
The outbox relay can deliver the event more than once.
It is not a distributed transaction with a broker.
[REST reliability](REST-RELIABILITY-AND-OPERATIONS.md) and
[outbox/inbox workflows](OUTBOX-INBOX-AND-WORKFLOWS.md) cover the pattern.

## 5. Quantify a changed condition

Suppose observations show a read-heavy workload where querying the same
authors for every reader is expensive.
Estimate the cost before choosing a materialized timeline:

| Assumption | Logical references if all posts are pushed |
| --- | ---: |
| 3 followers × 20 posts/second | 60 references/second |
| 1,000,000 followers × 20 posts/second | 20,000,000 references/second |

These are logical recipient references, not bytes, physical writes, or a
measured capacity benchmark.
They assume the follower sets stay fixed and every post is delivered to every
follower.
The broadcaster rate of 20 posts/second is an invented input, not a claim
about actual tweet rates.
Storage amplification, inactive readers, batching, retries, replication, and
retention change operational costs.

The original line 1018 describes one hypothetical post reaching 50M followers.
That multiplication illustrates potential fanout, not verified audience data.
The original case's 500M daily posts are also assumptions for its exercise,
not current company statistics.

<details class="learning-answer">
<summary>Predict: do 60 logical references per second prove a database can handle them?</summary>
<p>No. Capacity depends on record size, indexes, batching, replication, contention, workload shape, and measured system limits. The arithmetic only counts intended recipients.</p>
</details>

## 6. Materialize only with evidence

If repeated read costs justify it, process committed post events into
per-reader candidate references.
A reference identifies the post and ordering key; it is not a copy of the
private content and is never an authorization grant.
The read path hydrates each candidate from the post store and checks current
following, block, visibility, and deletion policy.
The cache and search index can lag without changing access rules.

Fanout on write reduces repeated read work but increases write amplification,
queue and cache memory, repair complexity, and sensitivity to large audiences.
Measure read latency, post delivery lag, active-follower fraction, fanout
cost, and cache miss rate.
If workload no longer justifies it, revert to indexed pull or use it for only
the portions of the graph that benefit.

## 7. Make fanout work repeatable

A durable job represents one `(post_id, recipient_id)` task.
Enforce a unique key on that pair and a unique timeline entry for the same
pair.
The event consumer's inbox receipt is recorded with its local changes in the
same transaction.
A duplicate event or retried job may do work twice, but cannot create a
duplicate effective timeline entry.
Jobs use stable post identity, not a newly invented ID per attempt.

The post and its idempotency/outbox record were committed atomically in the
post database.
The fanout consumer has a separate local transaction; do not pretend those
databases and any broker are atomic together.
When a worker crashes, retry outstanding jobs with bounded backoff.
Monitor oldest pending age, retry counts, dead-lettered work, and successful
repair.

## 8. Fanout is not instant

Suppose the author receives a successful post response but the fanout worker
is behind.
The authoritative post exists while some follower lists do not yet contain it.
Define an expected freshness objective and show lag or partial status when
that objective is missed.
Depending on capacity, a bounded pull fallback can fill the gap, or the UI can
say that the feed is delayed.
Do not silently serve an empty candidate cache as if it were the complete feed.

Treat duplicate deliveries as normal and persistent failures as operational
work.
Prioritizing active readers may reduce visible lag but can starve others;
use fairness, age limits, and repair.
Queue growth must be bounded by admission controls and available capacity,
not concealed with unbounded retries.

<details class="learning-answer">
<summary>Predict: a committed post is absent from a delayed candidate list. Is the post deleted?</summary>
<p>No. The authoritative post may be present while materialization lags. Report the freshness state or use a bounded authoritative fallback, still applying current authorization.</p>
</details>

## 9. Hybrid delivery for large audiences

For authors whose measured write amplification is too expensive, keep their
posts in an author index and pull them on timeline read.
For other authors, read materialized references.
The split is a workload decision, not a universal follower threshold.
Consider posting rate, active-reader rate, follower distribution, cache
capacity, and acceptable delivery lag.
The 1M threshold in original case 2, line 519, is illustrative only.

A broadcaster cache can reduce repeated reads of the same recent author
posts, but it consumes memory and still needs eviction, freshness, and
authorization-aware hydration.
Limit author lists, per-page candidate scans, cache size, and fallback work.
One highly active broadcaster can dominate a page unless the product defines
fairness or ranking rules.
The tradeoff moves work to read time; it does not make it disappear.

## 10. Merge and paginate without surprises

Merge the push and pull candidate streams using the same stable post ID and
publication ordering key, not the order in which workers complete.
Deduplicate IDs before pagination so a post present in both paths appears once.
A cursor records an upper snapshot bound and enough per-source continuation
state to resume the same logical merge.
Use a unique tie breaker such as post ID.
For ranked timelines, a stable ranking version and snapshot are needed too.

Posts written after the snapshot belong to a refresh, not an earlier page.
A late-arriving fanout reference with a publication key inside the snapshot
needs a documented policy: pull fallback, snapshot materialization, or an
explicitly incomplete page that is corrected on refresh.
Do not promise perfect snapshot pagination when the required source cannot
provide it.
Current authorization takes precedence over snapshot repeatability.

Consider three posts with keys `(10, post-a)`, `(10, post-b)`, and
`(9, post-c)`.
Descending order uses the post ID to break the timestamp tie.
If the first page ends at `post-b`, the next page resumes after that full key,
not merely after timestamp 10.
If the same post arrives through both the push and pull path, deduplicate it
before counting it toward the page size.

Now imagine the worker adds `post-c` after page one was returned.
Without an authoritative fallback or a frozen complete candidate snapshot,
the second page might not reproduce a complete historical view.
Expose that limitation and refresh or repair; never order `post-c` according to
the moment a worker finished.
The cursor also needs integrity protection if clients must not alter its
snapshot or source positions.
For example, the server can sign an opaque cursor and reject a malformed,
expired, or mismatched cursor instead of trusting arbitrary positions.
Define cursor expiration and a restart response before shipping the API.
This protects cursor integrity, but does not replace authorization.

## 11. Membership and privacy are checked at serving

Follow, unfollow, block, visibility changes, and deletion may race with jobs.
Candidate references can remain in caches after those changes.
Before returning each post, check current authoritative membership and policy,
including both directions of relevant blocks and the deletion state.
A reference is not content and does not authorize hydration.
Apply the same checks to search and media links.

If the authority cannot answer, fail closed for private or possibly revoked
content.
Return a documented error or a partial response with explicit status; never
use a success default that reveals data.
Cache invalidation is useful for performance and cleanup but is not the sole
privacy control.
Do not publicly cache private timelines.

<details class="learning-answer">
<summary>Predict: a delayed job inserts a reference after a reader is blocked. Can it be served?</summary>
<p>No. The reference can exist, but the current block check must filter it at serving time. An unavailable policy authority cannot be treated as permission.</p>
</details>

## 12. Caches and herd control

Choose a bounded cache for candidate references and another for safe public
content if measurements justify them.
TTL with jitter spreads expiry; bounded singleflight coalesces refreshes for
the same key.
Set limits for entry count, item size, waiters, queue depth, and concurrent
backend fetches.
Across many distinct keys, coalescing alone will not stop overload.
Use admission control and load shedding, and instrument origin pressure.

Stale content can be served only when explicitly permitted and still
authorized under the current policy.
Do not serve stale authorization as proof that a revoked follower is allowed.
In an authorization outage, fail closed instead of returning a fake empty
success or private content.
Cache policy must distinguish public data from user-specific results.
See [caching and infrastructure](SHARDING-CACHING-AND-INFRASTRUCTURE.md).

## 13. Ranking is a product contract

Chronological ordering is the simplest baseline.
If the product later ranks posts, record model or policy version, candidate
eligibility, ordering tie breakers, and the snapshot boundary in the cursor.
A change in ranking version between pages may require a refresh rather than
silently reordering previously traversed results.
Bound candidate generation and scoring work; leave room for graceful failure.

Filter unauthorized and deleted items before exposing any score or snippet.
Consider fairness, relevance, and the diversity of authors explicitly rather
than assuming high engagement is always desirable.
An experiment should compare observed latency, completeness, and user
outcomes against the simpler chronological feed.

## 14. Trending is an aggregate, not a truth oracle

Specify the eligible population and event types before counting.
A sliding window needs a duration, event time semantics, late-event allowance,
deduplication, and a rule for edits and deletes.
Decide whether private or blocked content can contribute; do not leak private
posts through labels, counts, or drill-down results.
The resulting top-k is a partial, delayed projection with a stated freshness
status.

Apply bounded defensive controls such as rate limits, account and bot signals,
anomaly review, and auditable appeal or correction paths.
Do not claim any detector is perfect.
An abuse defense itself can misclassify legitimate users.
The original line 1120 says “GET /trending returns from cache (sub-ms)”;
that is an illustrative note, not a universal latency guarantee.
Measure the complete request including authorization and network costs.

## 15. Search and likes have separate consistency

A search index is asynchronously populated from committed events.
It may miss recent posts or retain deleted references.
On search, rehydrate and authorize candidates before returning snippets.
Show that results can be incomplete rather than treating the index as the
post store.
Bound query complexity and candidate scans.

Model a like as the unique relationship `(user_id, post_id)`.
`PUT /posts/post-101/likes/me` establishes that caller's relationship with an
idempotent intended effect; an authorized `DELETE` removes it.
A POST needs an explicit scoped idempotency contract if retries must be safe.
An asynchronously updated count may lag the authoritative relationships.
Do not increment it on every duplicated request.

## 16. REST, GraphQL, and batching

Start with a bounded REST timeline response containing post summaries and a
cursor.
If screens need multiple related resources, measure payload size, round trips,
backend calls, and end-to-end tail latency before choosing a REST aggregate or
GraphQL.
GraphQL can select a useful shape, but nested fields can create N+1 queries
and expensive unbounded work.

Request-scoped DataLoader batching can combine repeated lookups inside one
request; it is not a global cache and cannot bypass per-reader authorization.
Bound query depth, field cost, list length, timeout, and resource consumption.
Authorization applies per object and field in either interface.
See [GraphQL execution](GRAPHQL-EXECUTION-AND-BATCHING.md) and
[GraphQL cost](GRAPHQL-COST-CACHING-AND-EVOLUTION.md).

## 17. Notifications, DMs, presence, replay

An SSE or WebSocket event can hint that a timeline has changed.
Push to a sleeping device may be delayed, duplicated, or suppressed.
Keep notification payloads minimal and reauthorize on opening the post.
The durable post and current timeline are the recovery source, not the hint.
Retained event cursors allow replay; an expired cursor requires an authorized
snapshot and reset.
Deduplicate events, bound reconnect loops, and use backoff with jitter.

Direct messages need a separate durable message and per-device delivery model;
a socket connection alone is not delivery or human reading.
Presence is an expiring estimate, not a guaranteed fact.
Apply backpressure and bounded queues so slow clients do not exhaust memory.
See [realtime recovery](REALTIME-RECOVERY-AND-FLOW.md),
[push delivery](PUSH-NOTIFICATION-DELIVERY.md), and
[messaging](CASE-WHATSAPP-MESSAGING.md).

## 18. Walk through a failure

1. `author-1` submits `post-101` using `post-101-a`.
2. The database atomically commits the post, request record, and outbox row.
3. The response is lost; a retry returns the same post.
4. The relay delivers the same event twice.
5. Three unique recipient jobs create at most three timeline references.
6. `reader-2` is blocked while one job is waiting.
7. The late job may still leave a reference, but serving filters it.
8. A different reader sees a lag status if their materialization is behind.
9. A cache miss invokes a bounded fallback, not an unlimited rebuild storm.
10. A search result is separately rechecked against current authorization.

If the transaction fails before commit, neither post nor outbox row exists.
If the consumer fails before its transaction commits, it can retry.
If an authorization dependency fails, do not reveal a possibly private post.
If a post is deleted, current serving filters it even before cache cleanup.

In a real deployment, test recovery against the actual data stores and
delivery system as well as a local model.
One process can die after an external side effect but before recording a
receipt, so external operations require their own stable idempotency contract.
The local database constraints below cannot prove cross-service atomicity.

<details class="learning-answer">
<summary>Predict: two fanout attempts for the same post and recipient create how many entries?</summary>
<p>At most one effective entry, enforced by the unique post and recipient key. Attempts and execution time may still be duplicated.</p>
</details>

## 19. What to observe and rehearse

Track post acceptance and conflict rates, outbox age, fanout task backlog,
oldest pending task, duplicate receipts, and dead-letter counts.
Track timeline read latency, fallback rate, completeness status, filtered
candidates, authorization failures, and cache memory.
For ranked feeds measure candidate coverage and rank-version resets.
For search and trends measure projection lag and late corrections.

Practice lost replies, duplicate events, partial fanout, worker crashes,
revoked memberships, stale cache reads, and unavailable policy authority.
Set recovery objectives from measured demand and resource limits.
A queue that keeps accepting work faster than it drains is not a recovery
strategy; shed or defer work with an explicit user-visible contract.
See [capacity and backpressure](BACKPRESSURE-AND-CAPACITY.md).

## 20. Compare and transfer

The [photo feed exercise](CASE-INSTAGRAM-FEEDS-AND-MEDIA.md) adds immutable
media validation and publication.
The [video upload exercise](CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md) explores
processing a different kind of content.
The [playback exercise](CASE-NETFLIX-PLAYBACK.md) distinguishes
control-plane authorization from delivering media bytes.
Do not infer a production architecture from any of these fictional cases.

<details class="learning-answer">
<summary>Changed condition: reads are rare and each user follows only a few authors. Keep fanout?</summary>
<p>Probably not. An indexed pull can be cheaper and easier to recover. Keep it until observed read costs justify the additional write amplification and freshness machinery.</p>
</details>

<details class="learning-answer">
<summary>Transfer: how does this help a private classroom announcement feed?</summary>
<p>Store announcements authoritatively and pull by current enrollment first. If measured reads require materialization, cache only announcement references and recheck enrollment and removals at serving time. A stale list must not grant an ex-student access.</p>
</details>

## 21. Offline practice and next steps

The companion test uses in-memory SQLite to probe atomic post/idempotency and
outbox writes, unique recipient jobs and entries, and logical fanout counts.
It also models candidate filtering, not a production social graph.
It does not run a broker, processing workers, network service, or Pact.
Run only the relevant selector from the repository root:

```sh
node --test tests/case-timelines.test.mjs
```

Change a recipient or retry count and predict what should remain unique.
Then change the follower count and recompute logical reference volume without
claiming a throughput benchmark.
Return to [requirements and estimation](REQUIREMENTS-AND-ESTIMATION.md) and
[case-study transfers](CASE-STUDY-TRANSFERS.md) for additional practice.
