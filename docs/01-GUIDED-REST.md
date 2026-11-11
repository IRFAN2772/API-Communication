# Phase 1 — Design the course API as requirements change

The learning platform from [Phase 0](00-GUIDED-FUNDAMENTALS.md) still has
`course-101`, **API Fundamentals**, with 30 available seats. A browser needs
to read it, an administrator needs to manage courses, and a learner needs to
enroll. Follow those needs in order; the point is to make a suitable contract,
not to climb a ladder of newer technologies.

All of the original [Phase 1 reference](01-REST-APIS.md) remains available.
The [course content map](COURSE-CONTENT-MAP.md) connects the wider course;
the [content corrections](CONTENT-CORRECTIONS.md) qualify reference claims.
The four linked lessons below are complete continuations of this journey, not
throwaway sidebars: follow the one that addresses the question at hand.

**State convention.** `seats` means seats currently available, not capacity.
Start with 30 for course-101. The enrollment in Step 4 leaves 29; subsequent
examples retain 29 unless an explicitly independent snapshot says otherwise.
Only course-102 is created in the administrator example. Example IDs, tokens,
and entity tags are illustrative, not credentials or live endpoints.

## Route through the reference

| Original family | Follow the journey | Reference |
| --- | --- | --- |
| Part 1: resources, URLs, methods | [Resources](#rest-resources) | [What is REST?](01-REST-APIS.md) |
| Part 2: requests, responses, JSON, status | [Messages](#rest-messages) | [Request and response](01-REST-APIS.md) |
| Part 3: paths, queries, filtering, pagination | [Collections](#rest-collections) | [Real-world design](01-REST-APIS.md) |
| Part 4: safety, idempotency, retries | [Retries](#rest-retries) | [Distributed systems](01-REST-APIS.md) |
| Part 5: HTTP caching | [Caching](#rest-caching) | [HTTP caching](01-REST-APIS.md) |
| Part 6: production REST | [Production](#rest-production) | [Production REST APIs](01-REST-APIS.md) |
| Final REST/GraphQL discussion | [Data shape](#rest-data-shape) | [Why REST Was Not Enough](01-REST-APIS.md) |

<span id="rest-resources"></span>
## Step 1 — Find a course before changing anything

The browser is the **client**: it asks for information and renders the
answer. The Course API is the **server**: it checks the request, obtains
course data from its storage, and returns a response. The database is not
the public API, and a client does not need to know its table layout.

A **resource** is the thing the interface identifies, such as a course or
an enrollment. A URI identifies it; `/courses/course-101` identifies one
course, while `/courses` identifies a collection. The path segment
`course-101` selects this course; it is not an instruction to create it.
Another URI can identify an enrollment belonging to that course.

HTTP supplies the request method and response semantics. A method tells the
server what operation is requested on a target. JSON is one possible
representation format for the data, not a synonym for HTTP or REST.
REST is an architectural style; using URLs and JSON alone does not establish
all of its constraints. Here we design a resource-oriented HTTP interface,
including stateless requests: each carries the context needed to handle it.

The learner asks for a representation:

```http
GET /courses/course-101 HTTP/1.1
Host: learn.example
Accept: application/json
```

The request is an HTTP/1.1 **excerpt**, not a complete wire recording.
An illustrative response excerpt follows; framing headers and wire line
endings are deliberately omitted throughout this lesson.

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"id":"course-101","title":"API Fundamentals","seats":30}
```

The client displays **API Fundamentals — 30 seats available**. A read does
not reserve a seat. The representation might be generated from storage and
is a view of the resource, not necessarily every field stored on the server.

**Safe** means the client does not request a state-changing effect; a server
can still log a GET. **Idempotent** means repeating the same request has the
same intended effect as doing it once, not that every response is identical.
GET is both safe and idempotent. Another learner can enroll between two GETs,
so the body may change from 30 to 29 even though the GETs remain safe.

<details class="learning-answer">
<summary>Predict: can a GET be safe if the second answer has fewer seats?</summary>
<p><strong>Reasoning:</strong> Yes. Another request can change the course between
reads. The client did not ask either GET to reserve a seat, and response
equality is not the definition of safety or idempotence.</p>
</details>

## Step 2 — An administrator needs to add and edit a course

The catalogue now needs a second course. Under this example contract, an
authorized administrator POSTs to the collection; the server assigns the
new ID. The body contains the complete writable course fields, `title` and
`seats`. An ID is server-owned; `title` is a nonempty string, and `seats` is
a nonnegative integer. This small schema is deliberately complete for these
examples, not a claim about a real course platform.

```http
POST /courses HTTP/1.1
Host: learn.example
Content-Type: application/json
Accept: application/json

{"title":"REST Studio","seats":20}
```

```http
HTTP/1.1 201 Created
Location: /courses/course-102
Content-Type: application/json

{"id":"course-102","title":"REST Studio","seats":20}
```

`201` means this contract has created the course; `Location` identifies the
new resource. POST alone does not guarantee retry safety. If the response is
lost, an uninformed retry could create a second course.

For a complete replacement, PUT to the known course URI supplies **both**
writable fields. Under this contract, omitting either required field is a
`400` validation error; omission does not secretly preserve it. For a
partial edit, PATCH uses the declared JSON Merge Patch format. An absent
field is unchanged; `null` would remove a field in that format and is
rejected here for these required fields. PATCH is not inherently idempotent:
its effect depends on the patch format and operation.

This independent editing snapshot starts after creation but before the
enrollment in Step 4; it does not change the main timeline:

```http
PUT /courses/course-102 HTTP/1.1
Host: learn.example
Content-Type: application/json

{"title":"REST Workshop","seats":20}
```

The resulting course-102 has title `REST Workshop` and 20 seats. A subsequent
partial edit in **that same snapshot** is:

```http
PATCH /courses/course-102 HTTP/1.1
Host: learn.example
Content-Type: application/merge-patch+json

{"title":"REST Studio"}
```

The title returns to `REST Studio`; the omitted `seats` stays 20. This
example uses a specific patch format, not a universal rule that every PATCH
body is a merge patch.

DELETE removes the target under the example contract. In another independent
snapshot, `DELETE /courses/course-102` returns `204 No Content` with **no
response body**; a repeat may return `404` because it is already absent.
The intended effect remains absence, so DELETE is idempotent despite
different statuses. This snapshot does not delete course-102 from the
following collection. A real platform may prohibit deletion of a course
with enrollments; authorization and business constraints still apply.

<details class="learning-answer">
<summary>Predict: can a PUT omitting seats be treated as our partial edit?</summary>
<p><strong>Reasoning:</strong> No. This example's PUT requires the complete
writable representation and rejects the missing required field. Use the
declared PATCH format for an edit that leaves seats unchanged.</p>
</details>

<span id="rest-messages"></span>
## Step 3 — Make success and failure understandable

The request line combines a method, a target, and an HTTP version. Headers
carry metadata: `Content-Type` describes the sent body; `Accept` expresses
response media types the client can understand. The response has a status,
headers, and sometimes content. A JSON object uses quoted property names,
strings, numbers, arrays, booleans, and null; it does not itself specify
whether an operation succeeded.

Status codes communicate a broad result, while a documented body explains
details. The following are *this API's policy examples*, not the only
possible mapping for every API:

| Situation | Status | What the client can do |
| --- | --- | --- |
| Malformed JSON or invalid required field | `400 Bad Request` | Correct the request. |
| Missing or invalid authentication | `401 Unauthorized` | Authenticate; the response includes an applicable `WWW-Authenticate` challenge. |
| Authenticated learner tries administrator creation, or accesses another learner's private enrollment | `403 Forbidden` | Do not assume identity alone grants ownership or admin rights. |
| Course or enrollment not found | `404 Not Found` | Check the target; an API may also conceal a forbidden resource. |
| Same retry key used for a different intent, or duplicate enrollment under this policy | `409 Conflict` | Resolve the conflict instead of blindly resending. |
| Stale `If-Match` precondition | `412 Precondition Failed` | Fetch current state and review the change. |
| Unsupported request body media type | `415 Unsupported Media Type` | Send a supported `Content-Type`. |
| Rate limit exceeded | `429 Too Many Requests` | Respect `Retry-After` when supplied and back off. |
| Temporarily unavailable dependency or service | `503 Service Unavailable` | Retry only when appropriate, with limits and backoff. |

A structured error can use the Problem Details media type, with stable
machine-readable `type` and a human-readable explanation:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{"type":"https://learn.example/problems/invalid-course","title":"Invalid course","status":400,"detail":"seats must be a nonnegative integer"}
```

The status line is authoritative for the HTTP exchange; a problem body
adds context and should not expose secrets. `204` and `304` responses have
no content. HEAD requests have GET-like metadata but no response content.
Their header and framing details matter: study the complete
[HTTP contracts lesson](lessons/REST-HTTP-CONTRACTS.md) before implementing
them, including content negotiation, errors and conditional requests.

<details class="learning-answer">
<summary>Predict: learner-7 has a valid token but requests learner-8's private enrollment. Is that an authentication failure?</summary>
<p><strong>Reasoning:</strong> The token establishes an identity; ownership is
a separate authorization decision. This example can return 403, or conceal
the resource with 404 under an explicitly documented policy.</p>
</details>

<span id="rest-collections"></span>
## Step 4 — The catalogue grows; learner-7 enrolls

Return to the main timeline: course-101 has 30 seats and course-102 has
20. The new course exists because of the Step 2 POST; no independent edit
or deletion carries over. First, learner-7 enrolls using the same nested
resource as Phase 0. Authentication identifies the learner, so this example
does not require a learner ID in the request body.

```http
POST /courses/course-101/enrollments HTTP/1.1
Host: learn.example
Authorization: Bearer example-token
Idempotency-Key: enroll-7-a
```

```http
HTTP/1.1 201 Created
Location: /courses/course-101/enrollments/enrollment-42
Content-Type: application/json

{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"}
```

With no competing writes, committing that enrollment reduces course-101
from 30 to **29**. It does not alter course-102. A list read now returns
these two fixtures:

```json
{
  "courses": [
    {"id": "course-101", "title": "API Fundamentals", "seats": 29},
    {"id": "course-102", "title": "REST Studio", "seats": 20}
  ]
}
```

As the catalogue grows, a client can ask for a subset instead of downloading
everything. A path identifies the collection; a query describes the view.
For example:

```http
GET /courses?minSeats=20&sort=title&limit=1 HTTP/1.1
Host: learn.example
Accept: application/json
```

For this example, `minSeats` is inclusive, `sort=title` sorts ascending, and
`limit=1` returns at most one matching item. Both fixtures match; API
Fundamentals sorts first. The server breaks title ties using the unique ID,
making `(title, id)` a stable ordering for a fixed set of records.

```json
{
  "courses": [
    {"id": "course-101", "title": "API Fundamentals", "seats": 29}
  ],
  "nextCursor": "opaque-page-token"
}
```

The client treats `opaque-page-token` as an opaque token, not as a course
ID or a value to construct. It follows the documented continuation:

```http
GET /courses?minSeats=20&sort=title&limit=1&cursor=opaque-page-token HTTP/1.1
Host: learn.example
```

```json
{
  "courses": [
    {"id": "course-102", "title": "REST Studio", "seats": 20}
  ],
  "nextCursor": null
}
```

These pages assume no intervening changes. In a **live** traversal, inserted,
deleted, or renamed courses may change which records appear between pages;
a stable tie-breaker alone does not make a snapshot. A snapshot-based cursor
can instead pin a consistent view, at a storage and lifetime cost. Bind the
cursor to the filter and ordering, validate it on the server, and document
expiration and what happens when the view changes.

Offset/page-number pagination is useful for small or relatively stable lists
and direct jumps. Deep offsets may become expensive, and concurrent inserts
can shift records. A cursor can help with continuation, but neither approach
is universally fastest: actual indexes, query plan, sort, dataset, and
consistency requirements determine cost. The complete
[collections and caching lesson](lessons/REST-COLLECTIONS-AND-CACHING.md)
works through search, indexing, pagination choices and cache behavior.

<details class="learning-answer">
<summary>Predict: do a title sort and a cursor guarantee a snapshot when a course is renamed between pages?</summary>
<p><strong>Reasoning:</strong> No. The tie-breaker orders a fixed set, but a
rename can move a record across the continuation boundary. A snapshot needs
an explicit consistent-view mechanism and a defined lifetime.</p>
</details>

<span id="rest-retries"></span>
## Step 5 — The enrollment response is lost

Revisit the **same** Step 4 enrollment by rewinding only its response
timeline: before the request, course-101 has 30 seats; after the successful
commit, it has 29 and enrollment-42 exists. The server sends `201`, but the
network loses the response. The client sees a timeout, not proof that the
commit failed.

```text
learner-7     POST, key enroll-7-a  --->  Course API
                                                commit enrollment-42; seats 30 -> 29
learner-7     <--- response lost ------------  201 Created
learner-7     same POST, same key ----------->  replay recorded outcome
```

Text alternative: the first request commits, its response is lost, and the
same logical request is retried using the same key. Under this contract the
retry returns the recorded enrollment-42 outcome, leaving 29 seats.

The key is scoped to the authenticated caller and the enrollment operation.
Before the documented expiry, a matching request with the same key receives
the recorded outcome; reuse for a different intent returns `409`. For
example, using `enroll-7-a` for course-102 must not silently return
course-101's enrollment or create another enrollment. Different systems
choose different scopes, expiry periods and behavior for an in-flight key;
clients must follow the actual contract.

The outcome depends on implementation, not the header alone. The server
must coordinate claiming the key, committing the enrollment and seat change,
and recording the outcome atomically or with an equivalent recovery design.
It must also decide how concurrent retries wait or receive an in-progress
response. After expiry the key may no longer prevent a duplicate; an
enrollment uniqueness rule is useful but does not deduplicate all effects.

Email or payment involves another system: a local database transaction does
not automatically make that external effect exactly once. Durable work
records, provider idempotency where supported, and reconciliation can help,
but each has failure cases. See
[Phase 0 retry correctness](00-GUIDED-FUNDAMENTALS.md#phase0-retry-correctness)
and the complete [reliability and operations lesson](lessons/REST-RELIABILITY-AND-OPERATIONS.md).
Bound retries with a deadline, backoff and jitter; retries under overload can
make recovery harder.

<details class="learning-answer">
<summary>Predict: after the lost response, should a client invent a new key and retry?</summary>
<p><strong>Reasoning:</strong> No. A new key describes a new attempt to this
contract and might repeat effects. Retry the same intent with the same scoped
key before expiry; after expiry follow the documented recovery procedure.</p>
</details>

<span id="rest-caching"></span>
## Step 6 — Repeated reads need less work, without hiding changes

The catalogue is read often. A cache stores a response for possible reuse;
it can be in a browser or an intermediary. Freshness is a policy, not proof
that the origin cannot change. This example starts from the main state after
enrollment: course-101 has 29 seats.

At time zero an authorized client receives this **private** representation:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=60
ETag: "course-101-v1"
Vary: Accept

{"id":"course-101","title":"API Fundamentals","seats":29}
```

For 60 seconds, its private cache can reuse the fresh response without asking
the origin, subject to normal cache rules. `private` prevents storage by
shared caches, but permits a private cache; use `no-store` for sensitive
responses that should not be stored by caches. Authorization alone is not
a blanket permission for shared caching. Avoid caching personalized
enrollment data in a shared cache, and choose a policy deliberately.

`Vary: Accept` tells a cache to consider the request's `Accept` when
selecting a stored response. `Vary` distinguishes representation variants;
it is not authorization or a substitute for private/no-store policy.
The ETag is an opaque validator for this representation, not a timestamp or
a seat count.

After freshness expires, the client can revalidate:

```http
GET /courses/course-101 HTTP/1.1
Host: learn.example
Authorization: Bearer example-token
Accept: application/json
If-None-Match: "course-101-v1"
```

If unchanged, the server sends a bodyless `304` and relevant metadata:

```http
HTTP/1.1 304 Not Modified
Cache-Control: private, max-age=60
ETag: "course-101-v1"
Vary: Accept
```

The cache updates metadata and reuses its stored 29-seat body; `304` does not
contain a new JSON body. Now suppose, in this independent cache continuation,
another learner successfully enrolls and available seats fall to 28. After
the stored response becomes stale, the same old validator yields:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=60
ETag: "course-101-v2"
Vary: Accept

{"id":"course-101","title":"API Fundamentals","seats":28}
```

The changed `200` replaces the cached representation. This 28-seat
continuation is isolated; subsequent production and data-shape examples
return to the main snapshot at 29.

Validators can also protect writes. Suppose two administrators fetch
course-101 at strong ETag `"course-101-v1"`. One changes the title, producing
`"course-101-v2"`; the other submits a complete replacement using the old
precondition:

```http
PUT /courses/course-101 HTTP/1.1
Host: learn.example
Content-Type: application/json
If-Match: "course-101-v1"

{"title":"API Fundamentals Revised","seats":29}
```

The server returns `412 Precondition Failed` and does not apply the stale
replacement. The editor should fetch the current representation, review
both changes, merge deliberately, and submit a new conditional request.
Blindly retrying without the condition could overwrite the other editor.
Strong validators are required for `If-Match` comparison. Caching policy,
validator generation, and write concurrency are distinct design decisions.

<details class="learning-answer">
<summary>Predict: is no-cache the same as no-store?</summary>
<p><strong>Reasoning:</strong> No. No-cache allows storage but requires
successful validation before reuse; no-store directs caches not to store the
response. Private restricts shared caches and is a different directive.</p>
</details>

<span id="rest-production"></span>
## Step 7 — Operate the contract as more clients depend on it

The platform now has learners and administrators. Authentication establishes
who is calling; authorization evaluates whether that caller can perform this
action on this resource. A valid learner token should not create a course or
read someone else's private enrollment merely because it is valid. Validate
credentials at the appropriate trust boundary and enforce ownership and role
checks in the service. Avoid putting tokens in URLs or logs.

As clients multiply, changing the API needs a compatibility plan. Suppose
the course response adds an optional `description`: tolerant existing
clients can continue to read `id`, `title`, and `seats`. But clients with
strict schemas may reject an extra field, so test actual consumers rather
than declaring every addition safe. Renaming `seats` or changing its meaning
breaks the agreed contract. Offer a migration period and versioning strategy
when a compatible change is not possible, communicate deprecation, and
observe remaining old-client traffic before removal.

Demand also has a cost. Suppose a learner is allowed 60 catalogue requests
per minute under an advertised policy. Request 61 within the enforced window
can receive `429` and `Retry-After`; the client waits rather than spinning.
Document the scope, window, and enforcement behavior, since distributed
limits are not necessarily exact. A rate limit is not a substitute for
authorization, and an expensive search may need a different budget from a
simple course read.

Before deploying, the complete
[authentication and evolution lesson](lessons/REST-AUTH-AND-EVOLUTION.md)
explains credential choices, access control, compatible changes and
deprecation. The [reliability and operations lesson](lessons/REST-RELIABILITY-AND-OPERATIONS.md)
covers deadlines, retry amplification, circuit breakers, gateways, logs,
metrics, and traces. These mechanisms address different failure modes; a
gateway or circuit breaker alone does not make a backend reliable.

<details class="learning-answer">
<summary>Predict: does adding a JSON field always preserve compatibility?</summary>
<p><strong>Reasoning:</strong> No. It is often compatible with tolerant
readers, but strict consumers can reject an unknown field. Check the actual
contract and consumers, then plan and monitor the rollout.</p>
</details>

<span id="rest-data-shape"></span>
## Step 8 — A page needs a different shape, not necessarily a different protocol

The course page currently needs title and seats, and one REST GET is enough.
Now a dashboard wants course details, learner enrollment, and progress on
the same screen. Multiple requests may increase latency; a large response
may include fields the screen does not need. Measure actual round trips,
payload size, client needs, and access rules before deciding on a remedy.

REST can address this in several legitimate ways: a purpose-built aggregate
endpoint combines authorized data; a backend-for-frontend (BFF) gathers and
shapes data for a particular client; or a documented field-selection parameter
returns a subset. Each adds contract, authorization, cache and maintenance
decisions. An aggregate cannot skip ownership checks merely because it joins
data from several sources.

GraphQL is a competing option when client-selected shapes and many distinct
consumers justify its schema, resolver, query-cost and caching trade-offs.
It is not a mandatory next stage or a replacement for every REST API. Read
the [GraphQL journey](02-GUIDED-GRAPHQL.md) as the **next comparison**, not an
automatic upgrade.
The [original GraphQL reference](02-GRAPHQL.md) remains available alongside
the new journey; none of its topics or examples is removed.

Suppose requirements change again: one page still needs only the title and
seat count, and progress can be several seconds old. Keeping the existing
REST read and using bounded polling for progress may be simpler than a
GraphQL layer or a persistent live connection. If freshness or load needs
change, re-evaluate with measurements; polling and REST are not universally
best either.

<details class="learning-answer">
<summary>Choose: one course read and progress every 30 seconds; must the team introduce GraphQL or a live socket?</summary>
<p><strong>Reasoning:</strong> No. If that freshness and request volume meet
the measured need, keep the REST read and simple polling. Revisit the choice
when the data shape, latency, or scale changes.</p>
</details>

### Transfer the reasoning: a book loan

Imagine a library with a book copy and a borrower. A read of
`/copies/copy-17` can show availability without loaning it. A loan command
must check availability and authorization and record the loan consistently.
If the loan commits but the response is lost, repeating an unprotected
creation request could produce duplicate effects. A documented, scoped
idempotency key and a uniqueness constraint can support a safe retry, with
the same expiry, concurrency and external-effect caveats as enrollment.
The resource names change; the uncertainty about a lost response does not.

<details class="learning-answer">
<summary>Predict: a library loan succeeds but its reply is lost. Does a timeout prove the book is still available?</summary>
<p><strong>Reasoning:</strong> No. The commit may already have happened.
Recover the recorded outcome through the documented retry or lookup contract
rather than assuming failure and issuing a new independent loan.</p>
</details>

## Check your understanding

1. Identify the client, server, resource, method, representation, and seat
   change in the course read and enrollment. Why is JSON not HTTP?
2. Contrast a complete PUT with this lesson's merge PATCH. What happens when
   `seats` is absent from each?
3. Explain why a second DELETE may return 404 without violating its
   idempotent intended effect, and why GET bodies can differ over time.
4. Walk through both pages of the two-course collection. What can change
   between pages in a live traversal, and what would a snapshot require?
5. Explain the lost enrollment response, scoped key, expiration, and why
   an external email is not automatically exactly once.
6. Trace fresh cache reuse, `304`, changed `200`, and `412`. Why must the
   editor review a concurrent change before trying again?
7. Distinguish identity from ownership, compatibility from version labels,
   and a measured data-shape need from a technology upgrade narrative.

## Sources to verify the contracts

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) —
  methods, status codes, representations, conditional requests and HEAD.
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) —
  freshness, validation, authorization, storage and cache directives.
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) —
  the problem details format and media type.
- [RFC 7396: JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396.html) —
  omitted members and null in the patch format used here.
- [MDN: HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods) —
  a practical reference for HTTP method semantics.
