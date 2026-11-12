# Requirements and estimation for API design

A useful estimate connects a question, explicit assumptions, units and a
decision. It does not establish a system's capacity. This lesson accompanies
the [senior design journey](../GUIDED-SENIOR-DESIGN.md) and preserves the
complete [original senior guide](../07-SENIOR-DESIGN-GUIDE.md). Its
[shared fixtures](../../assets/senior-lesson-fixtures.mjs) are executable
planning inputs, not observations from the documentation site.

The course story remains `course-101`, **API Fundamentals**, with 29 seats.
`learner-7` already has `enrollment-42` and has completed it.
Reading, reporting or estimating does not create another enrollment, reset
completion, or turn the historical 40% progress observation into completion.
Private enrollment, progress and dashboard reads are hypothetical and outside
the current seven-operation [OpenAPI contract](../contracts/course_api.openapi.json).

## Outcomes

After working through the examples, you should be able to:

- distinguish functional requirements, operational targets and invariants;
- translate a daily request assumption into an average and a planning peak;
- separate response bandwidth, connection state and event retention;
- calculate a finite burst's queue fill and recovery using an explicit model;
- vary uncertain inputs, identify missing measurements and avoid false precision;
- decide whether the evidence warrants a change at all.

## Begin with a question, not a component

**Problem.** A learner needs to read a course and see their own completion.
A team must establish what correct behavior means before it can choose a
protocol or estimate cost.

**Simple baseline.** The current fictional application serves REST requests
from one backend with a transactional database. The published course read
returns the course representation; the hypothetical private view authenticates
and authorizes the learner. Nothing in that read changes enrollment or seats.

**Worked example.** Ask the product owner:

1. Which callers and operations are required, and who controls each client?
2. Which information is public and which requires per-learner authorization?
3. What is the authoritative record when representations disagree?
4. How old may a dashboard be, including after a disconnect?
5. What can happen after a timeout, retry, duplicate or partner outage?
6. What volume, daily pattern, payload and growth range are plausible?
7. Who operates recovery, and what are the cost and time constraints?

**Changed requirement.** A stakeholder asks for a dashboard updated within
five minutes. Treat this as a proposed target to negotiate, not an existing
measured property. Specify the start and end of the freshness interval and
how to reconcile after a network gap.

**Failure.** A fast HTTP success response may contain stale data.
A mean latency also hides slow users; an availability percentage without
a denominator, window and eligible requests is not operationally testable.

**Options and costs.** Measure the current read and its freshness.
Poll if the interval and request cost fit; consider server push only when
the shorter delay is worth connection and recovery costs.
For incompatible data shapes compare a REST aggregate and GraphQL on
representative data and clients, rather than assuming a protocol wins.

**Prediction.** Does a successful refresh make a new enrollment?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> It is a read of an existing completed enrollment. The 29 available seats and the completion remain unchanged.</p>
</details>

### Write testable requirements

| Kind | Example question | Evidence |
| --- | --- | --- |
| Functional | Can a learner see their own completion? | Authorized and unauthorized contract tests. |
| Invariant | Does a read leave seats and enrollment unchanged? | State assertions before and after the read. |
| Latency | What fraction of eligible requests must finish within a budget? | A defined percentile and window from representative traffic. |
| Freshness | How old may a displayed state be? | Delay from authoritative change to display, including reconnect tests. |
| Availability | What counts as a good request and over which window? | Measured good and eligible counts with exclusions explained. |
| Recovery | How much data loss and downtime are acceptable? | Restore and failover exercises against agreed objectives. |
| Cost | What resource budget can the team operate? | Measured usage and a range of forecasts. |

These are examples of questions, not targets already achieved by this site.
Percentiles need a defined population and adequate samples.
An availability target is not a guarantee of correct authorization or data.
Specify an owner, a measurement method and what happens when the target fails.

<details class="learning-answer">
<summary>Check: does a 200 response prove freshness?</summary>
<p><strong>No.</strong> Measure the age relative to the authoritative change and test the chosen recovery path, not just the HTTP status.</p>
</details>

## Independent large-platform planning inputs

The next four blocks are an **independent imaginary large-platform scenario**.
They are not actual site statistics, course enrollment totals, or the independent
illustrative capacity model in Phase 6. Each block exactly publishes the corresponding
shared fixture. The burst block is a separate transient queue model, not an
inference about the daily traffic, connection or retention assumptions.
No benchmark has shown that the imagined workload can be served.

<!-- example: traffic-assumptions -->
```json
{
  "registeredUsers": 100000000,
  "dailyActiveUsers": 10000000,
  "callsPerActiveUserPerDay": 100,
  "secondsPerDay": 86400,
  "peakFactor": 5,
  "planningPeakRequestsPerSecond": 60000,
  "averageResponseBodyBytes": 5000,
  "largerResponseBodyBytes": 50000
}
```

<!-- example: connection-assumptions -->
```json
{
  "simultaneousConnections": 1000000,
  "stateBytesPerConnection": 50000,
  "reconnectFraction": 0.01,
  "reconnectWindowSeconds": 20
}
```

<!-- example: retention-assumptions -->
```json
{
  "eventFraction": 0.05,
  "averageEventBodyBytes": 2000,
  "retentionDays": 7,
  "replicationFactor": 3
}
```

<!-- example: burst-assumptions -->
```json
{
  "offeredEventsPerSecond": 5000,
  "serviceEventsPerSecond": 4000,
  "waitingCapacity": 10000,
  "recoveryEventsPerSecond": 3000
}
```

`registeredUsers` is not the number active each day. The number of active
users is itself an assumption; dividing registered users by seconds per day
would not produce request throughput.
The response sizes are body sizes, not a promise about total network traffic.
Decimal prefixes apply throughout: 1 KB = 1,000 bytes, 1 MB = 1,000,000
bytes, 1 GB = 1,000,000,000 bytes and 1 TB = 1,000,000,000,000 bytes.
Bits are eight per byte; distinguish `GB/s` from `Gb/s`.

## Derive request rate

**Problem.** Estimate the request rate needed to size a representative test.

**Simple baseline.** Compute an average from daily active users and calls per
active user, then ask how uneven traffic might be over a short period.

**Worked example.**

```text
10,000,000 active users/day × 100 requests/user/day
  = 1,000,000,000 requests/day
1,000,000,000 requests/day ÷ 86,400 seconds/day
  = 11,574.074074... requests/s average
11,574.074074... × 5
  = 57,870.370370... requests/s assumed peak
```

Rounded to two decimal places, those are **11,574.07 requests/s average**
and **57,870.37 requests/s assumed peak**.
Use **60,000 requests/s** as a conservative rounded planning rate for the
byte examples below. It is not a measured benchmark or proven capacity.
Peak factor is an assumption about the chosen time interval, not a physical
law. Burstiness below that interval may be higher.

**Changed requirement.** A launch targets a region whose users arrive in a
much narrower daily window than assumed.

**Failure.** The same daily total can have a much higher peak. Average
requests/s alone cannot establish tail latency, number of workers or
database capacity.

**Options and costs.** Model a range of peak factors, use actual arrival
histograms if available, then benchmark representative operation mixes,
payloads, concurrency, error rates, dependencies and failure conditions.
Provision or reject load with headroom informed by those measurements.
Do not size from a theoretical maximum alone.

**Prediction.** If the peak factor is 10 instead of 5 with the same daily
total, what changes?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p>The average remains about 11,574.07 requests/s, but the assumed peak doubles to about 115,740.74 requests/s. Both are still estimates, not measured capacity.</p>
</details>

## Estimate response-body bandwidth

**Problem.** A dashboard may need either a compact or a much larger response.
The team wants to understand the network consequence before comparing shapes.

**Simple baseline.** Multiply the planning rate by body bytes per response.
This produces bytes per second for that specific response-only model.

**Worked example.**

```text
60,000 requests/s × 5,000 bytes/response
  = 300,000,000 bytes/s = 300 MB/s
300,000,000 bytes/s × 8 = 2,400,000,000 bits/s = 2.4 Gb/s

60,000 requests/s × 50,000 bytes/response
  = 3,000,000,000 bytes/s = 3 GB/s
3,000,000,000 bytes/s × 8 = 24,000,000,000 bits/s = 24 Gb/s
```

The larger body is ten times the smaller, so this modeled body bandwidth
also increases tenfold. These values assume every planning request produces
one response of the selected average size at that rate.
They are not an end-to-end network bill or capacity guarantee.

**Changed requirement.** Multiple clients need different dashboard data,
and measurements reveal significant unused bytes or multiple round trips.

**Failure.** Adding fields to one response can waste bandwidth; simply
switching to GraphQL can introduce resolver work, access-control and
complexity costs without reducing the actual data transferred.

**Options and costs.** Compare an authorized REST aggregate with GraphQL
using identical representative screens and data. Measure response sizes,
request counts, query counts, caching, p95/p99 latency and operations.
Consider pagination, filtering, compression or caching where semantics allow.
Headers, TLS, retransmits, request bodies and protocol framing increase
network use; compression, conditional responses and cache hits change it.

**Prediction.** Does 3 GB/s mean the physical network transfers exactly
24 Gb/s in production?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> That conversion covers the modeled uncompressed response bodies only. Actual traffic also depends on overhead, retransmissions, requests, compression and cache behavior.</p>
</details>

## Count live connections separately

**Problem.** Some clients may need a lower-latency status update than polling
provides, but a long-lived connection has its own costs.

**Simple baseline.** Poll the authoritative status at an agreed interval and
refresh after reconnect. Compare request volume, battery and acceptable age
with the cost of server-to-client SSE or bidirectional WebSocket.
Choose WebSocket only when the feature needs its capabilities; a course
status screen need not become chat.

**Worked example.** The independent fixture assumes:

```text
1,000,000 simultaneous connections × 50,000 bytes/connection
  = 50,000,000,000 bytes = 50 GB connection state only
1,000,000 connections × 0.01 = 10,000 reconnecting connections
10,000 reconnects ÷ 20 seconds = 500 reconnects/s
```

The 500/s calculation assumes those reconnects are uniformly spread across
the full window. Synchronized clients could produce a higher instantaneous
rate, so jitter and representative reconnect tests matter.
The 50 GB excludes application heaps, operating-system buffers, network
devices, indexes and other system resources.

**Changed requirement.** A regional interruption reconnects clients at once
and some missed status updates are no longer retained.

**Failure.** Connection count is not requests/s, and an open connection
does not prove a client has observed every event. Reconnect storms can
overwhelm authentication and the authority behind the status endpoint.

**Options and costs.** Limit admission, add jitter, and define replay
identifiers and retention. If a gap exceeds retained history, obtain an
authorized snapshot and resume from a valid point. Monitor connection count,
reconnect attempts, delivery lag, dropped messages and snapshot load.
For the full interaction see [realtime recovery](REALTIME-RECOVERY-AND-FLOW.md).

**Prediction.** Is 50 GB the total RAM required by the service?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> It counts only the assumed per-connection state. The rest of the application, runtime, operating system and infrastructure need separate measurements.</p>
</details>

## Estimate event retention

**Problem.** The platform wants to retain produced events for a limited time.

**Simple baseline.** Count produced events, multiply by body bytes and retention
days, then account for the configured number of copies. Name the result a
payload estimate rather than total storage.

**Worked example.**

```text
1,000,000,000 requests/day × 0.05 = 50,000,000 events/day
50,000,000 events/day × 2,000 bytes/event
  = 100,000,000,000 bytes/day = 100 GB/day
100 GB/day × 7 days = 700 GB retained payload
700 GB × 3 copies = 2,100 GB = 2.1 TB replicated payload lower bound
```

This assumes one produced event for each selected request, constant daily
production, full seven-day retention and three complete payload copies.
It is a logical uncompressed payload lower bound for that model, not an
actual disk allocation or cost estimate.

**Changed requirement.** Several independent consumers receive each event;
some retry after crashes and the team also needs backups.

**Failure.** One event can cause several deliveries or duplicate attempts.
Event production is not consumer throughput, and payload times replicas
omits indexes, metadata, temporary segments, backups and other overhead.

**Options and costs.** Estimate fanout and retries independently for
network and consumer capacity. Measure actual representation, compression,
storage indexes, replication and backup policies. Compression may reduce
physical bytes; additional copies, overhead and duplicates may increase them.
Protect privacy and define a deletion and retention policy.
The completion fact and certificate/email commands are different records
with different owners and effects; see
[outbox and workflows](OUTBOX-INBOX-AND-WORKFLOWS.md).

**Prediction.** Does three replicas mean three separate business events?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> Replication stores copies of the modeled payload. Produced events, stored copies, delivery attempts and successful effects are different quantities.</p>
</details>

## Model a separate short burst

**Problem.** A waiting queue needs a bound and a clear response when offered
work exceeds service capacity.

**Simple baseline.** Use the separate burst fixture, starting with an empty
waiting queue and already-busy workers. Treat arrivals and service as constant
continuous fluid rates, with no other bottleneck and no overhead.
Waiting capacity excludes work already in service.

**Worked example.**

```text
offered = 5,000 events/s; service = 4,000 events/s
growth = 5,000 - 4,000 = 1,000 waiting events/s
10,000 waiting slots ÷ 1,000 events/s = 10 seconds to fill

after filling, offered falls to 3,000 events/s; service stays 4,000 events/s
drain = 4,000 - 3,000 = 1,000 waiting events/s
10,000 waiting events ÷ 1,000 events/s = 10 seconds to drain
```

At the end of draining, active work may still be in service.
During the fill interval assume all offered events are admitted.
Once full, continuing excess offered work requires rejection, upstream
backpressure, dropping under an explicit policy, or another bounded action.
The recovery calculation starts at a full queue with no new rejection and
the given lower arrival rate. It does not claim that a real queue drains
exactly on the tenth second.

**Changed requirement.** Events have variable service times and a downstream
dependency becomes slow or unavailable.

**Failure.** The constant service rate is no longer credible. Retries can
increase offered work exactly when the dependency is least able to serve it.
An unbounded queue hides overload while increasing delay and memory use.

**Options and costs.** Measure service-time distributions and dependency
behavior, bound active and waiting work, use backoff with jitter and define
retry limits, dead-letter handling and operator recovery. Prioritize important
work only under an explicit policy. A queue absorbs a finite burst; it does
not create steady-state capacity.

**Prediction.** Can this transient fill calculation prove Little's Law or
steady-state latency?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> It is an independent fluid overload and recovery model. Little's Law needs a consistent boundary and appropriate stable long-run averages; this transient is not such a measurement.</p>
</details>

For the separate stable observation and a different finite queue example,
read [backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md).

## Sensitivity, evidence and decisions

**Problem.** The inputs above are plausible placeholders, not facts about a
particular deployment. A review needs to know which assumptions dominate.

**Simple baseline.** Keep a table of low, central and high scenarios and
recalculate one factor at a time. Show units and whether a number is measured,
assumed or derived. Attach a date and owner to each assumption.

**Worked example.** Holding the planning rate constant, response bodies of
5 KB and 50 KB give 300 MB/s and 3 GB/s respectively. Holding daily calls
constant, increasing the peak multiplier from 5 to 10 doubles the peak.
Neither comparison shows which scenario is likely; obtain distribution data.
For event storage, changing retention from seven to fourteen days doubles
the modeled retained payload if all other assumptions remain fixed.

**Changed requirement.** A reviewer asks how many hosts to buy or whether
to shard immediately.

**Failure.** A calculated offered rate does not reveal the capacity of a host,
database or network at the desired tail latency and error rate. Average load
also masks hotspots, retries, contention and degraded dependencies.

**Options and costs.** Benchmark a realistic mix against a representative
deployment with warm-up, sustained peaks, failures and recovery. Observe CPU,
memory, network, database contention, queue age, throughput and latency
percentiles. State sample size, duration, bottleneck and environmental
differences. Repeat under varied sizes and loads; include uncertainty and
headroom. Use the resulting capacity and cost ranges to compare options.
This is evidence for those tested conditions, not a universal guarantee.

**Prediction.** The current system meets measured needs and recovery targets.
The only argument for sharding is that the imaginary scenario has 1B calls/day.
Should the team shard?

<details class="learning-answer">
<summary>Reveal the prediction</summary>
<p><strong>No.</strong> The scenario is not current traffic or measured capacity. Keep the simpler design until observed workload, ownership or recovery needs justify the operational and consistency costs.</p>
</details>

### A practical review checklist

- Identify caller, operation, direction and authority.
- Specify security, data isolation, invariants and required recovery.
- Define target windows, percentiles and eligible populations.
- Label assumptions and measure high-impact uncertain inputs.
- Keep requests/s, events/s, connections and delivery attempts distinct.
- Convert units explicitly and preserve enough precision before rounding.
- Include payload distribution, fanout, duplicates and retry amplification.
- Count storage replication, metadata, indexes, backups and retention.
- Account for transport overhead, compression and cache behavior.
- Bound queues and test overload, reconnect and downstream failures.
- Benchmark representative mixes at the required latency and error rate.
- Record simpler alternatives, cost, residual risk and a revisit trigger.

For deeper comparisons use the [contracts lesson](API-CONTRACTS-AND-LIFECYCLE.md),
the [reliability lesson](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md), and
the [sharding and infrastructure lesson](SHARDING-CACHING-AND-INFRASTRUCTURE.md).
The [course content map](../COURSE-CONTENT-MAP.md) links complete protocol
lessons rather than turning this calculation into a protocol ranking.
