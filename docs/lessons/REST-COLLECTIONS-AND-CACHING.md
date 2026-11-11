# REST lesson: collections, pagination, and caching

The learning platform has two courses: `course-101`, **API Fundamentals**,
with 30 available seats; and `course-102`, **REST Studio**, with 20. Learner
`learner-7` can browse this catalogue before enrolling. This lesson starts
with a two-item collection, then grows it to expose real pagination and
cache trade-offs.

Read [HTTP contracts](REST-HTTP-CONTRACTS.md) for methods, JSON and status
semantics. The [guided REST journey](../01-GUIDED-REST.md),
[complete original REST reference](../01-REST-APIS.md),
[Phase 0](../00-GUIDED-FUNDAMENTALS.md),
[all-topics map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md) are companion routes.
Examples describe an imaginary API, not an existing deployed service.

Jump to [pagination](#pagination) or [conditional validation](#validation).

## 1. Ask for the useful part of a collection

Suppose the catalogue offers these optional query parameters:

| Parameter | This API's declared meaning |
| --- | --- |
| `minSeats` | Non-negative integer; include courses with at least that many available seats. |
| `search` | Case-insensitive substring of the title; not a full-text ranking promise. |
| `sort` | `title` for ascending case-folded title and then ascending ID; `-title` for descending case-folded title and then ascending ID. |
| `limit` | Integer from 1 through 20, default 20. |
| `cursor` | An opaque continuation returned by this API, not a client-generated offset. |

These are choices of this contract, not mandatory REST parameter names.
For example, the following is a **request-line excerpt**, not a full HTTP
request:

```http
GET /courses?minSeats=20&search=api&sort=title&limit=2 HTTP/1.1
```

Filtering tests a predicate; searching finds titles matching user input;
sorting establishes order; the limit bounds the page. Here the result
contains only course 101: its title contains `api`, and its 30 seats satisfy
the filter. Search is case-insensitive, not automatically a synonym,
stemming, relevance or typo-tolerance feature. Encode query values correctly
when they contain spaces, `&`, or other reserved characters.

For this lesson, unsupported sort fields, malformed integers, a negative
`minSeats`, a `limit` of zero or greater than 20, and invalid or mismatched
cursor tokens receive `400 Bad Request`. The API does not silently clamp a
limit or interpolate an unchecked sort expression into a query. It reports
the problem in the error format described in the contracts lesson. A client
can rely on predictable rejection rather than guess which input was ignored.

### What the collection returns

This is a JSON **body excerpt** for the initial catalogue with `limit=2`
and `sort=title`; `nextCursor` is null because there is no next page:

```json
{"courses":[{"id":"course-101","title":"API Fundamentals","seats":30},{"id":"course-102","title":"REST Studio","seats":20}],"nextCursor":null}
```

The `courses` array contains course representations, while the envelope
contains navigation metadata. `nextCursor: null` is distinct from an absent
member; the contract promises this member even at the end. Total counts can
be expensive or change while paging, so this API does not promise one.
For a tiny, bounded catalogue, returning both items is often simpler than
pagination. Add paging when response size, memory, or latency justifies it.

<details class="learning-answer">
<summary>Predict: what does minSeats=21 return?</summary>
<p>With the initial catalogue it returns course 101 only. The predicate is at least 21, so the course with 20 seats is excluded. It says nothing about whether learner 7 will be able to reserve a seat later.</p>
</details>

<a id="pagination"></a>

## 2. Offset paging and a concrete duplicate

Offset paging skips a number of items in a defined ordering, then takes a
page. A contract might expose `offset=0&limit=1`, then
`offset=1&limit=1`. For a stable two-item list sorted by title and ID:

| Moment | Ordered IDs | Request | Returned IDs |
| --- | --- | --- | --- |
| Before insertion | `course-101`, `course-102` | offset 0, limit 1 | `course-101` |
| Still unchanged | `course-101`, `course-102` | offset 1, limit 1 | `course-102` |

Now insert `course-100`, **Advanced API**, before the second request. It
sorts ahead of API Fundamentals. The following trace starts again at the
first page, then inserts that course between requests:

| Moment | Ordered IDs | Request | Returned IDs |
| --- | --- | --- | --- |
| First read | `course-101`, `course-102` | offset 0, limit 1 | `course-101` |
| After insertion | `course-100`, `course-101`, `course-102` | offset 1, limit 1 | `course-101` |

The second page duplicates course 101 because the first position now belongs
to the new course. Deletion before the offset can instead cause a skip.
Offset is still useful for modest stable lists and direct page jumps. It does
not, by itself, create a snapshot across requests.

### Use a keyset boundary instead

For ascending `sort=title`, order by the pair `(case-folded title, id)` under
the service's documented collation. For these ASCII example titles, compare
their lowercase forms lexicographically. ID is a unique tie-breaker, so two courses
with equal titles still have a definite order. If page one ends at
`("API Fundamentals", "course-101")`, the next page selects pairs strictly
greater than that pair, then applies the same limit.

After the insertion above, course 100 sorts **before** the boundary and
course 102 sorts after it. The next page returns course 102, not a second
copy of course 101. Course 100 is not seen in this traversal: this is a
declared **live view**, not a snapshot. Later insertions after the boundary
may appear. Deletions, title edits, and filter changes can cause omissions
or repeats; clients needing a frozen export need a separately designed
snapshot/version contract.

### Follow the exact opaque continuation

Assume the initial first page is requested with `sort=title&limit=1`.
This is its JSON **body excerpt**:

```json
{"courses":[{"id":"course-101","title":"API Fundamentals","seats":30}],"nextCursor":"c1-example-opaque"}
```

The server generated the token for the boundary and the original query.
The client treats `c1-example-opaque` as uninterpreted, rather than
constructing or decoding it. The exact next **request-line excerpt** is:

```http
GET /courses?sort=title&limit=1&cursor=c1-example-opaque HTTP/1.1
```

With the earlier insertion, the next JSON **body excerpt** is:

```json
{"courses":[{"id":"course-102","title":"REST Studio","seats":20}],"nextCursor":null}
```

The example token is illustrative, not an encoding specification.
The service validates that the continuation is usable with the same filter,
search, sort, and limit; altered or expired tokens are rejected with 400.
It must protect any token state it trusts, and it must still apply current
authorization. A continuation is not automatically a capability, a database
snapshot, or a promise of constant-time execution.

<details class="learning-answer">
<summary>Predict: what happens to Advanced API in this traversal?</summary>
<p>It sorts before the last returned key, so the next keyset page does not include it. A new traversal can see it. Avoiding the offset duplicate does not mean this live view freezes concurrent changes.</p>
</details>

## 3. Cost follows the actual query

An offset query can need work proportional to the rows it skips; a keyset
query can seek from a boundary when a suitable access path exists. Neither
claim is universal. A composite index aligned with the filters and
`(title, id)` ordering may help one workload, while a substring search may
need a different index or a scan. Collation, selectivity, joins, database
statistics, result size, and writes all affect the plan.

Indexes consume storage and add write costs. Measure representative queries
and inspect their plans rather than promising that adding a cursor or an
index makes every request fast. A sort field exposed by an API creates a
query pattern to support and test; it does not demand an index in every
small deployment.

For illustration only, suppose measured lookup times on one system average
50 milliseconds per database lookup and 1 millisecond per cache lookup.
With 100 independent requests and no caching, database lookup time summed
across requests is 5,000 ms. If all 100 lookups hit an already-warm cache,
the summed cache lookup time is 100 ms. These are aggregate lookup times,
not end-to-end wall-clock latency or throughput; concurrency, misses,
network, serialization, invalidation and cache population are excluded.
Measure those too. REST is not universally faster than another architecture.

## 4. A cache stores a response for possible reuse

An HTTP cache stores eligible responses and can reuse them for matching
requests. A **fresh** response is within its freshness lifetime; a **stale**
one has exceeded it. For example, `Cache-Control: max-age=60` allows reuse
while its calculated age is below 60 seconds, subject to the other cache
rules. Age accounts for time already spent in caches; it is not simply
60 seconds from every browser's receipt.

When stale, a cache can validate with the origin before reuse, or serve stale
only where applicable rules or explicit policy permit. A fresh copy can
still differ from the latest database state after a write. If seats must be
correct for the actual enrollment decision, the server must check and
reserve them atomically; cached catalogue information is not a reservation.

### Directives express different policies

* `public` permits shared caching where it would otherwise be restricted,
  subject to the rest of the rules; it does not automatically make private
  data safe to share.
* `private` prevents storage by shared caches, but permits a private cache
  such as the user's browser to store the response.
* `no-cache` permits storage but requires successful validation before
  reuse. It does not mean “do not store.”
* `no-store` tells caches not to store the request or response for reuse.
  It is not a guarantee against malicious caches, logs, screenshots, or
  every form of local retention.

For a public catalogue, an API might choose `public, max-age=60` only after
deciding that up to that freshness interval of displayed seat staleness is
acceptable. A learner-specific enrollment response might instead use
`private, no-store`. These policies govern HTTP caches, not the database's
own cache.

### Variants, credentials and shared caches

Suppose a course representation varies with language. The response includes
`Vary: Accept-Language`; a cache must consider that request header when
selecting a stored response. A client asking for a different language must
not receive the wrong stored variant. The cache key also includes at least
the request method and target URI, subject to HTTP's matching rules.

An `Authorization` request header restricts shared-cache reuse unless the
response explicitly permits it under HTTP caching rules. Cookies can also
make a response personalized, but a cookie or `Set-Cookie` alone does not
automatically prohibit shared caching. Configure origin and CDN policy
deliberately; avoid `public` for learner-specific content, and do not assume
that a CDN's configured key includes every identity or variant dimension.
`Vary` is not authentication or an authorization check. Review cache keys,
header handling, and privacy boundaries at every intermediary.

<a id="validation"></a>

## 5. Validate an old representation with an ETag

An ETag is an opaque validator for a selected representation, not
necessarily a hash or a global database version. An origin might first send
the following **header/body excerpt**:

```http
HTTP/1.1 200 OK
Date: Wed, 11 Nov 2026 07:40:00 GMT
Cache-Control: public, max-age=60
ETag: "course-101-v1"
Vary: Accept-Language
Content-Type: application/json

{"id":"course-101","title":"API Fundamentals","seats":30}
```

After the stored response becomes stale, the cache sends this conditional
GET **request-header excerpt**:

```http
GET /courses/course-101 HTTP/1.1
Host: learn.example
Accept-Language: en
If-None-Match: W/"course-101-v1"
```

`If-None-Match` uses **weak comparison**. The weak tag above can match the
strong tag with the same opaque value. For GET or HEAD, when it matches the
selected current representation, the origin can send this **header excerpt**
with no content:

```http
HTTP/1.1 304 Not Modified
Date: Wed, 11 Nov 2026 07:41:05 GMT
Cache-Control: public, max-age=60
ETag: "course-101-v1"
Vary: Accept-Language
```

The cache updates its stored metadata as specified by HTTP caching rules and
reuses the stored body. A 304 is not an empty replacement representation.
An origin generating 304 must send the applicable `Content-Location`,
`Date`, `ETag`, and `Vary` fields that would have appeared in the
corresponding 200; normal HTTP Date exceptions apply. Cache directives and
other relevant metadata such as `Cache-Control` and `Expires` convey the
updated policy. The excerpt has no Content-Location or Expires because this
example's corresponding 200 would not contain them.

### Prevent a lost update with If-Match

Two editors read version `"course-101-v1"`. One changes the course and the
server commits version `"course-101-v2"`. The other sends a valid write with
`If-Match: "course-101-v1"`. The server compares against the current
selected representation **strongly** and atomically with the write. It
returns `412 Precondition Failed` without mutation when the condition fails.
A weak validator such as `W/"course-101-v1"` cannot strongly match.

The second editor should fetch the current representation and decide how to
merge, not simply replace the old tag and resend a stale whole-body PUT.
Another change can occur before the reviewed write, so its new precondition
must also be checked atomically. This is concurrency control, not the same
thing as POST deduplication.

### Last-Modified is a coarser validator

An origin can send `Last-Modified` and a cache can use
`If-Modified-Since` for validation. HTTP dates have one-second resolution:
two updates within a second may be indistinguishable by timestamp alone.
Clocks and timestamp maintenance add further limitations. ETags can express
representation-specific revisions more precisely. If both
`If-None-Match` and `If-Modified-Since` are supplied, the former takes
precedence under the HTTP precondition rules.

<details class="learning-answer">
<summary>Predict: can the weak tag safely protect the editor's write?</summary>
<p>No. If-Match requires strong comparison. A weak tag may validate a GET via If-None-Match, but it does not strongly match a write precondition.</p>
</details>

## 6. Separate HTTP caching from application data caching

An HTTP browser or CDN cache stores responses under HTTP rules. An
application cache near the database stores data under application-specific
rules; it is not automatically controlled by a browser's `Cache-Control`.
Both layers can hold a copy of the same course and each needs its own
freshness, privacy, and invalidation design.

### Cache-aside

The application checks the data cache. On a hit it returns the cached
value; on a miss it reads the database and populates the cache. A write
normally commits to the database and invalidates or refreshes the cached
value. A delayed invalidation, failed cache operation, or race between a
miss and a write can reintroduce stale data. Version checks, bounded TTLs,
and reliable invalidation may mitigate this, with different costs.

### Write-through

The write path updates the durable database and cache as part of the
operation, according to a defined order and failure policy. Two separate
systems do not become atomic merely because the application writes both.
If the database succeeds but the cache update fails, invalidate or repair
the cache and decide what the client sees. Avoid advertising success as
fully synchronized without the necessary guarantees.

### Write-back

The application first updates a cache or buffer and persists later.
Acknowledging before durable persistence risks losing accepted writes if
the buffer fails. A durable queue or log, replay, ordering, idempotent
consumers, monitoring, and recovery can reduce that risk but require an
explicit design. Delayed writes also expose stale database reads and can
make conflicting updates hard to reconcile. This is a trade-off, not a
default performance upgrade.

For available seats, a cache is not the authority for deciding the final
seat. The enrollment operation must enforce the capacity invariant in its
authoritative write path. After a successful write, both application data
cache entries and HTTP representations may need invalidation or expiry;
invalidating only one layer leaves the other potentially stale.

## 7. Check your reasoning

1. A title-sorted page ends at course 101. A new earlier title is inserted.
   Compare the next offset page with the next keyset page.
2. A response says `no-cache`. Can it be stored? Can it be reused without
   validation?
3. A public CDN receives a learner-specific response with a cookie. Is the
   cookie alone a sufficient shared-cache privacy policy?
4. An editor supplies a weak ETag to `If-Match`. Can it protect the write?

<details class="learning-answer">
<summary>Compare your reasoning</summary>
<ol>
<li>Offset one repeats course 101; the keyset boundary moves to course 102, while the inserted earlier title is missed in that live traversal.</li>
<li>It may be stored, but must be successfully validated before reuse.</li>
<li>No. Cookies do not automatically prohibit storage or guarantee isolation; choose and enforce a suitable private or no-store policy.</li>
<li>No. If-Match uses strong comparison, so a weak tag cannot match.</li>
</ol>
</details>

## Further reading

[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) specifies HTTP semantics
and conditional requests; [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111)
specifies HTTP caching; [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)
defines Problem Details for API errors. Paging policy, token encoding, data
cache strategy, and seat reservation are application design choices, not
automatic guarantees supplied by those RFCs.
