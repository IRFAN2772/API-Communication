# Push notification delivery: a hint, not a receipt

The shared Course API learner is `learner-7`; `course-101` is **API
Fundamentals**. In the independent preview timeline, the learner sees 20%
and then 40% progress. Neither preview update allocates seats, and 40% is
**not completion**. Later, an independent completion action produces
`completion-42`, type `course.completed`. The examples use the
[canonical fixture](../../assets/realtime-lesson-fixtures.mjs).

Read [webhooks and background jobs](WEBHOOKS-AND-BACKGROUND-JOBS.md),
[realtime recovery and flow](REALTIME-RECOVERY-AND-FLOW.md),
[WebRTC media and connectivity](WEBRTC-MEDIA-AND-CONNECTIVITY.md),
the [guided realtime lesson](../04-GUIDED-REALTIME.md),
[original realtime chapter](../04-REALTIME-COMMUNICATION.md),
[async APIs](../05-ASYNC-APIS.md), [content map](../COURSE-CONTENT-MAP.md)
and [corrections](../CONTENT-CORRECTIONS.md).

## 1. Problem: an active socket is not an inactive app

When the app is active and connected, a WebSocket can carry live updates in
both directions. SSE is another option for one-way updates to an active
client. Either connection can fail, and reconnection needs recovery. When
the app is suspended, backgrounded or not running, it cannot be assumed to
maintain that application socket. Push services offer another path for a
small hint or user-visible alert, but do not guarantee a wakeup.

An operating system and its platform push infrastructure manage shared
connections and delivery behavior; the Course website does not host a full
device push backend. FCM (Firebase Cloud Messaging), APNs (Apple Push
Notification service), and a browser's Web Push service are distinct
platform services with distinct registration, request and delivery rules.
FCM may route Apple-targeted messages through APNs when configured; it does
not make the platform contracts identical.

Text diagram, read left to right:

```text
completion -> durable inbox -> notification sender -> platform push service
                                                       -> device/browser
                                                       -> authenticated fetch
```

The durable inbox is authoritative for the learner; push is a hint that new
information may be available. The final fetch may happen on app launch or
user tap even if no push arrives.

<details class="learning-answer">
<summary>Predict: if an app is suspended, does the site's WebSocket necessarily remain connected?</summary>
<p>No. Lifecycle and network conditions can close or suspend it. A push hint
is a different, best-effort path, and recovery must not depend on either.</p>
</details>

## 2. Worked exchange: an event becomes a minimal hint

First the Course service commits the completion and a durable, authorized
inbox entry. This is the exact fixture event, intended only for an authorized
server-side integration:

```json
{"id":"completion-42","type":"course.completed","data":{"courseId":"course-101","learnerId":"learner-7"}}
```

The notification sender finds eligible installations for `learner-7` under
the learner's current preferences and produces this exact fixture hint:

```json
{"type":"course.completed","courseId":"course-101","eventId":"completion-42"}
```

This tiny application-level JSON is **not** a drop-in FCM, APNs or Web Push
protocol request. It has no learner ID, email, certificate, authorization
token or private course content. Even an event type and course identifier
can reveal information: classify them for the actual threat model. Where
that is sensitive, use an opaque identifier instead and fetch details only
after authentication. A generic lock-screen message such as “Open the app
for an update” avoids revealing course content to nearby people.

Suppose the sender submits a platform-specific request and receives a
provider message ID. That ID means the provider accepted the request under
its contract. It does **not** prove device delivery, display, app execution,
user reading, or business acknowledgement. The device may receive a hint
later, fetch the durable inbox using its existing authenticated session, and
display current state. The API authorizes the learner and resource at fetch
time; an event ID is a locator, not a bearer credential.

<details class="learning-answer">
<summary>Predict: does a provider message ID prove the learner saw the completion?</summary>
<p>No. It identifies an accepted provider request, not device delivery,
display, user reading, or business acknowledgement.</p>
</details>

## 3. FCM and APNs: different envelopes around the hint

These are illustrative shapes, not live calls or credentials. Actual requests
need provider authentication, valid registration, project/topic configuration,
payload limits and platform-specific headers. Test against current provider
documentation; no SDK or cloud account is required to study this lesson.

An FCM HTTP v1 request uses a `message` envelope; data values are strings.
The token below is a placeholder for one registered installation:

```json
{
  "message": {
    "token": "INSTALLATION_TOKEN_PLACEHOLDER",
    "data": {
      "type": "course.completed",
      "courseId": "course-101",
      "eventId": "completion-42"
    }
  }
}
```

An APNs request targets a device token in its HTTP/2 path. Its payload uses
an `aps` dictionary, plus optional application keys. This example asks for a
background update; it needs the appropriate `apns-push-type: background`,
priority and topic headers, entitlements and server credentials:

```json
{
  "aps": {"content-available": 1},
  "type": "course.completed",
  "courseId": "course-101",
  "eventId": "completion-42"
}
```

Those envelopes illustrate different protocols, not equivalent delivery
promises. On FCM, a notification payload can be displayed by the system
under certain app states; data messages are handled differently and are
subject to platform policy. APNs visible alerts require appropriate `aps`
alert contents and configuration. Exact foreground handling, background
execution and display depend on platform version, permissions, app state and
provider policy. Do not assume a data payload is silently handled on every
device, or that a visible alert causes your code to run immediately.

Silent/background pushes are best-effort. The OS may throttle, coalesce,
defer or decline to run the application, and force-quit behavior differs by
platform. They are not a reliable background scheduler. Handle missed hints
by fetching the inbox at the next authorized opportunity.

<details class="learning-answer">
<summary>Predict: can the same raw fixture JSON be POSTed unchanged as a complete FCM or APNs request?</summary>
<p>No. Each service needs its own envelope, addressing, authentication and
configuration; the fixture is only the shared application hint.</p>
</details>

## 4. Web Push: permission, subscription and worker

Web Push is a separate browser ecosystem, not an ordinary WebSocket to a
site-controlled notification server. In a supported secure context, the user
may grant notification permission. The site registers a service worker and
obtains a push subscription containing an endpoint and encryption key
material. The subscription identifies a browser installation/profile, not
the user. The browser chooses the push service behind the endpoint.

The site sends that subscription to its backend over an authenticated
connection, with CSRF and origin protections appropriate to its session.
The backend sends an encrypted message to the subscription's push service,
using the applicable Web Push protocol and application-server identity
(commonly VAPID). The VAPID **public** key can be distributed to clients;
the signing private key stays on the server. These are configuration
concepts, not browser calls to execute in this static lesson.

When the service worker receives an eligible push event, browser rules govern
what it may do and whether it must show a notification. Permission can be
denied or revoked; subscriptions expire or change. A notification click can
open the app, which then authenticates and fetches the inbox. Support and
background constraints vary by browser, operating system and installed-app
state. The browser or OS may suppress or delay delivery. Do not promise
silent arbitrary code execution, or assume all browsers share one provider.
Treat subscription endpoints and keys as sensitive routing metadata, and
validate outbound destinations under a safe push-service policy.

<details class="learning-answer">
<summary>Predict: where does the VAPID private key belong?</summary>
<p>On the application server, protected as a secret. The browser receives
only the public application-server key and its own subscription material.</p>
</details>

## 5. Failure: every hop has different evidence

Consider this possible timeline, not a universal provider guarantee:

1. `completion-42` and the learner's inbox item commit.
2. The sender attempts one registered installation and the provider accepts.
3. The phone is offline longer than the message's configured expiry.
4. The provider discards the expired hint; no display occurs.
5. The learner later opens the app and fetches the durable inbox.

Offline storage, time-to-live, collapse keys and maximum retention differ by
provider and configuration. Collapse may replace multiple pending hints with
one newer hint; it is useful for “refresh current state,” but unsuitable as
the only record of distinct business events. An expiration of zero or a
short TTL can prefer timely hints over stale delivery; it also means missed
notifications. Choose expiry according to usefulness and privacy.

Permission denial, notification settings, battery optimization, background
quotas, throttling, force-quit, network failure and provider outages can
prevent a wakeup, delivery or display. A visible notification may be hidden
by lock-screen settings or focus modes. A silent notification might never
run the app. A successful authenticated fetch establishes only that the app
retrieved data, unless an explicit read or business acknowledgement is
separately recorded. Each stage needs its own observable metric.

If the user must acknowledge a compliance task, model that action in the
authorized application and persist it. Do not interpret push acceptance,
display or a fetch as that action. If push is disabled, show pending items
when the user next opens the app and consider another consented channel.

<details class="learning-answer">
<summary>Predict: a silent push is accepted while the phone is offline beyond its TTL. What happens?</summary>
<p>It may expire without a wakeup or delivery. The persisted inbox remains
available when the user next opens the app and authenticates.</p>
</details>

## 6. Tokens, ownership and rotation

An FCM registration token, APNs device token, or Web Push subscription is
an address for an installation or browser subscription in a particular
application context. It is not proof of identity and is not one permanent
token per human. One learner can have several installations; an installation
can change owners after logout or shared-device use.

Register or update the address only through an authenticated endpoint that
binds it to the verified current account and app context. Validate inputs,
protect registration against abuse, and store the minimum needed. On logout,
account removal, permission revocation or a user preference change, revoke
or disassociate the relevant registration according to policy. Prevent a
previous user's notifications reaching a newly signed-in user on a shared
device. App reinstall, token refresh, subscription change and provider
rotation must update the mapping; do not assume stale addresses persist.

Interpret invalid-token and expired-subscription responses according to the
specific provider's documentation and error details. Disable confirmed
invalid registrations; distinguish permanent address errors from transient
outages or credential misconfiguration. Do not delete every token on a generic
server error. Re-register when the client obtains a replacement.
Avoid logging raw tokens, endpoints or private payloads.

## 7. Fanout, retries and receipts

For each eligible installation, create a delivery intent scoped by event ID,
installation and channel, with a unique constraint. A transaction can
atomically claim a pending intent, and a lease permits recovery after worker
failure. A simple low-volume service can send directly after persisting its
intent; a queue is useful for bursts, durable retries and rate control, but
is not mandatory for all push systems. A queue does not guarantee delivery.

Bound concurrency and provider request rates; use retry budgets, backoff
with jitter and provider guidance for transient failures. Respect expiration
and user preference changes before each attempt. A permanent invalid token
should be retired instead of retried forever. Store failure and provide
reconciliation against inbox items. Provider throttling and queue capacity
must inform admission and alerting. If notification work arrives faster than
it can be sent indefinitely, the backlog grows; workers and storage cannot
absorb an infinite burst.

A unique delivery intent prevents creating duplicate local work, not
necessarily duplicate provider effects. If the sender crashes after provider
acceptance but before recording the response, a retry can send another push
unless the provider's actual API offers a usable idempotency guarantee.
Design client refresh and inbox state to tolerate duplicate hints. Separate
provider-accepted receipts, device telemetry if available, displayed/read
signals and explicit business acknowledgements. Do not fabricate missing
device receipts.

For illustration only, 6,000 installations at 100 sends per second need at
least 60 seconds of sending, ignoring latency, limits, retries and parallelism.
Actual throughput, provider quotas and charges depend on configuration and
region; no free production delivery or cost figure is promised.

<details class="learning-answer">
<summary>Predict: a sender crashes just after the provider accepts a push. Can a retry duplicate the hint?</summary>
<p>Yes. The local receipt may be missing. Unique local intents do not alone
make the remote send atomic; tolerate duplicates and use supported provider
idempotency if it exists.</p>
</details>

## 8. Privacy and the authoritative fetch

Lock screens, notification history, shared devices and provider systems can
expose notification contents. Keep hints minimal, minimize retention and
apply user preferences. Even a generic hint can reveal activity. Never put
session cookies, API keys, access tokens, private messages, learner identity
or a certificate in the push payload. A mobile client or service worker
cannot safely hold the server's provider credentials.

On tap, foreground activation, or a successful background opportunity, the
app calls the Course API with its normal authenticated session. The server
authorizes `learner-7` for the inbox item and returns current data; the client
must not trust a push hint as proof of completion or authorization. If a
session has expired, require reauthentication. The inbox should survive
offline periods according to its retention policy and offer pagination and
read state if those are product requirements.

Push hints can arrive late, twice, out of order or not at all. Fetching
current state makes them safe as cache-invalidation signals. It does not
eliminate the need for durable domain events, per-item authorization, or
business acknowledgement where required. The fixture's `eventId` connects
the hint to the event; it is not a secret and must not grant access.

## 9. Choose the channel and check your reasoning

Use an active WebSocket when an interactive client needs bidirectional live
communication and can reconnect and recover. Use SSE for suitable one-way
active updates. Use push when an inactive device may benefit from a hint or
visible alert and the product accepts best-effort delivery. Do not use push
as the only copy of critical data, as proof of a user's action, or as a
guaranteed scheduler. Use an inbox and authenticated fetch for recovery.
Webhooks notify servers, not devices; they can complement push.

<details class="learning-answer">
<summary>Exercise: learner-7 has two devices and one invalid token. How should fanout proceed?</summary>
<p>Attempt eligible installations independently with bounded work. Retire
the confirmed invalid registration using provider-specific guidance; keep
the other eligible device and the durable inbox.</p>
</details>

<details class="learning-answer">
<summary>Exercise: a lock screen must not reveal the completed course. What should the alert say?</summary>
<p>Use a generic alert such as “Open the app for an update,” and require an
authenticated, authorized fetch for the details. Assess even metadata leakage.</p>
</details>

<details class="learning-answer">
<summary>Exercise: 40% preview arrives, followed later by completion-42. Is 40% itself completion?</summary>
<p>No. They are independent events in this lesson; the completion action
has its own authoritative event and must not be inferred from preview progress.</p>
</details>

<details class="learning-answer">
<summary>Exercise: should a low-volume service always introduce a message queue for push?</summary>
<p>No. A durable intent and bounded direct sender may suffice. A queue adds
value for burst buffering and controlled retries, but adds operations and
does not guarantee provider or device delivery.</p>
</details>

Primary references: [FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type),
[FCM message lifespan](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan),
[APNs background notifications](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app),
[APNs request format](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns),
[Web Push protocol](https://www.rfc-editor.org/rfc/rfc8030),
[VAPID](https://www.rfc-editor.org/rfc/rfc8292), and
[Push API specification](https://www.w3.org/TR/push-api/).
This static course is free to study. Real delivery services, infrastructure,
network usage and WebRTC TURN can incur costs; no production-free promise
follows from a free learning platform.
