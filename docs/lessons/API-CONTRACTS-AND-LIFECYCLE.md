# API contracts and lifecycle

An API contract is a shared, testable promise about an interface.
It is not the implementation, a running website, or a substitute for authorization.
This lesson follows a fictional course catalogue and enrollment interface from design to retirement.
You will inspect its complete contract, reason about changes, and decide what must still be implemented.

## Outcomes

By the end you can:

- distinguish OpenAPI from the tools that consume it;
- read paths, parameters, headers, security and reusable schemas;
- check concrete course and enrollment examples against their actual shapes;
- explain compatibility, rollout, monitoring and ownership.

## The canonical material

The [complete OpenAPI 3.1 contract](../contracts/course_api.openapi.json) is a real JSON file.
Open that file for the full definition; examples below are deliberately smaller.
It describes catalogue and enrollment only, not the entire learning platform.
It has seven operations across three paths.
The [architecture fixtures](../../assets/architecture-lesson-fixtures.mjs) provide the course and enrollment data used here.
They are teaching data, not a live database.
The documentation website does not implement these endpoints.
The placeholder server URL is illustrative, not permission to send real data.

| Path | Method | Operation | Purpose |
| --- | --- | --- | --- |
| `/courses` | GET | `listCourses` | List a bounded page. |
| `/courses` | POST | `createCourse` | Create a course. |
| `/courses/{courseId}` | GET | `getCourse` | Retrieve one representation. |
| `/courses/{courseId}` | PUT | `replaceCourse` | Replace writable fields. |
| `/courses/{courseId}` | PATCH | `patchCourse` | Merge-patch writable fields. |
| `/courses/{courseId}` | DELETE | `deleteCourse` | Delete a course. |
| `/courses/{courseId}/enrollments` | POST | `enrollCurrentLearner` | Enroll the authenticated caller. |

The path parameter is required because a concrete request must identify its course.
The declared `CourseId` parameter is a nonempty string, at most 128 characters.
Do not treat example identifiers as globally meaningful account identifiers.

<details class="learning-answer">
<summary>Predict: Does the contract describe progress streams too?</summary>
<p>No. Its scope is the seven catalogue and enrollment operations; other platform interfaces need their own contracts.</p>
</details>

## Specification and tooling

OpenAPI Specification (OAS) defines a machine-readable description of HTTP APIs.
JSON and YAML are alternative serializations of an OpenAPI document.
Swagger was an older name associated with the specification before the OpenAPI name.
Today Swagger UI renders documentation, Swagger Editor edits definitions, and Swagger Codegen generates code.
Those are tools; none is a synonym for the specification itself.
Other editors and generators exist; no paid tool is required for this lesson.
A local text editor and a schema-aware validator are enough to examine the file.
A renderer may provide a “Try it out” control when configured with a reachable server.
The course website is not such a server: do not claim that its endpoints were tried out.

## Anatomy of the definition

The top-level `openapi` value selects the specification version: `3.1.0`.
`info.title` names the contract and `info.version` is `1.0.0`, its API description version.
Neither is automatically the application's deployed build version.
Neither automatically dictates the URL pathname; a path need not contain `/v1`.
`servers` gives a base URL, while `paths` append request paths.
An operation defines its method, parameters, optional body, security and responses.
Response status codes identify outcomes; content maps media types to schemas.
Components centralize reusable schemas, parameters, responses and security schemes.
`$ref` points to one of these definitions rather than duplicating it.
References have to resolve in the complete document, not merely in a screenshot.

This valid JSON is a **partial JSON excerpt**, not a full OpenAPI document or program:

```text
{
  "openapi": "3.1.0",
  "info": {
    "title": "Course API teaching contract",
    "version": "1.0.0"
  }
}
```

In particular, an OpenAPI document also needs `paths`, `components` or `webhooks`.
This excerpt alone is not the complete course contract.
The full file includes `paths` and components.
Read the `info` object as mandatory metadata, not an optional decorative title.

### Schemas and types

`Course` is an object requiring `id`, `title`, and `seats`.
The first two are nonempty strings.
`seats` is an integer from 0 through 2147483647 inclusive.
The schema rejects additional properties.
That numeric range matches the signed 32-bit upper bound, but JSON itself has no int32 wire type.
`CourseWrite` requires both `title` and `seats`, and excludes `id`.
The server assigns the identifier; do not send it as a writable field.
`CoursePatch` permits either writable property or neither, with no required fields.
It also rejects additional properties and null for both properties.
`CoursePage` requires `courses` and `nextCursor`.
Its array holds at most 20 `Course` objects; `nextCursor` is a string or null.
`Enrollment` requires `id`, `courseId`, and `learnerId`, each a nonempty string.

OpenAPI 3.1 Schema Objects use JSON Schema type unions for nullability.
The actual cursor property uses `"type": ["string", "null"]`.
Do not copy the older OpenAPI 3.0 `nullable: true` convention into a 3.1 type union.
An omitted field and an explicit null are distinct JSON states.
An OpenAPI Schema Object cannot be defined by writing `id: number` as if that were a type declaration.
For this contract the correct schema has `type: object`, `properties`, and `required`.
Inside `properties`, `id` is a schema with `type: string`.
If a different numeric field is intended, use a nested `type: number` schema.

<details class="learning-answer">
<summary>Check: Can a Course contain 2.5 seats?</summary>
<p>No. Seats must be an integer within the declared inclusive range, even if a programming language uses one numeric type for both forms.</p>
</details>

## Read the course response

This is a JSON response body matching the canonical architecture course and `Course` schema:

```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 29
}
```

`GET /courses/course-101` can return this representation with status 200.
An `ETag` response header can identify a particular representation version.
The contract permits `If-None-Match` on the next GET.
If the validator matches, status 304 has no response body.
An ETag is a validator, not a count of visits or an authorization credential.
The exact tag is assigned by the implementation.
For example, an illustrative strong validator is `"course-101-v7"`.

The fixture's complete page is also a JSON response body:

```json
{
  "courses": [
    { "id": "course-101", "title": "API Fundamentals", "seats": 29 },
    { "id": "course-102", "title": "REST Studio", "seats": 20 }
  ],
  "nextCursor": null
}
```

For `GET /courses`, `limit` is an integer between 1 and 20, default 20.
`cursor` is an optional nonempty request string.
`sort` is `title` or `-title`, default `title`.
A null response cursor signals no next cursor in this teaching example.
The cursor is opaque to clients: do not increment or parse it.
Production documentation should define ordering stability and behavior when the catalogue changes.
An output cursor's string-or-null type is not the same as accepting null as a query parameter.

<details class="learning-answer">
<summary>Predict: Does a 304 response contain the course JSON?</summary>
<p>No. The client reuses its stored representation after a matching conditional GET; a 304 response has no body.</p>
</details>

## Create, replace and patch

The following is a valid `CourseWrite` JSON request body for POST or PUT:

```json
{
  "title": "API Fundamentals",
  "seats": 29
}
```

POST `/courses` returns 201 and a `Location` header on creation.
PUT `/courses/course-101` sends the complete writable representation.
Both writable fields are required for replacement, even if only one changed.
An administrator grant is needed for course creation and editing.
Clients must not infer that merely possessing a cookie grants that role.

The following is a valid `CoursePatch` JSON request body:

```json
{
  "seats": 29
}
```

PATCH uses `application/merge-patch+json`.
An absent property is unchanged; an empty object is a no-op.
JSON Merge Patch ordinarily interprets a property set to null as removal.
Here the minimal writable schema rejects null for `title` and `seats`.
Consequently neither required field can be removed through this contract.
That is different from treating null as an empty string, zero, or “not supplied.”
Adding `id` is also rejected because it is not writable.
Wrong media types for PATCH are described by 415.
Input validation failure can be reported as 400.

PUT and PATCH require `If-Match`.
This contract requires a strong validator, such as the earlier `"course-101-v7"`.
If the resource changed and that value is stale, return 412 without making the write.
A weak validator such as `W/"course-101-v7"` is not a strong comparison.
Version checks must be atomic with the write, or two concurrent editors may both pass.
The header declaration alone does not implement that atomicity.
DELETE is separately described and does not declare `If-Match` here.
Do not generalize a requirement from one method to all methods.

<details class="learning-answer">
<summary>Predict: Does a null title remove it in this PATCH?</summary>
<p>No. Merge Patch gives null removal semantics, but the minimal CoursePatch schema rejects null and the required title must remain present.</p>
</details>

## Enrollment and identity

`POST /courses/course-101/enrollments` has no request body.
It requires a session cookie and a nonempty `Idempotency-Key` header of at most 128 characters.
The verified caller, not an arbitrary `learnerId` supplied by the client, is the recipient.
The canonical 201 JSON response body is:

```json
{
  "id": "enrollment-42",
  "courseId": "course-101",
  "learnerId": "learner-7"
}
```

The successful response can include a `Location` header.
That learner is the one recipient in this example.
The fixture represents a post-enrollment course with 29 seats; no starting-seat arithmetic is implied.
The course capacity number is business data, not a request concurrency budget.

The declared `sessionCookie` security scheme names a `session` cookie.
It describes how credentials are presented, not how they are verified.
The implementation must validate the session, establish the caller and check grants.
For protected CRUD operations, 401 means authentication is required.
The documented 401 response includes a `WWW-Authenticate` challenge header.
403 means the authenticated caller lacks permission.
Depending on privacy policy, 404 may conceal a resource rather than disclose its existence.
Do not return private details in an error or log credentials and session tokens.
Keep the challenge appropriate to the deployed authentication scheme.

The idempotency key is a contract for safe retries, not magic supplied by OpenAPI.
Scope it to caller and operation, bind it to intent, and persist the outcome atomically with the effect.
Concurrent duplicates must coordinate rather than create two enrollments.
A matching completed retry replays the recorded outcome; conflicting intent yields 409.
Define retention and what happens after expiration.
A timeout after dispatch is an uncertain write, not proof that no enrollment occurred.
Retry with the same key while it remains valid; never invent a fresh key for that same intent.

<details class="learning-answer">
<summary>Check: Does declaring the session cookie authenticate the request?</summary>
<p>No. The server must verify the credential and apply authorization separately; the security scheme describes credential placement.</p>
</details>

## Privacy, caching and authorization

The selected GET operations have no declared security requirement in this file.
That is this example's public-read policy, not a universal rule for GET.
Another API may require a cookie for a private read.
User-specific enrollment counts or progress must not leak via a shared public cache.
Use appropriate private or no-store cache policy and vary keys where appropriate.
An ETag alone does not make a personalized response safe to cache globally.
Authorize before serving sensitive data, including cache hits.
Never assume all responses can be cached or that a cache replaces permission checks.
Course data and user data can need different policies even at the same gateway.
The definition's response schemas do not express every cache policy.
Agree on policy with implementers and test it in the actual deployment.

## Design and delivery workflow

Design-first begins by agreeing on use cases, actors and success/failure outcomes.
An editor such as VS Code can display and edit the local JSON file.
Provider-first starts with an existing service and describes observed behavior.
In either approach compare the definition with real behavior.
Validate the complete document and resolve references before publishing.
Validate examples against their actual component schemas.
Generate clients where useful, but inspect their error handling and assumptions.
Generated server stubs are placeholders, not business logic or security enforcement.
Implement identity, state transitions, persistence, transaction boundaries and observability.
Compile JSON Schemas to validate structure at the service boundary.
Schema compilation does not prevent side effects, enforce permissions, or solve distributed schema coordination.
Run implementation contract tests against actual behavior, not only generated examples.

### Release gate

1. Assign an accountable API owner and an escalation contact.
2. Record intended consumers and their supported versions.
3. Review the proposed schema and the behavior change together.
4. Run automated validation and a schema diff against the last published contract.
5. Test old consumers against the new provider.
6. Test new consumers against the old provider during mixed-version rollout.
7. Release behind a gate, canary or staged deployment where appropriate.
8. Monitor error rates, latency, adoption and compatibility failures.
9. Roll back or halt the rollout if the agreed signals breach thresholds.
10. Announce deprecation, give a migration window and monitor remaining use.
11. Retire only after the owner confirms the agreed exit criteria.

Losing administrative ownership is a lifecycle risk, not merely a version-bump problem.
An unowned contract can drift from deployment and leave consumers without migration support.
Transfer ownership and operating responsibilities before the previous owner departs.
Preserve the old contract and compatibility evidence for the supported period.
An API version string cannot repair an unannounced semantic change.

## What “compatible” means

Compatibility is directional: specify old client/new server or new client/old server.
It is also behavioral: a valid payload is not necessarily the same promise.
Adding a required request field breaks old callers that do not send it.
Removing a response field breaks consumers that require it.
Even an optional output field can break a strict consumer.
Here `Course` and `CoursePage` declare `additionalProperties: false`.
Adding a response property therefore fails validators built against the old schema.
Review such additions explicitly instead of assuming they are backward compatible.
New optional request fields need a defined default and old-provider behavior.
An added enum value may break exhaustive client switches or strict validators.
Changing an enum default can silently alter behavior even if both values validate.
Changing status codes can break retry and error-handling branches.
Changing sort order or cursor meaning can skip or duplicate records between pages.
Changing idempotency retention can change whether a delayed retry creates another effect.
A schema diff helps locate structural changes; it cannot prove all semantic compatibility.
Test representative consumers and document assumptions about order, cursors and defaults.

<details class="learning-answer">
<summary>Predict: Is adding an optional Course response field automatically safe?</summary>
<p>No. Existing strict validators reject additional properties, and consumers may also rely on semantics that a schema diff cannot assess.</p>
</details>

## Failure investigation

Imagine a team changes the default order but keeps the same response schema.
An old client stores a cursor produced under the old ordering.
After a rolling deployment, the next request may be processed by a new instance.
If cursor interpretation differs, that client can miss or repeat courses.
The JSON validates while the behavior is incompatible.
Define cursor versioning or preserve interpretation for the supported lifetime.
Test pagination across mixed deployments, then roll out and monitor duplicates and errors.
If the rollout fails, restore compatible behavior and retain incident evidence.
Communicate with consumers rather than silently changing the version string.

Imagine an editor updates seats using an old ETag.
If the server ignores `If-Match`, it can overwrite a newer administrator's edit.
If it enforces strong comparison atomically, the stale write gets 412.
The client fetches the latest representation and asks the administrator to reconcile.
A 401 or 403 instead concerns identity or authorization, not a version conflict.
These cases need separate tests and different user-facing recovery.

## Choose the right interface

OpenAPI fits a documented HTTP interface with methods, headers and media types.
It can support generated documentation and client code across many languages.
It does not replace a protobuf definition for native gRPC methods and streaming messages.
For the parallel native interface see the [protobuf contract](../contracts/course_api.proto).
Streaming has byte-level flow-control and application-level buffering concerns beyond an HTTP schema.
Neither a browser UI nor an API gateway is itself the contract.
For bounded admission and overload tradeoffs continue to [Backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md).

## Quick self-check

1. Which seven operations are in scope, and which platform capabilities are absent?
2. What distinguishes OpenAPI version, contract version and deployment path?
3. What fails if a client sends an `id` in `CourseWrite`?
4. How do absent and null properties differ in this merge patch?
5. Why does a cookie declaration not establish an administrator grant?
6. What must implement idempotency when the original reply is lost?
7. Which strict output schemas make even additive changes worth review?
8. Who owns deprecation and the migration window?

<details class="learning-answer">
<summary>Check: What proves that a released service conforms?</summary>
<p>The definition and validators describe expectations; tests of deployed behavior, authorization, compatibility and monitoring provide the needed evidence.</p>
</details>

## Continue

- [Guided architecture](../06-GUIDED-ARCHITECTURE.md)
- [Original architecture chapter](../06-API-ARCHITECTURE.md)
- [Gateways, BFFs and load balancing](GATEWAYS-BFFS-AND-LOAD-BALANCING.md)
- [Service mesh and trust](SERVICE-MESH-AND-TRUST.md)
- [Course content map](../COURSE-CONTENT-MAP.md)
- [Content corrections](../CONTENT-CORRECTIONS.md)
- [Canonical architecture fixtures](../../assets/architecture-lesson-fixtures.mjs)

The raw contract remains the source of truth for the seven operations.
The examples above explain it; they do not replace the complete file.
