# WhatsApp-style design: messaging, devices and recovery

[Case-study hub](../GUIDED-CASE-STUDIES.md) ·
[Original case 1](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-1-design-whatsapp) ·
[Topic library](../COURSE-CONTENT-MAP.md) ·
[Corrections ledger](../CONTENT-CORRECTIONS.md) ·
[Shared fixtures](../../assets/case-study-fixtures.mjs)

This is a fictional **design exercise**, not a verified description of
WhatsApp internals. Every scale number and any potential SLO is a hypothetical
planning input, not a current company fact or promise. This static course is
free: there is no account, dashboard, running messaging service or provider.
Follow the reasoning, not a company's name.

## Outcomes and route

Start with one conversation and one durable write. Then make the recipient
multi-device, add offline recovery, group fanout, media and calls. At each
change identify what the simpler design cannot guarantee before choosing more
machinery. Our invariant is not “exactly once over the network”: it is a
precise set of local effects and observable receipt states.

1. Define the promise and the smallest useful exchange.
2. Commit an intent and recover a lost sender response.
3. Deliver independently to two devices and replay safely.
4. Scale with explicit ordering, admission and privacy boundaries.
5. Work through group, media and optional call branches.
6. Predict failures and transfer the design to another domain.

## 1. A problem small enough to solve

A sender wants a message to appear on another person's device, even if a
connection briefly fails. Initially there is one conversation and a single
server with a database. Authenticate both participants; authorize the sender
against current conversation membership. A WebSocket can carry live messages,
but HTTP could submit them and polling could fetch them. Neither transport
is the durable message record.

One database transaction records an accepted message and its delivery intent.
Only after commit can the server acknowledge acceptance. If the recipient is
connected, a worker attempts delivery; otherwise the message remains available
for later retrieval under a defined retention policy. This is intentionally
simpler than deploying a broker, several regional clusters, or a call service.

```text
sender -> authenticated service -> [message + request identity + outbox]
                                           one local commit
                                             |
                                             v
                                   delivery worker -> device
```

The bracket is the transaction boundary, not a network transaction. The worker
can retry after a crash. A delivery attempt is not proof of device receipt.
For low volume this single database and polling worker may be enough.

The canonical independent example is exactly the shared fixture:

<!-- example: messaging-case -->
```json
{
  "messageId": "message-101",
  "conversationId": "conversation-7",
  "senderId": "sender-1",
  "recipientId": "recipient-2",
  "requestKey": "send-101-a",
  "ciphertext": "opaque-demo-bytes",
  "recipientDevices": ["recipient-2-phone", "recipient-2-web"]
}
```

`opaque-demo-bytes` is a symbolic placeholder, **not encryption**, an
algorithm, a valid encrypted payload or evidence of confidentiality. We use
identifiers to trace the exchange, not as bearer credentials.

<details class="learning-answer">
<summary>Predict: if a socket write returns, has the human read the message?</summary>
<p>No. It only reports a transport-level action. Acceptance, each device's durable receipt, and a human read are separate events.</p>
</details>

## 2. Sender request and lost reply

The sender submits the message ID, conversation and symbolic payload with a
request key. The server derives the sender from authenticated identity rather
than trusting a claimed sender ID. It verifies active membership and size
limits before accepting a new operation. In this example the request key is
scoped to the authenticated sender and send operation; a different sender's
same literal key is a different scope, not access to the first sender's result.

The semantic fingerprint binds the meaningful request: conversation, sender,
message ID, recipients as defined by membership, and payload bytes or their
collision-resistant digest. Canonicalize the fields deliberately: JSON
property order and irrelevant whitespace must not create a different intent.
Do not treat the key as authorization. Define retention for the identity and
result at least as long as the allowed retry window; retain business uniqueness
for the message ID beyond that if the contract requires it.

A local transaction with appropriate isolation and uniqueness constraints:

1. Resolves or inserts `(sender, operation, requestKey)` and its fingerprint.
2. Allocates a conversation-scoped sequence at the authoritative owner.
3. Inserts the message and a durable outbox delivery intent.
4. Records the accepted result associated with the request identity.
5. Commits all of these together, then responds `accepted`.

A preliminary read followed by an unguarded insert races. Unique constraints,
conditional writes and the actual database transaction must arbitrate
concurrent submissions. A matching retry returns the saved result, even if
the first response was lost. Same scoped key with different semantic content
is a conflict, not a second message and not silently accepted as a duplicate.
An unauthorized retry must not expose the earlier result after access changes.

```text
sender                  service + local DB              worker
  | send key K                  |                         |
  |---------------------------->| begin                   |
  |                             | message + K + outbox    |
  |                             | commit                  |
  |       accepted (lost)       |                         |
  |<-------------X--------------|                         |
  | retry K, same meaning       |                         |
  |---------------------------->| return committed result |
  |<----------------------------|                         |
  |                             | outbox retry ---------->|
```

The outbox makes the obligation to attempt delivery durable with the message;
it does not prove a relay ran, a device received anything, or that a network
send occurred exactly once. A crash after network send but before marking
progress can lead to another attempt. The recipient deduplicates message
identity and commits its local receipt with any required local effect.
See [outbox and inbox](OUTBOX-INBOX-AND-WORKFLOWS.md) and
[transaction recovery](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md).

<details class="learning-answer">
<summary>Predict: same sender and key, different conversation?</summary>
<p>Reject the conflicting intent. Returning the old result or creating a second message would conceal a semantic mismatch.</p>
</details>

## 3. Two devices, three kinds of evidence

The recipient has a phone and a web device. We model independent device
identities, delivery cursors and receipt rows keyed by message and device.
Assume both were authorized members at the message's defined eligibility
point. A new device enrollment and the policy for old history are separate
product decisions, not automatically implied by this fixture.

| State | Evidence | Does not establish |
| --- | --- | --- |
| Server accepted | Local message, scoped request and outbox committed | Any device received it |
| Phone ACK | Authorized phone durably recorded message and ACKed | Web device received it; a human read it |
| Web ACK | Authorized web device durably recorded it and ACKed | Phone ACK or human attention |
| Read | A separately defined authenticated read event | Other devices read it or the user understood it |

A server may present a product-level aggregate such as “delivered to any
eligible device” or “delivered to all eligible devices.” Name the rule,
including what happens when devices are removed; never relabel one device
ACK as all-device delivery. A read receipt is a user-action signal under a
specified client policy, not independently verifiable attention.

```text
accepted message-101
  +-- recipient-2-phone: ACK recorded, cursor advanced
  +-- recipient-2-web:   disconnected, no ACK, cursor unchanged
  +-- read:              not reported
```

If the phone ACK is lost, the server can redeliver. The phone recognizes the
same message ID, does not render a duplicate, and ACKs again. The server
records an ACK idempotently per device. A malicious or unauthorized client
cannot advance another device's cursor by naming it. Device authentication,
message association and authorization must be checked on each receipt.
A cursor can advance over a contiguous processed prefix, not leap over a
missing message just because a later message arrived.

<details class="learning-answer">
<summary>Predict: the phone ACKs and the web is offline. Is delivery complete on both?</summary>
<p>No. The phone receipt is evidence only for that device; the web device still needs authorized replay or another explicit recovery outcome.</p>
</details>

## 4. Reconnect, retention and a consistent snapshot

A disconnected device reconnects with its authenticated identity and its
last durable cursor for this conversation. The service validates cursor scope
and current access, reads the retained ordered continuation after that point,
then transitions to live delivery without a gap. It sends bounded batches;
the device ACKs only after the promised local durable processing. The server
can resend after a lost ACK, so the client must deduplicate.

The cursor is an opaque scoped position, not a credential and not necessarily
sortable by its spelling. If replay history or the cursor has expired, return
an explicit reset rather than guessing. Provide an authorized snapshot of the
retained visible history and a cursor from the same consistent point, then
replay later messages from that cursor and hand off to live. A snapshot of
current state cannot recreate messages already deleted by retention. If full
history is required, the retention and backup contract must actually support it;
otherwise surface the gap rather than claim complete delivery.

| Moment | Action | Consequence |
| --- | --- | --- |
| 1 | Web loses connection after cursor 40 | It has a durable prefix, not future messages |
| 2 | Message 41 commits | It remains in the retained conversation log |
| 3 | Web reconnects after 40 | Replay 41, including duplicates if necessary |
| 4 | ACK for 41 commits | Device cursor advances over the contiguous prefix |
| 5 | Cursor 40 expires in another run | Reset and consistent snapshot, not invented replay |

If a message commits between snapshot and stream connection, replay after the
snapshot cursor includes it. If that cursor expires before the handoff, retry
with bounded backoff or report recovery failure. See the complete
[real-time recovery and flow lesson](REALTIME-RECOVERY-AND-FLOW.md).

Membership revocation changes the branch. Stop live access and reject further
replay or media access according to the policy at authorization time; do not
trust a previously issued cursor. Define whether already downloaded content
can be removed (usually not reliably) and how history and pending messages
are treated when someone is removed or re-added. An old outbox entry must not
bypass the current delivery authorization check. Existing copies or already
issued download capabilities have their own expiry and revocation limitations.

<details class="learning-answer">
<summary>Predict: may a revoked member replay using a formerly valid cursor?</summary>
<p>No. A cursor names a position, not permission. Recheck membership and apply the documented revocation and retained-history policy.</p>
</details>

## 5. Ordering is a declared scope

Two senders can submit concurrently to the same conversation. Assign sequence
numbers atomically at the conversation owner or use an equivalent ordered
log with a safe ownership/failover protocol. This lesson chooses commit order
within each conversation, not global order across every conversation. A
per-user inbox can be a delivery projection, but two independent per-user
logs alone cannot establish one shared conversation order. Message IDs and
client clocks are not reliable ordering mechanisms.

If partition ownership moves, protect against an old writer with an
appropriate authoritative epoch and resource-enforced fence. A TTL in a
routing registry merely expires a hint; it is not consensus, exclusive
ownership or a proof that a paused process stopped. The real system must
choose and operate a coordination mechanism if the invariant needs it.
See [consensus and coordination](CONSENSUS-AND-COORDINATION.md).

A total order adds coordination and can delay writes during owner failure.
If the product accepts causal or unordered messages, a less restrictive rule
may cost less, but clients must understand the resulting semantics. A socket's
in-order bytes in one direction do not settle concurrency between sockets or
reconnects.

<details class="learning-answer">
<summary>Predict: do separately ordered user inboxes guarantee the same order for concurrent conversation sends?</summary>
<p>No. They can observe different orders unless an authoritative conversation ordering rule is applied before fanout.</p>
</details>

## 6. Offline hints and presence are not delivery

A connection registry maps device sessions to gateway instances, typically
with leases or TTL heartbeats. It is an approximate routing hint: a gateway
can crash after advertising itself, or a device can disconnect unnoticed.
A stale entry must not erase the durable message or falsely mark it delivered.
Retry routing or let the next authorized sync retrieve it. Presence and last
seen are sensitive metadata, require user-facing sharing rules and may be
inaccurate or delayed.

For an offline device, a notification can carry a minimal, non-sensitive hint
that new work might exist. Push may be delayed, suppressed, duplicated, or
never delivered; it is not proof the device woke, fetched, ACKed or a human
read anything. On wake or ordinary reconnect the app authenticates and uses
the same replay path. Bound retries, honor provider limits and remove invalid
registration tokens under an explicit policy. No real notification provider
is contacted in this lesson. See [push delivery](PUSH-NOTIFICATION-DELIVERY.md).

A registry backed by consensus could coordinate some metadata, at additional
cost and with its actual failure assumptions; an ordinary TTL cache alone
does not resolve split brain. Neither approach gives exactly-once delivery.

<details class="learning-answer">
<summary>Predict: a push provider accepted a notification. Is the message read?</summary>
<p>No. Provider acceptance is only a handoff. The device may not wake or fetch, and a read event is separate from both.</p>
</details>

## 7. Bounded flow and overload

Suppose a gateway receives 10 required messages per second for a device that
processes only 4. Backlog rises by 6 per second; after 100 seconds it has
600 additional messages. Infinite buffering is not a scaling plan. Give each
device and gateway byte/message limits, bounded in-flight batches and
application-level credits. Stop reading or admitting work where the protocol
allows; otherwise reject or defer with an explicit retry policy.

Required messages cannot be coalesced like a latest-presence value. When a
slow consumer fills its queue, stop delivery or disconnect it and let it
resume from the durable log, provided retention is sufficient. If the log is
also full or expired, surface the defined failure. `WebSocket.bufferedAmount`
is an outgoing browser buffer measurement, not an inbound application ACK.
Use exponential backoff with jitter and finite budgets to prevent a reconnect
storm; do not silently turn persistent overload into infinite retries.

During planned gateway drain: stop new assignments, notify or close existing
connections gradually, let clients reconnect with jitter, and preserve replay
state outside the gateway. A node crash is an unplanned version of this path.
Track queue bytes, oldest outbox age, replay lag, cursor resets, ACK lag,
connection count and overload rejections. Never log private payloads or keys.

<details class="learning-answer">
<summary>Predict: can the service replace two undelivered chat messages with the newest?</summary>
<p>Not when both are required facts. Apply backpressure or recover from retained history instead of silently dropping one.</p>
</details>

## 8. Capacity arithmetic, not a benchmark

These numbers are hypothetical planning assumptions, not facts about a
company or an SLO. Decimal bytes are used; payload-only storage excludes
metadata, replicas, indexes, encryption overhead, media, network framing,
backups and failures. DAU does not imply concurrent connections.

<!-- example: messaging-scale -->
```json
{
  "dailyActiveUsers": 500000000,
  "messagesPerActiveUserPerDay": 40,
  "secondsPerDay": 86400,
  "peakFactor": 5,
  "averageMessageBodyBytes": 1000,
  "retentionDays": 30,
  "assumedConcurrentConnections": 500000000,
  "assumedConnectionsPerGateway": 100000
}
```

| Calculation | Result | Interpretation |
| --- | --- | --- |
| 500,000,000 DAU × 40 | 20,000,000,000 messages/day | Hypothetical average volume |
| 20,000,000,000 / 86,400 | 231,481.48 messages/s | Rounded mean, not a peak |
| Mean × 5 | 1,157,407.4 messages/s | Rounded assumed peak, not measured |
| 20B × 1,000 bytes | 20 TB/day | Decimal payload only |
| 20 TB × 30 | 600 TB | Decimal 30-day payload only |
| 500M assumed concurrent / 100K per node | 5,000 gateways | Arithmetic baseline only |

The 500M concurrent connections are an independent assumption, not derived
from 500M daily active users. The 100K connections per gateway is a capacity
assumption, **not a benchmark**. Actual CPU, memory, TLS, fanout, network,
headroom and failover tests could change it substantially. N+1 or regional
failure headroom adds capacity; skew and hot conversations matter.
A hypothetical delivery-latency target needs a measurement boundary, population,
observation window and explicit eligibility rules. Do not silently exclude
outages that affected eligible user requests. Pair delivery-after-acceptance
with acceptance success so an accepted-only cohort cannot conceal failed sends.
Acceptance latency, per-device receipt latency and read-report latency are
not interchangeable or proof of human attention.

## 9. Group fanout and membership

Change the requirement: a message goes to a group with many members and
multiple devices each. Define membership at a particular version of the
conversation. The message's canonical ordered record references that version;
a durable fanout task enumerates eligible recipients in bounded pages.
Persist fanout progress and deterministic delivery identities so retries do
not create new logical copies. Device delivery still checks current access,
including removal after the message was accepted. Define which historic
messages a newly added member can see, and how concurrent joins/removals are
serialized with sends. Do not take an unbounded snapshot in memory.

```text
conversation sequence + membership version
             |
             v
      durable fanout job -> page of eligible devices -> per-device attempts
             |                       |
       checkpoint progress      ACK / retry independently
```

A broker may transport jobs, but partition order, consumer recovery, duplicate
handling and retention must be configured and verified; it does not make
message storage and publish atomic. The local outbox remains the boundary.
Huge groups produce large write amplification and hot partitions. Alternatives
include a shared group log read by members, hybrid fanout or paged delivery;
each trades write work for read load, authorization complexity and latency.
The product must explicitly define the per-device delivery obligation.

<details class="learning-answer">
<summary>Predict: does publishing one group event prove every member device received it?</summary>
<p>No. Publication records a handoff, not per-device receipt. Fanout progress and each device's ACK remain separate.</p>
</details>

## 10. Media is an authorized object lifecycle

Change the requirement again: a sender shares a large image. Sending all bytes
through the live messaging gateway may overload connection workers. Instead,
a service authorizes a short-lived, narrowly scoped upload capability for an
object owned by that sender and intended conversation. The client uploads to
object storage under size and content constraints. The server verifies object
completion and ownership, then commits a message referencing an immutable,
versioned object. A URL alone is neither a membership check nor proof that an
upload succeeded.

```text
sender -> authorize upload -> scoped short-lived capability
sender -> object store -> immutable completed object
sender -> message service -> reference + outbox commit
recipient -> authorized download capability -> object bytes
```

On download, recheck conversation membership and issue a short-lived capability
for the specific object and operation. If storage cannot revoke an already
issued capability immediately, bound its lifetime and document that exposure.
Clean up abandoned uploads with a safe expiry policy. Prevent overwriting an
object after its message was approved; scan or validate as the product and
privacy model permit. Media keys, content type, size limits and abuse controls
are separate design choices. CDN caching must not accidentally make private
objects publicly accessible. Media processing adds cost and may conflict with
end-to-end confidentiality if the server must inspect plaintext.

## 11. Confidentiality requires more than a label

A production end-to-end encrypted design needs actual cryptographic protocols,
authenticated device identities, key distribution and rotation, authenticated
encryption, device additions and revocation, compromise recovery and carefully
reviewed implementations. There is no crypto implementation in this exercise.
TLS protects a client-to-service transport hop; it does not automatically
make message content end-to-end encrypted between devices. The same warning
applies to SRTP in calls when a relay or intermediary can access keys or media.
Use established, reviewed protocols rather than inventing cryptography here.

Even with content protected, metadata can expose who communicated, when,
group membership, IP addresses, device identifiers, notification tokens and
object sizes. Minimize collection and retention, apply access controls and
separately consider abuse, legal and operational requirements. Key backup,
new-device history and lost-device recovery have privacy and usability costs.
Deleting a server record cannot guarantee deletion of a recipient's copy.

<details class="learning-answer">
<summary>Predict: does TLS between every client and the server prove end-to-end encryption?</summary>
<p>No. The server may terminate TLS and see plaintext. End-to-end protection needs actual device identities, key distribution and reviewed cryptography.</p>
</details>

## 12. Optional branch: voice and video calls

If users need calls, messaging delivery is not itself a media transport.
An authenticated signaling service authorizes an invitation, exchanges SDP
offer/answer and ICE candidates, and handles rejection, timeout, cancellation
and reconnect. Both clients perform ICE connectivity checks. STUN can help
discover a server-reflexive address; TURN provides a relay when direct paths
are unavailable and credentials/policy allow it. ICE can select a viable
candidate pair, but direct UDP is not guaranteed: network policy, NAT,
relay availability or firewall conditions can make even TURN fail.

```text
caller -- offer/candidates --> signaling -- offer/candidates --> callee
caller <-- answer/candidates -- signaling <-- answer/candidates -- callee
caller <--- ICE-checked direct path OR authorized TURN relay ---> callee
                         neither works -> call fails visibly
```

After negotiation, audio flows over the selected media path; video is an
optional track with its own bandwidth and permission needs. Handle codec
negotiation, device permission, call teardown, bandwidth adaptation and
TURN bandwidth costs. Reconnect or renegotiate after network changes only
under a bounded policy. Signaling success is not media connectivity. SRTP
protects media in its relevant negotiated context, not a blanket claim of
end-to-end privacy through every architecture. Read the full
[WebRTC connectivity lesson](WEBRTC-MEDIA-AND-CONNECTIVITY.md).

<details class="learning-answer">
<summary>Predict: both users accepted the call; must direct UDP now work?</summary>
<p>No. ICE checks may select a relay or find no usable path. Signaling acceptance is not evidence that media connectivity exists.</p>
</details>

## 13. Failure decisions and costs

| Condition | First safe action | Cost or limitation |
| --- | --- | --- |
| Commit fails | Return failure; no accepted record | Client retries within a budget |
| Response lost after commit | Same scoped key and fingerprint returns saved acceptance | Dedup state and retention |
| Gateway crashes | Reconnect and replay retained conversation data | Recovery latency and load |
| Device ACK lost | Redeliver and deduplicate per device | At-least-once attempts |
| Cursor expired | Explicit reset and consistent authorized snapshot | Cannot recover already deleted history |
| Member removed | Recheck access, stop future delivery | Cannot retract existing copies |
| Fanout backlog grows | Backpressure, page work and monitor age | Delayed delivery under sustained overload |
| TURN unavailable | Try permitted candidates, then fail visibly | No guaranteed call connectivity |

A multi-region system adds replication and conflict/ownership decisions.
Failing over to a stale region without the message and dedup record can lose
or duplicate accepted operations. Choose the recovery point, authoritative
write ownership, replication acknowledgements and read contract explicitly;
a nearby gateway is not necessarily the authoritative database. See
[regions and consistency](REGIONS-AND-CONSISTENCY.md).

## 14. Practice: predict before expanding

1. The accepted response is lost, then the sender retries the same key with
   the same message but rearranged JSON properties. What should happen?
2. The phone ACKs, the web device reconnects from an expired cursor and its
   membership has been revoked. Which operation must be rejected first?
3. A group has a million members and one worker crashes halfway through a
   page. Which identities and checkpoints must survive a retry?
4. The sender wants offline delivery indefinitely. What must change about
   retention, storage budgets and the promise after a device is removed?
5. A small private study group has ten participants and low traffic. Explain
   why one database, a bounded worker and polling can be the right first design.
6. Transfer to a hospital appointment reminder (no medical data in push):
   distinguish server acceptance, a particular device's receipt, and a person
   actually reading a reminder. Identify what retention and authorization
   must change for that domain.

<details class="learning-answer">
<summary>Check the lost-response and revocation predictions.</summary>
<p>The first retry returns the committed result because its semantic intent matches. The revoked device cannot use its old cursor as authorization; reject access before serving a snapshot or replay.</p>
</details>

<details class="learning-answer">
<summary>Check the keep-it-simple and transfer predictions.</summary>
<p>Low traffic does not justify a broker or global coordination by itself. A reminder still needs distinct acceptance, device receipt and human-read semantics, with privacy and retention chosen for its own domain.</p>
</details>

## 15. Source bridge and evidence boundary

The [original case](../09-SYSTEM-DESIGN-CASE-STUDIES.md#case-study-1-design-whatsapp)
remains intact. Its line 152 calls push “Wake device when app inactive”; this
lesson treats it as an unreliable hint, not proof of waking. Lines 260 and
261 propose per-user sharding and group partitioning; a shared conversation
order and membership-aware device delivery require additional rules. Line 278
presents “Consensus-based registry or TTL-based expiry” together; TTL expiry
is not consensus and cannot itself guarantee exclusive authority. Lines 203–219
sketch offline sync but do not define per-device cursors, expiry or snapshot
handoff. These are qualifications, not claims about a real deployment.

The accompanying local tests parse the actual example blocks and exercise
small decision models. They do not prove a production messaging system,
cryptography, device durability, network delivery, ordering under distributed
failure or provider behavior. The parent course's local SQLite probe examines
local atomicity separately; it is not a live broker or provider test.

Continue with [realtime recovery](REALTIME-RECOVERY-AND-FLOW.md),
[backpressure and capacity](BACKPRESSURE-AND-CAPACITY.md),
[notification delivery](PUSH-NOTIFICATION-DELIVERY.md),
[WebRTC](WEBRTC-MEDIA-AND-CONNECTIVITY.md), and
[distributed transactions](DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md).
