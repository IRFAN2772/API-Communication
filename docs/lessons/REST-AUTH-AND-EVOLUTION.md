# REST lesson: identity, permission, and safe evolution

The fictional learning platform offers `course-101`, **API Fundamentals**,
with 30 available seats. `learner-7` wants to enroll; an administrator edits
the course. These examples teach design and reasoning, not a deployable
security implementation or an identity-provider configuration. Identifiers
and placeholder values are fictional; no real credentials appear here.

Start with [HTTP contracts](REST-HTTP-CONTRACTS.md) and
[collections and caching](REST-COLLECTIONS-AND-CACHING.md) when needed.
Return to the [guided REST journey](../01-GUIDED-REST.md),
[original REST reference](../01-REST-APIS.md),
[Phase 0](../00-GUIDED-FUNDAMENTALS.md),
[content map](../COURSE-CONTENT-MAP.md), or
[corrections ledger](../CONTENT-CORRECTIONS.md).
For recovery from a lost reply, continue to
[reliability and operations](REST-RELIABILITY-AND-OPERATIONS.md).

## 1. Identity is not permission

**Authentication** establishes an identity or principal from evidence.
**Authorization** decides whether that principal may perform this action
on this object under current policy. A valid credential does not authorize
every action; an ID supplied by the caller is not proof of identity.
Roles help express policy but are not enough if ownership, membership,
resource state, tenant, or the specific action also matters.

Our illustrative policy is intentionally explicit:

| Principal | Object and action | Decision |
| --- | --- | --- |
| Anonymous | Read public course-101 | Allow |
| Authenticated learner-7 | Create own enrollment in course-101, if eligible and a seat remains | Allow |
| Authenticated learner-7 | Create an enrollment for another learner | Deny |
| Authenticated learner-7 | Edit course-101 title or seats | Deny |
| Authorized course administrator | Edit course-101 title or seats | Allow, subject to validation |
| Authenticated user without the administrator grant | Edit course-101 | Deny |

This is a fictional policy, not a universal role model. For enrollment the
server derives `learner-7` from verified authentication; it does not trust a
JSON `learnerId` as authority. It checks the course, action, eligibility,
tenant and available seats. Those checks must also be enforced at the write
boundary so that concurrent requests cannot both take the last seat.

Under the body-free contract from Phase 0:

This header excerpt omits the authentication credential so we can focus on
the enrollment target and retry key. A real request must carry verifiable
caller context; the idempotency key does not authenticate learner-7.

```http
POST /courses/course-101/enrollments HTTP/1.1
Host: learn.example
Idempotency-Key: enroll-7-a
Content-Length: 0

```

In an independent snapshot, successful authorization and a single atomic
commit create `enrollment-42` and change available seats from 30 to 29.
The same learner cannot turn this permission into a course edit by changing
the request method. An administrator may edit, but must still satisfy the
course schema and any concurrency precondition.

<details class="learning-answer">
<summary>Predict: learner-7 has a valid token. Can they edit the course?</summary>
<p>No. Authentication establishes the principal; this policy grants the edit action to an authorized administrator, not every authenticated learner. Check the target object and action as well as the principal.</p>
</details>

## 2. Respond without confusing identity and access

When authentication is required and credentials are missing or invalid,
`401 Unauthorized` indicates the request lacks valid authentication
credentials. A server generating 401 must send an applicable
`WWW-Authenticate` challenge, for example `Bearer`; the status name does
not mean that a recognized principal merely lacks permission.
`403 Forbidden` is appropriate when the server understood the request but
refuses it, such as a verified learner attempting an admin edit.

When revealing that a private object exists would itself leak information,
the server may choose `404 Not Found` to conceal it. Apply a consistent
policy to response bodies, timing, logs, and related endpoints; a 404 alone
does not guarantee concealment. `404` can also mean genuinely absent.
Avoid returning passwords, raw tokens, or unnecessary policy details.

<details class="learning-answer">
<summary>Predict: is 403 the right automatic response for a missing token?</summary>
<p>No. For a protected resource requiring authentication, a missing or invalid credential normally leads to 401 with an applicable challenge. A verified learner denied an administrator action may receive 403, or a deliberate concealment policy may use 404.</p>
</details>

## 3. Basic authentication and its transport boundary

Basic authentication sends a Base64 encoding of a username and password in
an `Authorization` header. Base64 is reversible encoding, **not encryption**.
Never put an actual password in course material or logs. Conceptually:

```text
Authorization: Basic <base64-of-username-colon-password>
```

The server decodes the value and verifies the credential. The credential
travels on each applicable request; if copied, it can be replayed until
revoked or changed. Basic has no intrinsic token expiry or delegated scope;
server-side policies can still constrain the account.
HTTPS/TLS protects the connection in transit, including the header, when
correctly configured and verified. TLS termination is a boundary: a proxy
that terminates TLS can see the header, and the next hop must also be
appropriately protected. TLS does not protect a credential after an
authorized endpoint logs or exposes it.

Basic can fit a tightly controlled integration with TLS and limited
credentials. A short-lived scoped token or another mechanism may better
support delegation and rotation. Neither a private network nor Base64 alone
provides a substitute for transport protection.

<details class="learning-answer">
<summary>Predict: does Base64 keep a Basic password secret from a network observer?</summary>
<p>No. Anyone with the encoded value can decode it. Correctly configured TLS protects the connection; it does not make the encoding encryption or protect credentials exposed at an endpoint.</p>
</details>

## 4. Browser sessions: lifecycle and CSRF

One browser design verifies a login, creates a high-entropy opaque session
identifier, and stores the principal and expiry in a server-side session
store. It sends a session cookie using `Set-Cookie`; the browser sends
matching cookies on subsequent requests subject to their attributes and
browser policy. The server looks up the session, checks expiry and
authorization, and returns a response. Rotate the session identifier on
authentication or privilege change to reduce fixation risk. Logout
invalidates the server session and expires the browser cookie; sessions also
need idle and absolute expiration policies.

For example, the following is syntax with a placeholder, not a usable
session:

```http
Set-Cookie: session=<opaque-placeholder>; Secure; HttpOnly; SameSite=Lax; Path=/
```

`Secure` restricts transmission to secure channels; `HttpOnly` prevents
ordinary JavaScript from reading the cookie, but does not stop injected
script from issuing authenticated requests. `SameSite` limits some
cross-site cookie sending; `Lax`, `Strict`, and `None` have different
navigation and integration implications. `None` requires `Secure` in modern
browsers. Choose narrow domain and path scope and an appropriate expiry.

The changed condition is a malicious site causing a victim's browser to
send a state-changing request with ambient cookies. This is cross-site
request forgery (CSRF). Protect unsafe operations using an appropriate CSRF
token and/or validated Origin with a considered fallback, and use SameSite
as defense in depth. Check authorization and avoid state-changing GETs.
CORS is not a general CSRF defense. Cookies are not inherently bad: they
can be a practical session mechanism when their tradeoffs and controls fit.

<details class="learning-answer">
<summary>Predict: does HttpOnly alone prevent CSRF or all XSS harm?</summary>
<p>No. HttpOnly limits script access to the cookie value. An injected script can still act as the user, and a cross-site request can carry an eligible cookie. Use suitable CSRF defenses, XSS prevention, and authorization.</p>
</details>

## 5. Access tokens and signed JWTs

A bearer token is a credential: anyone possessing it can generally present
it. An API can receive it in the `Authorization` header using the `Bearer`
authentication scheme, over TLS.
An access token can be opaque or a JWT; OAuth does not require JWTs.
A signed JWT has claims in a payload and a signature for integrity and
issuer authentication. A signature is **not encryption**, and the payload
is readily readable. Do not put secrets or unnecessary personal data in it.
JWTs can be encrypted separately, but signing alone does not do that.

Before relying on a JWT access token, the resource server validates its
signature using trusted keys and an allowed algorithm, expected issuer,
intended audience, expiration and other applicable time constraints.
It validates token type and follows the issuer's access-token profile.
It then enforces scopes and current resource/action policy. A correctly
signed token for another audience, an expired token, or a token with a
required scope missing does not authorize the edit. Avoid accepting an ID
token as an API access token merely because it is a JWT.

Local validation can reduce a network dependency but makes immediate
revocation harder: a signed token may remain usable until expiry unless
the architecture adds a revocation/introspection mechanism or other checks.
Key rotation, clock skew and policy changes need explicit handling.

Where to keep a browser token is a threat-model decision. JavaScript-readable
localStorage exposes it to successful XSS; an HttpOnly cookie reduces direct
reading but introduces ambient-credential CSRF concerns. In-memory storage
reduces persistence but does not defeat active XSS and may require renewed
authorization after reload. A backend-for-frontend with a session cookie is
another choice, with its own CSRF and server-state costs. There is no one
universal best storage choice; prevent XSS, protect tokens and design for
the actual client and trust boundaries.

<details class="learning-answer">
<summary>Predict: a JWT has a valid signature and a readable admin claim. Is an edit automatically allowed?</summary>
<p>No. The API must validate issuer, audience, expiration, signature and applicable token profile, then evaluate the required scope and current object/action authorization. Signing also does not hide the payload.</p>
</details>

## 6. OAuth delegation and OIDC login

OAuth 2.0 is a framework for **delegated authorization**: a client obtains
an access token to call a resource server within a grant's constraints.
It is not by itself a standard login protocol. OpenID Connect (OIDC) adds
an identity layer: a client can authenticate a user using an ID token
issued for that client, after validating it according to OIDC rules.
The access token is for the API; the ID token is for the client and is not
automatically an API authorization credential.

Conceptually, a public browser or mobile client uses authorization code
with PKCE:

1. The client creates a fresh PKCE verifier and derived challenge, and
   begins authorization with the configured, trusted issuer. It uses
   request correlation and CSRF protections such as an appropriate state.
2. The authorization server authenticates the user, applies consent and
   policy, and redirects the client with an authorization code.
3. The client exchanges that code with the verifier at the token endpoint.
   The verifier binds the exchange to the initiating client instance.
4. The client obtains an access token for the Course API; with OIDC it
   also validates the ID token, including issuer, audience, expiry and
   applicable nonce. The API independently validates the access token.

Use the issuer's current, trusted discovery metadata and keys rather than
assuming every environment has the same hardcoded issuer or endpoints.
Discovery itself needs issuer validation and a trust policy; blindly
discovering an attacker-supplied issuer is unsafe. PKCE does not replace
redirect URI validation, TLS, state/nonce handling, or all other controls.
Follow current provider and security guidance; this overview is not a
complete identity-provider implementation.

Access tokens expire. Refresh tokens, if issued, need appropriate protection,
rotation/replay handling and revocation according to the provider contract.
Application logout ends its local session; it does not necessarily log out
the identity provider or instantly revoke an already issued access token.
Provider logout and revocation are separate, explicitly designed operations.

<details class="learning-answer">
<summary>Predict: does local logout necessarily invalidate every access token immediately?</summary>
<p>No. Local logout can end the application session while an issued access token remains valid until expiry or an effective revocation mechanism applies. Identity-provider logout and token revocation have their own contracts.</p>
</details>

## 7. Stateless requests are not a ban on databases

REST's stateless constraint means each request contains the context needed
to understand it rather than relying on conversational client state stored
on the server between requests. Credentials and resource identifiers can
be supplied per request. Resource state in a database, authorization policy,
and server-side storage are not forbidden. A conventional server-side
session that depends on stored client conversational context is a useful
web design but trades away strict REST statelessness for that interaction.
Do not claim REST prohibits sessions anywhere in a system.

A bearer token can carry per-request context, but its presence alone does not
prove the whole API meets every REST constraint or eliminates all state.
Choose the interaction according to client needs and security requirements.

<details class="learning-answer">
<summary>Predict: can a stateless REST interaction read a database?</summary>
<p>Yes. The constraint concerns conversational client context between requests, not whether the server stores resource data. The request must still contain the context needed for processing.</p>
</details>

## 8. Compatibility is more than a version number

An API contract includes paths, fields, types, status codes, defaults and
behavior. **Source compatibility** asks whether client source still builds
against an updated library; **wire compatibility** asks whether exchanged
messages can be parsed and interpreted; **semantic compatibility** asks
whether behavior still means what the client expects. A parseable message
can still have a different meaning. A default changing from 30 available
seats to 30 total capacity, for example, silently breaks the UI even if
the field is still an integer.

Consider this old client: it reads the title, available seats, and a
`status` enum with only `open` and `closed`. It ignores unknown object
members but rejects unknown enum values. Its expected response is:

```json
{"id":"course-101","title":"API Fundamentals","seats":30,"status":"open"}
```

An additive optional field can work for this particular tolerant parser:

```json
{"id":"course-101","title":"API Fundamentals","seats":30,"status":"open","description":"An introduction"}
```

But adding a new enum value to an existing field can fail the same client:

```json
{"id":"course-101","title":"API Fundamentals","seats":30,"status":"waitlist"}
```

The old client rejects `waitlist` even though the JSON is valid and no
field was removed. A strict parser can also reject the extra
`description`. An optional field can therefore be compatible for one
consumer and incompatible for another; test actual behavior.

Absent, null, and default values are different contracts. A new optional
request member with a changed default can alter existing callers' behavior.
Making an optional field required, changing a number to a string, renaming
`title`, or allowing `null` where a client assumes a string can break it.
Preserve old meanings and document what omission and null mean separately.
Adding a status code or changing ordering, pagination, authorization, or
rate limits can also change consumer behavior without a JSON schema error.

<details class="learning-answer">
<summary>Predict: is adding an optional field always safe?</summary>
<p>No. A strict client can reject an unknown field, and an added enum value can break an exhaustive old client. Compatibility depends on consumers and semantics, not just whether a field was added.</p>
</details>

## 9. Roll out a changed contract

REST does not require `/v1` in every URI. A stable unversioned URI and
compatible evolution may be enough. If incompatible behavior must coexist,
possible routing choices include:

| Choice | Example | Tradeoff |
| --- | --- | --- |
| URL | `/v1/courses/course-101` | Visible and easy to route; version is part of the address and parallel routes must be maintained. |
| Header | `API-Version: 2` | Keeps path stable; clients, intermediaries, documentation and cache variation must honor the header. |
| Query | `/courses/course-101?version=2` | Explicit in URLs; query handling, caching and link generation must preserve it. |

None makes compatibility automatic. A new version introduces migration,
monitoring, support and eventual retirement costs. Announce deprecation and
the timeline, measure remaining consumers, provide examples and a migration
path, and do not remove a route just because a new one deployed.

For the course status change, inventory consumers and run old and new
fixtures through consumer contract tests. Provider verification against
those contracts is a deployment gate, not a substitute for integration,
security and production monitoring. Contracts cover only the interactions
and consumers actually represented. Deploy support before clients require
it, canary a small cohort, watch errors and client version adoption, and
roll back or pause if the gate or monitoring fails. Only emit `waitlist`
to clients known to handle it, or use a negotiated/new contract.
Communicate behavior and defaults in the API documentation.

An internal gRPC service is not a prerequisite for a production REST API.
A single service may be sufficient; choose extra protocols only when their
benefits justify the added operations and compatibility boundaries.

<details class="learning-answer">
<summary>Predict: does a passing contract test prove every old client is safe?</summary>
<p>No. It verifies the interactions represented by that test. Unknown clients, untested semantics, production configuration and operational failures still require inventory, complementary testing and monitoring.</p>
</details>

## References for further study

- [RFC 9110: HTTP authentication and status codes](https://www.rfc-editor.org/rfc/rfc9110.html#section-11).
- [RFC 7617: Basic authentication](https://www.rfc-editor.org/rfc/rfc7617.html).
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html) and [RFC 8725: JWT best current practices](https://www.rfc-editor.org/rfc/rfc8725.html).
- [RFC 7636: PKCE](https://www.rfc-editor.org/rfc/rfc7636.html), [RFC 9700: OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html), and [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).
- [MDN: Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies) and [MDN: CSRF](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF).
- [Original evolution and consumer contracts](../08-EXPERT-API-DESIGN.md#phase-71--api-evolution--backward-compatibility).
