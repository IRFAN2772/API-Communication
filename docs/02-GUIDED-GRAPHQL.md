# Phase 2 — Shape a course dashboard with GraphQL

The course platform from [the guided REST journey](01-GUIDED-REST.md) has
one course page and a growing dashboard. This lesson compares contracts; it
is not an instruction to replace a working REST API. The complete
[original Phase 2 reference](02-GRAPHQL.md), [course content map](COURSE-CONTENT-MAP.md),
and [content corrections](CONTENT-CORRECTIONS.md) remain available.

**Example contract, not a deployed service.** In this independent starting
snapshot, course-101 is API Fundamentals with 30 available seats and 20%
progress for learner-7. Course-102 is REST Studio with 20 seats and no
progress for this learner. Their authors are author-1, API Team, and
author-2, REST Team, respectively. Neither course initially has this
learner's enrollment. The enrollment below changes only course-101 to 29.
`enrollment-42` and `enroll-7-a` are illustrative, not live credentials.

This fictional policy permits preview activity before enrollment, so the
20% progress does not imply an active enrollment. Other platforms may require
enrollment first. Neither a progress value nor its presence in the schema
proves access permission.

## Route through the original reference

| Original topic | Start here or continue | Full original |
| --- | --- | --- |
| Why GraphQL, REST comparison, architecture | [Choice](#graphql-choice) | [Phase 2 reference](02-GRAPHQL.md) |
| Schema, types, queries, nested fields | [Schema](#graphql-schema) and [query](#graphql-query) | [Phase 2 reference](02-GRAPHQL.md) |
| Resolvers, request lifecycle, N+1, DataLoader | [Execution](#graphql-execution) and [batching branch](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md) | [Phase 2 reference](02-GRAPHQL.md) |
| Mutations and CRUD | [Mutation](#graphql-mutation) | [Phase 2 reference](02-GRAPHQL.md) |
| Depth, complexity, authorization, production | [Cost](#graphql-cost) and [production branch](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md) | [Phase 2 reference](02-GRAPHQL.md) |
| Caching, persisted queries, evolution | [Production branch](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md) | [Phase 2 reference](02-GRAPHQL.md) |
| Subscriptions, Apollo, federation and gateway | [Next choices](#graphql-next) and [production branch](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md) | [Phase 2 reference](02-GRAPHQL.md) |

<span id="graphql-choice"></span>
## Step 1 — A dashboard needs a shape, not necessarily a new protocol

**Problem.** The course card needs title and available seats. The dashboard
also needs its author, the signed-in learner's progress, and enrollment.
Different screens need different combinations. Several client round trips or
a large response can matter, but measure latency, payload and maintenance.

**Same case.** A REST course read already handles the card. An aggregate
endpoint can return the dashboard; a backend-for-frontend (BFF) can gather
and shape data for one client; a documented REST field-selection parameter
can select fields. Each can enforce ownership and authorization. They are
legitimate alternatives, not inferior versions of GraphQL.

GraphQL is another option: a typed schema defines what may be selected,
and an operation selects a response shape within that contract. A server
resolves fields and returns an object matching the selection, subject to
nulls and errors. It may call existing REST services or a database behind the
interface. GraphQL does not grant data access and does not give the client
control over server work, storage, or resolver implementation.

**Changed condition.** If the page needs just title and seats and progress
can be 30 seconds old, keep the REST read and bounded polling if measurements
support it. A GraphQL layer or persistent connection is not mandatory.

**Limits and fit.** GraphQL can be worthwhile when many clients need
meaningfully different shapes, but requires schema ownership, resolvers,
authorization, operational limits and cache decisions. A REST aggregate also
has maintenance and access-control costs. Compare the actual workload.

<details class="learning-answer">
<summary>Predict: does a dashboard automatically require GraphQL?</summary>
<p><strong>Reasoning:</strong> No. A REST aggregate, BFF or field-selection
contract may satisfy the same need. Measure the trade-offs and retain the
existing read when it is sufficient.</p>
</details>

<span id="graphql-schema"></span>
## Step 2 — Define the contract before selecting fields

**Problem.** The client and server need to agree on fields, arguments and
nullability. The schema is a contract, not the database schema and not a
promise that every caller may see every value.

**Same case.** This is the complete shared teaching schema, including the
root operation types and the later subscription and administrative commands:

For the first card, focus on `Course.id`, `title`, `seats`, and
`Query.course(id)`. The remaining definitions make the later examples
checkable; you do not need to memorize the administrative or subscription
types before reading the first query.

```graphql
type Author { id: ID!, name: String! }
type Progress { percentComplete: Int! }
type Enrollment { id: ID!, courseId: ID!, learnerId: ID! }
type Course {
  id: ID!
  title: String!
  seats: Int!
  author: Author!
  progress: Progress
  enrollment: Enrollment
}
type CourseEdge { cursor: String!, node: Course! }
type PageInfo { hasNextPage: Boolean!, endCursor: String }
type CourseConnection { edges: [CourseEdge!]!, pageInfo: PageInfo! }
type Learner { id: ID!, enrollments: [Enrollment!]! }
input EnrollInput { courseId: ID!, idempotencyKey: String! }
input CourseInput { title: String!, seats: Int! }
input CoursePatchInput { title: String, seats: Int }
type EnrollmentPayload { enrollment: Enrollment!, course: Course! }
type Query {
  course(id: ID!): Course
  courses(first: Int! = 2, after: String): CourseConnection!
  me: Learner!
}
type Mutation {
  enroll(input: EnrollInput!): EnrollmentPayload
  createCourse(input: CourseInput!): Course!
  updateCourse(id: ID!, patch: CoursePatchInput!): Course
  deleteCourse(id: ID!): Boolean!
}
type Subscription { courseProgress(courseId: ID!): Progress! }
```

`ID` is an identifier scalar; `Int` is an integer; `String` and `Boolean`
are other built-in scalars used here. `!` means non-null. `course` may be
null, while a returned course's `id`, `title`, `seats` and `author` cannot be
null. `progress` and `enrollment` may be null; `edges` is a non-null list of
non-null edges. A connection is an object containing edges and pageInfo,
not an implicit array. An input object is supplied as an argument; output
objects describe results. `first` has an SDL default of 2.

**Changed condition.** A missing course can produce `course: null` without
an execution error under this example's lookup policy. A denied nullable
field may instead be null with an error; authorization policy must say which.
Neither nullability nor knowledge of a field authorizes access.

**Limits and fit.** Schema validation catches unsupported fields and wrong
argument types before execution; it cannot prove the caller owns an
individual enrollment or guarantee an upstream service will succeed.

<details class="learning-answer">
<summary>Predict: does a nullable progress field mean it is always visible?</summary>
<p><strong>Reasoning:</strong> No. Nullability describes the possible result,
not permission. The server must check the caller and may return null with a
field error under the stated access policy.</p>
</details>

<span id="graphql-query"></span>
## Step 3 — Request only the card, then the dashboard

**Problem.** A card should not require the dashboard's private fields.
The client must supply an ID without rewriting the operation text.

**Same case.** This complete operation selects exactly three fields:

```graphql
query CourseCard($id: ID!) {
  course(id: $id) { id title seats }
}
```

Send it, for example, as an HTTP POST JSON request with `query` containing
the operation text, `operationName` equal to `CourseCard`, and the following
`variables` object. The `ID!` variable is required and cannot be null; the
string below is accepted as an ID. The operation name chooses the operation
when a document contains multiple operations; it is not a field name.

Card variables:

```json
{"id":"course-101"}
```

Card response before enrollment:

```json
{"data":{"course":{"id":"course-101","title":"API Fundamentals","seats":30}}}
```

The `data` envelope contains only the requested fields. A GraphQL query is
a read operation; it is not synonymous with the HTTP GET method. This
example uses POST; a server may support GET for queries under its transport
contract, while mutations must not be executed through HTTP GET.

The dashboard adds related fields and the authenticated `me`:

```graphql
query Dashboard($id: ID!) {
  course(id: $id) {
    title seats
    author { name }
    progress { percentComplete }
    enrollment { id }
  }
  me { id }
}
```

Dashboard variables are the same object as for CourseCard. The principal is
learner-7, and the dashboard is read before enrollment:

```json
{"data":{"course":{"title":"API Fundamentals","seats":30,"author":{"name":"API Team"},"progress":{"percentComplete":20},"enrollment":null},"me":{"id":"learner-7"}}}
```

**Changed condition.** If `id` is `course-missing`, the same selected
`course` may be null; `me` remains available:

```json
{"data":{"course":null,"me":{"id":"learner-7"}}}
```

**Limits and fit.** The selection changes the response, not the server's
access policy or guaranteed database columns. Validation rejects unknown
fields and incompatible variable definitions; required variables must also
be coerced successfully before execution. A successful lookup may return
null rather than a not-found HTTP status under this chosen policy.

<details class="learning-answer">
<summary>Predict: does selecting title also return the course ID?</summary>
<p><strong>Reasoning:</strong> No. The dashboard selects title and seats but
not the course ID. Only selected fields appear, subject to errors and nulls.</p>
</details>

<span id="graphql-execution"></span>
## Step 4 — Follow execution, errors and the catalogue

**Problem.** One request can combine related fields, but a response may be
partial and a single request can still perform multiple backend calls.

**Same case.** The server parses the document, validates it against the
schema, chooses the named operation, coerces variables, then executes. A
request error in parsing, validation, operation selection or variable
coercion prevents execution; no resolver should run. During execution,
resolvers obtain values, nested fields are completed, and errors can coexist
with data. Actual scheduling and storage access depend on implementation.

Suppose the `progress` resolver rejects access for this learner. Under this
illustrative field policy, it raises an error and returns null for the
nullable `progress` field; other selected fields still resolve:

```json
{"data":{"course":{"title":"API Fundamentals","seats":30,"author":{"name":"API Team"},"progress":null,"enrollment":null},"me":{"id":"learner-7"}},"errors":[{"message":"Progress access denied","path":["course","progress"]}]}
```

If instead the non-null `author.name` resolver fails, its null cannot satisfy
`String!`: it bubbles through non-null `author: Author!` to the nullable
`course`, which becomes null. The path identifies the original failing field,
not just the point where null propagation stops:

```json
{"data":{"course":null,"me":{"id":"learner-7"}},"errors":[{"message":"Author name unavailable","path":["course","author","name"]}]}
```

A failure can propagate further if the parent is also non-null, potentially
to `data: null`. Error paths use response keys, including aliases and list
indices where relevant. Errors should not expose sensitive internal details.

**HTTP policy for these examples.** For `application/graphql-response+json`
we choose HTTP 200 for executed operations, including partial field errors;
a malformed document, validation error or invalid variables gets HTTP 400
and an `errors` response without `data`. This is a chosen contract, not a
claim that all GraphQL responses are 200. HTTP authentication, transport and
server failures can use other statuses. Legacy `application/json` has
additional compatibility conventions; clients must consult the server's
media-type and status policy and inspect `errors` even on 200.

Now ask for the two-course catalogue before enrollment:

```graphql
query Catalogue($first: Int!) {
  courses(first: $first) {
    edges { node { id title author { name } } }
    pageInfo { hasNextPage endCursor }
  }
}
```

Catalogue variables:

```json
{"first":2}
```

Catalogue response, with illustrative opaque cursors and no further page:

```json
{"data":{"courses":{"edges":[{"node":{"id":"course-101","title":"API Fundamentals","author":{"name":"API Team"}}},{"node":{"id":"course-102","title":"REST Studio","author":{"name":"REST Team"}}}],"pageInfo":{"hasNextPage":false,"endCursor":"cursor-102"}}}}
```

Phase 1's REST response uses a `courses` collection array. This GraphQL
schema explicitly declares a connection with `edges` and `pageInfo`: it is a
different envelope, not a silently renamed REST response. The edge cursor
exists in the schema but is absent above because it was not selected. Treat
`endCursor` as opaque; pass it as `after` when continuing under the server's
ordering and cursor policy. A cursor alone does not ensure a snapshot.

**Changed condition.** Naively fetch the two courses in one database call,
then fetch author-1 and author-2 separately: 1 + 2 = 3 database calls. A
request-scoped batch of the two author IDs can instead fetch both authors in
one call: 1 + 1 = 2, assuming that backend supports a batch and both loads
are collected together. The server must map results back to keys and handle
missing authors and authorization. The numbers are an example, not a
GraphQL guarantee; joins, caches or remote services change the accounting.

**Limits and fit.** Depth alone does not count backend work. Request-scoped
DataLoader-style batching and memoization can help avoid N+1, but are not
required for every server, nor a cross-user cache or authorization substitute.
The complete [execution and batching lesson](lessons/GRAPHQL-EXECUTION-AND-BATCHING.md)
examines scheduling, per-request cache scope, failure and measurements.

<details class="learning-answer">
<summary>Predict: does one GraphQL request imply one database query?</summary>
<p><strong>Reasoning:</strong> No. The two-course example uses three calls
with naive author lookups, or two with an effective batch. The implementation
and backend determine actual work.</p>
</details>

<span id="graphql-mutation"></span>
## Step 5 — Enroll without inventing a global transaction

**Problem.** Learner-7 wants a seat. The server must verify identity,
authorization and availability, and handle a lost reply safely.

**Same case.** Start again from the independent 30-seat snapshot. This
operation uses the schema's input object and the authenticated principal;
there is no client-supplied learner ID:

```graphql
mutation Enroll($input: EnrollInput!) {
  enroll(input: $input) {
    enrollment { id courseId learnerId }
    course { id seats }
  }
}
```

Enroll variables:

```json
{"input":{"courseId":"course-101","idempotencyKey":"enroll-7-a"}}
```

After the server commits, with no competing writes:

```json
{"data":{"enroll":{"enrollment":{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"},"course":{"id":"course-101","seats":29}}}}
```

The single enrollment consumes one available seat: 30 − 1 = 29; course-102
still has 20. The returned fields are precisely those selected. The nullable
`enroll` payload can be null on a field failure, with an appropriate error.
This example policy scopes the key to the authenticated principal and
operation, records the outcome with the seat change, and replays the same
outcome for the same intent within its documented retention period. Reusing
the key for a different intent is rejected. Atomic persistence or an
equivalent recovery design is needed; merely sending a key does not do it.

**Changed condition.** If the reply is lost after commit, a retry of the same
intent with the same key can return enrollment-42 and leave 29 seats. A new
key could create another effect; after expiry follow the recovery policy.
Uniqueness checks, concurrent retries and external notifications need their
own design. A local transaction does not make email exactly once.

GraphQL executes top-level mutation fields serially within one operation.
That ordering is not a global transaction, isolation across requests,
automatic rollback, safe retry, or authorization. The server must implement
those guarantees where needed. A mutation is not automatically safe merely
because it returns a selection.

**Limits and fit.** The schema explicitly offers `createCourse`,
`updateCourse` and `deleteCourse`; GraphQL does not generate CRUD semantics.
For this lesson's administrative policy, only authorized administrators may
use them. Create takes a nonempty title and nonnegative seats; update leaves
omitted patch members unchanged and rejects explicit null for these required
business properties; delete returns true only for an existing deletable
course, false if absent, and refuses a course with enrollments. Validation,
conflicts and denial are reported as field errors, with null propagation
according to the schema. These are server policies, not consequences of the
SDL alone. The examples do not perform these administrative mutations.

<details class="learning-answer">
<summary>Predict: does serial mutation execution make a lost-reply retry safe?</summary>
<p><strong>Reasoning:</strong> No. Serial execution orders fields in one
operation, not repeated requests. The server needs a scoped, durable retry
contract and must enforce authorization and business constraints.</p>
</details>

<span id="graphql-cost"></span>
## Step 6 — Bound work without treating all queries alike

**Problem.** An apparently shallow catalogue query may request many records;
a nested query may fan out across services. One HTTP request is not one unit
of backend work.

**Same case.** For this example the server accepts `first` from 1 through
20 inclusive, even though SDL's `Int!` alone cannot express that range.
`first: 2` returns at most two edges, and `first: 21` is rejected by the
server's explicit admission/domain policy before list data is fetched.
This range is not enforced by the GraphQL `Int` type. Check authorization at fields and
objects, including each learner's progress and enrollment, not only at the
entry point. A bounded list does not make private data public.

**Changed condition.** A shallow request for 20 courses can cost more than
a deeper request for one course. Depth limits bound nesting but not list
cardinality, repeated aliases, expensive fields or upstream latency. Combine
bounds with a cost budget weighted for cardinality and field expense,
request size/rate limits, timeouts, instrumentation and load testing.
Budgets are estimates, not precise guarantees of database work.

Caching is another separate decision. A POST endpoint alone does not provide
a universally useful shared HTTP cache key. Client entity caches, request
batch memoization, server field caches, and HTTP caching have different
keys and lifetimes. Include variables, selection and authorization context
where applicable; personalized responses must not leak across users. A
persisted operation identified by hash can reduce transfer and support an
allowlist if the server actually enforces one, but a hash alone is neither
access control nor a universal cache guarantee.

**Limits and fit.** Disabling introspection alone cannot protect fields;
enforce access on the server. Select limits against observed workloads,
not an arbitrary claim that all operations cost the same. The complete
[cost, caching and evolution lesson](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md)
works through budgets, isolation, cache invalidation and schema change.

<details class="learning-answer">
<summary>Predict: does a depth limit alone prevent a large shallow list?</summary>
<p><strong>Reasoning:</strong> No. Cardinality and field cost can be large
even at low depth. Bound first, authorize fields and evaluate cost separately.</p>
</details>

<span id="graphql-next"></span>
## Step 7 — Choose a continuation, not a required technology ladder

**Problem.** Progress may need updates, teams may own different services,
and clients may depend on the schema for years. None is required for the
first course query.

**Same case: subscriptions.** The fixture exposes this complete operation:

```graphql
subscription Progress($courseId: ID!) {
  courseProgress(courseId: $courseId) { percentComplete }
}
```

Its variables are:

```json
{"courseId":"course-101"}
```

A subscription establishes an event stream: an authorized subscriber can
receive a selected result for each progress event, such as 20% followed by
40% in the related lesson.
An event is not a guarantee of delivery, ordering, replay or current state;
the chosen transport and service must define reconnection, backpressure,
authorization and recovery. Subscriptions are not required when polling
meets the freshness and load requirements. This subscription is an
independent later scenario, not an update to the initial 20% snapshot.

An illustrative event result is:

```json
{"data":{"courseProgress":{"percentComplete":40}}}
```

**Changed condition: team and client growth.** Federation is an
architecture in which independently owned graph services contribute to a
composed schema and a gateway/router plans calls across them. Ownership,
composition compatibility, identity propagation, timeouts and partial
failures still require explicit design. A single server can be simpler.
Apollo is a family of GraphQL client and server/router tools, not GraphQL
itself: a client can manage operations and a normalized cache, while server
and federation tooling can implement graph serving and composition. Tooling
choices do not supply authorization or freshness automatically. This is a
conceptual introduction, not a complete Apollo framework lab; the
[cost, caching and evolution branch](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md)
continues with the relevant execution and federation trade-offs.

**Limits and fit.** Schema evolution usually favors adding fields and
deprecating old ones before removal; removing or changing types can break
clients. Even adding required input fields can break existing operations.
Observe usage and coordinate migrations. Choose a subscription, federation,
a cache or a framework only for a demonstrated need. The
[production branch](lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md)
covers evolution and caching in more detail. Compare the original
[RPC and gRPC journey](03-GUIDED-RPC-AND-GRPC.md) as a parallel typed-call design,
not a mandatory next rung above GraphQL.
The [original RPC and gRPC reference](03-RPC-AND-GRPC.md) remains available
with all of its examples and repeated deep dives.

<details class="learning-answer">
<summary>Predict: must a team adopt federation before its first course query?</summary>
<p><strong>Reasoning:</strong> No. One schema and server can serve the first
query. Federation introduces coordination costs and fits only when distributed
ownership and operational needs justify them.</p>
</details>

### Transfer: a library loan

A library card could select a book copy's title and availability; a loan
mutation could create a loan for the authenticated borrower. As with the
course, selecting a field is not permission to read another borrower's loan.
A lost reply after a successful loan leaves the outcome uncertain; a scoped,
durable idempotency policy can support a retry, but a mutation alone cannot.
The library may instead use its existing REST endpoint if that fits the need.

<details class="learning-answer">
<summary>Predict: does a library loan mutation automatically prevent duplicate loans on retry?</summary>
<p><strong>Reasoning:</strong> No. Retry safety needs a documented server-side
key, atomic or recoverable outcome recording, and appropriate loan rules.</p>
</details>

## Check the journey

1. Compare REST aggregation, a BFF, field selection and GraphQL for the
   dashboard. What would you measure before choosing?
2. Explain `ID!`, `Course`, and nullable `progress` in the shared schema.
3. Trace the CourseCard variable, selected fields, response and operation name.
4. Explain the two error paths and why a non-null failure can null its parent.
5. Account for three naive database calls and two batched calls for two courses.
6. Trace learner-7's enrollment, key, lost response and 30-to-29 seat change.
7. Contrast depth, cardinality, cost, field authorization and cache isolation.
8. Explain when polling, subscriptions, federation or RPC might fit instead.

## Sources

- [GraphQL specification: schema, validation, execution and response](https://spec.graphql.org/October2021/) — the typed contract, non-null propagation, errors and mutation ordering.
- [GraphQL over HTTP draft](https://graphql.github.io/graphql-over-http/draft/) — media types, request methods and status-code guidance; check the version your implementation follows.
- [DataLoader documentation](https://github.com/graphql/dataloader) — batching, key ordering and per-request memoization.
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) — shared and private HTTP caching rules.
