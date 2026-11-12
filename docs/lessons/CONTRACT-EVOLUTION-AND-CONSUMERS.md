# Contract evolution and consumers

[← Expert journey](../07-GUIDED-EXPERT-DESIGN.md) |
[Original modules 7.1 and 7.2](../08-EXPERT-API-DESIGN.md)

This lesson is a fictional design exercise, not a live API or a Pact
verification. Its existing state is `course-101`, **API Fundamentals**,
with 29 available seats. Authenticated and authorized `learner-7` has
confirmed `enrollment-42` and completed the course. No request here
re-enrolls that learner or resets the course.

The [source contract](../contracts/course_api.openapi.json) and
[expert fixtures](../../assets/expert-lesson-fixtures.mjs) are the reference
for the current course. The proposed representation is explicitly a v2
proposal, not a silent change to the current closed schema.

## 1. Compatibility is a relationship, not a property of a diff

**Problem.** A provider deploys every week while a mobile client may stay
installed for months. A release must work across versions that coexist.

**Simple baseline.** Keep the current contract and observe the consumers
before changing it. A compatibility statement names the consumer version,
provider version, operation, direction and relevant behavior. It is not
enough to label a JSON edit “safe.”

**Worked exchange.** This is the fixture's current response to
`GET /courses/course-101`, with HTTP status 200.

<!-- example: current-course-response -->
```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 29
}
```

The response describes current available capacity; it does not create an
enrollment. The `Course` schema requires these three fields and has
`additionalProperties: false`. A client may impose further requirements,
but a client-specific expectation is not automatically part of the
published provider schema.

**Changed requirement.** A new screen wants a summary. The proposed v2
representation is:

<!-- example: proposed-course-response -->
```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 29,
  "summary": "A requirement-driven introduction to API communication."
}
```

**Limitation.** The added `summary` fails the old closed `Course` schema.
That remains true even though the old three fields are unchanged. A
consumer explicitly written and tested to accept unknown fields and depend
on the original subset might accept this proposed response. These are
different compatibility claims: tolerant client acceptance does not make
the payload valid under the old provider contract.

**Alternatives and tradeoffs.** Serve a separately negotiated v2
representation or endpoint while preserving v1, or change the requirement
and keep the old response. The extra version costs implementation,
documentation and retirement work; it prevents sending an invalid payload
to consumers relying on v1.

<details class="learning-answer">
<summary>Predict: is the proposed response valid under the old closed schema?</summary>

<p><strong>No.</strong> The old schema rejects <code>summary</code> as an
additional property. A tolerant subset consumer may nevertheless accept it,
but that is a different consumer contract, not evidence that the old schema
has become open.</p>
</details>

## 2. Trace the two directions

Compatibility depends on which component is old and what crosses the
boundary. “Backward” and “forward” are sometimes used inconsistently, so
state the pair explicitly.

| Pair | Request direction | Response direction | Question |
| --- | --- | --- | --- |
| Old consumer → new provider | Old request reaches new code | New response reaches old consumer | Does the new provider still accept old requests and return behavior old consumers understand? |
| New consumer → old provider | New request reaches old code | Old response reaches new consumer | Can the old provider accept what the new consumer sends, and can the consumer work without new response features? |

**Worked change: request.** Suppose a hypothetical new create operation
requires a `locale` that old clients do not send. A new provider rejecting
the old request breaks old consumer → new provider compatibility. Supplying
a documented default can preserve it only if the resulting behavior is
actually acceptable. Conversely, if a new client sends `locale` to an old
provider with a closed request schema, that old provider can reject it.

**Worked change: response.** If the new screen requires `summary`, an old
provider cannot supply it. The new consumer needs a fallback or must wait
until it can select v2 from an upgraded provider. If a new provider always
returns the field on v1, it breaks the old closed response contract.

**Changed requirement.** A provider wants to change the default page size,
not the shape. A client expecting at most a particular number of results,
or assuming a stable iteration order, may behave differently even when
both JSON documents validate.

**Limitation.** Wire compatibility, semantic compatibility and operational
compatibility are distinct. A type-correct response may use an old name
with a new meaning, return too late for the client, or repeat a cursor.
Neither schema acceptance nor a successful TCP exchange proves the user's
workflow still works.

**Alternatives and tradeoffs.** Preserve old behavior per version, offer an
explicit option, or negotiate a new contract. Each costs more than silently
changing a default but lets consumers migrate deliberately.

<details class="learning-answer">
<summary>Predict: will a new mandatory request field work with an old client?</summary>

<p>Not if the new provider rejects the old request for missing that field.
A compatible default may help, but only when its semantics satisfy existing
consumers. Check the reverse pair separately.</p>
</details>

### Changes that a field diff misses

* **Behavior and defaults:** changing whether a list excludes full courses
  alters results even if every response validates. Document old behavior
  and provide an explicit opt-in for a different filter.
* **Status:** changing a documented 200 to 202 can break a client that
  expects an immediately usable representation. A 202 generally indicates
  acceptance, not completion. Error status, retryability and error shape
  also matter to client control flow.
* **Cursor:** a cursor is opaque to clients. A provider must specify
  ordering, expiration, filter binding and what happens on invalid or
  expired cursors. A deployment that cannot read previously issued cursors
  can interrupt a mixed-version pagination session.
* **Enum:** adding a new value can break an exhaustive switch or a closed
  enum validator. Changing the meaning of an existing value is also
  breaking even if the spelling remains unchanged. Decide how an unknown
  value is displayed or rejected before adding it.
* **Null, absence and type:** missing, `null`, empty and zero need not mean
  the same thing. Changing a number to a string can pass through transport
  while breaking arithmetic or validation.

For example, the following is intentionally invalid against the current
`Course` schema because `seats` must be an integer:

```json-invalid
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": "29"
}
```

The catalogue page's `nextCursor` is required and may be a string or null.
`null` signals no next page in the teaching contract; omitting it is not
the same valid representation. A cursor need not encode an offset and must
not be treated as an authorization credential.

<details class="learning-answer">
<summary>Predict: is a new enum value always safe because it is additive?</summary>

<p><strong>No.</strong> A consumer may validate a closed enum or use an
exhaustive switch. Its unknown-value behavior must be agreed and tested;
the answer depends on the deployed consumer and contract.</p>
</details>

## 3. Be tolerant deliberately, not indiscriminately

**Problem.** Teams hear Postel's maxim, “be liberal in what you accept,”
and infer that all malformed requests should be accepted.

**Simple baseline.** Specify the allowed input, reject malformed or
unauthorized requests, and produce predictable, documented outputs.
Tolerance of an unknown response field is a narrowly scoped consumer
choice, not permission to ignore authentication or validation.

**Worked contrast.** A catalogue consumer can ignore a harmless unknown
presentation field if its own accepted contract allows it. A server should
not silently ignore an unknown write field that the caller thinks controls
access, money or identity. Ignoring it might produce a successful response
while performing a different operation than the caller intended.

**Changed requirement.** A partner asks to add optional request metadata.
Define which fields are accepted, their bounds and their security
semantics; use explicit negotiation or a versioned extension point.

**Limitation.** Excessive tolerance hides typos, inconsistent producers,
ambiguous interpretations and security problems. Strict validation can
also make harmless extensions difficult. Choose by boundary and field,
not by slogan.

**Alternatives and tradeoffs.** Allow unknown display fields for a consumer
that does not depend on them, or reject unknown writes for a sensitive
operation. Record observability without logging private payloads. Version
an extension if behavior would otherwise be ambiguous.

<details class="learning-answer">
<summary>Predict: should the provider silently ignore an unknown access-control field?</summary>

<p><strong>No.</strong> Rejecting an unknown security-sensitive input avoids
pretending the requested restriction was applied. A tolerant response
consumer is a separate, explicitly chosen policy.</p>
</details>

## 4. Expand, migrate, observe, contract

**Problem.** Mobile v1 cannot be replaced immediately, and old and new
providers coexist during rolling deployment and rollback.

**Simple baseline.** Keep v1's closed representation and behavior
unchanged. Name a provider owner, a consumer owner, a deployment owner and
a deprecation decision owner. Know where telemetry comes from and who
contacts consumers.

**Worked plan.**

1. **Expand provider support.** Deploy code that still serves v1 and can
   also serve the proposed v2 only when explicitly selected. During a
   mixed provider rollout, route v2 requests only to instances that support
   v2 or delay client enablement until all relevant instances do.
2. **Verify and release.** Test old client/v1 with both old and new
   providers. Test the new client with its selected provider versions and
   define a v1 fallback if the old provider can still receive its request.
3. **Migrate consumers.** Contact known owners, publish examples and dates,
   track adoption by client version and environment, and offer migration
   help. Telemetry may miss offline clients and unknown integrations.
4. **Observe and deprecate.** Announce the v1 end-of-support date, support
   policy and replacement. Monitor remaining usage and failures, investigate
   unowned consumers, and decide exceptions explicitly.
5. **Contract only after the decision.** Retire v1 after the agreed window,
   evidence and owner sign-off. Update documentation and verify the removal.
   A passing test alone does not establish that no unregistered consumer
   remains.

**Rollback.** Before enabling v2, confirm the prior provider can still serve
all traffic it may receive. If new clients require v2, disable the feature
or route them to a compatible provider; otherwise a rollback can strand
them. Keep old data readable while dual versions exist. If a destructive
storage migration has happened, rollback may need a forward fix rather than
a binary downgrade.

**Limitation.** A deployment matrix can grow quickly, and usage counts
alone do not prove every consumer has migrated. A client disconnected for
months may return after retirement.

**Alternatives and tradeoffs.** A long overlap costs support but protects
slow consumers; a short deadline reduces maintenance but risks disruption.
Negotiate the policy with actual owners rather than assigning a universal
duration. A separate endpoint or media type both require routing, caching
and documentation to distinguish representations.

<details class="learning-answer">
<summary>Predict: can the team remove v1 as soon as its known contract tests pass?</summary>

<p><strong>No.</strong> Tests cover registered expectations and versions,
not all installed or offline clients. The deprecation owner needs migration
evidence, a communicated window, an exception decision and a rollback plan.</p>
</details>

<details class="learning-answer">
<summary>Exercise: keep the simple solution if no new data is required.</summary>

<p>Keep v1 unchanged and show the title if it meets the user need. Do not
create a second API version just to demonstrate a migration pattern.</p>
</details>

## 5. Consumer-driven contracts: a concrete interaction

**Problem.** The provider's own tests can pass even when a particular
consumer depends on a response it no longer returns.

**Simple baseline.** The consumer documents the behavior it actually
needs. The provider tests its published schema and behavior, and both teams
communicate before releases. Consumer-driven contract (CDC) testing adds
automated verification of selected consumer expectations.

**Worked interaction — TEACHING MODEL.** The following JSON models an
interaction for discussion. It is **not serialized Pact**, is not an
executed Pact test, and is not an SDK example. Its provider state is a
description of a reproducible precondition, not an instruction to create a
new enrollment or reset shared data.

<!-- example: consumer-interaction -->
```json
{
  "providerState": "course-101 exists with 29 available seats",
  "request": {
    "method": "GET",
    "path": "/courses/course-101"
  },
  "response": {
    "status": 200,
    "body": {
      "id": "course-101",
      "title": "API Fundamentals",
      "seats": 29
    }
  }
}
```

An actual consumer test exercises the consumer's HTTP client against a
controlled test provider and captures its expectation in the framework's
supported format. A provider verification sets up the named state in an
isolated test environment, replays the request against the provider and
compares the actual response with the contract's matching rules.
State setup must be deterministic and cleaned up or isolated from other
tests; it must not alter production or depend on a prior test's order.

**Changed requirement.** The consumer can display any nonnegative seat count,
not just 29. An exact literal matcher for `29` may make the test brittle
without expressing that real requirement. A type and range matcher may be
more representative if supported by the selected framework and configuration.
The example's literal JSON itself does not declare such a matcher.

**Limitation.** A loose matcher can let a semantically wrong response pass;
an exact matcher can reject harmless variation. A provider state is a
test precondition, not a guarantee of production data. A response match
does not validate security, latency or unrepresented workflows.

**Alternatives and tradeoffs.** Use exact values for identifiers and
semantics the consumer genuinely requires, and flexible matchers for
legitimate variation. Include negative interactions when the consumer
depends on a particular failure. Avoid turning a consumer contract into a
copy of every provider field, which couples it unnecessarily.

<details class="learning-answer">
<summary>Predict: does the teaching JSON alone verify a Pact interaction?</summary>

<p><strong>No.</strong> It is a model of the precondition, request and
expected response. Actual verification requires a supported contract format,
framework tooling, provider state setup and an executed comparison.</p>
</details>

### Events are contracts too

A hypothetical consumer of a `course.completed` event may require an event
identifier, type, course and learner identity. Match the payload fields and
metadata the consumer actually uses, including a version or content type
when meaningful. Construct a controlled event in a provider test and invoke
the consumer's actual handler in its test; do not assume an HTTP replay
proves event handling.

Event contracts do not by themselves prove broker delivery, partition
ordering, redelivery, deduplication or recovery. Integration tests and
operational checks must cover those properties. A new event field can break
a closed event consumer just as an added HTTP response field can.

<details class="learning-answer">
<summary>Predict: does a matching event body prove exactly-once processing?</summary>

<p><strong>No.</strong> It checks the represented interaction, not broker
delivery or consumer side effects. Duplicate delivery and durable
deduplication require separate tests and operational evidence.</p>
</details>

## 6. Version matrix and a release gate

**Problem.** Passing a contract locally does not say whether every
deployed consumer/provider combination is safe.

**Simple baseline.** Track immutable application versions, the environments
where each is deployed or supported, and the verification results. A broker
can store published consumer contracts and provider verification results
against versions; it does not discover unknown consumers automatically.

**Worked matrix.** “Pass” here is an illustrative result, not a claim that
any Pact tooling ran in this repository.

| Consumer | Provider | Representation | Example verification | Release interpretation |
| --- | --- | --- | --- | --- |
| mobile 1 | provider 1 | v1 | pass | Existing deployed pair |
| mobile 1 | provider 2 | v1 | pass | Needed before provider 2 rollout |
| mobile 2 | provider 2 | v2 | pass | Needed before mobile 2 enablement |
| mobile 2 | provider 1 | v2 | fail / unsupported | Route away, delay enablement or use tested v1 fallback |

**Changed requirement.** A provider release must be safe against every
relevant supported consumer version. CI publishes a candidate version,
verifies selected published contracts against it, records results, and
checks the deployment matrix for the target environment before release.
Consumer CI similarly publishes its candidate expectations and checks
provider compatibility before enabling the consumer. Environments and
version labels must reflect actual deployments.

**Limitation.** A green gate covers only published, correctly selected
interactions and accurate version records. It does not discover offline or
unregistered clients, establish complete coverage, test every dynamic
business rule, or prove availability. A stale broker matrix can incorrectly
allow or block a deployment. Network access, state setup and matchers can
also produce misleading results if misconfigured.

**Alternatives and tradeoffs.** Start with a manually maintained matrix for
a few owners; automate a broker gate as independent release coordination
grows. Treat a missing verification as an explicit risk or block according
to policy, not as a pass. Monitor actual production behavior after release.

<details class="learning-answer">
<summary>Predict: does mobile 2's v2 contract passing against provider 2 make rollback to provider 1 safe?</summary>

<p><strong>No.</strong> Provider 1 does not support v2 in the illustrated
matrix. Roll back the feature or route to a compatible provider, or verify
that the consumer's v1 fallback works before switching traffic.</p>
</details>

### OpenAPI, CDC and end-to-end testing complement one another

| Tool or test | Useful evidence | Important gap |
| --- | --- | --- |
| OpenAPI and schema validation | Provider's declared operations, shapes, status codes and constraints; examples can be validated against it | Does not prove a specific consumer's behavior, a real deployment or all semantics |
| Consumer-driven contract / Pact | Selected consumer expectations verified against a provider version with explicit state and matching rules | Does not cover unknown consumers, every workflow, network infrastructure or performance |
| End-to-end test | A representative integrated user path through deployed components | Slower and more fragile; limited scenarios and environment fidelity |

Use schema checks for the broad published interface, consumer contracts for
important versioned expectations, and a small set of end-to-end journeys
for real integration. None replaces authorization tests, resilience tests,
or monitoring. Pact is one CDC tool; this teaching model does not assert an
installed SDK, generated contract or provider verification.

<details class="learning-answer">
<summary>Exercise: transfer the contract to a parcel tracking event.</summary>

<p>State which event version and tracking fields a notification consumer
uses, set up a reproducible provider event, and match the consumer-relevant
values. Separately test duplicate handling, authorization and broker
recovery; a matching event alone does not prove delivery.</p>
</details>

## 7. Return to the design decision

The new summary is useful only if a real user needs it. Keep the old v1
response valid, identify mixed deployments, select a separately defined v2
representation and verify the versions that can actually meet. If the
feature can wait, the simple original response remains a valid choice.
Return to the [expert journey](../07-GUIDED-EXPERT-DESIGN.md#expert-evolution)
or consult the [original Phase 7](../08-EXPERT-API-DESIGN.md), the
[library](../../README.md), and the [corrections ledger](../CONTENT-CORRECTIONS.md).
