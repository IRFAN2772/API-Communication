# Gateways, BFFs, and load balancing

Start with one backend and a client.
If it meets the needs of the course application, it is a good architecture.
A gateway, a backend for frontend (BFF), and a service mesh are not prerequisites.
Add a boundary only when its benefit exceeds the new failure and ownership costs.

## Outcomes

After this lesson you can:

- Trace a request across an edge, an optional BFF, and a backend.
- Explain which component verifies identity and which owns an authorization decision.
- Choose an appropriate traffic distribution unit and explain its limits.
- Diagnose unhealthy pools, sticky sessions, and overloaded HTTP/2 connections.
- State what stays true when a recommendation dependency fails.

This lesson uses the fictional shared course data:

| Item | Value |
| --- | --- |
| Course | `course-101`, API Fundamentals |
| Seats | 29 at the observed snapshot |
| Learner | `learner-7` |
| Enrollment | `enrollment-42` |

The 29 seats are a snapshot, not a promise that another request cannot change them.
The enrollment is an example of a confirmed result, not a result to invent.
The [shared architecture fixtures](../../assets/architecture-lesson-fixtures.mjs) supply these values.
The [OpenAPI 3.1 teaching contract](../contracts/course_api.openapi.json) describes an interface, not a running service.
Its `sessionCookie` security scheme names a `session` cookie; it does not authenticate or authorize it by itself.

## One possible request path

The following is a conceptual arrangement, not a required deployment.
A product may combine roles, omit a layer, or place a BFF differently.

```text
Mobile / Web / Dashboard
          |
     optional edge gateway
          |
  optional client-specific BFF
          |
  ready backend replicas ---- shared durable store
          |
  optional recommendations
```

Text alternative: clients may reach an edge gateway and client-specific BFF,
which call ready replicas backed by a shared durable store and optionally recommendations.
A load-balancing decision can occur at one or more of these boundaries.
The diagram does not mean every request traverses every box.

## The gateway is a policy enforcement point

A gateway can route, limit traffic, terminate TLS, and apply configured authentication.
It can also collect metrics, transform representations, and cache eligible responses.
These are capabilities, not automatic guarantees just because a gateway exists.
An operator must define, test, and maintain the rules and their failure behavior.
A gateway instance is a dependency; multiple instances reduce one failure mode,
but shared configuration, discovery, network, or upstream failures can still affect all.

### Routing and contract preservation

Suppose `/courses/course-101` maps to the course backend.
A versioned gateway route can translate paths or an older representation for migration.
The externally promised method, status, headers, body, and authorization semantics remain binding.
In particular, preserve `ETag`, `If-None-Match`, and body-free `304` behavior for course reads.
Preserve required `If-Match` and a `412` without a write on a stale course update.
Do not transform a `409` enrollment conflict into a `201` success.
An adapter needs tests for each supported version and an explicit retirement plan.

### Example route policy

This JSON is a teaching model, not configuration for a particular product.
It uses symbolic destinations; it does not deploy or operate a gateway.

<!-- example: gateway-route-policy -->
```json
{
  "routes": [
    {"method": "GET", "path": "/courses/course-101", "target": "course-read-v1"},
    {"method": "POST", "path": "/courses/course-101/enrollments", "target": "enrollment-v1"}
  ],
  "identityHeader": "X-User-ID",
  "stripClientIdentityHeader": true,
  "authenticateBeforeForward": true,
  "trustedHopRequired": true
}
```

The policy is intentionally explicit about the identity header.
An unmatched route must be rejected, not silently sent to the enrollment target.
A route match alone proves neither identity nor permission.

### The spoofed-header walkthrough

1. A client sends `X-User-ID: learner-7` without a valid credential.
2. The gateway discards the client-supplied identity header, even if it looks plausible.
3. A missing, invalid, expired, wrong-audience, or badly signed credential is rejected.
4. If a valid credential identifies another learner, the gateway overwrites the header with that verified identity.
5. The backend checks that the verified principal may perform this particular operation on this course.
6. It never trusts a bare external header as proof of the caller's identity.

For a signed token, verify its signature against trusted keys, issuer, intended audience,
expiry, and any other required claims before using it; a decoded payload is not verification.
For the contract's cookie, the server must validate the session and grants separately.
Authenticated is not synonymous with authorized: a valid learner is not automatically an administrator.
The course backend owns object, tenant, and business authorization as well as seat decisions.

A backend may consume an identity header only over a restricted, authenticated trusted hop,
with TLS protecting that hop, and only from a gateway that strips and replaces the header.
Alternatively it can independently validate a suitably scoped credential or signed delegation.
Any direct or alternate bypass path requires equivalent backend validation; network location alone is not proof.
If provenance cannot be established, reject the request rather than accepting the header.
See [service mesh and trust](SERVICE-MESH-AND-TRUST.md) for workload versus learner identity.

### TLS termination is a boundary, not the end of privacy

TLS between client and gateway protects that hop, not automatically the gateway-to-backend hop.
Decide separately whether the next hop uses TLS or mTLS and authenticate its peer.
Protect cookies in transit, use appropriate secure cookie attributes and CSRF defenses,
and never put session cookies or bearer tokens in logs or cache keys visible to other users.
A public course response may be cacheable under an explicit freshness policy.
A personalized enrollment response should normally be `private` or `no-store`;
if privately cached, scope it to the authorized identity and invalidate it appropriately.
A shared cache must not serve learner-7's data to another learner.
The backend still authorizes a request even when a gateway performs edge authentication.

## A BFF serves a particular frontend

A BFF is frontend-owned runtime code that shapes and optionally aggregates responses.
It is not just a build-time setting or a universal synonym for a gateway.
Its contract can use REST or GraphQL, and it calls backend APIs at runtime.
It may reduce client round trips, but parallelism, backend latency, and failures still matter.
A BFF authorizes its own endpoint and propagates appropriate verified user context;
each downstream backend independently enforces its own authorization.
The frontend team needs ownership of deployment, dependency updates, observability,
security, on-call, schema changes, and duplication across BFFs.
If mobile, web, and dashboard need essentially the same view, a shared API may be simpler.

### Example frontend views

This example configuration states product choices for the same fictional course.
The dashboard is a frontend view; its recommendation limit is not a new domain rule.
The limit is only a display cap, not evidence that that many recommendations exist.

<!-- example: frontend-views -->
```json
{
  "mobile": {"courseId": "course-101", "recommendationLimit": 5, "fields": ["course", "enrollment", "recommendations"]},
  "web": {"courseId": "course-101", "recommendationLimit": 20, "fields": ["course", "enrollment", "recommendations"]},
  "dashboard": {"courseId": "course-101", "recommendationLimit": 10, "fields": ["course", "enrollment", "recommendations", "summary"]}
}
```

All three views can show API Fundamentals and the same confirmed `enrollment-42`.
Their fields and recommendation caps are presentation decisions.
A dashboard summary must also be authorized for the requesting learner or operator.
An aggregate is not automatically fast: measure its fan-out and tail latency.

### Optional data and honest partial failure

Assume course and enrollment reads succeed, but recommendations time out.
The BFF can return an explicitly degraded *view* if its own contract permits partial data:

<!-- example: degraded-mobile-view -->
```json
{
  "course": {"id": "course-101", "title": "API Fundamentals", "seats": 29},
  "enrollment": {"id": "enrollment-42", "courseId": "course-101", "learnerId": "learner-7"},
  "recommendations": {"status": "unavailable", "items": null}
}
```

This is the BFF's illustrative view, not a response shape added to the course API contract.
`unavailable` with `items: null` means the list is unknown, unlike `ok` with an empty list.
It lets a client say “recommendations temporarily unavailable” instead of “none exist.”
If enrollment creation times out, the BFF must not claim enrollment succeeded.
An ambiguous POST outcome requires reconciliation or a documented idempotent retry.
The existing `enrollment-42` above is shown only when the enrollment read actually confirms it.
Do not turn required course or enrollment failure into a fabricated complete success.

### Write example: enroll the verified learner

The contract's body-free request is `POST /courses/course-101/enrollments`.
It requires an `Idempotency-Key` and a valid `session` for the verified caller.
A matching completed retry can replay the stored `201` outcome and `Location`.
Conflicting intent returns `409`; key scope, atomic persistence, and retention matter.
The server checks permission, seat availability, and the caller's identity.
A BFF or gateway cannot create a durable enrollment merely by returning JSON.
A retry may hit a different replica, so deduplication must be shared and atomic.
See [backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md) for overload and retry budgets.

## Load balancing: choose a unit

A load balancer selects among eligible destinations; it does not make every request cheap.
A layer 4 balancer typically selects a backend for a TCP connection or UDP flow,
using transport metadata such as address and port rather than HTTP paths.
A layer 7 HTTP-aware balancer can select per HTTP request using path, query, headers,
or, when supported and configured, gRPC method and metadata.
Query-based routing needs an explicit rule and must preserve the public contract.
Whether HTTP/2 streams are independently balanced depends on the actual proxy and configuration.
An L4 connection selection can carry many HTTP/2 requests to the same backend.
An established WebSocket or gRPC stream cannot be migrated to another backend mid-stream;
a reconnect creates a new connection or stream and may need application-level resume.

### A concrete multiplexing counterexample

| Backend | TCP connections | Active HTTP/2 streams | New-connection least-connections choice |
| --- | ---: | ---: | --- |
| A | 1 | 100 | A |
| B | 2 | 2 | — |

A has fewer connections yet may be much hotter.
Streams vary in cost too, so counting streams alone is not a perfect load metric.
Measure concurrency, queueing, CPU, latency, and actual request costs before choosing a rule.

### Distribution algorithms and their limits

- **Round robin:** alternate eligible backends; equal counts do not imply equal work.
- **Weighted round robin:** send more selections to a higher-capacity backend.
- Weights need current capacity estimates and an understanding of request cost.
- A small number of expensive requests can overwhelm a backend with fewer total requests.
- **Least connections:** choose a backend with fewer active connections, not necessarily less work.
- A long-lived HTTP/2 connection can contain many expensive gRPC streams.
- **IP hash:** map a client IP to a backend, often for coarse affinity.
- NAT can put many independent clients on one IP, causing unevenness.
- Changing client networks or pool membership can also change the mapping.
- **Consistent hashing:** membership changes typically remap fewer keys than naive modulo hashing.
- It does not promise zero movement, balanced request cost, data consistency, or durability.
- A hash ring is not a universal database sharding or write-consistency solution.

Example: two clients behind the same NAT address can both be sent to replica A.
This is not proof that A can handle their combined work.
A strategy should be evaluated under realistic connection and request distributions.

### Readiness, health, and draining

Liveness asks whether a process is alive enough to continue or be restarted.
Readiness asks whether this instance should receive a *new* request now.
A business dependency check asks whether a particular operation can succeed;
it need not be identical to liveness or to every endpoint's readiness.
For example, unavailable optional recommendations should not necessarily remove course reads.
An unavailable required database may make enrollment writes unready even while the process is alive.
Choose check scope, intervals, thresholds, and timeouts deliberately.

During shutdown, mark an instance unready before stopping it.
Stop assigning new work and allow existing requests and connections time to drain.
A long-lived WebSocket or stream may outlive the drain deadline and require reconnection.
Existing work can fail during shutdown; readiness is not a promise of zero interruption.
If configuration leaves zero ready backends, return an explicit unavailable error,
not a fabricated success or a default enrollment.
Alert on an empty pool and distinguish bad checks from actual backend failure.

### Replica state and affinity

If sessions live only in replica A's memory, a later request to B can appear logged out.
Cookie-based affinity can route a client back to A, but is a partial mitigation.
A's failure, expiration, rebalance, or a new connection can still lose that session.
Use suitably secured external session storage when requests must work across replicas.
The enrollment idempotency record also needs durable, shared, atomic storage.
Do not confuse an affinity cookie, which selects a replica, with the authenticated session cookie.
IP affinity has the same failure and NAT limitations and is not an authorization mechanism.

### CDN and load balancer are roles, not a mandatory stack

A CDN often caches suitable content closer to clients; a load balancer distributes traffic.
Some products offer both functions, and dynamic content may bypass caching.
Neither a CDN nor an edge gateway nor a particular ordering is mandatory for every system.
For personalized data, specify cache scope, freshness, invalidation, and authorization first.
A cache hit is not a substitute for application authorization when the response is private.

## Worked trace

1. Learner-7 opens the mobile view for course-101 using a valid session.
2. The edge drops any incoming identity header and validates the credential if configured to do so.
3. The BFF and backend receive verified context over a protected, restricted hop.
4. The backend checks access to the course and the learner's enrollment.
5. A ready replica returns the course snapshot with 29 seats and the confirmed enrollment-42.
6. Recommendations time out; the BFF labels that portion unavailable.
7. The client renders the confirmed facts and a degraded recommendation message.
8. The request trace records the timeout without logging the session credential.

For an enrollment POST, a `201` means the backend committed or replayed the recorded result.
If the backend outcome is unknown, the client sees an appropriate failure or unknown state,
not the successful read shown in the previous example.

## Practice

### 1. Header spoofing

A request contains a forged `X-User-ID: learner-7` but no session.
The gateway has the example policy and no alternate trusted credential.
What should happen, and why must the backend still have a policy?

<details class="learning-answer">
<summary>Show answer</summary>
<p>The gateway removes the header and rejects the unauthenticated request.
The backend enforces object and business authorization and validates bypass paths;
a gateway's existence does not make arbitrary traffic trustworthy.</p>
</details>

### 2. Fairness

Replica A has one connection with 100 active streams; B has two with one stream each.
What does least-connections select, and why might that be a poor choice?

<details class="learning-answer">
<summary>Show answer</summary>
<p>It selects A for a new connection, assuming these are its connection counts.
A could be doing far more work; inspect stream load and actual resource usage.</p>
</details>

### 3. No ready replicas

All replicas fail a misconfigured readiness check while their processes are alive.
Can the gateway return an invented `enrollment-42` as a fallback?

<details class="learning-answer">
<summary>Show answer</summary>
<p>No. Report unavailability, alert, and investigate the check and pool state.
Only a confirmed backend result can establish a successful enrollment.</p>
</details>

### 4. One more layer?

Mobile and web need the same data and the backend is already reliable.
Would separate BFFs necessarily improve this design?

<details class="learning-answer">
<summary>Show answer</summary>
<p>No. A shared API may satisfy both without duplicate runtime code and operational ownership.
Add a BFF when measured frontend-specific needs justify it.</p>
</details>

## Correction ledger for the original lesson

These exact quotations are from [the original architecture lesson](../06-API-ARCHITECTURE.md).
They are teaching simplifications, not guarantees to copy into production:

| Original quote | Safer interpretation |
| --- | --- |
| “Instead of every service checking tokens.” | Edge validation can help, but backends still validate trust provenance and authorize their objects and bypass paths. |
| “Everything dies.” | A failed gateway instance affects its traffic; redundant instances help, but shared failures remain possible. |
| “Perfect distribution.” | Round robin distributes selections, not necessarily resource cost or completed work. |
| “Least loaded.” | Fewest connections is not necessarily least work, especially with HTTP/2 multiplexing. |
| “Minimal movement.” | Consistent hashing reduces typical remapping, not to zero, and provides no data-consistency guarantee. |

## Continue learning

- [Guided architecture](../06-GUIDED-ARCHITECTURE.md) and [original architecture](../06-API-ARCHITECTURE.md).
- [Guided async](../05-GUIDED-ASYNC.md) for asynchronous work and failure handling.
- [API contracts and lifecycle](API-CONTRACTS-AND-LIFECYCLE.md) for version and contract obligations.
- [Backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md) for queues, budgets, and overload.
- [Service mesh and trust](SERVICE-MESH-AND-TRUST.md) for east-west policies.
- [Course content map](../COURSE-CONTENT-MAP.md) and [content corrections](../CONTENT-CORRECTIONS.md).
