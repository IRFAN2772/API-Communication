# Consensus and coordination: one decision under failure

[← Expert journey](../07-GUIDED-EXPERT-DESIGN.md) |
[Original module 7.8](../08-EXPERT-API-DESIGN.md) |
[Course library](../COURSE-CONTENT-MAP.md) |
[Corrections](../CONTENT-CORRECTIONS.md)

This fictional exercise uses the
[shared expert fixtures](../../assets/expert-lesson-fixtures.mjs) and
requires no paid infrastructure, running cluster, broker or installation.
The current `course-101`, **API Fundamentals**, has 29 available seats;
`learner-7` already holds `enrollment-42`. Nothing here re-enrolls that
learner or changes the current baseline.

The last-seat story below is an **independent hypothetical snapshot**:
one seat, competing `learner-8` and `learner-9`, and three replicas.
It is not the 29-seat baseline. See
[regions and consistency](REGIONS-AND-CONSISTENCY.md) for the partition
and read contracts, and the [architecture journey](../06-GUIDED-ARCHITECTURE.md)
for service boundaries.

## 1. Why coordinate?

A local process can serialize commands with a lock, but that lock
disappears or becomes inaccessible when the process fails. Replicated
participants communicate through a network that can delay, drop, duplicate
or reorder messages. A timeout cannot distinguish a crashed machine from
a slow machine or a network partition. A leader may be paused rather than
dead, then wake up with an obsolete belief that it owns the work.

Consensus lets non-Byzantine participants agree on a decision despite
specified crash and communication failures. In a replicated log, they
agree on a sequence of commands; a deterministic state machine applies
committed commands in that order. Starting from the same state and
applying the same deterministic commands yields the same state.
Authentication and authorization of clients are still application
responsibilities, not consequences of agreement.

Examples of decisions include a configuration version, a leader epoch, or
the next ordered state-machine command. A consensus log can hold a seat
reservation command if the application validates and atomically applies
the invariant. Consensus does not automatically make a payment provider,
email service and database one atomic transaction. A workflow still needs
idempotency, durable handoffs and compensation as appropriate; see
[distributed transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md) and
[outbox/inbox workflows](OUTBOX-INBOX-AND-WORKFLOWS.md).

<details class="learning-answer">
<summary>If a leader times out, is it proven dead?</summary>
<p>No. It might be delayed, paused, overloaded or partitioned. A timeout
is a suspicion used to start recovery, not proof that the old process
cannot later act.</p>
</details>

## 2. State the invariant before choosing the algorithm

For the independent snapshot, at most one learner may successfully claim
the one remaining seat. Both requests are authenticated and authorized.
The state machine must atomically test availability and record the
outcome; agreement on the command order alone does not implement that
business rule.

<!-- example: quorum-case -->
```json
{
  "replicas": ["A", "B", "C"],
  "reachable": ["A", "B"],
  "term": 12,
  "requiredVotes": 2
}
```

This JSON is an **illustrative model**, not a running protocol, membership
change or proof that A is leader. A and B can form a majority of the fixed
three-node configuration if their protocol state permits an election;
C alone cannot. A majority is two out of three, three out of five, or
generally floor(N/2)+1 for a fixed membership.

```text
learner-8 -> leader A -> log entry -> B acknowledgement
                                      C unreachable
                           |
                           +-> commit only when protocol rules permit
                               -> apply atomic seat decision
```

The figure assumes A has already become a valid leader. No arrow says
that a follower append alone is a commit or that a learner has already
been enrolled.

## 3. Work through a partition and a retry

1. A becomes leader in term 12 after an eligible election. It has the
   necessary log history; A and B form a reachable majority.
2. `learner-8` submits intent `seat-8-a`. A appends the command in term
   12 and replicates it to B. Assuming durable acknowledgements and the
   current-term commit rule, A can mark this entry committed.
3. The state machine applies the command once: one seat becomes zero and
   a durable result is associated with that intent. The service may now
   respond successfully, according to its chosen application contract.
4. The response is lost. A timeout tells the client neither that the
   command committed nor that it failed. It retries the *same* intent,
   not a new identity for the same operation.
5. After a safe leader change, the new leader applies or reads the
   committed deduplication record and returns the original result. It
   does not consume another seat. Deduplication must be part of durable
   replicated state, with a defined client/key scope and retention period.
6. `learner-9` asks for the same last seat. The ordered state machine
   observes zero and returns no seat. If `learner-9` had been ordered
   first, the outcomes would be reversed.
7. C rejoins, learns the newer term and log from the legitimate leader,
   and repairs any conflicting uncommitted suffix through the protocol.
   Rejoining does not create another enrollment.

If only C is reachable, it cannot obtain the fixed-configuration majority.
It may reject or wait on seat writes rather than violate the invariant.
It may serve suitably labeled stale catalogue data only if that separate
read policy allows it. A minority's inability to write is a deliberate
availability cost; no promise of automatic progress is implied.

<details class="learning-answer">
<summary>Why does replaying the same request not reserve a second seat?</summary>
<p>The replicated state machine durably records the intent and result.
On retry it returns that result instead of applying the seat change again.
A timeout alone does not indicate whether the first attempt committed.</p>
</details>

## 4. What a majority proves—and what it does not

For a fixed membership, any two majorities intersect. For A, B and C,
the majority pairs are AB, AC and BC. Each pair of those sets shares at
least one member. In a five-node group every three-node majority also
intersects every other three-node majority.

Intersection provides a path for evidence to carry forward. It does not,
alone, force an intersecting node to remember its vote, reject a stale
candidate, retain a log entry, or select the correct value. The algorithm
needs durable state, election restrictions, log consistency and commit
rules. Quorum sizes also cannot be naively recomputed across arbitrary
membership changes; a protocol must use a safe transition such as Raft's
joint consensus where required.

If A is partitioned from B and C, both sides may *believe* they lead
temporarily. Only the side satisfying the actual term and quorum rules
can commit new entries. The old leader's belief is not a fencing token for
an unrelated external database or payment service.

<details class="learning-answer">
<summary>Is shared membership of two majorities a complete safety proof?</summary>
<p>No. The shared node must preserve and enforce the protocol's durable
voting and log rules. Membership changes, crashes and concurrent terms
must also be handled by the actual algorithm.</p>
</details>

## 5. Timing assumptions and failure detection

The two-generals story illustrates why repeated acknowledgements do not
give both sides certainty that the last message arrived. It is an
intuition about unreliable communication, not a derivation of Raft.
The FLP result concerns deterministic consensus in a fully asynchronous
model with even one possible crash: guaranteed termination is impossible
in every admissible execution. It does not say that agreement is useless
or that safety must be abandoned.

Practical protocols preserve safety under their specified message delays,
crash and partition model and rely on eventual communication and suitable
timing for progress. Randomized election timeouts reduce repeated split
votes but do not guarantee an immediate leader. Heartbeats help followers
suspect a missing leader; they are not proof that a remote process has
stopped. Clock assumptions matter particularly for lease-based shortcuts.

These are crash-fault, non-Byzantine explanations: nodes are assumed to
follow the protocol and not maliciously forge votes or arbitrarily corrupt
state. Byzantine faults require different algorithms and assumptions.
Disks, networks, process pauses, and operational errors still matter.

## 6. Raft roles, terms and elections

A Raft server is a follower, candidate or leader. A follower that stops
hearing from a leader starts an election after its timeout. It increments
its term, becomes a candidate, records a vote for itself, and requests
votes from peers. A candidate winning a majority in the same term becomes
leader and sends AppendEntries heartbeats. Competing candidates can split
votes; a later timeout starts a new term.

A voter grants at most one vote per term, persisting its current term and
vote before replying so that a crash and restart cannot create a second
vote. It also checks the candidate's log freshness: the candidate's last
log term must be newer, or equal with an index at least as large as the
voter's. A higher term causes a server to update its term and step down
as needed. A stale-term request is rejected; this is protocol behavior,
not magic removal of all obsolete external side effects.

```text
term 12: A requests votes -> A votes A; B votes A -> 2/3 -> leader A
         C unreachable; an election needs log-freshness checks too
term 13: B can win only with a valid majority and an eligible log
```

The exact freshness and persistence rules protect committed history
through leadership changes. A node merely having the highest term is not
sufficient to lead: it still needs a majority of valid votes.

<details class="learning-answer">
<summary>Why persist a vote before acknowledging it?</summary>
<p>Otherwise a crash could erase the vote and allow the same server to
grant another vote in the same term after restart, undermining election
safety.</p>
</details>

## 7. Append is not commit

The leader assigns each entry an index and term and sends AppendEntries
with the preceding index and term. A follower accepts the extension only
when its log matches at that preceding position. On conflict, the leader
backs up and sends the needed entries; conflicting uncommitted suffixes can
be replaced. The log-matching property links equal index-and-term entries
to matching preceding history under the protocol's rules.

A follower appending an entry means that follower stored it, not that the
entry is committed. A leader may advance its commit index by counting
replicas only for an entry **from its current term** stored on a majority.
Committing that current-term entry also commits preceding entries in its
log, including entries from older terms. A previous-term entry being on a
majority alone is not sufficient for a new leader to count it as committed
using that rule; a later current-term entry can establish commitment
indirectly.

After commitment, the leader applies entries in order and communicates
the commit index to followers, which apply committed entries in order.
Exact client acknowledgement and read semantics are implementation
contracts. A leader's local append, a follower's append, and state-machine
application are distinct events. For linearizable reads, use the
implementation's validated leader/read-index or appropriately constrained
lease mechanism, not an arbitrary follower.

```text
index   term   A       B        C
  41     11    stored  stored   unknown    <- old term; do not count alone
  42     12    stored  stored   absent     <- current-term majority
                                      commit 42 also commits prefix 41
```

This is a schematic after A has been validly elected with the shown log.
It is not a full transcript of messages, disk writes or crash recovery.
Production Raft also depends on correctly implemented stable storage,
membership transitions, snapshots and recovery.

<details class="learning-answer">
<summary>Does one follower's successful append make an entry committed?</summary>
<p>No. Commitment depends on the leader's quorum and Raft's term rules.
Even an older-term entry on a majority is not directly committed by
counting replicas; a committed current-term entry can commit its prefix.</p>
</details>

## 8. Paxos, Multi-Paxos and ZooKeeper

Classic single-decree Paxos chooses one value. A proposer selects a
proposal number and sends **prepare** to acceptors. An acceptor promises
not to accept lower-numbered proposals and reports its highest accepted
proposal, if any. After a quorum of promises, the proposer sends
**accept** for the highest-numbered previously accepted value reported
by that quorum, or its own value if none was reported. Acceptors accept
only when their promises allow it; a quorum of accepts chooses the value.
Learners find out the chosen value. A later proposal must respect the
prior accepted value as required, rather than choosing an arbitrary one.

Multi-Paxos amortizes leader/prepare work across a sequence of log slots
under a stable leader, while preserving the needed recovery rules. Both
protocol families require careful stable storage and quorum management.
Do not treat “Paxos versus Raft” as a mandatory progression or infer
identical deployment performance from their conceptual equivalence.

ZooKeeper is a coordination service whose ensemble uses Zab (ZooKeeper
Atomic Broadcast) to establish an ordered stream of changes. Its leader
coordinates proposals and followers participate in quorum replication and
recovery; observers can serve reads but do not vote in the quorum. Clients
use service abstractions such as znodes and watches, not direct access to
a generic Raft API. ZooKeeper's own read and durability semantics and
configuration must be consulted for the specific deployment.

etcd uses Raft for replicated state and is commonly used by the Kubernetes
control plane for cluster state. Neither using etcd nor using ZooKeeper
automatically fences an arbitrary external resource. Choose a service
based on the required guarantees and operations, not a presumed ladder
of algorithm sophistication.

<details class="learning-answer">
<summary>What must a Paxos proposer do after receiving promises?</summary>
<p>It must propose the value of the highest-numbered accepted proposal
reported by its promise quorum, if one exists; otherwise it may propose
its own value. This preserves earlier choices.</p>
</details>

## 9. Split brain and fencing are separate problems

Suppose worker A held a lease and paused. The coordinator eventually grants
worker B a newer lease, but A wakes and still believes it owns the work.
A local timeout or leader election cannot prevent A from writing to an
external system. Both can think they are leader even though only one has
current authority.

A fencing design issues a monotonically increasing token on each
ownership grant. The **protected resource** atomically compares the token
with the highest token it has accepted, rejects a lower token, and records
the new maximum with the protected mutation in one atomic operation. For
example, after accepting token 12, it must reject token 11. The check and
write cannot be separated by a race or performed only at the client.

```text
coordinator -> B token 12 -> resource atomically records 12 + mutation
old A token 11 -----------> resource rejects (11 < accepted 12)
```

Token equality can permit repeated operations by the same owner; it does
not deduplicate a request. Use a separate idempotency key and atomic
result recording when retries must not repeat an effect. If a stale token
arrives before the resource has seen the newer token, the resource cannot
infer the newer grant from its local maximum alone. The new owner must
establish its fence at the resource before relying on exclusive access,
or the resource must consult an equivalent authoritative mechanism.

Leases add time assumptions: clock drift, pauses, network delay and expiry
interpretation can invalidate simplistic local-clock reasoning. Fencing
does not retract an email or payment already sent to a third party that
does not enforce the token. Use provider idempotency, outbox records and
reconciliation; if the external system cannot enforce the invariant,
state that limit rather than claiming perfect fencing.

<details class="learning-answer">
<summary>Does obtaining token 12 instantly prevent all token 11 writes?</summary>
<p>Not by itself. The protected resource must atomically enforce the
ordering, and it must have observed the newer fence or consult an
authoritative equivalent before rejecting an earlier token.</p>
</details>

## 10. Consensus costs and where it belongs

Cross-region quorum round trips increase write latency. A three-node group
tolerates one unavailable voter for progress; a five-node group tolerates
two, provided a majority can communicate and the protocol's other
preconditions hold. More voters can increase fault tolerance but also
cost, coordination overhead and operational complexity. Region placement
and failure correlation matter more than node count alone.

Use agreement where a specific invariant needs one ordered decision:
seat ownership, control-plane configuration, or leader metadata.
Batching and careful placement can reduce overhead, but do not promise
zero latency. Avoid a global consensus round for every cache hit or
independent analytics event when weaker, well-defined semantics suffice.
Eventual convergence and consensus serve different requirements; one is
not automatically more appropriate everywhere.

Monitor quorum reachability, term churn, commit latency, storage latency,
replication backlog and recovery events. Rehearse losing a region, losing
a disk, restoring a snapshot, rejoining an old node and changing
membership. Know the documented durability configuration and what happens
when fsync is disabled or fails. Backups and verified restores are still
needed; replicated corruption is still corruption.

## 11. Model versus production

The local lesson tests enumerate small fixed quorums and model a resource
that atomically checks and records a fencing token. They do not simulate
Raft elections, durable disks, messages, crashes or reconfiguration and
are not a production protocol implementation. Finite tests can expose
specific mistakes, but do not prove safety for every possible execution.

Before deploying a real system, use a well-reviewed implementation, read
its version-specific guarantees, configure durable persistence, validate
fsync and storage failure behavior, test network partitions and restores,
and verify that application deduplication and resource fencing are
actually atomic. Formal specifications, model checking and fault injection
can add evidence; each has a defined model and coverage boundary.

## 12. Reason about a changed failure

Suppose A leads and its current-term seat command is present on A and B,
but the acknowledgement from B is delayed. Until A receives enough
evidence, it cannot safely report commitment on that basis. If A crashes,
the client still does not know the outcome: the entry may be retained and
later committed by a valid leader, or it may be overwritten if it was not
committed and the protocol permits that history.

Consider the alternative in which A committed the current-term entry
before crashing. Election and log rules ensure a future legitimate leader
contains the committed prefix under Raft's assumptions. B or C can become
leader only by winning votes and satisfying the freshness check. A
rejoining later must recognize a higher term and reconcile its log; it
must not use its old leadership belief to authorize external work.

These are different histories even if the client observes the same
timeout. A retry resolves the application outcome through the durable
intent record, not by guessing from a transport error. If the key expires
too early, a late retry could become a new operation. Set retention and
client retry policy together, and consider a durable business uniqueness
constraint where appropriate.

For an external email, even committed log application is not sufficient
to prove exactly one delivery. The consumer may crash after sending but
before recording completion. A transactional outbox and a provider-side
idempotency key can narrow that gap; without a cooperating provider,
reconciliation and a visible uncertainty policy may still be necessary.

<details class="learning-answer">
<summary>Does a committed log entry guarantee exactly one external email?</summary>
<p>No. The email is an independent side effect with its own failure and
retry window. A durable handoff and a cooperating idempotent recipient
are needed for stronger behavior, and their limits must be documented.</p>
</details>

## 13. Practice and source bridge

1. Enumerate all majorities of A/B/C and find the intersection of each
   pair. Then explain why this is not a complete Raft proof.
2. The leader appends an entry locally, sends it to B, then crashes before
   B acknowledges. What can the client conclude? What information is
   needed to decide whether it committed?
3. A newly elected leader sees an old-term entry on a majority. Explain
   why it cannot use that observation alone to advance its commit index.
4. A resource accepted token 12. What must it do with token 11? What if
   token 11 arrived before token 12 was registered?
5. The payment provider ignores fencing tokens. Propose a separate
   idempotency and reconciliation strategy; explain the remaining limits.

<details class="learning-answer">
<summary>Check the lost-acknowledgement case.</summary>
<p>The client cannot determine whether the write committed from a timeout
or missing acknowledgement. Retry the same durable intent and consult
the authoritative result after the protocol recovers.</p>
</details>

<details class="learning-answer">
<summary>Check the fencing case.</summary>
<p>After the resource atomically accepts token 12, it rejects token 11.
Before observing 12 it may accept 11, so the new owner must establish the
fence at that resource before relying on exclusivity.</p>
</details>

The original module 7.8 introduces failure detection, terms, replicated
state machines, total order, Raft, Paxos, Zab, etcd and consensus costs.
Its replication summary at lines 5402–5410 says “Once majority replicate
it, leader commits it”; the current-term restriction and prefix rule above
are essential qualifications for a new leader. Its majority discussion
at lines 5217–5226 is useful intuition, but overlap needs the
persistence, election and log rules described here. Total-order broadcast
and repeated consensus are related under the appropriate system model;
neither implies an atomic transaction across external services.

Continue with [regions and consistency](REGIONS-AND-CONSISTENCY.md),
[transaction recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md),
[reliability and incidents](RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md),
and [tenant governance](TENANCY-USAGE-AND-GOVERNANCE.md) for the surrounding
operational and authorization decisions.
