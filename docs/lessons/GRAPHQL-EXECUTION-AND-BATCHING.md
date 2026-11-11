# GraphQL lesson: execution and batching

Follow one request from a selected operation to its response, then count
the work hidden behind it. The shared [teaching schema and fixtures](../../assets/graphql-lesson-fixtures.mjs)
are a contract for these examples, not a deployed service.

Start with the [guided GraphQL journey](../02-GUIDED-GRAPHQL.md) and
[original GraphQL reference](../02-GRAPHQL.md). Continue to
[cost, caching, and evolution](GRAPHQL-COST-CACHING-AND-EVOLUTION.md).
The [Phase 0 journey](../00-GUIDED-FUNDAMENTALS.md),
[REST reliability lesson](REST-RELIABILITY-AND-OPERATIONS.md),
[content map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md) connect this lesson
to the rest of the course.

Jump to the [N+1 count](#6-count-the-n1-then-change-the-plan) or
[mutation retry contract](#8-writes-serial-fields-are-not-a-transaction).

## 1. Start with a snapshot, not an imaginary server

Our examples start independently from this snapshot unless stated otherwise:

| Course | Title | Seats | Author | Progress | Enrollment |
| --- | --- | ---: | --- | ---: | --- |
| course-101 | API Fundamentals | 30 | author-1: API Team | 20% | null |
| course-102 | REST Studio | 20 | author-2: REST Team | null | null |

The authenticated learner is `learner-7`. A successful enrollment can
create `enrollment-42` and leave course-101 with 29 seats. A later progress
event may report 40%; that is not the initial snapshot.
The initial 20% is preview progress under this fictional platform's policy,
not evidence of an existing enrollment or a permission grant.

The schema has `Query.course`, `Query.courses(first, after)`, and `Query.me`.
`Course` includes `author`, nullable `progress`, and nullable `enrollment`.
The mutations are `enroll`, `createCourse`, `updateCourse`, and
`deleteCourse`; `courseProgress` is a subscription field. Only selected
fields appear in an execution result. The examples describe plausible
resolver behavior under stated policies, not guarantees of the schema.

## 2. A request has gates before execution

```text
document + operation name + variables + identity
  -> parse -> validate document -> select operation -> coerce variables
  -> apply admission policy -> execute fields -> assemble data and errors
```

Parsing checks syntax. Validation checks the document against the schema:
fields must exist, scalar fields cannot have child selections, required
arguments must be provided, and fragment and variable usage must be valid.
When a document contains multiple operations, the server needs the intended
operation name. Variables are coerced against their declared input types
before execution. Authentication can establish the principal at the transport
boundary; authorization must still be enforced wherever protected data and
actions are accessed.

For example:

```graphql
query CourseCard($id: ID!) {
  course(id: $id) {
    id
    title
    seats
  }
}
```

Variables:

```json
{"id":"course-101"}
```

Under the snapshot, the selected result is:

```json
{"data":{"course":{"id":"course-101","title":"API Fundamentals","seats":30}}}
```

Missing `$id` or supplying an object for it causes a variable coercion
failure before field execution. An unknown field is a validation failure:

```graphql-invalid
query BadCard {
  course(id: "course-101") {
    tuition
  }
}
```

This invalid document does not ask a database whether tuition exists.
Similarly, parse and validation errors are request errors: execution does
not start and the response has `errors` but no `data` entry. Schema
validation alone is not business validation: for example `first` is an
`Int`, but an API can reject a negative or too-large value by policy.

<details class="learning-answer">
<summary>Predict: can the database be queried for the invalid tuition field?</summary>
<p>No field execution should occur for a document that fails validation. Authentication or request logging may still perform separate work.</p>
</details>

## 3. Field resolution assembles a tree

The root `course` resolver receives `id`, request context, and execution
information. It might read one row, apply object authorization, and return
an object. GraphQL then resolves each selected child field. An explicit
`Course.author` resolver can use `authorId` to look up an author. A default
field resolver commonly reads a same-named property from the parent object;
the exact default behavior is implementation-specific. `id`, `title`, and
`seats` may therefore require no extra database calls after the row is read.

```text
Query.course("course-101") -> course row
  id, title, seats         -> parent properties
  author                   -> author lookup -> name property
  progress                 -> nullable parent property or protected lookup
```

Resolver code must enforce the relevant authorization, including whether
this learner can see a specific course, progress, or enrollment. A schema
does not automatically make a field private. It also does not automatically
return an authorization error: the service chooses whether to deny with an
error, return null where allowed, or use another documented policy.
Avoid exposing sensitive denial details.

The runtime can resolve independent query fields concurrently. One GraphQL
operation is not necessarily one database query, one service call, or even
one backend. Observe resolver and downstream timings rather than inferring
work from the number of HTTP requests.

## 4. Selection, aliases, fragments, directives

This operation asks for the same course twice under distinct response keys.
The aliases do not change the underlying field or arguments.

```graphql
query CompareCards($showProgress: Boolean!) {
  firstCard: course(id: "course-101") {
    ...CourseBasics
    progress @include(if: $showProgress) {
      percentComplete
    }
  }
  secondCard: course(id: "course-102") {
    ...CourseBasics
    progress @skip(if: $showProgress) {
      percentComplete
    }
  }
}

fragment CourseBasics on Course {
  id
  title
}
```

With variables:

```json
{"showProgress":true}
```

The selected result is:

```json
{"data":{"firstCard":{"id":"course-101","title":"API Fundamentals","progress":{"percentComplete":20}},"secondCard":{"id":"course-102","title":"REST Studio"}}}
```

The fragment is a reusable selection, not another request. A fragment's
type condition must be compatible with the selection location. `@include`
includes when its Boolean is true; `@skip` omits when its Boolean is true.
When a field is omitted by a directive, it is absent, not `null`.
Aliases also appear in error paths, so the client can locate a failing
response position. Different aliases can create extra work if they cause
distinct field evaluations; measure rather than assume deduplication.

<details class="learning-answer">
<summary>Predict: does secondCard contain a null progress field above?</summary>
<p>No. The skip directive excludes that field from the response entirely.</p>
</details>

## 5. Nullable results and error paths

Consider this authorized query:

```graphql
query Dashboard($id: ID!) {
  course(id: $id) {
    title
    seats
    author { name }
    progress { percentComplete }
    enrollment { id }
  }
  me { id }
}
```

For `{"id":"course-101"}`, an ordinary result has progress 20 and a
null enrollment. A nullable `enrollment` can mean no enrollment is known;
null by itself does not establish an error or reveal its reason.

Suppose instead the `progress` resolver fails its permission check and this
service chooses to expose a sanitized field error. Since `progress` is
nullable, siblings survive:

```json
{"data":{"course":{"title":"API Fundamentals","seats":30,"author":{"name":"API Team"},"progress":null,"enrollment":null},"me":{"id":"learner-7"}},"errors":[{"message":"Progress unavailable","path":["course","progress"]}]}
```

The `errors` entry is illustrative; extensions, locations, and wording
depend on the implementation. GraphQL error paths contain response keys
and, for lists, zero-based indices. `data` and `errors` can coexist.
An authorization field error is not automatic: it results from a resolver
or authorization layer raising an error under this example policy.

Now suppose the `name` resolver fails instead. Both `Author.name` and
`Course.author` are non-null, so the error propagates through them until
the nullable `Query.course` boundary. The independent `me` field survives:

```json
{"data":{"course":null,"me":{"id":"learner-7"}},"errors":[{"message":"Author unavailable","path":["course","author","name"]}]}
```

The path still identifies the original failing field even though `author`
and then `course` could not be represented. If every boundary to the root
were non-null, the entire `data` value would become null. Non-null is a
response guarantee, not a promise that a dependency can never fail.

### Lists: two different promises

The following is a hypothetical type comparison, not an addition to the
shared schema:

```text
[Course!]   nullable list, non-null items
[Course]!   non-null list, nullable items
```

Imagine each is a field called `items`, with a nullable containing object,
and an error at the second item's `title` (which is non-null).

| Type | Effect at index 1 | Original error path |
| --- | --- | --- |
| `[Course!]` | Item cannot be null, so the whole list becomes null | `["items",1,"title"]` |
| `[Course]!` | Item may be null; the list remains, with a null at index 1 | `["items",1,"title"]` |

If the list resolver itself fails, `[Course!]` can become null but
`[Course]!` must propagate to its containing nullable boundary.
With `[Course!]!`, neither a null item nor a null list is permitted, so an
item failure also propagates beyond the list. These comparisons concern
execution errors; GraphQL type validation is a separate earlier stage.

<details class="learning-answer">
<summary>Predict: which list permits a null item after an item field fails?</summary>
<p>The non-null list of nullable items permits the failed item to become null; the nullable list of non-null items becomes null as a whole.</p>
</details>

## 6. Count the N+1, then change the plan

```graphql
query Catalogue($first: Int!) {
  courses(first: $first) {
    edges {
      node {
        id
        title
        author { name }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

Use `{"first":2}`. Suppose the first course query returns both rows and a
naive author resolver separately queries each author. These are illustrative
database calls, not mandatory GraphQL execution:

| Step | Call | Rows |
| --- | --- | --- |
| 1 | Read page of courses | course-101, course-102 |
| 2 | Read author-1 | API Team |
| 3 | Read author-2 | REST Team |

That is **1 + 2 = 3** database calls. At N courses, the shape can be
1 + N, even though the client sends one operation. Additional policies,
pagination metadata, or services may add more work.

A request-scoped DataLoader can collect the two author IDs and issue one
batch query, e.g. `SELECT ... WHERE id IN (...)`. With the same assumptions:
one course query plus one author query is **2** database calls.
The batch function must return one result per input key, in input order,
even if SQL returns rows in another order. For keys
`[author-2, author-1, missing]`, the aligned results are
`[REST Team, API Team, null]` under a nullable lookup policy. A missing
author assigned to the shared non-null `Course.author` still causes
non-null propagation. A batch function may instead return per-key errors.

Repeated keys can be deduplicated by the loader's request-local cache;
the batch must preserve alignment for the keys actually handed to it.
Do not assume all loads for an entire request happen in one batch: loads
scheduled in different dispatch windows, dependent levels, or capped
batch sizes may produce multiple queries. Sequentially awaiting each load
can defeat batching. Test actual query counts with instrumentation.

Scope loaders to one request and its authenticated tenant and policy.
Sharing a cache across principals without a correct security-aware key and
invalidation risks leaking data. Even within one request, a mutation can
make a cached author or course stale: after a successful update, clear the
affected key, or clear and prime it with the newly committed value, before
a later read. Rollbacks and authorization must also be considered.
DataLoader is one option, not a requirement: an efficient join or preload
can fetch these authors with the course page, provided it preserves
pagination and authorization semantics. Compare actual plans and payloads.

<details class="learning-answer">
<summary>Predict: does batching guarantee one SQL query for every request?</summary>
<p>No. Different dispatch windows, batch limits, and other selected fields can require more calls. The two-call example assumes one course query and one author batch.</p>
</details>

## 7. Pagination bounds work, not just syntax

For this lesson, define an application policy: `first` must be between
1 and 20 inclusive. The schema's `Int! = 2` permits a default but does not
itself enforce that range. Reject invalid or excessive values before data
access as domain/admission validation, and include the accepted value in
query-cost analysis. The cursor is an opaque continuation token; the
server must validate it, use a stable ordering, and document consistency
under inserts and deletes.

`after` does not magically imply O(1) access. Performance depends on the
cursor encoding, indexed ordering, filters, database plan, and page size.
`pageInfo.hasNextPage` might require an extra row or another query; the
N+1 count above deliberately assumes the page and metadata come from one
course query.

<details class="learning-answer">
<summary>Predict: is first equal to 100 valid just because it is an Int?</summary>
<p>It satisfies the GraphQL input type but violates this lesson's separate maximum of 20 and should be rejected by the application policy.</p>
</details>

## 8. Writes: serial fields are not a transaction

```graphql
mutation Enroll($input: EnrollInput!) {
  enroll(input: $input) {
    enrollment { id courseId learnerId }
    course { id seats }
  }
}
```

Variables, with authentication supplied separately:

```json
{"input":{"courseId":"course-101","idempotencyKey":"enroll-7-a"}}
```

After an authorized successful commit from the initial snapshot:

```json
{"data":{"enroll":{"enrollment":{"id":"enrollment-42","courseId":"course-101","learnerId":"learner-7"},"course":{"id":"course-101","seats":29}}}}
```

The server derives learner-7 from verified identity and checks eligibility,
course access, and seat availability. The key is not authentication.
Top-level mutation fields execute serially within one operation. This does
not make them a transaction: if the first commits and the second fails,
the first is not automatically rolled back. Nested selections and external
effects also need explicit design.

Other operations in the same schema can be used separately:

```graphql
mutation CreateCourse($input: CourseInput!) {
  createCourse(input: $input) { id title seats }
}
```

```graphql
mutation UpdateCourse($id: ID!, $patch: CoursePatchInput!) {
  updateCourse(id: $id, patch: $patch) { id title seats }
}
```

```graphql
mutation DeleteCourse($id: ID!) {
  deleteCourse(id: $id)
}
```

Each write requires action and object authorization and business validation;
the schema does not declare that every learner may edit or delete courses.
The server defines patch semantics, including what explicit null means for
optional input fields. Update or delete also requires appropriate cache
invalidation.

### Retry the intent, not the side effect

A lost response does not prove enrollment failed. In this example, claim a
unique key scoped to authenticated principal and enrollment operation
family; include course target and meaningful input in a semantic
fingerprint. A matching completed retry returns the recorded outcome,
while the same key for course-102 conflicts rather than enrolling twice.
The scope deliberately does not include course, so a changed course can be
detected. Define in-progress handling, retention, payload canonicalization,
and recovery.

The unique claim, seat check/decrement, enrollment and recorded outcome need
transactional concurrency control in the same transactional store. A
remote payment or email provider is outside that transaction: use that
provider's idempotency support where available, a durable outbox and
reconciliation where appropriate, and handle uncertain outcomes. Do not
promise exactly-once external effects merely because a GraphQL mutation
was serial.

<details class="learning-answer">
<summary>Predict: does serial execution roll back a previous mutation field when the next fails?</summary>
<p>No. Serial ordering is not atomicity; application transactions and external effect recovery must be designed separately.</p>
</details>

## 9. Try it and check your reasoning

1. For a page of two courses, calculate the naive and batched author call
   counts. What assumptions would make your actual count higher?
2. Replace `firstCard` with another alias. Which response key appears in an
   error path, and why?
3. If progress is null without an error, can you conclude access was denied?
4. A load occurs before and after a course update in the same request.
   What prevents the second load from returning a stale cached row?
5. A retry key is reused for a different course. Why is the fingerprint
   checked under the same principal-and-operation claim?

<details class="learning-answer">
<summary>Check: what evidence distinguishes a slow operation from an N+1?</summary>
<p>Trace resolver and downstream call counts and timings. A slow operation can have many causes; an N+1 specifically has repeated child fetches proportional to the parent count.</p>
</details>

## Primary references

- [GraphQL specification: execution](https://spec.graphql.org/October2021/#sec-Execution)
  and [response](https://spec.graphql.org/October2021/#sec-Response).
- [GraphQL.org: execution](https://graphql.org/learn/execution/) and
  [queries](https://graphql.org/learn/queries/).
- [DataLoader batch function contract](https://github.com/graphql/dataloader#batch-function).

Next: [cost, caching, and evolution](GRAPHQL-COST-CACHING-AND-EVOLUTION.md).
