# REST lesson: HTTP contracts for a course API

A learner opens **API Fundamentals**, course `course-101`, with 30 available
seats. The catalogue also contains **REST Studio**, `course-102`, with 20
available seats. Learner `learner-7` wants to enroll. The contract must let
the learner read a course without accidentally reserving a seat, and must
explain what happens when an enrollment cannot be made.

This lesson builds the messages and decisions, not a particular backend.
After it, continue to [collections and caching](REST-COLLECTIONS-AND-CACHING.md).
The [guided REST journey](../01-GUIDED-REST.md),
[complete original REST reference](../01-REST-APIS.md),
[Phase 0](../00-GUIDED-FUNDAMENTALS.md),
[all-topics map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md) provide other routes.

Jump to [patch semantics](#patch-semantics) or
[failure responses](#failure-responses).

## 1. Identify the thing before choosing the operation

A **resource** is the conceptual thing the API makes addressable; a
**representation** is data describing its current state. The course is not
the JSON bytes: a different representation could describe the same course.
An enrollment is a separate resource recording a learner's participation.

The URI `https://learn.example/courses/course-101` identifies the course in
this example. Its scheme and authority locate the server, and its path
identifies the course there. A URL is a URI that also indicates how to
locate a resource. `/courses` is the collection; a query such as
`?limit=2` modifies a collection request, not the identity of course 101.
Percent-encode characters that cannot appear literally in a URI component.

Plural nouns, lowercase paths and stable identifiers are useful **API
conventions**, not REST laws. A resource need not be a database row, and
REST does not mandate these spellings or JSON. Good names help humans; the
documented links, representations and method semantics make the contract
usable by clients.

## 2. Read the actual message

The following is a complete HTTP/1.1 request without a body. The empty line
after `Accept` ends the header section. The request target contains a path
and query; the scheme and authority are supplied by the connection and Host.

```http
GET /courses/course-101?view=full HTTP/1.1
Host: learn.example
Accept: application/json

```

`GET` is the method, `/courses/course-101?view=full` is the request target,
and `HTTP/1.1` is the version. Headers add metadata. There is no request body
here. A body, when present, begins **after** the blank line; it is not a
header or part of the request line.

This response is a header/body excerpt, not a complete wire transcript:
framing headers have intentionally been omitted.

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"id":"course-101","title":"API Fundamentals","seats":30}
```

The status line reports the outcome; `Content-Type` describes the actual
representation, and the JSON body gives the current available seats.
The response is a snapshot, not a reservation. HEAD requests the metadata
that a corresponding GET would send but has no response content.

<details class="learning-answer">
<summary>Predict: does this GET reserve a seat?</summary>
<p>No. GET is safe: the client requests a read, not an enrollment. The server may log the request, but the client did not request a state-changing operation. The seat count may change immediately after the response.</p>
</details>

## 3. Choose a method by its intended effect

HTTP defines **safe** methods as essentially read-only in their requested
semantics. GET and HEAD are safe. Logging or metering can still occur.
**Idempotent** means repeating the same request has the same intended effect
as sending it once; it does not mean identical responses or no side effects.
GET, PUT and DELETE are idempotent by their HTTP semantics.

For this example the contract uses:

| Method and target | Intended effect |
| --- | --- |
| `GET /courses/course-101` | Read a representation, without requesting a mutation. |
| `POST /courses/course-101/enrollments` | Ask the collection to create an enrollment. |
| `PUT /courses/course-101` | Replace the course representation under the declared writable schema. |
| `PATCH /courses/course-101` | Apply the specified patch document. |
| `DELETE /courses/course-101` | Remove the course, if policy permits. |

POST is **not idempotent by default**: a retry might create a second
enrollment or attempt a second reservation. The application can define
deduplication, for example a durable idempotency key and payload-binding
policy; an HTTP method alone does not provide it. PUT requests replacement,
not an unspecified merge. Repeating a DELETE can return 204 and then 404
while the intended final state remains absent.

## 4. JSON describes values, not operations

JSON supports objects, arrays, strings, numbers, booleans and `null`.
Object keys must be double-quoted strings. JSON has no comments, `undefined`,
unquoted keys, trailing commas, NaN or Infinity. A number is not a quoted
string: `"30"` and `30` have different types. The meaning and accepted ranges
are API schema decisions.

The following JSON and patch examples use an **independent extended-schema
exercise**, not the unchanged minimal course schema from the guided journey.
For this exercise only, suppose the API explicitly adds `published`, `tags`,
and nullable `description` to that schema and documents which are writable.
The minimal contract does not automatically accept any of these fields.

```json
{"id":"course-101","title":"API Fundamentals","seats":30,"published":true,"tags":["api","rest"],"description":null}
```

`description: null` is present with the JSON null value. An absent
`description` member is different. Whether either is permitted or means
anything special depends on the operation and media type. For example, an
assignment-style patch contract might say that an absent member stays as it
was and that present `null` sets a nullable field to null. A full PUT may
instead require every writable field; this API rejects missing required
fields rather than silently retaining them.

<a id="patch-semantics"></a>

## 5. PATCH needs a defined patch language

PATCH alone does not say how a document modifies state, nor does it guarantee
idempotency. Choose and document a media type and its rules. Compare three
possible contracts; the snippets below are **body excerpts**, not complete
HTTP requests.

### A. Application-defined assignment

With `Content-Type: application/json`, this particular API could define
present members as assignments and absent members as unchanged:

```json
{"seats":20,"description":null}
```

Under that explicitly declared contract the new seat count is 20 and the
description becomes null. Applying the same assignments twice has the same
intended result, though a different custom patch language could be
non-idempotent. Validate types and authorization before committing.

### B. JSON Merge Patch

`application/merge-patch+json` uses RFC 7396, which obsoletes RFC 7386.
In an object patch, a member with `null` **removes** the corresponding
member rather than assigning a JSON null. Nested objects merge recursively;
arrays are replaced as whole values. A non-object patch replaces the entire
target. Consequently this format cannot express setting an object member to
JSON null using that member in an object patch.

```json
{"description":null,"tags":["http"]}
```

Here the description member is removed and the entire `tags` array becomes
`["http"]`. A client assuming assignment semantics would lose information.

### C. JSON Patch

`application/json-patch+json` is an ordered array of RFC 6902 operations
using JSON Pointer paths. This body sets a nullable member and then removes
the first tag:

```json
[{"op":"replace","path":"/description","value":null},{"op":"remove","path":"/tags/0"}]
```

`replace` requires the target to exist; `add` has different rules. Array
indices can shift after an operation, and retrying an array removal can
remove another item or fail. Escape `~` as `~0` and `/` as `~1` in a JSON
Pointer token. Apply the whole patch atomically: a failed operation must not
leave earlier operations partially committed. A precondition can prevent a
patch based on an outdated representation from changing current state.

<details class="learning-answer">
<summary>Predict: what does null do in the two object examples?</summary>
<p>In the declared assignment contract it assigns JSON null. In JSON Merge Patch it removes the member. The media type and contract matter; PATCH does not define either interpretation on its own.</p>
</details>

## 6. Negotiate output and reject unsupported input

`Accept` describes response media types the client can use; `Content-Type`
identifies the format of a body actually sent. They are independent. In this
request-header excerpt, the client prefers JSON over plain text:

```http
Accept: application/json;q=1.0, text/plain;q=0.5
Content-Type: application/json
```

The `q` weight ranges from 0 to 1; zero means not acceptable. The server
selects a supported acceptable representation, considering more specific
media ranges and its own selection policy. If it cannot supply an acceptable
representation it may return `406 Not Acceptable`; HTTP also permits a
server to disregard the preference instead. Document the API's choice.

For a request body in a media type the target operation does not support,
return `415 Unsupported Media Type`; do not apply the mutation. The server
must interpret and validate the representation before changing state.
`Accept` is not a request-body validator, and `Content-Type` neither
authenticates nor authorizes the caller. TLS, credential verification,
ownership checks, input validation, and safe rendering are separate
responsibilities. A valid JSON content type is not proof of safe content.

## 7. Respond according to the outcome

These are **status/header excerpts**, not complete wire messages. Each
successful status has different meaning:

* `200 OK`: a successful operation can return a representation; HEAD has no
  response content even when the corresponding GET would.
* `201 Created`: the request created a resource. This API returns
  `Location: /courses/course-101/enrollments/enrollment-42` to identify it;
  a representation of the created enrollment may also be returned.
* `204 No Content`: success with no response content. Do not send a JSON
  body or a Content-Length field on 204.
* `304 Not Modified`: a conditional GET or HEAD can reuse a stored
  representation; 304 has no content. Cache metadata still matters.

Here is the created-enrollment **header/body excerpt**:

```http
HTTP/1.1 201 Created
Location: /courses/course-101/enrollments/enrollment-42
Content-Type: application/json

{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"}
```

A 201's Location identifies the primary created resource; if no Location
is supplied, HTTP identifies it by the target URI. An API contract should
tell clients whether a representation is included. Do not invent a body for
204, 304, or HEAD simply because a normal GET has one.

<a id="failure-responses"></a>

### Diagnose failures without collapsing them into one error

* `400 Bad Request`: this API rejects malformed JSON, invalid query values,
  or a document that violates its declared input rules.
* `401 Unauthorized`: credentials are missing or invalid. Send a suitable
  `WWW-Authenticate` challenge, for example `Basic realm="courses"`.
  This is a syntax illustration; routes protected by bearer credentials
  should issue a challenge appropriate to their actual scheme instead.
* `403 Forbidden`: the server refuses access; for example, learner 7 is
  authenticated but does not own another learner's enrollment. A 403 does
  not itself prove the identity was established.
* `404 Not Found`: the course or enrollment is absent, or the server has a
  deliberate policy of concealing a forbidden resource's existence.
* `409 Conflict`: valid enrollment data conflicts with current state, such
  as an already active enrollment or no remaining seats.
* `412 Precondition Failed`: a supplied `If-Match` does not match the
  current representation; check atomically before making any change.
* `429 Too Many Requests`: rate limit reached. `Retry-After` can advise a
  delay in seconds or an HTTP date; it is not a guarantee of success.
* `503 Service Unavailable`: the service is temporarily unable to handle
  the request, perhaps during maintenance. `Retry-After` can advise when
  to try again. A retry of a non-idempotent operation still needs care.

Conflict is a domain-state problem; a failed explicit HTTP precondition is
412. Neither status alone tells the client to blindly retry a write.

## 8. Make errors machine-readable

[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) defines Problem Details.
This **header/body excerpt** uses the correct JSON media type; the `status`
member agrees with the actual HTTP status. The server has not changed the
enrollment or seats in this failure example.

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{"type":"https://learn.example/problems/no-seats","title":"No seats available","status":409,"detail":"Course course-101 has no available seats.","instance":"/problems/request-42"}
```

`type` identifies a problem category, `title` gives a short summary,
`status` is advisory to consumers but, when generated, must agree with the
HTTP response status, `detail` explains this occurrence, and `instance`
identifies the occurrence. Members can be omitted according to RFC 9457;
without `type`, its effective value is `about:blank`. An API may add
extension members. Do not include secrets or implementation internals in
error details. Clients should use status and stable type, not parse prose.

<details class="learning-answer">
<summary>Predict: a stale write and an unsupported patch arrive together. Which error?</summary>
<p>The API should document its evaluation order; HTTP preconditions are evaluated after normal request checks and are ignored if the unconditional response would not be successful or 412. An unsupported input can therefore be rejected with 415 without performing the write. A valid request whose If-Match fails receives 412.</p>
</details>

## 9. Try it without changing domains

1. Learner 7 sends a GET for course 101. Explain why 30 seats is not a
   promise that enrollment will later succeed.
2. The learner submits a create request twice after a lost response. Explain
   why POST alone cannot prove there will be only one enrollment.
3. In the extended-schema exercise, an editor sends a merge patch containing
   `{"description":null}`.
   Predict whether the member remains with a null value.
4. An editor sends a valid JSON Patch with an old `If-Match`. Predict the
   status and whether any operation should be applied.

<details class="learning-answer">
<summary>Compare your reasoning</summary>
<ol>
<li>The read is a snapshot; concurrent enrollments can consume seats.</li>
<li>A create can happen twice unless an application-level deduplication contract prevents it.</li>
<li>Merge Patch removes the member; it does not assign null.</li>
<li>The precondition fails with 412 before mutation, assuming the request otherwise passes normal checks.</li>
</ol>
</details>

### One labeled transfer exercise

For a library catalogue, map a book resource and a loan creation to the
same GET-versus-POST reasoning. Do not assume the loan has the same schema,
permissions, retry policy, or state rules as a course enrollment.

## Further reading

The HTTP method, status, conditional request, representation and message
rules are in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110). Caching
semantics are in [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111).
See [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396), which replaces
[RFC 7386](https://www.rfc-editor.org/rfc/rfc7386), for Merge Patch;
[RFC 6902](https://www.rfc-editor.org/rfc/rfc6902) for JSON Patch; and
[RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) for JSON Pointer.
These are protocol specifications, not claims about a deployed backend.
