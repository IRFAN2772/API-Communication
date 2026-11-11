# Phase 0 — Follow one course request

A learner clicks **API Fundamentals** on a learning platform.
The browser must show the course title and the number of seats available.
The course is `course-101`; it has 30 seats, all currently available.
How does the browser find that information?

In this walkthrough, the JSON field `seats` means currently available seats.
We keep the course IDs and field names used by the existing REST examples.
Reading that value and reserving a seat are different operations.

We will keep this same Course API and change one requirement at a time.
First make the course page work; then ask what happens when messages fail,
the catalogue grows, enrollment takes too long, or progress needs to be live.
Each step ends with a prediction: try it before reading the reasoning.

**Learn now, go deeper when ready:** Follow the six steps first to see the
problems and choices. The [retry correctness](#phase0-retry-correctness)
and [reliable deferred work](#phase0-deferred-work) lessons
explain important guarantees behind those choices. They are not unimportant
or restricted to advanced readers: anyone can read them now or return later.

This guided page is the **first installment**, not a replacement for the
complete material. The other chapter pages remain in their original state.
The [complete Phase 0 reference](00-FUNDAMENTALS.md) and
[all-topics library](COURSE-CONTENT-MAP.md) are available whenever you want
to explore beyond this path. After the basics, the suggested next lesson is
[REST APIs](01-GUIDED-REST.md).

## Step 1 — A click becomes a request

### Problem and first solution

The browser can draw a page, but it does not automatically know what is
stored by the learning platform. Give it a way to ask for one course.
For this example, a backend exposes a **Course API**: a defined interface
through which software can request course information.

The **client** is the browser code making this request.
The **server** is the backend receiving and answering it.
These are roles in an exchange, not necessarily different kinds of computers:
a backend can also be a client when it calls another service.
The API is a contract implemented by the backend, not necessarily a separate
machine. A **request** asks for something; a **response** reports the result.

The contract tells both sides what to send and expect. Here it says:
ask for `GET /courses/course-101`; a successful response has a status and
course fields named `id`, `title`, and `seats`.
The server is responsible for looking up the course and applying its rules.

### Work through the exchange

Assume the browser already has a secure HTTPS connection to `learn.example`.
These are separate request and response messages, shown using HTTP/1.1.
The empty line ends the headers; the response's `Content-Length` gives its
body length in bytes, so this example does not require closing the connection.

```http
GET /courses/course-101 HTTP/1.1
Host: learn.example
Accept: application/json

```

The server's response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 57

{"id":"course-101","title":"API Fundamentals","seats":30}
```

In order:

1. The click causes the browser to send the request to the server.
2. The server identifies the course, checks applicable access rules, and reads it.
3. The server sends `200 OK` and a JSON representation of that course.
4. The browser reads the response and displays **API Fundamentals — 30 seats available**.

`GET` means the client requests a representation of a resource; a well-designed
GET is intended to be read-only from the client's perspective. `Accept`
expresses a preferred response format, while `Content-Type` identifies the
format actually sent. `/courses/course-101` identifies the requested course
within this API. These are contract choices, not magic names.

HTTP is the protocol defining the request/response messages and their semantics.
HTTPS protects HTTP in transit using TLS; HTTP/1.1 is the version shown here.
JSON is the data representation in the body, not the transport protocol.
REST is an architectural style; using HTTP and JSON alone does not establish
that an API satisfies all REST constraints.

### Limitation and fit

The returned seat count is a snapshot: another learner might enroll before
this learner acts. Reading it does not reserve a seat. A simple HTTP resource
read is a good starting point when the page needs an answer now; it does not
by itself solve reservations or live updates.

**Predict:** If the backend changes the course title after this response,
does the already displayed page change automatically?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> No. The browser has the earlier representation. It must request
new data or receive a later update through another mechanism; the GET itself
does not continuously synchronize the page.</p>
</details>

## Step 2 — Protect the boundary and distinguish outcomes

### Changed requirement: many learners use the course

Suppose learners can inspect and alter their browser code. One tempting
shortcut is to let every browser connect directly to the database and read
or change course rows. What could go wrong?

Credentials distributed to untrusted clients can be copied; each client also
becomes coupled to table structure. A client might bypass validation or
access rules if the database permissions permit it. Putting an API in between
provides a place to enforce rules, but merely adding an API does not enforce
them automatically.

```text
Browser (untrusted client) --HTTP--> Course API/backend --authorized query--> Database
Browser (untrusted client) <--HTTP-- Course API/backend <--course row--------- Database
```

A trusted backend can legitimately connect directly to its database using
appropriately limited credentials. The warning is about giving an untrusted
browser unrestricted database access, not a ban on direct database connections.
For a small platform, **one backend and one database** is a sound start:
fewer deployments and simpler debugging. Its limits may emerge later, but
multiple services are not a prerequisite for an API.

### Changed requirement: explain a failed lookup

Consider two possible timelines. The server's actions and what the browser
can know are not always the same:

| Time | Course absent and response arrives | Course exists but response is lost |
| --- | --- | --- |
| 1 | Browser requests `course-101`. | Browser requests `course-101`. |
| 2 | Server looks it up and finds no course. | Server finds API Fundamentals with 30 available seats. |
| 3 | Server sends `404 Not Found`; browser receives it. | Server sends `200 OK`, but the response is lost. |
| 4 | Browser knows it received a 404 for this request. | Browser times out without a response; it does not know whether the server processed it. |

These are illustrative outcomes, not the only ones. A timeout could also
mean the request never arrived or processing is still in progress. A `404`
is an HTTP response, not a timeout; depending on a service's policy it can
also conceal a resource the caller is not allowed to see.

### Limitation and fit

For our read-only `GET`, a bounded retry after a timeout is often reasonable.
Use a timeout and backoff rather than retrying endlessly: retries can increase
load during an outage, and the next response may reflect newer data.
HTTP defines GET as safe and idempotent in its intended semantics; a badly
implemented endpoint with side effects breaks that expectation. The same
retry reasoning does **not** automatically apply to enrollment.

**Predict:** A browser times out on the course read. Can it conclude that
the course is missing or that the server did no work?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> Neither follows. A received <code>404</code> is a response with a specific
meaning in this API; a timeout reports only that the client did not receive
an answer in time. The server may have completed the read.</p>
</details>

## Step 3 — Enrollment changes the retry problem

### Changed requirement: learner-7 takes a seat

Now `learner-7` clicks **Enroll** in `course-101`. A possible contract is
`POST /courses/course-101/enrollments` with the learner identity established
by authentication. The server checks authorization and seat availability,
then records the enrollment and adjusts the count as one consistent operation.

Worked state, with no competing enrollment:

| Moment | Enrollment for learner-7 | Available seats |
| --- | --- | --- |
| Before POST | None | 30 |
| After successful commit | Created, for example `enrollment-42` | 29 |
| Response | `201 Created` with the enrollment identifier | Still 29 |

### The limitation: did the POST happen?

Imagine the server commits `enrollment-42`, but its response is lost.
The browser sees a timeout, just as it did for the GET. If it blindly sends
a fresh enrollment command, the server might create another enrollment or
repeat other side effects. A unique enrollment constraint can help, but does
not generally deduplicate every effect associated with the operation.

```mermaid
sequenceDiagram
    participant Client as Browser client
    participant API as Course API
    participant Storage as Storage
    Client->>API: POST enrollment for learner-7
    API->>Storage: Commit enrollment-42; seats 30 to 29
    Storage-->>API: Commit confirmed
    API--xClient: 201 Created response lost
    Note over Client: Timeout; outcome is unknown to client
```

Text alternative: The browser sends the enrollment request to the Course API.
The API commits `enrollment-42` in storage, reducing available seats from 30
to 29. Storage confirms the commit, but the API's `201 Created` response is
lost. The browser times out and cannot tell whether the enrollment succeeded.

### One option: a retry identity

The client can attach an **idempotency key**, for example `enroll-7-a`,
to this logical enrollment attempt. On a timeout it retries the *same*
request with the *same* key. Assuming authentication has already established
learner-7's identity, one body-free request under this example's contract is:

```http
POST /courses/course-101/enrollments HTTP/1.1
Host: learn.example
Idempotency-Key: enroll-7-a
Content-Length: 0

```

A successful response is `201 Created`, with
`Location: /courses/course-101/enrollments/enrollment-42` and a representation:

```json
{
  "id": "enrollment-42",
  "courseId": "course-101",
  "learnerId": "learner-7"
}
```

The request is interpreted for the authenticated learner; a learner ID in
the URL or JSON would not itself prove permission. The key identifies this
logical attempt, not every future action by the learner.

Under a deliberately designed contract, the same key and same enrollment
request can return the recorded `enrollment-42`, leaving 29 seats, rather
than creating another enrollment. The key is not magic: the server must
recognize and safely handle retries, and protection has a defined lifetime.
See [retry correctness](#phase0-retry-correctness) for the assumptions,
concurrent requests, differing payloads and external effects.

### Fit and checkpoint

Use a retry identity when clients may retry a write and duplicated effects
matter. It costs storage, concurrency handling, and a documented lifetime;
it is not needed merely because a harmless GET can be retried.

**Predict:** The original POST committed but the response timed out. The
client repeats the identical request with the same scoped key. How many seats
should be taken under the stated contract?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> One. The server must recognize the retry and return the saved
result; the seat count remains 29. This assumes it safely coordinates competing
attempts and still remembers the key and result. The deeper lesson explains
those atomicity and retention requirements; the key string alone is not enough.</p>
</details>

## Step 4 — The catalogue grows

### Changed requirement: show a list, not just one course

The platform now has thousands of courses. Returning all of them for
`GET /courses` can create a large response and make the browser wait and
hold unnecessary data. The original course detail endpoint still works;
the new problem belongs to the **list**.

### One option: bounded pagination

Keep the HTTP resource interface and return a small page at a time. In this
example the API caps `limit` at 20, uses a stable order by course ID, and
returns an opaque cursor for the next page:

```http
GET /courses?limit=2 HTTP/1.1
Host: learn.example
```

```json
{
  "courses": [
    {"id": "course-101", "title": "API Fundamentals", "seats": 29},
    {"id": "course-102", "title": "REST Studio", "seats": 20}
  ],
  "nextCursor": "next-page-token"
}
```

The browser displays these two courses and requests the next page with
`GET /courses?limit=2&cursor=next-page-token` when needed. A last page
has `nextCursor: null`. The cursor is an API-issued token; the client should
not invent its contents. Bounded pages reduce each response, but fetching the
entire catalogue still takes multiple requests.

The author has added REST Studio as `course-102`. API Fundamentals is still
`course-101`, now with 29 available seats after learner-7's enrollment.
Its identity did not change when we moved from a detail response to a list.

### Limitation and fit

Courses may be added or removed between page requests. The API must document
ordering, cursor validity and whether pagination is a snapshot or reflects
changes; a cursor alone does not guarantee a consistent snapshot.
Pagination is useful when lists can grow; for a tiny bounded list, extra
page navigation may add needless complexity. It does not require GraphQL or
a new service.

**Keep the simple solution when it fits:** If the catalogue is known to stay
tiny and bounded, returning the whole list may be simpler and sufficient.
Choose pagination for an actual size or growth requirement, not as an upgrade
every list must have.

**Predict:** With a limit of 2 and 100 courses, can the first response contain
all 100 under this contract?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> No. It contains at most two and a continuation if more remain.
The client chooses whether and when to make further requests.</p>
</details>

## Step 5 — Enrollment should not wait for email

### Changed requirement: send a confirmation

After learner-7 enrolls, the platform should send a confirmation email.
Revisit that same enrollment, not a second one: the timeline below rewinds
to its original 30 seats and adds the confirmation requirement.
A straightforward implementation saves the enrollment, waits for the email
provider, then responds. It is easy to follow, but a slow or unavailable
email provider now delays the learner even after the seat is committed.

### One option: defer the email

If the product accepts email arriving later, the backend can confirm the
enrollment and arrange email for later. A worker processes the job separately.
This timeline assumes the reminder to send email is not lost when enrollment
is saved; see [reliable deferred work](#phase0-deferred-work)
for how that guarantee can be supported:

| Time | Enrollment | Confirmation email |
| --- | --- | --- |
| 1 | `learner-7` requests enrollment. | No job yet. |
| 2 | Enrollment commits; seats go from 30 to 29. | The job is recorded for later work. |
| 3 | API returns `201` for `enrollment-42`. | Job is accepted for later work, not necessarily sent. |
| 4 | Enrollment remains confirmed. | Worker attempts delivery; it may succeed or fail. |

The response confirms the enrollment under this contract, **not** email
delivery. If instead the whole enrollment is deferred, `202 Accepted` can
indicate accepted processing, not completion; provide a way to check status.

### Limitation and fit

Jobs add a worker, storage, monitoring, retry and failure handling. An email
provider may accept a message without proving the learner received it.
Queues are also bounded: if 10 jobs arrive per second and workers finish
4 per second, backlog grows by about 6 per second until capacity is reached.
At that point an explicit admission, rejection, or other overload policy is
needed. Matching arrivals to capacity later does not drain an existing backlog.

Use deferred jobs when the user does not need that effect to finish before
the response and the team can operate the added machinery. If immediate email
delivery is a hard requirement, a pending job cannot honestly satisfy it.

**Predict:** The API returns `201` after committing the enrollment and its
email job. Has learner-7 necessarily received an email?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> No. The enrollment is complete and the job is recorded, but
the worker and provider still have to process it; later delivery can fail.</p>
</details>

## Step 6 — Progress needs fresher updates

### Changed requirement: show learning progress

Later, learner-7 starts `course-101`. The page should show progress updates.
Suppose the first target is “within about 30 seconds”; it is not yet a
requirement for instant, two-way communication.

### Start with polling

The browser can request `GET /courses/course-101/progress` every 30 seconds.
Here, the server returns the authenticated learner's progress for that course;
it must authorize access rather than sharing another learner's progress.
At one read the response is `{"percentComplete":20}`; after a learning
activity is recorded, the next may be `{"percentComplete":40}`.
The display can be stale between reads, and each poll has network and server
cost even when nothing changes. The interval is an illustrative product
choice, not a universal freshness guarantee: delays and failures still occur.

### If the requirement changes again

If the server should push frequent updates to the page, **Server-Sent Events
(SSE)** can keep an HTTP event stream open from server to browser. The browser
can still send changes through ordinary HTTP requests. SSE is one-way for
events and needs reconnection and recovery decisions.

If the same interaction needs frequent messages in *both* directions, such
as collaborative live editing, **WebSocket** provides a bidirectional
connection. It adds connection management, reconnection and missed-message
recovery; an open connection does not itself guarantee delivery.

Polling is a good fit for modest freshness needs and simpler operations; it
is a poor fit if its delay or repeated requests violate measured requirements.
SSE fits server-to-client updates; it is not a two-way channel. WebSocket
fits sustained two-way interaction, not merely every page that displays a
changing number. See the [real-time chapter](04-REALTIME-COMMUNICATION.md)
for alternatives and their costs.

**Keep the simple solution when it fits:** If progress changes only once and
the minimum freshness requirement is within 45 seconds, polling may fit;
for example, a 30-second interval gives room in normal conditions, but network
delay or failure can still breach that target. Check measured behavior rather
than introducing a persistent connection by default.

**Predict:** Progress changes at 12:00:05, immediately after a successful
12:00:00 poll. When will the learner normally see it with 30-second polling?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> Around the next poll at 12:00:30, about 25 seconds later,
assuming the request succeeds and returns the new state. It is not pushed
at 12:00:05, and network delay or failure can make it later.</p>
</details>

<span id="phase0-retry-correctness"></span>

## Deeper lesson — Retry correctness

The write must protect the last seat under concurrent requests; checking
availability and updating it without appropriate transactional concurrency
control is not enough. Exact schema and locking are implementation choices.

A deliberately designed server contract could:

1. Scope the key to the authenticated caller and enrollment operation.
2. Atomically claim it and commit the enrollment and recorded outcome so
   simultaneous retries cannot each perform the same write.
3. Return the recorded outcome for a completed matching retry; define what
   a caller receives while the first attempt is still in progress.
4. Return `409 Conflict` if that scoped key is reused with a different payload,
   instead of silently treating a different request as the original.

For example, the same key and same enrollment request should return the
recorded `enrollment-42`, leaving 29 seats, not create another enrollment.
The server must also define key retention: after expiry, the same key may no
longer protect a retry. This is a proposed contract and set of assumptions,
not an implementation or a property automatically supplied by POST.

If enrollment also triggers an external email or payment, a local atomic
record cannot alone guarantee that external effect happened exactly once.
The external system may succeed before the local process records success.
Its own deduplication support, recovery, and reconciliation may be needed.

<span id="phase0-deferred-work"></span>

## Deeper lesson — Reliable deferred work

If the product accepts email arriving later, the backend can commit the
enrollment and a durable record of the email job, then respond. A worker
processes the job separately.

Recording the enrollment and job consistently matters: saving one and
crashing before recording the other can lose the email. A transactional
outbox is one possible design, not something a queue supplies automatically.
The outbox record must be durably published to the job system, including
recovery after a publisher crash; publication may happen more than once.

A durable queue survives specified failures only if configured and operated
accordingly; delivery can be duplicated, so the consumer or provider needs
deduplication. Reconciliation can identify work whose external result is
uncertain, since even a recorded job does not prove that an email was received.

## Stop here, or follow a requirement-driven branch

You can stop after the six steps. You have followed a read, a write, and
several changes in requirements using one backend and database. None of the
following is a required upgrade or a fixed sequence.

- **Different screens need differently shaped data?** Consider a REST
  backend-for-frontend (BFF) that assembles a screen-specific response, or
  [GraphQL](02-GUIDED-GRAPHQL.md) for client-selected fields. A BFF adds a maintained
  interface; GraphQL adds schema, query-cost and caching concerns.
- **Controlled services need generated, strongly typed contracts or streaming?**
  Consider [RPC/gRPC](03-GUIDED-RPC-AND-GRPC.md). It adds tooling and browser/debugging
  considerations; it is not automatically faster for every workload. Measure.
- **Work can finish later?** Revisit the email example and explore
  [asynchronous APIs](05-ASYNC-APIS.md), including recovery and capacity.
- **Operations or team boundaries genuinely demand a split?** Explore
  [API architecture](06-API-ARCHITECTURE.md). Distributed services add
  network failure and operational costs; a monolith can remain the right fit.

## Related lessons and complete reference

The original [Phase 0 reference](00-FUNDAMENTALS.md) remains available in
full. Its numbered topic families are mapped below so you can pursue the
material not covered in this first installment.

| Original Phase 0 topics | Where to continue |
| --- | --- |
| 1–3: API, reasons for APIs, basic vocabulary | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |
| 4–6: communication methods, mental models, core problem | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |
| 7–9: requirements, sample problem, design progression | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |
| 10–12: methods, comparison, choosing | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |
| 13–15: estimations, failures, possible solutions | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |
| 16–18: architecture, end-to-end flows, real-world lessons | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |
| 19–21: checklist, summary, what to study next | [Complete Phase 0 reference](00-FUNDAMENTALS.md) |

| Original chapter | Focus |
| --- | --- |
| [00 — Fundamentals](00-FUNDAMENTALS.md) | Complete original Phase 0 reference |
| [01 — REST APIs](01-REST-APIS.md) | Suggested next lesson: HTTP and resource APIs |
| [02 — GraphQL](02-GRAPHQL.md) | Client-selected data and schema |
| [03 — RPC and gRPC](03-RPC-AND-GRPC.md) | Remote calls and typed contracts |
| [04 — Real-time communication](04-REALTIME-COMMUNICATION.md) | Polling, streams and other live patterns |
| [05 — Async APIs](05-ASYNC-APIS.md) | Jobs, queues and event-driven design |
| [06 — API architecture](06-API-ARCHITECTURE.md) | Gateways, boundaries and operational concerns |
| [07 — Senior design guide](07-SENIOR-DESIGN-GUIDE.md) | Requirements and design decisions |
| [08 — Expert API design](08-EXPERT-API-DESIGN.md) | Evolution and distributed-system design |
| [09 — System design case studies](09-SYSTEM-DESIGN-CASE-STUDIES.md) | Applying the ideas to larger scenarios |

For the complete topic index, see the [all-topics library](COURSE-CONTENT-MAP.md).
The original chapters include broader examples and simplifications; evaluate
each choice against its specific requirements rather than treating a diagram
or a list of phases as a mandatory production architecture.

### Primary references

- [MDN: Overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview) — messages and client/server roles.
- [RFC 9110: HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html) — methods, status codes and representations.
- [RFC 9110: GET](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.1) and [safe and idempotent methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2) — read and retry semantics.
- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — server-to-client event streams.

## Explain it without looking

Try each task before revealing its reasoning. Your explanation need not use
exactly the same words or propose the only acceptable design.

1. Reconstruct the course read and enrollment: who sends and answers each
   request, what state starts at 30, and what changes after the successful
   enrollment? Distinguish a lost response from a failed commit.

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> The browser is the client and the Course API is the server;
the API reads or writes its storage. A GET reads course-101 with 30 available
seats without reserving one. An authorized enrollment POST can commit
enrollment-42 for learner-7 and reduce seats to 29. If its 201 response is
lost, the browser cannot infer whether the commit happened; a received response
or a supported recovery mechanism can resolve the uncertainty. Equivalent
descriptions of the roles and state are fine.</p>
</details>

2. Change the catalogue requirement: there are only 20 courses and this is
   a genuinely small, bounded list. Is pagination necessary? What if a new
   requirement says 100 columns per course must be returned safely?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> Pagination is not automatically necessary for a small,
bounded list: a whole-list response may be simpler. But 100 columns change
the payload and may include sensitive fields. Check authorization, field
exposure, sizes and measured costs; a safe, explicit representation or field
selection and limits may help. Pagination can bound rows, but alone does not
make 100 columns safe. Several designs are acceptable depending on the
requirements and evidence.</p>
</details>

3. Transfer the reasoning to a library book loan: the loan commits but the
   reply is lost. What would a repeated request need to avoid another loan,
   and what changes if a separate payment provider is also involved?

<details class="learning-answer">
<summary>Reveal reasoning</summary>
<p><strong>Reasoning:</strong> A retry needs a defined way to recognize the same logical
loan attempt, such as a scoped idempotency key and a recorded outcome, with
concurrency and retention handled. Other documented designs, such as a
uniqueness rule plus a way to recover the existing loan, may also fit.
Neither a key nor a local loan commit alone guarantees exactly-once payment:
the provider needs its own deduplication or recovery strategy, and uncertain
external outcomes may need reconciliation. The design must distinguish the
local loan from that external effect.</p>
</details>
