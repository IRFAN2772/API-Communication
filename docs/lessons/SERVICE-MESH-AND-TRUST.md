# Service mesh and trust

Start with one backend and a client.
A direct, well-secured application can be the right design.
Neither an API gateway nor a BFF nor a service mesh is automatically required.
Use a mesh only when its particular benefits justify its costs and operational ownership.

## Outcomes

After this lesson you can:

- Distinguish workload identity from the learner's identity and permissions.
- Explain data-plane and control-plane responsibilities without assuming one topology.
- Trace identity and failure behavior through a course enrollment.
- Calculate retry amplification and reason about deadlines and cancellation.
- Evaluate canary traffic, long-lived streams, and rollback limitations.
- Recognize when discovery, certificates, or readiness make routing unsafe.

## Shared case

Our fictional course snapshot is `course-101`, API Fundamentals, with 29 seats.
`learner-7` has a confirmed enrollment identified by `enrollment-42`.
These are the values in the [shared architecture fixtures](../../assets/architecture-lesson-fixtures.mjs).
The seat count is an observation, not an immutable fact.
The [OpenAPI 3.1 contract](../contracts/course_api.openapi.json) describes course and enrollment APIs;
it is a teaching contract, not an implementation or a live deployment.
Its `sessionCookie` declares a cookie named `session` for secured operations.
The scheme does not itself verify the session, authorize the learner, or provide CSRF protection.

The companion [gateway, BFF, and load balancing lesson](GATEWAYS-BFFS-AND-LOAD-BALANCING.md)
uses the same mobile, web, and dashboard configuration and optional recommendation dependency.
Each client view may have a separate BFF, or all may share a backend when needs are alike.
Neither this lesson nor its examples require a live proxy, cluster, or paid service.

## Boundary sketch

```text
Mobile / Web / Dashboard
          |
 optional gateway --> optional frontend BFF
                           |
                    course backend
                     /          \
             enrollment    recommendations (optional)
                     \          /
                policy-managed service traffic
```

Text alternative: clients may use a gateway and BFF; the BFF calls course,
enrollment, and optional recommendation backends, whose service traffic may be policy-managed.
The sketch describes roles rather than requiring particular network links or products.
The service responsible for a write still owns its transaction and business rules.

## What a mesh adds

A service mesh provides coordinated communication policies and telemetry across participating workloads.
Examples include peer authentication, transport protection, routing, retries, and traffic measurements.
It commonly addresses east-west service-to-service traffic.
An edge gateway commonly handles north-south client-to-service traffic.
These are useful descriptions, not absolute boundaries: products and deployments can overlap.
A gateway can participate in a mesh, and internal gateways can also exist.
Participation and enforcement coverage must be verified, not inferred from a diagram.

### Data plane and control plane

The data plane applies the configured policies to traffic it actually sees.
Depending on mode, that can mean workload-local proxies, node-level proxies,
or proxyless application libraries that participate in mesh protocols.
The control plane supplies administrative policy, service discovery information,
and, where supported, certificate issuance or distribution and rotation configuration.
It is not necessarily on the physical path of each request.
A request can keep flowing through existing data-plane state when a control plane is unavailable,
but only as long as that mode's cached routes, policy, and credentials remain usable.

A sidecar is one common deployment model: a proxy accompanies a workload.
Not every mesh uses a sidecar for every workload.
Ambient or node-level proxy modes and proxyless modes make different trade-offs.
Different modes may support different features and enforcement coverage.
The actual product, version, mode, configuration, and participating traffic determine behavior.

Envoy is a proxy that can serve as a data-plane component in some configurations.
Istio is a mesh system providing control and policy functions and can use Envoy proxies.
The mapping is not an immutable rule for all releases, modes, or products.
A proxy alone is not automatically a configured service mesh.

### Practical ownership

Someone must own policy changes, compatibility, certificate rotation, upgrades,
proxy resource budgets, incident response, and exceptions for non-participating traffic.
Application teams still own data validation, transactions, business rules, and user permissions.
Network telemetry does not replace application metrics or application trace propagation.
A network feature that is not configured or not on the path cannot protect that path.

## Workload identity is not learner authority

Mutual TLS authenticates peers using their configured credentials and protects the connection.
A verified certificate can establish that a peer is an authorized workload identity,
subject to the trust roots, certificate validity, policy, and actual enforcement.
It does not prove which learner initiated a request or which course that learner may access.
It does not prove the request body or tenant is authorized.
The application must enforce those facts against trusted user context and current business state.

### Worked identity chain

1. `learner-7` presents the contract's session cookie to the edge or application.
2. The responsible component validates the session and establishes the learner's identity.
3. A client-supplied `X-User-ID` is stripped, not trusted as an identity assertion.
4. A gateway or BFF forwards verified user context using a protected delegation mechanism.
5. The receiving service verifies the delegation's signature, issuer, audience, expiry, and scope,
   or accepts a replaced identity header only over a restricted, authenticated TLS-protected hop.
6. The service checks that the authenticated workload is permitted to call it.
7. The service separately checks that learner-7 may perform this operation on course-101.
8. The enrollment backend makes the durable seat and enrollment decision.

An authenticated workload presenting a forged learner header must not gain learner access.
An invalid or missing delegated credential is rejected; mTLS does not repair it.
A signed credential is validated, not merely decoded.
Network policy should prevent untrusted clients from impersonating the trusted hop.
A direct bypass route must enforce equivalent credential validation and object authorization.
The secure design survives an alternate route, not merely the happy-path diagram.

### An illustrative trust decision

This JSON is a conceptual test vector, not a credential and not mesh configuration.
The verified claims represent results of actual validation in a real implementation.

<!-- example: trust-context -->
```json
{
  "workload": "mobile-bff",
  "workloadAuthenticated": true,
  "delegation": {"subject": "learner-7", "audience": "enrollment", "signatureValid": true, "issuerValid": true, "notExpired": true},
  "requestedCourse": "course-101",
  "objectAuthorization": true,
  "incomingUserHeader": "learner-999"
}
```

The forged incoming header is ignored; the verified delegation supplies `learner-7`.
This vector's booleans are test inputs, not a production verification implementation.
If the audience is wrong or authorization fails, the decision is deny.
Never let an unauthenticated header override a verified subject.

## Course contract across hops

The enrollment operation is a body-free `POST /courses/course-101/enrollments`.
It requires an `Idempotency-Key` and an authenticated session for the current learner.
The backend may return `201` for a new enrollment or replay a matching completed result.
A conflicting intent under the key yields `409`; callers must not treat that as success.
An idempotency key is not a credential and does not authorize an operation.
The implementation needs appropriately scoped keys, atomic durable records, and a retention policy.
The user identity and key must survive any legitimate gateway or mesh forwarding.
Shared durable deduplication matters when retries or load balancing reach different replicas.

A confirmed read of `enrollment-42` can be displayed by mobile, web, or dashboard.
If optional recommendations fail, the view may label that field unavailable,
provided its own contract explicitly permits degraded responses.
It cannot fabricate an enrollment or report a timed-out enrollment POST as completed.
Protect personalized data with private or no-store caching and identity-aware access control.
Backend object authorization remains required even if a gateway or mesh has checked a caller.

## Retries, deadlines, and ambiguous writes

A retry may help a transient failure, but it consumes capacity and can duplicate work.
Configured retries at multiple hops multiply the number of downstream attempts.
Count total attempts, including the first; “two retries” means up to three attempts.

### Example retry policy

This JSON describes an illustrative budget, not proxy-specific syntax.
It explicitly disables mesh retries for the enrollment POST unless a safe policy is established.

<!-- example: retry-budget -->
```json
{
  "clientTotalAttempts": 2,
  "gatewayTotalAttempts": 3,
  "meshTotalAttempts": 2,
  "enrollmentPost": {"meshRetries": 0, "reason": "unknown write outcome without verified safe replay"},
  "overallDeadlineMs": 800,
  "courseReadAttemptTimeoutMs": 150
}
```

If all three layers each use the listed attempt limits for a retryable read,
the upper bound is 2 × 3 × 2 = 12 downstream attempts for one original operation.
This is a maximum under nested retries, not a prediction that every failure causes 12 calls.
For the listed enrollment POST, zero mesh retries means one mesh attempt per upstream attempt.
That alone does not make upstream retries safe: they also need an appropriate replay policy.

The contract supports replay of a matching completed enrollment outcome,
but a mesh cannot infer that the application actually implements atomic, shared deduplication.
Do not automatically retry a POST with an unknown outcome without an explicit safe policy.
A timeout can mean the server committed but the reply was lost.
Reconcile or replay with the same correctly scoped key only when the implementation supports it.
Retrying with a fresh key could create a second logical operation.
The mesh cannot roll back a database transaction or guarantee application success.

### Make a time budget

Suppose a client gives the whole operation 800 ms.
The gateway, BFF, and downstream calls share that deadline rather than each spending 800 ms.
At each hop propagate the remaining deadline and subtract elapsed time and return overhead.
A 150 ms attempt timeout is a ceiling, not permission to exceed the remaining overall budget.
Reserve time for processing, response transport, and an honest timeout response.
Backoff and jitter can limit synchronized retries; enforce a cap and retry budget.
Cancel obsolete downstream RPCs where supported when the caller times out or abandons work.
Cancellation is best effort: a server may already have committed, so it is not rollback.

Observe attempts per original request, timeout and cancellation counts, and retry exhaustion.
Use latency histograms, percentiles, error rates, and saturation rather than averages alone.
Correlate attempts in traces while keeping credentials and sensitive fields out of logs.
Trace context must be propagated by participating applications and proxies; it is not magic.
Consult [backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md) for admission and queue limits.

### Circuit breaking is not business correctness

A configured circuit breaker can stop or limit calls to an unhealthy dependency.
It may reduce load during failures but can also reject valid work until recovery.
Treat its thresholds and recovery probes as operational policy, not proof of an enrollment.
Expose a clear error or a permitted degraded optional field when the circuit is open.
The backend still decides whether an enrollment exists and whether a learner may create it.

## Canary and blue-green traffic

A canary routes a chosen fraction of eligible traffic to a new version while observing it.
Blue-green switching moves traffic between two environments, often with a quick switch back.
Feature flags can target a cohort separately from routing; record which policy controls which user.
Neither method makes incompatible database changes or external side effects reversible.

### Example split

This JSON describes a hypothetical HTTP request-level policy for eligible new requests.
It is not a guarantee of exact counts or a configuration for a particular mesh.

<!-- example: canary-policy -->
```json
{
  "unit": "http-request",
  "stablePercent": 95,
  "canaryPercent": 5,
  "eligibleRoute": "/courses/course-101",
  "stickyExistingStreams": true,
  "featureFlag": "course-view-v2"
}
```

At request-level independent selection, 5% is an expected long-run fraction.
A sample of 20 requests can contain zero, one, or several canary requests.
A connection-level split has a different unit: one connection can carry many requests.
Existing WebSocket and gRPC streams remain on their selected version until they end;
a new routing rule cannot migrate a live stream and produce an immediate 5% stream split.
A flag can also produce a different user exposure from a proxy's routing percentage.
Compare errors, latency histograms, saturation, and business outcomes by version and cohort.
Keep a minimum observation window and explicit stop conditions; small samples are noisy.

### Rollback checklist

- Can both versions read and write the shared schema during the rollout?
- Are migrations backward-compatible for the whole rollback window?
- Are events and other external side effects idempotent and compatible?
- Can old clients handle the response and status semantics?
- Does rollback stop new requests from reaching the canary?
- What happens to existing connections and streams during draining?
- Are logs, traces, and flags sufficient to identify affected traffic?
- What manual reconciliation is needed for already committed changes?

Routing back to blue does not undo a database write, a sent email, or an external charge.
An irreversible schema migration may prevent code rollback from restoring service.
Plan forward fixes, compensating actions where appropriate, and data recovery separately.

## Discovery, certificates, and failure visibility

A control-plane or discovery outage does not have one universal result.
A data plane may retain its last known routes and policy for some time,
refuse new updates or connections, or behave differently by implementation and mode.
Existing certificates have a validity period; rotation failure eventually matters.
Expired or invalid credentials must not be accepted just to keep traffic flowing.
Operators should know how long cached state is retained and how expiry is surfaced.
Test the actual configuration rather than assuming either instant failure or indefinite safety.

A ready endpoint is eligible for new traffic only when the relevant readiness policy says so.
Liveness is a different question from whether a specific business dependency can serve work.
If readiness or endpoint health is unknown, do not treat it as healthy by default.
An empty eligible pool should return a visible unavailable error, not success.
A bad check may remove all healthy instances, so alert and diagnose both configuration and service.
Drain old endpoints before stopping them, and plan for connection and stream lifetimes.
Requests already in flight can fail and may need safe reconciliation.

### Failure exercise

The control plane is unreachable, but a proxy still has a route to enrollment.
Its peer certificate has expired and no valid replacement is available.
Should it continue presenting the expired certificate as if nothing happened?

<details class="learning-answer">
<summary>Show answer</summary>
<p>No. Cached route availability does not make expired identity credentials valid.
The protected connection should fail visibly under the configured verification policy;
restore certificate issuance or distribution and investigate before retrying safely.</p>
</details>

## Observability and operational cost

A mesh can expose request counts, connection behavior, error rates, and latency.
Coverage depends on participating traffic and enabled instrumentation.
Use application metrics to see seat conflicts, idempotency replays, and business failures.
A `200` from an aggregate may still contain explicitly unavailable optional recommendations.
Track those degraded outcomes rather than hiding them in a success-only dashboard.

Measure proxy CPU and memory overhead and additional latency at relevant percentiles.
Include configuration complexity, rollout risks, certificate operations, and on-call expertise.
A smaller system may be better served by standard libraries, TLS, clear service contracts,
and a small number of well-owned application policies.
Even a large system should adopt only mesh features it can configure, observe, and maintain.

## Practice

### 1. Identity

The enrollment backend receives mTLS-authenticated traffic from `mobile-bff`.
The request asserts `learner-7` in a header that an external client could supply.
Does mTLS alone permit the enrollment?

<details class="learning-answer">
<summary>Show answer</summary>
<p>No. The workload peer is authenticated, but the learner assertion lacks trusted provenance.
Strip external assertions, verify user delegation or use a restricted trusted hop,
and perform the backend's object and business authorization.</p>
</details>

### 2. Retry multiplication

A client, gateway, and mesh allow 2, 3, and 2 total attempts respectively for a read.
What is the maximum number of downstream attempts under nested retries?

<details class="learning-answer">
<summary>Show answer</summary>
<p>At most 12: 2 × 3 × 2, including first attempts at each layer.
An overall deadline or a non-retryable response can stop the sequence earlier.</p>
</details>

### 3. Long-lived connections

A canary receives 5% of new connections, and one selected connection carries 100 streams.
Does that guarantee 5% of requests or users see the canary?

<details class="learning-answer">
<summary>Show answer</summary>
<p>No. Connection, request, stream, and user units are different.
Existing streams stay where they started, and connection workloads are uneven.</p>
</details>

### 4. Optional recommendation failure

Recommendations fail while the course and confirmed enrollment reads succeed.
Can the BFF present a degraded view, and can it pretend a new POST succeeded?

<details class="learning-answer">
<summary>Show answer</summary>
<p>A documented partial view may label recommendations unavailable.
A new POST with an unknown outcome must not be reported as completed without confirmation.</p>
</details>

## Correction ledger for the original lesson

These exact quotations are from [the original architecture lesson](../06-API-ARCHITECTURE.md).
They are simplified statements, not guarantees to apply without context:

| Original quote | Safer interpretation |
| --- | --- |
| “Applications never talk directly.” | Some modes use sidecars, others use node-level or proxyless mechanisms; verify actual coverage. |
| “Istio  = Control Plane” | Istio provides mesh control and policy functions; product components and traffic modes vary by version. |
| “All services get same behaviour.” | Retry and other policies apply only as configured and supported; nested retries can amplify load. |
| “Every request passes through Envoy.” | Only traffic captured by the chosen data plane is governed or observed; not every mesh uses Envoy for every path. |

## Continue learning

- [Guided architecture](../06-GUIDED-ARCHITECTURE.md) and [original architecture](../06-API-ARCHITECTURE.md).
- [Guided async](../05-GUIDED-ASYNC.md) for durable work and failure handling.
- [API contracts and lifecycle](API-CONTRACTS-AND-LIFECYCLE.md) for version compatibility.
- [Backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md) for retries, queues, and budgets.
- [Gateways, BFFs, and load balancing](GATEWAYS-BFFS-AND-LOAD-BALANCING.md) for edge policy and distribution.
- [Course content map](../COURSE-CONTENT-MAP.md) and [content corrections](../CONTENT-CORRECTIONS.md).
