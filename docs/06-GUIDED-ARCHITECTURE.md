# Phase 6 — Grow an API architecture only when the problem grows

The [guided async journey](05-GUIDED-ASYNC.md) followed a completion beyond
one request. Now follow requests, identity, data and pressure through an
architecture. This is a fictional design exercise, not a running service.
No example requires a provider account, credentials, installation or cluster.

Our **independent current post-enrollment record** has authenticated,
authorized `learner-7` with `enrollment-42` in `course-101`, **API
Fundamentals**, and **29 available seats**. `course-102`, **REST Studio**,
has **20 available seats**. A separate authorized action recorded
`completion-42`; a completion fact and a pending email do not reserve
another seat. Neither examples nor retries below create another enrollment.
The [shared architecture fixture](../assets/architecture-lesson-fixtures.mjs)
records the common values. Its completion timeline is independent of earlier
preview resets.

Read the [original Phase 6](06-API-ARCHITECTURE.md) as the complete chapter,
with the [course content map](COURSE-CONTENT-MAP.md),
[course library](../README.md), and [corrections ledger](CONTENT-CORRECTIONS.md).
Company and product examples in the original are illustrations, not evidence
of those organizations' current deployments. This guide makes assumptions and
failure boundaries explicit rather than requiring every named technology.

## Route through the original

| Original topic family | Guided route | Complete source |
| --- | --- | --- |
| Gateway problems, routing, authentication, authorization, policies, operations, failure and technology | [Baseline](#arch-baseline), [edge](#arch-edge) | [Original Phase 6](06-API-ARCHITECTURE.md) |
| Backend for frontend motivation, aggregation, clients, trade-offs and examples | [Clients](#arch-clients) | [Original Phase 6](06-API-ARCHITECTURE.md) |
| Load balancing layers, algorithms, sessions, health, scaling and hashing | [Balancing](#arch-balancing) | [Original Phase 6](06-API-ARCHITECTURE.md) |
| Service mesh, proxy patterns, security, rollout, observability and limits | [Next choices](#arch-next) | [Original Phase 6](06-API-ARCHITECTURE.md) |
| OpenAPI, documentation, generation, contracts, versioning and testing | [Contract](#arch-contract) | [Original Phase 6](06-API-ARCHITECTURE.md) |
| Backpressure, queues, flow control, shedding, priority and bulkheads | [Capacity](#arch-capacity) | [Original Phase 6](06-API-ARCHITECTURE.md) |

<span id="arch-baseline"></span>
## Step 1 — Start with a working boundary

**Problem.** Learners need a course catalogue and an enrollment result. A
small team needs a system it can understand and operate, not a diagram with
as many boxes as possible.

**Small workable baseline.** One backend serves the clients and uses one
database. It authenticates protected writes, authorizes the learner's action,
checks capacity and records the enrollment transactionally. It also exposes
catalogue reads. A database backup and restore plan, monitoring, input
validation, and a deployment process still matter in this simple design.
It is not immune to an outage or unlimited traffic.

**Worked Course API.** A catalogue request returns the two courses; the
current enrollment is already `enrollment-42`. The backend stores its
business state in the database, including the completion record. It can
return the existing enrollment result for a matching retry without changing
seats a second time. Implementation and retention of that retry outcome must
be designed; the example is a contract, not an available server.

**Changed requirement.** The product asks for a completion email, but the
learner does not need to wait for delivery. The backend may record the
completion and an outbox intent in one database transaction. A worker can
publish the fact and a separate worker can attempt email later. The pending
email is not proof of delivery, and the broker fact is not a new enrollment.

**Failure.** If the backend commits and crashes before publishing directly,
a database change and a message can diverge. An outbox makes publication
intent durable alongside the state change; it still needs retries, monitoring,
duplicate handling, and a policy for external email effects. A single DB
can fail too; a queue is not a backup for it.

**Options and when not.** A synchronous email call may be sufficient if the
business requires immediate confirmation and latency and failure behavior
are acceptable. Use a queue when independent, delayed work is justified;
do not add it merely because architectures often show brokers. Similarly,
one backend may serve many endpoints without splitting into microservices.

<details class="learning-answer">
<summary>Predict: does the pending email change the 29 available seats?</summary>

<p><strong>Reasoning:</strong> No. The existing enrollment already accounts for
the seat. Completion and email delivery are separate effects; neither is another
enrollment.</p>
</details>

<span id="arch-clients"></span>
## Step 2 — Shape data for different clients

**Problem.** A desktop catalogue and a learner dashboard need different
views. Sending each screen many calls or a large common payload can waste
latency and bandwidth. But different needs alone do not prove a separate
backend for frontend (BFF) is worth its operational cost.

**Small workable baseline.** The existing backend offers a bounded course
collection and individual resources. Clients fetch what they need, with
explicit authorization for private learner data. Measure call count, payload,
latency and change coordination before changing that arrangement.

**Worked Course API.** The dashboard needs `course-101`, learner identity,
completion status, and optional recommendations. An illustrative aggregate
could return the following projection after authenticating the caller and
checking access to every private source. This hypothetical dashboard is not
one of the seven operations in the shared catalogue contract.

```json
{
  "course": {"id": "course-101", "title": "API Fundamentals", "seats": 29},
  "learner": {"id": "learner-7", "completion": "completed"},
  "recommendations": {"status": "unavailable", "items": null}
}
```

The course and learner portions are available; the optional recommendation
source timed out. `unavailable` is not an empty recommendation list and is
not evidence that the learner has no recommendations. The UI can show the
course with an explicit degraded-state notice and offer a retry. If the
course or required authorization check fails, return an appropriate failure
instead of presenting a partial result as complete. The example's completion
status comes from the already recorded completion, not a new action.

**Changed requirement.** The mobile view needs a compact projection while
web needs richer details. Three viable choices are: add a REST aggregate to
the existing backend; introduce a BFF owned for a client experience; or use
GraphQL with a bounded schema and carefully controlled queries. All three
can aggregate data. A BFF may itself use REST, GraphQL or another protocol;
there is no universal hierarchy in which a protocol requires a BFF.

**Failure.** An aggregator that uses a privileged service credential without
checking the caller can leak another learner's record. Propagate a verified
identity and authorization context and check access at each private fetch.
Cache private projections only with keys and policies that distinguish the
principal or permission scope, client view, representation and freshness;
never reuse one learner's response for another. Invalidation and revocation
also matter. A public course cache can follow different rules.

**Options and when not.** A REST aggregate keeps the deployment simple but
may grow screen-specific fields. A BFF isolates client evolution but adds a
service, extra hop and ownership. GraphQL lets a client select a bounded
shape but needs query cost, batching, caching and authorization controls.
Do not add any of them if ordinary calls meet the measured need.

<details class="learning-answer">
<summary>Predict: should the dashboard turn a recommendation timeout into an empty list?</summary>

<p><strong>Reasoning:</strong> No. An explicit unavailable status distinguishes
a failure from a valid empty result; the required course and learner data remain
separately checked.</p>
</details>

<span id="arch-balancing"></span>
## Step 3 — Add replicas for a measured reason

**Problem.** One backend is simple, but a sustained load exceeds its tested
capacity, or a reliability objective requires serving during an instance
failure. Both are meaningful reasons to consider replicas. Neither a client
change nor a diagram alone establishes that requirement.

**Small workable baseline.** Run the original backend as one instance and
measure throughput, latency, errors and recovery. Once the target justifies
it, put multiple healthy instances behind a load balancer. Replication adds
cost, deployments, health checks and shared-state concerns; it does not by
itself remove the database as a shared bottleneck or failure domain.

**Worked Course API.** Suppose a response to an enrollment attempt is lost.
The retry may reach a different replica. Use a shared database idempotency
record, scoped to the caller and operation, with a unique key and request
fingerprint; atomically record the enrollment, seat change and replayable
outcome. Concurrent matching attempts resolve to the same result. A reused
key with a different payload is rejected, and retention is specified. The
existing example result stays `enrollment-42`, with 29 seats. A worker's
cross-replica message retry similarly needs a shared inbox or idempotency
record committed with its local effect; external email requires its own
provider idempotency or reconciliation strategy.

**Changed requirement.** Some sessions currently live in a process's memory.
A retry routed elsewhere may not find one. Options include shared session
storage, stateless signed tokens with revocation and expiry considerations,
or affinity to the instance. Affinity can help legacy state but instance
failure still loses local state; it is not globally required for all traffic.

**Failure.** A local in-memory deduplication set cannot coordinate replicas.
Two attempts could both change seats. Health checks should remove unhealthy
instances, but do not assume they detect every slow dependency or ensure a
safe retry. Observe the shared database as well as each backend.

**Routing options.** At layer 4 a balancer commonly selects an upstream per
TCP connection. At layer 7 it can inspect HTTP and route per request, subject
to protocol and implementation. HTTP/2 multiplexes requests on connections;
a gRPC stream or WebSocket long stream cannot be moved while alive. Reconnect
and application recovery are needed after failure. Layer 7 routing does not
make an existing live stream migratable.

Round robin distributes selections, not necessarily work: requests can have
very different costs. Weighted round robin can reflect different capacities.
Least connections counts active connections, not CPU use or latency; one
HTTP/2 connection can carry many requests and long connections can distort
that signal. No algorithm guarantees even resource use. Health, timeouts,
observability and workload tests inform the choice; do not introduce a
balancer or replica fleet before the need outweighs operational complexity.

<details class="learning-answer">
<summary>Predict: can a retry on another replica rely on the first replica's local memory?</summary>

<p><strong>Reasoning:</strong> No. Store the idempotency decision and business
effect in a shared durable boundary, or otherwise coordinate them across
instances.</p>
</details>

<span id="arch-edge"></span>
## Step 4 — Put policy at the right boundary

**Problem.** Several independently owned APIs now need consistent external
routing, TLS, authentication and rate policies. A shared edge may reduce
duplication, but a single backend does not automatically need a gateway.

**Small workable baseline.** The backend already terminates TLS or sits
behind a trusted TLS terminator, authenticates the session and authorizes
objects. For a small deployment, its existing reverse proxy and application
checks may be enough. Keep credentials and session cookies out of logs.

**Worked Course API.** Imagine catalogue and learner APIs are independently
deployed and a gateway routes both. It verifies the session at the edge and
forwards a trusted identity context. The learner API must still check whether
`learner-7` may see the requested enrollment; a valid session proves neither
ownership nor an administrator role. Authorization can depend on current
resource state and policy at the backend.

**Changed requirement.** Clients can connect to the gateway but must not
forge internal identity headers. The gateway strips incoming `X-User` and
other identity headers before constructing trusted context. Protect the
backend from direct untrusted access, authenticate the gateway-to-backend
hop, and use TLS across the boundary; a short-lived signed claim with
issuer, audience and expiry verified by the backend is another explicit
identity mechanism. Header stripping alone is insufficient if an attacker
can bypass the gateway. TLS termination changes where plaintext is visible,
so document and protect each hop and trust boundary.

**Failure.** If a backend trusts client-supplied `X-User: learner-7`, an
attacker can impersonate that learner. If an edge authenticates but the
backend omits object authorization, a legitimate user may read another
person's data. Do not equate transport encryption with permission.

**Options and when not.** A gateway can implement route selection, rate
limits, caching and timeouts, but none automatically supplies authorization,
durability, correct invalidation or a safe retry. Configure timeouts and
error mapping deliberately. A cached private view must respect identity and
permissions. A gateway becomes another dependency and needs capacity,
redundancy, deployment and observability plans; multiple instances alone do
not prove high availability. Use it when multiple APIs and shared policies
justify the cost, not as a mandatory first box.

<details class="learning-answer">
<summary>Predict: is a client-provided X-User header trusted after TLS termination?</summary>

<p><strong>Reasoning:</strong> No. Strip untrusted identity headers and establish
a verified, protected context from the gateway; the backend still enforces
object authorization.</p>
</details>

<span id="arch-contract"></span>
## Step 5 — Make the contract inspectable

**Problem.** A client needs to know what requests and responses mean before
an implementation exists. Ambiguous examples, especially incomplete API
descriptions presented as complete, lead to incompatible clients.

**Small workable baseline.** Write down the request, response, error and
authorization behavior for the existing backend. Review it with client and
server owners. A specification describes behavior; it does not run code or
enforce a security policy.

**Worked Course API.** The complete [shared OpenAPI JSON contract](contracts/course_api.openapi.json)
is OpenAPI **3.1.0**; its `info.version` is **1.0.0**, the API description's
version, not the OpenAPI specification version. Its scope is catalogue and
enrollment only, not dashboard, completion, recommendations, or all
platform endpoints. It contains seven operations: GET and POST `/courses`;
GET, PUT, PATCH and DELETE `/courses/{courseId}`; and POST
`/courses/{courseId}/enrollments`. The descriptions are fictional; there is
no server behind them.

A successful `GET /courses` response body is the shared `CoursePage`:

```json
{
  "courses": [
    {"id": "course-101", "title": "API Fundamentals", "seats": 29},
    {"id": "course-102", "title": "REST Studio", "seats": 20}
  ],
  "nextCursor": null
}
```

The `courses` array has at most 20 items and `nextCursor` is a string or
null. A successful enrollment response body is the shared `Enrollment`:

```json
{"id": "enrollment-42", "courseId": "course-101", "learnerId": "learner-7"}
```

The latter can represent the already completed matching outcome replayed for
a retry, not a second enrollment. The `Course` response schema requires only
`id`, `title` and `seats` and rejects additional properties. A new field may
break strict clients and needs a compatibility review, even if some clients
ignore unknown fields. OpenAPI provides a shared description; generated
stubs are not completed handlers, and generated clients or documentation do
not prove runtime conformance. Implement and independently test behavior.

**Changed requirement.** An administrator wants to update a title. The
contract describes `sessionCookie` as an API-key security scheme in a cookie;
that description does not enforce authentication. A valid cookie does not
imply an admin role. The implementation must authenticate and authorize the
write, and honor the documented error and conditional-write behavior.

For JSON Merge Patch (`application/merge-patch+json`), `null` normally
requests removal. This contract does not allow null for the required course
fields: reject `{"title": null}` or `{"seats": null}` rather than removing
those fields from the resulting resource. Omission leaves a field unchanged;
a valid example is `{"title": "API Fundamentals"}`. The patch schema
also rejects unknown properties. Do not confuse omission with null.

**Failure.** If someone labels a fragment as a complete OpenAPI document but
omits required `info`, tools cannot treat it as a valid complete document.
A schema can describe `401` and `403` but cannot enforce access controls.
Review actual responses and runtime validation as well as the static file.

**Options and when not.** Design-first review and generated clients can
improve coordination, at the cost of versioning, tooling and maintenance.
Small internal interfaces still benefit from explicit contracts; adding a
generator without an owner does not create correctness. Use the linked
[complete OpenAPI file](contracts/course_api.openapi.json) as the authority for
its scope; the JSON response examples above are not an API definition.

<details class="learning-answer">
<summary>Predict: does a valid session cookie make every caller a course administrator?</summary>

<p><strong>Reasoning:</strong> No. It identifies a session only after the
implementation verifies it; the backend must separately authorize the
administrative action.</p>
</details>

<span id="arch-capacity"></span>
## Step 6 — Measure waiting and bound overload

**Problem.** An API can appear healthy at the edge while requests pile up
behind it. A fast acceptance response is not proof of eventual processing,
and an unbounded queue can exhaust memory before work completes.

**Small workable baseline.** Measure arrivals, completions, latency,
concurrency, errors and queue depth at a clearly defined boundary. Set
request deadlines and bounded in-flight and waiting work; keep the simple
backend if tested demand is within its reliability and capacity targets.

**Worked observation.** The shared fixture's stable observation has an
average arrival rate λ = **40 requests/second** and average time in the
system W = **0.125 seconds**. Little's Law gives L = λW = **5 requests** in
the system on average. This stable, matching long-run boundary includes
waiting and service; arrivals and completions must balance over the window.
It says nothing about p99 latency or instantaneous queue depth. Do not apply
it as a steady-state prediction to a growing overload queue.

**Independent capacity model.** Separately, assume four concurrent workers,
each with a fixed **0.05 second** service time and no bottleneck elsewhere.
Ideal service capacity is 4 / 0.05 = **80 requests/second**. This service
time is not the previous observation's mean total W: it excludes waiting,
and the examples are independent, not two measurements of the same system.

Start with all four workers busy and an empty waiting queue of **40** slots.
A burst arriving at **100 requests/second** grows the queue at net
100 − 80 = **20 requests/second**, filling it in **2 seconds** under the
fluid approximation. Then, if arrivals immediately drop to **60 per second**
and all workers stay busy, net drain is 80 − 60 = **20 per second** and the
40 waiting requests drain in **2 seconds**. This ignores discrete arrivals,
variability, expirations, overhead and changing service rates. It is an
illustration, not a production forecast: load-test actual CPU, database and
dependency saturation, latency distributions and recovery behavior.

**Changed requirement.** A burst can exceed the waiting budget. Bound both
queue entries and bytes, and reject work that cannot meet a deadline. Use
`429` when a caller exceeds an enforced rate or quota policy; use `503` when
the service is temporarily unable to accept work. Choose and document retry
hints only when useful. `429` is not a universal label for all overload,
and `503` is not a successful acceptance.

**Failure.** Immediate retries from every client amplify load precisely when
capacity is exhausted. Limit attempts with a retry budget, exponential
backoff and jitter, and a deadline; retry only safe or idempotent operations.
Admission, bounded queues and explicit rejection are safer than silently
claiming success for work that was dropped. If optional recommendations are
unavailable, report the degraded status described in Step 2, not a default
empty success. Required enrollment work should fail explicitly if it cannot
be accepted safely.

**Options and when not.** Priority queues can reserve attention for critical
work but risk starving other traffic; define fairness and limits. Bulkheads
isolate pools so a slow dependency consumes only its allocation, at the cost
of stranded capacity and extra configuration. A circuit breaker can stop
repeated calls to a failing dependency, but needs recovery probes and fallback
semantics. None guarantees that a request is durable. Add these mechanisms
when measured isolation or recovery needs warrant them.

<details class="learning-answer">
<summary>Predict: does 40 requests/second and 0.125 seconds prove the p99 is 0.125 seconds?</summary>

<p><strong>Reasoning:</strong> No. Little's Law uses matching averages in a
stable system; tail latency requires its own distribution measurement.</p>
</details>

<span id="arch-next"></span>
## Step 7 — Choose the next boundary deliberately

**Problem.** More services may eventually create repeated service-to-service
security, traffic and telemetry work. That possibility is not a reason to
install a mesh while the one-backend baseline meets its requirements.

**Small workable baseline.** Keep explicit client libraries, timeouts,
service discovery and operational checks proportional to the actual system.
Document ownership and failures first. The architectural choice remains
reversible only if interfaces, data changes and deployment practices support
that reversibility.

**Worked Course API.** If many independently operated services later share
cross-cutting requirements, compare a mesh with existing libraries and
infrastructure. A data plane handles traffic using the selected design;
a control plane distributes policy and configuration. Implementations vary:
sidecar proxies, ambient approaches and proxyless integrations do not all
put an Envoy sidecar on every request or require Kubernetes.

Mutual TLS can authenticate a peer service identity and encrypt a protected
hop. It does not decide whether `learner-7` may view `enrollment-42` or
perform an administrator operation. The receiving service still applies
business authorization, including any verified end-user context. Metrics,
retries and policy coverage depend on the actual integration and routes.

**Changed requirement.** A team wants a canary release: send a small fraction
of suitable new requests to a new version, observe errors and latency, then
increase or stop the rollout. A mesh or other router can help shift traffic;
a rollout plan still needs a compatible contract, health signals and a way
to return traffic. Long-lived connections may remain on their prior target.

**Failure.** Routing back to an old version does not roll back a database
migration, undo side effects, restore dropped fields or fix an incompatible
schema. Plan expand/contract migrations, data recovery and backwards
compatibility independently. Retrying in several layers may multiply
attempts; coordinate budgets and avoid unsafe duplicate effects.

**Options and when not.** A mesh can centralize selected policies and
telemetry across a sufficiently large service estate, but adds control-plane,
proxy, debugging and operational complexity. A library or existing proxy can
be simpler for fewer services. Do not force a mesh, orchestration platform or
new protocol without a demonstrable service-count and operations need.

### Related detail and transfer

The core seven-step route stands alone. For deeper trade-offs, read:

- [Gateways, BFFs and load balancing](lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md).
- [Service mesh and trust](lessons/SERVICE-MESH-AND-TRUST.md).
- [API contracts and lifecycle](lessons/API-CONTRACTS-AND-LIFECYCLE.md).
- [Backpressure and capacity](lessons/BACKPRESSURE-AND-CAPACITY.md).

Transfer the reasoning to a library helpdesk: one backend and one database
can track tickets and reservations. If librarians need a separate summary,
first compare an existing endpoint or aggregate against a BFF or GraphQL.
If the system is overloaded, measure and bound work; if no requirement has
changed, keep the small design. A queue, gateway, replica fleet or mesh is not
mandatory simply because the setting changed.

<details class="learning-answer">
<summary>Predict: does sending traffic back to the old version undo a database migration?</summary>

<p><strong>Reasoning:</strong> No. Traffic routing and database recovery are
different operations; plan compatible migrations and recovery before the
release.</p>
</details>

Continue to the [guided expert design journey](07-GUIDED-EXPERT-DESIGN.md),
with the [complete original expert chapter](08-EXPERT-API-DESIGN.md)
still available. The [senior design companion](07-SENIOR-DESIGN-GUIDE.md)
remains a complete original reference rather than a rewritten journey. Revisit the
[original architecture chapter](06-API-ARCHITECTURE.md) for all topic families.
