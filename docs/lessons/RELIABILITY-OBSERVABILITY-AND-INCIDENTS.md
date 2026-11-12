# Reliability, observability and incidents

[← Expert journey](../07-GUIDED-EXPERT-DESIGN.md) |
[Original expert modules](../08-EXPERT-API-DESIGN.md) |
[Course library](../COURSE-CONTENT-MAP.md) |
[Corrections](../CONTENT-CORRECTIONS.md)

This is a fictional learning model, not an operating service or a promise of
production reliability. The [shared expert fixtures](../../assets/expert-lesson-fixtures.mjs)
describe `course-101`, **API Fundamentals**, with 29 seats, and the existing
`enrollment-42` for `learner-7`. Observing a request does not allocate a seat,
change that enrollment, or imply any commercial billing.

The original reading map places modules 7.4 and 7.6 here. Its quick reference
also promises observability and chaos engineering. We distinguish measurement
from an agreement, and safe planning from running an experiment.

## Outcomes

You should be able to:

- define the population and outcome for a request-based SLI;
- calculate a period error budget and a short-window burn rate;
- interpret a small latency distribution and compose a deadline budget;
- choose useful, privacy-conscious telemetry and bounded failure controls;
- plan incident response and a simulation-first resilience exercise.

## 1. Begin with a user journey

A learner opens a catalogue page. The edge validates the request, an identity
service resolves access, the catalogue and enrollment services supply data,
and an optional recommendation component adds suggestions. A successful
response must be correct and sufficiently timely, not merely have a process
that is running.

The journey boundary matters. A server may return a successful HTTP response
after a client has already timed out. A service-only measurement misses that
experience. A client-side measurement can miss a request that never reached
instrumentation. Choose a boundary, describe its blind spots and compare
consistent periods rather than inventing a perfect vantage point.

A service level indicator (SLI) is a defined measurement, such as the
fraction of eligible requests with a correct timely response. A service level
objective (SLO) is a target for that indicator over a stated window. A service
level agreement (SLA) is an agreement with a customer, including scope,
exclusions and possible remedies. These are distinct concepts, not steps on
an automatic upgrade ladder. An SLO can exist without an SLA; an SLA may use
different measurement and terms.

## 2. Define the denominator before calculating

For this illustrative availability SLI, count **eligible legitimate
requests** at the edge over a rolling 30-day window ending at the evaluation
time. Define good as an
authorized request resulting in a correct response within the agreed latency
threshold. The numerator is good eligible requests; the denominator is all
eligible legitimate requests, including those that fail or time out.

Define classification before inspecting results. A malformed request rejected
as invalid, an unauthenticated attempt, and an identified abusive request can
be excluded from this particular denominator if that is the published policy.
Keep separate counters for those rejections and inspect false positives. A
legitimate request rejected because the service is overloaded is bad, not
silently removed. A rightful user mistakenly denied by an auth dependency is
also bad when it is observable as eligible. Unknown identity or client
cancellation needs an explicit policy; neither is automatically harmless.

One can instead define distinct availability, latency and correctness SLIs.
Do not double-count the same request as multiple bad requests in a combined
binary SLI. The following fixture assumes classification was already made;
it does not establish that the classification itself was accurate.

<!-- example: slo-window -->
```json
{
  "eligibleRequests": 1000000,
  "badRequests": 2000,
  "target": 0.999
}
```

In this rolling 30-day window, good requests are
`1,000,000 − 2,000 = 998,000`.
The observed SLI is `998,000 / 1,000,000 = 99.8%`.
With a 99.9% target, the allowed bad fraction is 0.1%, or exactly
`1,000,000 / 1,000 = 1,000` whole bad requests. The budget consumed is
`2,000 / 1,000 = 200%`: the period is 1,000 bad requests beyond budget.
An error budget is a tolerable amount under the objective, not permission to
intentionally harm users.

For whole request counts, compute the allowance with an exact rational target
or decimal arithmetic and round down when asking for the maximum integer
number of bad requests consistent with the target. Binary floating-point
evaluation of `1 - 0.999` may produce an apparent `1000.0000000000009`;
that is not a fractional or extra allowable request. If the denominator is
zero, report no eligible data, not 100% success.

<details class="learning-answer">
<summary>Predict: what if an overload rejection is removed from this denominator?</summary>
<p>The reported availability improves while a legitimate user still fails. Count the rejection as bad under this definition and investigate it; do not make an SLO look healthy by excluding the failure.</p>
</details>

## 3. Burn rate is a rate, not period consumption

<!-- example: burn-window -->
```json
{
  "eligibleRequests": 10000,
  "badRequests": 50,
  "target": 0.999,
  "minutes": 5
}
```

The five-minute window is within the illustrative rolling 30-day window and
uses the same eligibility and outcome definitions. It is a shorter
observation, not a different kind of denominator. The five-minute bad fraction
is `50 / 10,000 = 0.005`, or 0.5%.
Divide by the allowed bad fraction, 0.1%, to get a **5× burn rate**.
This is a short-window comparison of fractions, not 500% of the
rolling 30-day budget consumed. Actual period consumption depends on bad requests
and eligible traffic across the entire SLO window. Traffic volumes can vary;
five minutes alone does not determine the final period denominator.

An alert can require both a fast and a slower window to be above their
thresholds, catching urgent failures while avoiding pages for a brief spike.
Choose thresholds against actual impact, detection time and paging capacity.
Low traffic makes ratios volatile; use minimum counts, synthetic checks or
longer windows without concealing an affected user.

<details class="learning-answer">
<summary>Predict: does 5× burn for five minutes mean the whole rolling 30-day budget is gone?</summary>
<p>No. It means the observed bad fraction is five times the allowed fraction in that short window. Count the entire period's eligible and bad requests to calculate consumption.</p>
</details>

## 4. Latency distributions, not one average

The measurement below contains exactly 100 completed request samples. These
are illustrative fixed values, not a population-wide reliability guarantee.
Sort them and use the nearest-rank definition: percentile `p` is the value at
one-based rank `ceil(p × N)`.

<!-- example: latency-samples -->
```json
{
  "groups": [
    { "count": 94, "latencyMs": 50 },
    { "count": 4, "latencyMs": 200 },
    { "count": 2, "latencyMs": 1000 }
  ]
}
```

The sum is `94 × 50 + 4 × 200 + 2 × 1,000 = 7,500 ms`.
The mean is `75 ms`. Rank 50 is 50 ms, so p50 is 50 ms.
Rank 95 is 200 ms, so p95 is 200 ms. Rank 99 is 1,000 ms,
so p99 is 1,000 ms. Ties are allowed: saying exactly half of observations
are strictly below the median is wrong here.

This sample shows how the mean can hide a slow tail, but a percentile is not
an explanation of why the tail exists. Look at queues, database wait, network
and downstream spans. Include timeouts as a separately reported outcome:
omitting them from a completed-only latency histogram can make an outage look
fast. Record observation windows, sample counts and histogram bucket
resolution. Percentiles of separate groups generally cannot be averaged to
obtain a combined percentile; aggregate compatible histogram counts instead.

<details class="learning-answer">
<summary>Predict: what is p95, and why is it not 50 ms?</summary>
<p>Nearest rank 95 is in the four observations at 200 ms. The first 94 observations are 50 ms, so rank 95 has already moved into the next group.</p>
</details>

## 5. Allocate a deadline across a fanout

An end-to-end budget is a design constraint for one path, not an SLO by
itself. The fixture contains fixed illustrative durations in milliseconds:

<!-- example: fanout-budget -->
```json
{
  "overallMs": 800,
  "edgeMs": 40,
  "identityMs": 60,
  "courseMs": 120,
  "enrollmentMs": 200,
  "recommendationsMs": 300,
  "composeMs": 50,
  "returnMs": 50
}
```

Serial execution takes `40 + 60 + 120 + 200 + 300 + 50 + 50 = 820 ms`,
which exceeds the 800 ms budget by 20 ms. If identity completes first and
the three independent reads start together, the fixed path takes
`40 + 60 + max(120, 200, 300) + 50 + 50 = 500 ms`, leaving 300 ms
of illustrative headroom.

This arithmetic assumes no contention, scheduling overhead or dependencies
among those reads. It is not the sum or maximum of measured p99s, and it does
not predict an end-to-end p99. Real concurrent latency distributions,
correlation, queueing and missing responses need end-to-end measurement.

Propagate a shared absolute deadline, with a clock-skew-aware protocol or
remaining duration, and subtract elapsed time before each call. A retry or
hedge must fit within the remaining time and resource limits. Cancel work
when the caller no longer needs it, while recognizing cancellation is a
best-effort signal, not rollback of an already committed write. Writes need
idempotency and reconciliation as described in
[distributed transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md).

<details class="learning-answer">
<summary>Predict: does parallel execution prove the p99 is 500 ms?</summary>
<p>No. The example uses fixed individual durations and ideal parallelism. Real tail latency depends on distributions, correlation and overhead and must be measured end to end.</p>
</details>

## 6. Observe the path with useful evidence

Metrics aggregate numerical observations. Request rate, eligible and bad
counts, duration histograms, queue depth and saturation can show trends and
drive alerts. Use bounded labels such as route template, outcome class and
region. A raw learner ID, enrollment ID, token or arbitrary URL as a metric
label creates unbounded cardinality and may expose private information.

A trace records a sampled journey as spans: edge, identity, and child spans
for catalogue, enrollment and recommendations. Parent-child relationships
show critical paths; a span may include a bounded status, start time and
duration. A correlation ID connects relevant log entries but does not prove
identity or authorization. Incoming trace headers and baggage are untrusted
metadata: validate sizes and formats, drop or replace values at trust
boundaries, and never use them to grant access.

Baggage can propagate context across services, so treat it as data that could
reach many systems. Do not put credentials, emails, enrollment content or
sensitive tenant identifiers there. Apply redaction, retention limits, access
controls and purpose-specific sampling to logs and traces. Sampling reduces
cost but can omit the exact failure; do not use sampled trace counts as an
unqualified denominator for an SLI. Metrics should count the eligible
population independently, including failures.

OpenTelemetry's SDK instruments an application and exports signals. An
optional collector receives, processes and routes telemetry, including
filtering or batching; a backend stores and queries it. They have separate
roles. A local demonstration can inspect locally exported data without a paid
account or a particular vendor. This lesson does not require installing an
SDK, collector, backend or running service.

<details class="learning-answer">
<summary>Predict: can a trace ID from a request header authorize a tenant?</summary>
<p>No. It is untrusted correlation metadata. Authentication, verified membership and object-level authorization must independently decide access.</p>
</details>

## 7. Keep overload from becoming a cascade

Abuse controls and overload controls solve overlapping but different problems.
An edge DDoS defense aims to absorb or filter unwanted traffic; a quota
governs consumption over a stated period. Neither guarantees the backend can
serve a sudden legitimate burst. Admission control and load shedding reject
or defer excess work before bounded workers, queues, connections and memory
are exhausted. Return a truthful overload response and provide retry guidance
only when appropriate. See [backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md).

Retries multiply work during a failure. Retry only transient outcomes when an
operation is safe to repeat or protected by an idempotency design. Bound
attempts, total deadline and concurrency; use exponential backoff with
random jitter. A retry budget limits extra traffic. A circuit breaker can
stop futile calls and allow a small bounded set of half-open probes; coordinate
recovery rather than allowing every client through at once.

Resource isolation also protects critical paths. Separate connection pools,
worker permits and queue capacities for enrollment and optional
recommendations, while reserving enough system-wide headroom. A tenant-level
limit can prevent a noisy neighbor from exhausting shared capacity, but a
limit cannot replace authorization or physical resource isolation.

## 8. Cache misses and honest degradation

A popular key expiring for many callers can stampede its backing store.
Bound cache fills with singleflight per key, a global fill permit and a
maximum queue. Jitter TTLs so unrelated keys do not expire simultaneously;
this alone does not protect one hot key. Isolate that key's fill traffic,
measure hot-key pressure and cap waiters. Failed fills must release permits,
and a hung fill needs a deadline.

Stale data can be served only when explicitly acceptable for **public or
otherwise authorized data**, within a defined maximum staleness and without
crossing tenant boundaries. Stale availability counts must not be used to
promise a seat or pretend an enrollment succeeded. Omitting optional
recommendations with an honest indication is different from fabricating
success for a required dependency. Sensitive personalized data requires
authorization even when cached.

<details class="learning-answer">
<summary>Predict: does TTL jitter alone solve a single hot-key stampede?</summary>
<p>No. Callers for the same expired key can still arrive together. Bound and coalesce fills, protect the backing service and define a safe stale-data policy.</p>
</details>

## 9. Triage, mitigate, reconcile, learn

First establish who leads the incident and how responders communicate.
Bound the initial triage: confirm user impact, start time, affected regions
and journeys; compare bad-request and latency signals with recent changes;
assign an owner and record hypotheses. Avoid speculative blame. If data may
be exposed, use the organization's security response and restrict access to
the evidence.

Mitigate before pursuing a perfect root cause. Roll back a known safe
reversible deployment, disable an optional feature or shed load when evidence
supports it. A rollback is not universally safe: database migrations, emitted
events and external effects may persist. Check compatibility and a recovery
plan before reverting. Track the decision, time and effects; verify SLI and
user-facing recovery rather than declaring success from process health.

After stabilization, reconcile in-flight operations with durable records.
For ambiguous writes, query authoritative state and use the operation's
idempotency and compensation rules rather than repeating blindly. Communicate
what is known, uncertainty, mitigation and next update time to stakeholders.
Document customer impact without exposing private data.

A blameless postmortem reconstructs the timeline and contributing conditions,
including misleading dashboards and organizational constraints. It records
what worked, actionable improvements, owners and deadlines, then checks
completion. Blameless does not mean accountability disappears: it means
learning from system conditions rather than punishing a person for a
reasonable decision made with incomplete information.

## 10. Design a safe chaos exercise, do not run one here

Begin locally with a simulation or tabletop using synthetic data, not live
fault injection. Hypothesis: if optional recommendations are unavailable, the
catalogue still responds correctly within its deadline and enrollment is not
modified. Define baseline eligible request success, latency and resource
use; name a facilitator, observer and recovery owner.

In a model, vary a simulated dependency result and inspect the planned
fallback, queue and deadline behavior. Set explicit abort conditions, such as
unexpected impact to the required path, resource growth beyond a chosen bound,
or loss of observation. Recovery means restore the model's normal dependency,
drain bounded work, verify the baseline and record unresolved effects.
Any future real experiment requires separate authorization, isolation,
scope, safety review and a tested recovery plan. This lesson provides no
instructions to attack a service or inject faults into a running system.

<details class="learning-answer">
<summary>Predict: is turning off a real dependency the first step of this exercise?</summary>
<p>No. Start with a local simulation or tabletop, define the hypothesis, bounds, abort criteria and recovery checks, and obtain separate authorization before considering a real experiment.</p>
</details>

## Worked review: from symptoms to a bounded decision

Suppose a dashboard for the catalogue journey shows a fast-window burn
above the team's chosen alert threshold. This does not identify a cause.
The incident lead checks the slower window, eligible request count, the
distribution of errors and which regions or route templates are affected.
They compare these signals with the client-facing latency and timeout views.

The on-call engineer finds that successful requests remain quick but the
overload rejection count has risen. Because legitimate overload rejections
belong in this SLI's bad numerator, the result is not hidden by the fast
latency of completed requests. The team examines worker occupancy and the
bounded queue. If optional recommendation work is consuming a shared pool,
the mitigation candidate is to disable that optional work and preserve the
required catalogue and enrollment paths.

The team assigns one person to make the change, another to observe the
system and another to communicate impact. Before changing the feature,
they confirm the resulting representation still satisfies the published
contract and does not fabricate recommendations or enrollments. They note
the change time, observe backlog and rejected requests, and verify recovery
from the learner's perspective. If the mitigation fails, they revert it or
choose another documented action rather than changing multiple variables
without recording them.

Afterward, the team compares the timeline with deployment and traffic
changes. They could add separate resource pools, tighten admission or adjust
an alert, but only after measuring the actual constraint. The action record
names owners and dates. A successful mitigation does not prove that the
underlying problem is fixed; a successful process restart is not the same as
a recovered user journey.

### Recognize monitoring gaps

Consider a five-minute window with a small number of requests. A single
failure can produce a large rate, but an alert that simply ignores low
traffic may miss an important affected customer. Pair population-based
signals with low-volume checks and human context. A synthetic probe can
exercise a known safe read path, but it does not represent every device,
authorization decision or network condition.

Instrumentation may fail during an outage. Monitor missing data separately
from a healthy value, and make the collection pipeline's drop and export
errors visible. When a client times out before a server records completion,
compare both perspectives without adding the same request twice into one
denominator. Precisely document any deduplication and outcome precedence.

A histogram gives approximate quantiles based on its buckets, whereas the
100-value nearest-rank example used exact samples. If the desired threshold
falls between coarse boundaries, the result cannot support millisecond
precision. Use compatible bucket schemes when aggregating and preserve counts;
do not average per-instance p99 values.

### Alert design as an operational contract

For each page, state the affected journey, numerator and denominator, window,
threshold and expected responder action. A page should identify a condition
that needs timely human intervention, not every deviation from normal.
Route informational signals to dashboards or tickets when they do not
require an immediate response.

During a sustained outage, suppress redundant notifications without hiding
new impact. Define who takes over if the first responder is unavailable and
how status updates are handed off across shifts. After the incident, review
missed pages, noisy pages and time to detection with the same care as
application failures. Alert thresholds must be tuned from evidence; this
fixture does not prescribe universal values.

## Worked trace: correlation without authority

Imagine the edge starts a root span for a request to read the catalogue.
It creates an identity child span followed by three parallel child spans for
catalogue, enrollment and recommendations. The compose span can start when
the required data is ready, subject to the deadline and the documented
optional-feature behavior. Each service records its own duration; the trace
visualization can show overlap instead of incorrectly summing concurrent
work.

If a client supplies a trace identifier, the edge validates it as metadata
or starts a new trace according to policy. Neither the trace identifier nor
baggage establishes that `learner-7` belongs to any organization. Identity
and authorization use separately verified credentials and policy. Logs may
include a correlation identifier to find a trace, but should not contain a
bearer token, raw request body or sensitive enrollment data.

Sampling should be described explicitly. A collector may retain selected
slow or error traces, subject to privacy, retention and resource controls.
Such selection makes the retained trace population intentionally biased.
Use unsampled counters or another population-correct measurement for SLI
math; a retained trace is evidence for a particular path, not an unbiased
request count.

## Worked cache decision: protect correctness

The public catalogue description is eligible for a short stale window in
this hypothetical design. If its cached value expires during a burst, one
bounded fill obtains a fresh copy while authorized readers may receive the
older public description within the documented maximum age. If the fill
fails, its permit is released and the next attempt remains subject to
backoff and admission limits.

An enrollment confirmation is different. A stale record cannot establish
whether a new enrollment committed or whether a learner has permission to
see it. Route that question to an authoritative operation status and
authorization check. A timeout does not mean the write failed, and
cancellation does not undo a commit. If the result is uncertain, give an
honest pending or error outcome under the actual contract and reconcile it.

TTL jitter spreads expiration across different keys; singleflight limits
concurrent fills for one key. Neither control by itself provides fair
capacity across tenants or protects a database from many distinct cold keys.
Bound global fills, waiting callers and request size, then use telemetry to
identify contention. See the [capacity lesson](BACKPRESSURE-AND-CAPACITY.md)
for queue and admission tradeoffs.

## Exercise: tabletop with evidence and stop conditions

Use the following as a discussion prompt, not a command to run:

1. Name the user journey and baseline: authorized catalogue reads succeed
   within the team's defined threshold while the dependency is available.
2. Hypothesize that simulated recommendation failures leave the required
   response correct and within its shared deadline.
3. Assign a facilitator and observer. Use fictional records and a local
   model or a paper exercise; do not touch production.
4. Describe what each component would record: eligible and bad counts,
   optional dependency outcomes, queue use and a sampled trace.
5. Abort the simulated exercise if the required journey becomes incorrect,
   the modeled work grows without bound, or evidence is unavailable.
6. Restore the simulated dependency, account for outstanding work and
   compare the recovered baseline with the starting baseline.
7. Record surprises, follow-up actions and owners. Treat an untested
   recovery assumption as an open risk, not proof of resilience.

This exercise cannot prove that a deployed system will survive a real
failure. A future authorized experiment would need its own safety approval,
isolation, measured blast radius, abort mechanism and recovery verification.

## 11. Design review checklist

1. What user journey, population, outcome, window and exclusion policy?
2. Are an SLI, an SLO and any SLA described independently?
3. Are budget arithmetic and alert windows tied to the same definition?
4. Do latency histograms include a clear timeout policy and sample count?
5. Are deadlines propagated and cancellation distinguished from rollback?
6. Are metrics bounded and traces sampled without exposing sensitive data?
7. Are overload and abuse treated as separate admission problems?
8. Can an optional dependency fail without pretending required work succeeded?
9. Can responders mitigate, reconcile and measure recovery safely?
10. Is a proposed exercise simulated first, bounded and reversible?

## Continue reading

- [Contracts and consumers](CONTRACT-EVOLUTION-AND-CONSUMERS.md) explains
  why a degraded response must still obey the published contract.
- [Regions and consistency](REGIONS-AND-CONSISTENCY.md) examines a different
  failure boundary and the tradeoffs of regional recovery.
- [Tenancy, usage and governance](TENANCY-USAGE-AND-GOVERNANCE.md) connects
  isolation, authorization and resource limits.
- [Distributed transactions and recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md)
  treats uncertain writes and reconciliation.
