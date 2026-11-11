# GraphQL lesson: cost, caching, and evolution

The [execution and batching lesson](GRAPHQL-EXECUTION-AND-BATCHING.md)
shows how a selection becomes work. Here we set boundaries around that work,
separate cache layers, and evolve the contract without assuming that clients
and services upgrade together.

Use the [guided GraphQL journey](../02-GUIDED-GRAPHQL.md), the
[original GraphQL reference](../02-GRAPHQL.md), the
[Phase 0 journey](../00-GUIDED-FUNDAMENTALS.md), the
[REST collections and caching lesson](REST-COLLECTIONS-AND-CACHING.md),
the [REST reliability lesson](REST-RELIABILITY-AND-OPERATIONS.md), the
[content map](../COURSE-CONTENT-MAP.md), and the
[corrections ledger](../CONTENT-CORRECTIONS.md) for connected material.

All executable GraphQL examples use the
[shared teaching schema and fixtures](../../assets/graphql-lesson-fixtures.mjs),
not a running service. Initially course-101 is **API Fundamentals**, with
30 seats, author-1 **API Team**, and progress 20%; course-102 is
**REST Studio**, with 20 seats and author-2 **REST Team**. The principal
is learner-7. A successful enrollment can create enrollment-42 and leave
29 seats; 40% is a later progress event. Examples reset to the initial
snapshot unless their timeline explicitly says otherwise.
The initial progress records preview activity allowed by this fictional
policy; it does not imply that an enrollment already exists.

Jump to the [cost calculation](#1-one-request-can-demand-a-lot-of-work)
or [subscription tradeoffs](#8-subscriptions-are-event-execution-not-durable-delivery).

## 1. One request can demand a lot of work

An attacker or accidental client can request broad selections, many aliases,
or a large list even when the document is shallow. Depth limits constrain
nesting, but cannot alone bound width, list cardinality, resolver cost, or
downstream work. Batching may reduce round trips without making all requested
rows free.

```graphql
query CostedCatalogue($first: Int!) {
  courses(first: $first) {
    edges {
      node {
        id
        title
        author { name }
      }
    }
  }
}
```

For `{"first":2}` and both fixture courses returned, suppose an intentionally
simple teaching cost model charges one unit per selected field occurrence
at each response position. Ignore root object overhead, `__typename`,
authentication, data fetch strategy, and errors for this calculation:

| Selected field | Positions | Units |
| --- | ---: | ---: |
| `courses` | 1 | 1 |
| `edges` | 1 | 1 |
| `node` | 2 | 2 |
| `id` | 2 | 2 |
| `title` | 2 | 2 |
| `author` | 2 | 2 |
| `name` | 2 | 2 |
| **Total** | | **12** |

This is a teaching model, not a standardized GraphQL cost. Actual results
may contain fewer than two edges; a pre-execution budget should conservatively
use an allowed cardinality bound, not assume a small current dataset.
Here, if the bound is `first: 20`, the same selection has a bound of
`1 + 1 + 20 * 5 = 102` units. The `edges` field occurs once on the
connection, while `node`, `id`, `title`, `author`, and `name` each occur
once per edge.

Two aliases of this catalogue field at `first: 20` would have a model
bound of 204 units despite unchanged depth. A server may choose weights
based on measured expense, nested list multipliers, abstract types,
directives and merged field selections. It must handle aliases, variables,
fragments and defaults correctly rather than counting raw text. Define
whether the policy charges a conservative upper bound for conditional
fields; calibrate it using traces and observed workloads.

<details class="learning-answer">
<summary>Predict: do 20 edges cost ten times the complete two-edge operation?</summary>
<p>No. The two fixed field occurrences are paid once, so the teaching model gives 12 units for two edges and 102 for twenty.</p>
</details>

## 2. Layer the admission and security controls

The shared schema accepts `first` as an `Int!` with default 2. Our service
policy separately permits 1 through 20, and rejects out-of-range values
before database access. A type-correct integer is not automatically a
valid business value. Bound `after` and other input lengths and validate
cursor structure and authorization too. A cursor is not proof of O(1)
access; indexing, ordering, filters and storage determine its performance.

Admission and execution should combine:

1. Request byte-size and parser limits, including variables and documents.
2. Schema validation, variable coercion, input and pagination bounds.
3. Depth, width, alias and estimated cost limits based on bounded lists.
4. Rate limits and quotas by principal and, where useful, network origin.
5. Authentication and object-, action-, and field-level authorization.
6. Deadlines, downstream timeouts, concurrency limits and cancellation.
7. Observability of rejected requests, execution time, errors, and actual
   downstream work, without logging secrets or private selections blindly.

For a concrete teaching policy, cap the entire decoded request body at
16,384 bytes, including JSON syntax, document, variables, and extensions.
Count bytes rather than characters, enforce limits while reading and after
decompression, and configure a separate compressed-size limit. This number
is a local example, not a GraphQL standard; pick a limit for real clients
and return a documented transport-level rejection for oversized requests.

A limit on request bytes does not bound the number of records returned.
A rate limit does not replace authorization. A timeout limits waiting and
may not undo already committed work. Disabling introspection can reduce
casual discovery but does not secure fields: operation names and requests
can still be learned elsewhere, and policies must be enforced at access.
Use safe error messages without exposing internal systems or another
learner's data.

<details class="learning-answer">
<summary>Predict: can disabling introspection protect an unguarded progress resolver?</summary>
<p>No. A client that knows the field can still request it. Authorization must protect the object and field independently of schema discovery.</p>
</details>

## 3. GraphQL errors and HTTP are different layers

For a selected operation, successful field execution can return `data`
alongside `errors`. A nullable `progress` field may be null with an error
path while `title` and `me` survive. A request error such as a parse,
validation, operation-selection, or variable-coercion failure prevents
execution and has `errors` without a `data` entry. An application can also
return an ordinary nullable field as null without an error.

Do not teach either “every GraphQL response is HTTP 200” or “any error must
be a non-200.” HTTP status and media type are transport choices governed by
the server's contract. The [GraphQL over HTTP specification](https://graphql.github.io/graphql-over-http/draft/)
is a **draft**, not a final RFC; it distinguishes behavior and recommendations
for `application/graphql-response+json` from compatibility with
`application/json`. Follow the relevant draft version and implementation's
documented behavior, and handle both the HTTP status and GraphQL response.
For example a server can use a non-2xx response for a malformed request,
while a response with partial data and field errors can be successful at the
HTTP layer. Do not retry solely because an `errors` array exists.

POST is common for GraphQL-over-HTTP, not a universal mandate. A service may
allow safe query operations over GET according to its policy, with operation
and variables encoded in the URL. It must not execute a mutation over GET;
URLs can appear in history, logs and intermediaries, so do not place secrets
there. The GraphQL specification itself describes execution, not a mandatory
HTTP deployment.

<details class="learning-answer">
<summary>Predict: does an HTTP success prove every selected field succeeded?</summary>
<p>No. Inspect data and errors as well as status and media type; a field error can coexist with partial data.</p>
</details>

## 4. Choose the cache and its boundary

The same endpoint can receive many documents and variable values. Caching
only by `/graphql` would confuse selections and users. HTTP caches use HTTP
method, URL and applicable `Vary` request headers and cache directives;
cacheability depends on the response and method, not simply on GraphQL.
A safe GET query may be cacheable under a deliberately configured policy.
POST is not automatically equivalent to a cacheable GET; any intermediary
support for it must respect HTTP semantics and its own configuration.

| Layer | Cached thing | Boundary and risk |
| --- | --- | --- |
| HTTP browser or CDN | Complete HTTP response | Method, URL, `Vary`, directives, and authorization determine reuse; a shared CDN must not serve private data to another principal. |
| Client normalized cache | Entity fields and references | Typically keyed by `__typename` and stable ID; selection, variables, merge policy, role changes and invalidation still matter. |
| Resolver or application cache | A lookup or computed value | Include tenant and policy-sensitive context in its key; define expiration and invalidation. |
| Request-scoped loader | Repeated key loads during one request | Avoid cross-request principal leakage; clear or prime after a write. |

An authenticated response with learner-specific progress is not public
merely because it was a query. Use `Cache-Control: private` where browser
storage is acceptable, or `no-store` where it is not; a shared cache needs
an explicit safe public representation and correct HTTP authorization
handling. `Vary` identifies relevant headers but is not a substitute for
privacy policy, authorization, or proper cache keys. An application-level
response cache should also include the selected operation, variables,
tenant, and every policy dimension that changes the result, or avoid
storing that response.

### Entity invalidation in a concrete timeline

1. The client reads course-101 with ID, title and seats at 30.
2. The authorized `enroll` mutation commits enrollment-42 and returns 29
   seats for course-101.
3. A client can merge the returned course fields into its normalized entity
   record, then invalidate or refetch affected enrollment and list views.
4. The server invalidates affected shared resolver/response cache entries,
   subject to its consistency policy; a request-local loader clears or
   primes a stale course key after the commit.

A normalized cache is a client storage strategy, not an algorithm guaranteed
by GraphQL. IDs need to be stable and unique within their intended type and
scope, and the client needs `__typename` if its cache keys use it. A
mutation response that omits an affected field cannot magically update it.
Lists, aggregate counts, permissions, and another user's view may require
separate invalidation. A role or tenant switch must not reuse protected
records under the wrong identity.

<details class="learning-answer">
<summary>Predict: does invalidating course-101 automatically fix every cached course list?</summary>
<p>Not necessarily. List membership, counts, and policy-dependent projections may require their own invalidation or refetch.</p>
</details>

## 5. Persisted operations are not automatically an allowlist

Automatic persisted queries (APQ) commonly let a client send a hash first.
If the server does not know it, the client can send the full document so
the server registers or caches the mapping. Later requests can reference
the hash to reduce repeated document transfer. Exact protocol and hash
handling depend on the implementation.

An allowlist instead admits only operations approved ahead of time; a new
hash plus document is not automatically accepted. A deployment can combine
persisted operations with an allowlist, but APQ registration alone does not
provide one. Neither a known hash nor an approved document authenticates the
caller or authorizes its objects. Variables still change cardinality and
targets, so validate them and apply cost, rate and size policies. A hash is
not a secret credential.

Persisting a document also does not by itself make a response cacheable:
the variables, principal, selected representation and HTTP policy remain
important. Measure whether saved request bytes matter for this service.

<details class="learning-answer">
<summary>Predict: is an APQ cache miss proof that a document was rejected by an allowlist?</summary>
<p>No. In a registration flow the client may send the full document after a miss. An allowlist requires a separate policy that rejects unapproved operations.</p>
</details>

## 6. Evolve a contract while clients lag

GraphQL lets a client select fields, but does not eliminate compatibility
work. This existing operation is valid against the shared schema:

```graphql
query EvolutionCard {
  course(id: "course-101") {
    id
    title
    seats
  }
}
```

The original selected response is:

```json
{"data":{"course":{"id":"course-101","title":"API Fundamentals","seats":30}}}
```

Imagine a future schema adds a nullable `description: String` to `Course`.
This is a hypothetical schema change, not part of today's fixture:

```text
Before: Course has id, title, seats, author, progress, enrollment
After:  Course also has description: String
```

The unchanged operation above receives the same selected JSON after that
addition. If a future client explicitly selects the new field and it is
available for course-101, its selected response might be:

```json
{"data":{"course":{"id":"course-101","title":"API Fundamentals","seats":30,"description":"An introduction"}}}
```

The extra field is not automatically sent to the old client. New clients
must tolerate null where the schema permits it, and wait until the server
deploys the field before requesting it. A stricter change such as removing
a selected field breaks validation; tightening an input or adding a
required argument can break requests. Changing an output from non-null to
nullable weakens the guarantee for existing consumers. Making output
non-null strengthens the contract but requires reliable data and can cause
larger error propagation if the promise is violated. Review actual usage,
generated client assumptions, and rollout order.

Likewise, imagine a future enum with `OPEN` and `CLOSED`, later extended with
`WAITLIST`. Even an additive enum value can break a client with an
exhaustive switch or strict generated deserializer. It is not a field in the
shared course schema; it illustrates a general compatibility hazard.
Plan a fallback where appropriate, communicate deprecations, measure old
operation usage, and remove fields only after migration.

Introspection and schema registries can reveal the published contract;
code generation helps clients compile against a particular version.
Neither proves runtime values, authorization, or performance. Run schema
compatibility checks, consumer contract tests, and representative operations
against candidate releases. Test old and new clients during a staged rollout.

<details class="learning-answer">
<summary>Predict: will a new optional field appear in an old client's response?</summary>
<p>No. The client receives the fields it selected, so adding a field does not add it to an unchanged selection.</p>
</details>

## 7. Federation is an architecture choice

The simple starting point can be one GraphQL service backed by one or more
data sources. Federation is an optional approach where independently owned
subgraphs contribute parts of a composed schema. An entity key identifies
the same logical entity across participating services; a gateway or router
plans the cross-service fetches. Ownership, key stability, authorization,
and data consistency must be agreed between teams.

```text
client -> router -> course-owned subgraph
                 -> author-owned subgraph
                 -> other services as the plan requires
```

Schema stitching is another integration approach that combines schemas and
delegates fields; its composition and entity linkage mechanisms differ by
implementation. Do not use the words as if they were identical protocols.
Federation can support independent ownership but adds network hops, query
planning, coordination, error boundaries, latency and cost. It does not
automatically scale a slow database or remove N+1. Bound the total operation
cost across subgraphs, propagate identity safely, and instrument downstream
calls. Introduce it when team and deployment needs justify the operational
cost, not simply because the system is large.

Apollo is a recognizable suite of GraphQL libraries and tools, including
client and server offerings and federation tooling. It is not GraphQL
itself, a required protocol, or a claim that this course implements its
framework. Alternatives exist; evaluate their behavior and operational
tradeoffs rather than treating a brand as an architectural requirement.

<details class="learning-answer">
<summary>Predict: does a federation router make an expensive downstream resolver cheap?</summary>
<p>No. The resolver still needs a sound data access plan, and the router adds planning and network costs.</p>
</details>

## 8. Subscriptions are event execution, not durable delivery

```graphql
subscription Progress($courseId: ID!) {
  courseProgress(courseId: $courseId) {
    percentComplete
  }
}
```

For `{"courseId":"course-101"}`, suppose the service emits two authorized
events in order. Each event produces a separately executed result:

```json
{"data":{"courseProgress":{"percentComplete":20}}}
```

```json
{"data":{"courseProgress":{"percentComplete":40}}}
```

The example assumes these events are emitted; the schema does not promise
an initial snapshot, frequency, or delivery of every change. GraphQL defines
subscription event execution, not one mandatory transport, reconnect
protocol, replay log, delivery guarantee or durable queue. WebSocket, SSE,
or other HTTP streaming carriers can be chosen with an appropriate documented
protocol and infrastructure; they are not interchangeable automatically.

Authenticate at connection or operation setup as appropriate, authorize the
specific course, and define what happens when credentials expire or access
changes during a long-lived stream. If the application needs resumability,
define event IDs, retention, replay, deduplication and gap behavior in the
application protocol; the shared `Progress` type above exposes no event ID.
Backpressure, fan-out and slow consumers need limits too.

Polling the existing query can be the simpler baseline when occasional
updates and additional request latency are acceptable:

```graphql
query PollProgress($id: ID!) {
  course(id: $id) {
    id
    progress { percentComplete }
  }
}
```

Polling yields a current snapshot under the service's read semantics; it may
miss intermediate changes. Compare freshness, client count, operating cost,
reconnect complexity, and required durability before selecting a transport.

<details class="learning-answer">
<summary>Predict: does reconnecting guarantee the 40 percent event is replayed?</summary>
<p>No. Replay and event identifiers require an explicit application contract and retained event history; the subscription type alone provides neither.</p>
</details>

## 9. Apply the tradeoffs

1. Calculate the cost bound for two aliases of `first: 20` under the
   teaching model. Which part does depth alone miss?
2. A private progress response is cached by URL alone. What information
   could cross a principal boundary?
3. A server registers unknown persisted hashes. What extra policy is needed
   to reject an unapproved operation?
4. A client exhaustively handles an enum. Why can a new server value break it?
5. A live client disconnects for a minute. What extra contract must exist to
   recover each missed progress event?

<details class="learning-answer">
<summary>Check: what should be measured before adopting federation or subscriptions?</summary>
<p>Measure actual latency, call counts, freshness requirements, failure recovery and operating costs, then compare them with a simpler single service or polling baseline.</p>
</details>

## Primary references

- [GraphQL specification: response](https://spec.graphql.org/October2021/#sec-Response),
  [validation](https://spec.graphql.org/October2021/#sec-Validation), and
  [subscription execution](https://spec.graphql.org/October2021/#sec-Subscription).
- [GraphQL.org: security](https://graphql.org/learn/security/) and
  [serving over HTTP](https://graphql.org/learn/serving-over-http/).
- [GraphQL over HTTP draft](https://graphql.github.io/graphql-over-http/draft/).
- [Apollo: automatic persisted queries](https://www.apollographql.com/docs/apollo-server/performance/apq/)
  and [federation overview](https://www.apollographql.com/docs/federation/).

Return to [execution and batching](GRAPHQL-EXECUTION-AND-BATCHING.md).
