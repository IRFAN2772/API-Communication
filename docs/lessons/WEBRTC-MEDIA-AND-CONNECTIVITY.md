# WebRTC lesson: media and connectivity

The fictional learning platform has a live classroom for **API Fundamentals**
(`course-101`). The existing chat message is from `learner-7`:
“Ready for class”. A fictional `teacher-1` now wants to speak, show video and share a
screen with that learner. Later, more learners join the same classroom.
These roles and call events are teaching examples, not real accounts or calls.

The course is free, static reading: it deploys no media server or TURN
service and requires no account or tools. This page neither requests camera
or microphone access nor creates a connection. Manual exercises are thought
experiments; production behavior requires its own implementation and testing.
The [shared fixtures](../../assets/realtime-lesson-fixtures.mjs) provide the
course, learner and chat message, not a WebRTC implementation.

**Route:** [The changed problem](#webrtc-problem) ·
[Call setup](#webrtc-setup) · [Connectivity](#webrtc-connectivity) ·
[Media and data](#webrtc-media) · [Group cost](#webrtc-group) ·
[Failure and recovery](#webrtc-failure) · [Security](#webrtc-security) ·
[Practice](#webrtc-practice) · [Source corrections](#webrtc-corrections).

Existing references: [original real-time chapter](../04-REALTIME-COMMUNICATION.md),
[course content map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md).
Related lessons:
[guided real-time](../04-GUIDED-REALTIME.md),
[recovery and flow](REALTIME-RECOVERY-AND-FLOW.md),
[push delivery](PUSH-NOTIFICATION-DELIVERY.md), and
[webhooks and background jobs](WEBHOOKS-AND-BACKGROUND-JOBS.md).

<a id="webrtc-problem"></a>
## 1. Chat works; speech changes the requirement

The classroom already uses WebSocket for bidirectional text messages.
A chat message may arrive a little late and still be useful.
Speech must be captured, encoded, carried and played continuously; when an
old syllable arrives too late, waiting for it can make the conversation worse.
Video and screen sharing add much higher and changing bandwidth demands.
Both participants need to hear and respond in time, not merely receive bytes.

WebSocket **can** carry encoded media bytes. However, the application must
build or integrate a suitable media stack, including capture, encoding,
timing, playback, adaptation and loss handling. WebSocket alone is not that
integrated interactive media stack. Its reliable ordered byte transport can
also make later data wait behind lost earlier data.
This does not make WebSocket audio or video categorically impossible.

WebRTC is a set of browser APIs and protocols for real-time peer connections,
including audio, video and data channels. It brings media negotiation,
connectivity checks and media transport mechanisms together. It is not a
drop-in classroom application: the platform still designs its room,
identity, signaling, participant controls, operations and user experience.
“Peer connection” is an API relationship; its network path can be direct,
relayed, or terminate at a media server. It is not always direct or UDP.

<details class="learning-answer">
<summary>Predict: must the platform replace its working WebSocket chat to add speech?</summary>
<p>No. Keep chat where it fits and add an interactive media solution when needed; WebSocket can also carry signaling.</p>
</details>

<a id="webrtc-setup"></a>
## 2. Set up one illustrative call

Assume both people are authenticated and authorized for this classroom,
their devices have usable media, and the platform has configured any needed
connectivity infrastructure. None of those conditions follows merely from
opening this page.

1. `learner-7` requests entry; the application checks identity and room
   membership. `teacher-1` has permission to teach in `course-101`.
2. The application establishes a signaling exchange. Existing HTTPS
   requests or a WSS channel could carry it; WebRTC does not specify the
   application's signaling transport or room protocol.
3. One side creates an SDP offer describing proposed media and transport
   parameters; the other processes it and returns an SDP answer.
   The offer/answer exchange agrees compatible session parameters, not a
   promise that media can reach the recipient.
4. Each side gathers ICE candidates and sends them to the other through the
   application's signaling path. Candidates may arrive incrementally while
   negotiation continues; the application must associate them with the
   correct room, peer and negotiation.
5. ICE tests candidate pairs. If a usable pair is selected and secure
   transports establish, media can flow. The application displays state and
   handles rejection, failure and termination explicitly.

The following is a small schematic, not a claim about a fixed order of all
asynchronous events:

```text
learner-7 -- offer / candidates --> application signaling --> teacher-1
learner-7 <-- answer / candidates -- application signaling <-- teacher-1
learner-7 <==== selected media path: direct OR relay/server ====> teacher-1
```

Text alternative: offer, answer and candidates go through the application's
signaling channel; the chosen media path is a separate connection and may
include a relay or media server. A group can use separate peer connections
to an SFU instead of the two-person path shown.

An open signaling WebSocket does not prove that ICE succeeded or that audio
is flowing. Conversely, an established media path may continue briefly if
signaling disconnects, depending on circumstances. The app still needs
signaling for later coordination, renegotiation and recovery.
Protect signaling messages against unauthorized room access, tampering and
replay according to the application's session design; do not trust a
client-supplied course ID as proof of membership.

<details class="learning-answer">
<summary>Predict: does an SDP answer prove learner-7 can hear teacher-1?</summary>
<p>No. It describes negotiated parameters; connectivity, secure transport, tracks, permissions and playback must also work.</p>
</details>

<a id="webrtc-connectivity"></a>
## 3. Find a usable network path

Devices often sit behind network address translation (NAT) and firewalls.
A private address may work on a shared local network but not from the
Internet. ICE, Interactive Connectivity Establishment, gathers possibilities,
checks candidate pairs and selects a working pair under its procedures.
This is not a single “try STUN, then try TURN” switch.

| Candidate | What it represents | What it does not prove |
| --- | --- | --- |
| Host | An address on a local interface | That a remote network can reach it |
| Server-reflexive | A NAT mapping observed using STUN | That every destination can use the same mapping or pass the firewall |
| Relay | An address allocated on a TURN relay | That the relay or the path to it is reachable and has capacity |

STUN, Session Traversal Utilities for NAT, can reveal the address and port
mapping observed by a STUN server. It does not itself guarantee NAT
traversal or carry the call for both participants.
Different NAT behavior and filtering policies can still prevent a connection.
ICE checks pairs, not STUN alone; candidate availability and check outcomes
depend on configuration and networks. Selected does not mean globally
fastest, cheapest or permanently best.
ICE's connectivity checks themselves use STUN messages between the agents.
That is different from asking a public STUN server to discover a mapping:
ICE coordinates which candidate pairs to test and select.

TURN, Traversal Using Relays around NAT, provides a relay allocation and
forwards traffic when an appropriate relay candidate is selected.
Depending on configuration and support, the client can reach TURN using
UDP, TCP or TLS over TCP. Peer-facing transport and deployment details also
matter. Some networks block UDP; a supported TCP/TLS relay path may help,
but TURN is not a magic bypass for every firewall, proxy, policy or outage.
Relay-only policy can also be chosen for privacy or deployment reasons.

TURN needs accessible relay servers, an authentication design and capacity.
Short-lived credentials are a useful application policy, not a requirement
that every TURN credential has that lifetime. Protect credentials, monitor allocation and bandwidth, and plan for relay
egress costs. Candidate addresses and connectivity metadata can reveal
network information; consider privacy policy, access controls and retention.
Browser address-obfuscation behavior is implementation-dependent, not a
substitute for a privacy design.

If a laptop moves from Wi-Fi to cellular, its old path may break.
An application can arrange an ICE restart and exchange new negotiation
information and candidates; this may select a different pair if one works.
It is not guaranteed instantaneous or successful. Expired signaling or TURN
credentials may require reauthentication or refreshed configuration.
The app must report progress and failures, and decide how room membership
and ongoing activity are recovered.

<details class="learning-answer">
<summary>Predict: the STUN server is unreachable; must this call use TURN?</summary>
<p>No. A host pair or another available candidate may work; a configured reachable relay is another possibility, and all paths can fail.</p>
</details>

<a id="webrtc-media"></a>
## 4. What makes media timely?

Once a usable transport is established, WebRTC media commonly uses RTP
for media packets and RTCP for feedback, carried with DTLS-SRTP protection.
DTLS establishes keys used by SRTP to protect media; it is not a claim
that RTP media itself is application data sent inside a DTLS record.
Negotiated codecs turn captured audio/video into encoded frames and back.
The peers must support compatible codec and format parameters.

Packets do not arrive evenly. A jitter buffer holds some media to smooth
variable arrival times. A larger buffer can conceal more variation but adds
playout delay; it cannot repair every loss. Late packets may be discarded.
RTCP feedback and implementation-dependent recovery mechanisms can help
with packet loss, but waiting for a retransmission also consumes time.
Congestion control adapts sending rate; a video encoder can change bitrate,
resolution or frame rate when bandwidth falls. Audio may be prioritized.
These are trade-offs, not a guarantee of clear speech on a broken network.

For comparison, a WebRTC **data channel** uses SCTP over DTLS.
Its default configuration is ordered and reliable; applications can choose
unordered delivery or limited retransmissions or lifetime where appropriate.
Such choices can suit ephemeral state, while important messages still need
application-level semantics and recovery. A data channel is not a durable
message history. Avoid slogans like “UDP is always fast” or “TCP is always
slow”: network conditions, congestion, ordering and the chosen path matter.

Screen sharing is a media source, not a special permission to disclose
everything on a device. A browser normally asks the user to select what to
share; available surfaces and prompts vary. The teacher should share only
the intended window, hide sensitive tabs and notifications, stop sharing
when finished, and coordinate before learners share their own screens.
Consent to join a room does not imply consent to record or redistribute it.

<details class="learning-answer">
<summary>Predict: should the receiver wait indefinitely for every missing speech packet?</summary>
<p>No. A late packet may no longer be useful; buffering and recovery balance continuity against conversational delay.</p>
</details>

<details class="learning-answer">
<summary>Predict: is a newly created data channel necessarily unreliable and unordered?</summary>
<p>No. Its defaults are reliable and ordered; partial reliability and ordering are configurable choices.</p>
</details>

<a id="webrtc-group"></a>
## 5. More classmates: count the streams

Now imagine a group, not just teacher-1 and learner-7. The following
arithmetic is a deliberately simplified capacity model, not an actual
classroom deployment or measurement. Let `N` participants each send one
distinct stream to every other participant at `r` Mbps per stream.
Assume all participants publish and receive, identical rates, no protocol
overhead, no simulcast or layered encoding, and no suppressed subscriptions.

In a full **mesh**, each participant uploads `N - 1` streams, so its
upload is `(N - 1) × r` Mbps. Across all participants, outgoing upload is
`N × (N - 1) × r` Mbps. Each device also receives `N - 1` streams.
For `N = 4` and `r = 1 Mbps`, each uploads 3 Mbps and the combined
outgoing upload is 12 Mbps. Each connection uses device and network
resources; in practice encode sharing and rates vary.

A **selective forwarding unit** (SFU) receives a participant's stream and
forwards selected streams to other participants. Under the same simplified
all-to-all assumptions, each participant uploads one `r` Mbps stream to the
SFU and the SFU egress is `N × (N - 1) × r` Mbps.
At `N = 4`, `r = 1 Mbps`, each uploads 1 Mbps and server egress is
12 Mbps. The SFU also ingests 4 Mbps. Server egress is real infrastructure
cost, not bandwidth magic, and each receiver still downloads three streams.

Real SFUs may forward only subscribed speakers, use simulcast or scalable
layers, and select different resolutions per recipient. Subscription policy,
codecs, adaptation, retransmissions and overhead change actual costs.
An SFU generally forwards encoded media without mixing every stream, but
implementation-specific processing can occur. It must be provisioned,
monitored and secured.

An **MCU**, multipoint control unit, decodes and mixes media, then encodes
a composite for each recipient. One mixed stream per recipient can reduce
recipient delivery load; the server pays CPU and latency for mixing and
encoding, and may need to see media plaintext. Personalized layouts and
codec choices change its costs. Neither SFU nor MCU is universally best.

<details class="learning-answer">
<summary>Predict: with four equal 1 Mbps publishers in the stated all-to-all SFU model, is server egress 4 Mbps?</summary>
<p>No. Each of four streams is forwarded to three others, so egress is 12 Mbps before overhead.</p>
</details>

<a id="webrtc-failure"></a>
## 6. Failure timelines: diagnose the layer

### A. STUN is unreachable

1. Learner's client cannot reach one configured STUN server.
2. Host candidates, other STUN servers or a reachable configured relay may
   still supply a pair. ICE checks whatever candidates are available.
3. If none works, surface connection failure; do not claim a relay was used.
4. Inspect candidate gathering, signaling delivery and check results without
   logging sensitive addresses or credentials unnecessarily.

### B. “Connected” but no audio

1. The ICE or peer-connection state reports connected, yet learner hears
   nothing. This proves neither a live track nor audible playback.
2. Check microphone permission, selected device, mute state and track
   enabled/ended status at the sender; verify compatible negotiated codecs.
3. Check packets sent and received, inbound track, playback element and
   output device, volume and browser playback restrictions at the receiver.
4. Use WebRTC statistics appropriate to the browser to distinguish no
   packets, loss, decode problems and local playback. Restore a device or
   renegotiate only as appropriate; “connected” alone is not success.

### C. Relay capacity is exhausted

1. A TURN allocation fails or an admitted relay path becomes overloaded.
2. Enforce admission limits, show a clear failure or degraded state, and
   protect existing sessions. Do not silently downgrade privacy or quality
   to an unapproved path.
3. Operators examine relay allocation failures, bandwidth and regional
   capacity; scale or route according to explicit policy and availability.
   Other candidates might work if policy permits, but none is guaranteed.

### D. Jitter rises, then the network changes

1. Uneven arrivals increase jitter; a buffer may smooth playout but adds
   delay. Loss recovery can help only within a useful time budget.
2. Congestion adaptation can reduce video bitrate, resolution or frame
   rate; a user may turn video off to preserve speech. The teacher should
   communicate the degradation instead of assuming everyone heard.
3. A Wi-Fi-to-cellular transition breaks the selected path. Reauthenticate
   or refresh expired credentials if needed, signal an ICE restart, and
   test newly gathered pairs. A valid route may not exist.
4. Rejoining a room does not automatically restore missed chat, screen-share
   state or a durable conversation. The application needs explicit replay,
   state synchronization, permission checks and a bounded recovery policy.
   No instant recovery or seamless media continuity is guaranteed.

<details class="learning-answer">
<summary>Predict: if signaling reconnects after a network change, are missed chat and media automatically restored?</summary>
<p>No. The application must recover room and message state and may need a new ICE negotiation; success is not guaranteed.</p>
</details>

<a id="webrtc-security"></a>
## 7. Permission, trust and encryption boundaries

Use secure contexts for browser camera and microphone access and request
the appropriate user consent through browser APIs in a real application.
Authorization is separate: validate who can enter the room, publish media,
share a screen, subscribe or moderate; recheck when credentials expire.
Protect signaling and verify its relationship to the intended participants.
Do not expose TURN secrets in a public static page.

DTLS-SRTP protects media on each WebRTC transport hop. This does **not**
automatically mean end-to-end encryption through an SFU or MCU. A media
server can terminate transport security; an MCU normally needs plaintext to
mix. Additional application-level E2E encryption can protect media from an
SFU when properly designed, but requires key management and compatible
clients, and can restrict server-side recording, inspection or processing.
It is not equivalent to transport encryption or a blanket guarantee.
Treat recording, participant identities, consent, IP metadata and retention
as explicit product and security decisions.

<details class="learning-answer">
<summary>Predict: does DTLS-SRTP alone guarantee an SFU cannot access media plaintext?</summary>
<p>No. Transport encryption protects each hop; separate end-to-end protection and its key management are needed for that stronger property.</p>
</details>

<a id="webrtc-practice"></a>
## 8. Choose for the changed requirement

| Requirement | First reasonable choice | Why |
| --- | --- | --- |
| Interactive browser audio/video classroom | Consider WebRTC | Timely two-way media and connectivity tools fit the need |
| Recorded lesson watched on demand | HTTP video and CDN | Cacheable playback and distribution; no interactive call required |
| Server-to-client course progress | SSE | One-way updates fit; reconnection and replay still need design |
| Classroom text chat | WebSocket | Bidirectional messages fit; delivery history remains an app concern |
| Offline completion alert | Push notification | Best-effort hint or alert; wakeup and delivery are not guaranteed |

These are requirement-based starting points, not mutually exclusive
protocols. WebRTC also has data channels and non-browser implementations.
HTTP streaming can serve live broadcasts too; not every video need warrants
WebRTC. A product can use HTTPS for normal API requests, WSS for chat and
signaling, and WebRTC for interactive media together.

<details class="learning-answer">
<summary>Predict: the live classroom becomes a recorded lesson watched tomorrow; what should you choose first?</summary>
<p>Consider HTTP video delivery through a CDN: caching and on-demand playback fit better than setting up an interactive WebRTC call.</p>
</details>

<details class="learning-answer">
<summary>Predict: a small library wants a remote helper to see and talk to a visitor in real time; transfer the reasoning.</summary>
<p>Consider WebRTC for interactive audio and video, plus authenticated signaling, consent and connectivity infrastructure; verify the library's privacy and operational constraints.</p>
</details>

**Manual recall:** Without looking, explain which messages use signaling,
which candidate types ICE checks, and why a selected pair does not prove
the microphone works. Then calculate mesh upload and SFU egress for three
publishers at 2 Mbps under the same all-to-all assumptions: each mesh
upload is 4 Mbps, total mesh upload is 12 Mbps, and SFU egress is 12 Mbps.
These calculations do not simulate a real call.

<a id="webrtc-corrections"></a>
## 9. Original reference: qualifications and sources

The [original Part 5](../04-REALTIME-COMMUNICATION.md) remains available.
Its company examples—WhatsApp, Google Meet, Microsoft Teams, Discord, Zoom
and Slack—are illustrative of the problem space, not verified claims about
their present private stacks or specific routing. This lesson makes no such
claim. Exact source lines below refer to that original file:

| Original source and quotation | Qualification in this lesson |
| --- | --- |
| Lines 2523–2524: “Much cheaper.” / “Much faster.” | A direct path can reduce relay use, but cost and latency depend on network and architecture. |
| Line 2903: “Works almost always.” | TURN can fail due to reachability, policy, credentials or capacity. |
| Lines 2931–2933: “Try STUN first.” / “Use TURN if necessary.” | ICE gathers and checks available pairs; this is not a guaranteed fixed sequential algorithm. |
| Line 3004: “STUN attempts connection.” | STUN helps discover a mapping; ICE performs connectivity checks. |
| Line 3203: “Does NOT decode video.” | An SFU commonly forwards encoded media, but actual processing is implementation-dependent. |
| Lines 3259–3264: “STUN fails” / “Use TURN.” | Other candidates can succeed, and relay is neither automatic nor guaranteed. |
| Lines 3312–3315: WebSocket marked “❌” for audio, video and screen share | It can transport bytes, but does not itself supply WebRTC's integrated media stack. |

Further reading: [RFC 8445: ICE](https://www.rfc-editor.org/rfc/rfc8445),
[RFC 8656: TURN](https://www.rfc-editor.org/rfc/rfc8656),
[RFC 8825: WebRTC overview](https://www.rfc-editor.org/rfc/rfc8825),
[RFC 8827: WebRTC security architecture](https://www.rfc-editor.org/rfc/rfc8827),
[RFC 8831: data channels](https://www.rfc-editor.org/rfc/rfc8831), and
[MDN: WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API).
