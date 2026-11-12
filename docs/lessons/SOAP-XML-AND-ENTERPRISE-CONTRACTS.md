# SOAP, XML, and enterprise contracts

A university's older learning-management system already speaks SOAP.
It needs to read a course from a partner's catalogue, and replacing that
integration is not an immediate option. How can both sides agree on the
message and its meaning without pretending that a local method call
cannot fail?

This is a complete, standalone branch of the free course. It does not
prescribe a mandatory upgrade to SOAP, or assume any paid server or tool.
The partner and endpoint are fictional; no private enterprise system was
inspected or verified. The files describe a contract, not a running service.

## What you will learn

- Separate the SOAP envelope, application XML schema, WSDL operation, binding,
  and endpoint address.
- Trace a SOAP 1.2 request, successful response, and structured fault.
- Understand which compatibility, security, and operational duties remain
  even when an interface and generated proxy exist.
- Compare this legacy integration with the existing HTTP/JSON interface,
  and predict what a changed requirement actually affects.

## Start with the same course

The [senior fixtures](../../assets/senior-lesson-fixtures.mjs) define the
SOAP identities and inherit the current course. That course is
`course-101`, **API Fundamentals**, with 29 seats remaining.
Earlier, `learner-7` enrolled and received `enrollment-42`; that event has
already happened. This lesson performs only a read. `GetCourse` cannot
enroll anyone, decrement seats, or create that enrollment again.
Assume the course remains unchanged during the worked example; a later read
can legitimately reflect a concurrent change.

This contract has exactly **one operation**, `GetCourse`. It does not
describe all catalogue operations, enrollment, or the whole platform.
The [WSDL](../contracts/course_api.wsdl) and
[XSD](../contracts/course_api.xsd) are complete physical contract files.
The [OpenAPI definition](../contracts/course_api.openapi.json) describes a
different HTTP/JSON interface; its `Course` response supplies the same three
field names and constraints for this comparison.
The placeholder `https://learn.example/soap/course` is not a live endpoint;
do not send real data there.

Continue through the [guided senior journey](../GUIDED-SENIOR-DESIGN.md),
the [original senior guide](../07-SENIOR-DESIGN-GUIDE.md),
the [topic library](../COURSE-CONTENT-MAP.md), and the
[corrections ledger](../CONTENT-CORRECTIONS.md).
For the resource-oriented alternative see
[REST and HTTP contracts](REST-HTTP-CONTRACTS.md) and
[API contracts and lifecycle](API-CONTRACTS-AND-LIFECYCLE.md).

<details class="learning-answer">
<summary>Predict: Does reading this course enroll the learner again?</summary>
<p>No. GetCourse is the only operation in this contract and is read-only. The earlier enrollment and seat decrement are not repeated.</p>
</details>

## 1. What SOAP contributes

SOAP is a protocol for exchanging XML messages. It defines an envelope
and processing model, including headers and faults, independently of this
particular course data. A SOAP message can use different underlying
transports and conventions; this lesson chooses SOAP 1.2 over HTTP.
XML is the representation of the message, not itself the operation,
transport, authentication mechanism, or business implementation.

Compare four things rather than calling all of them “SOAP”:

| Layer | Job in this example | What it does not decide |
| --- | --- | --- |
| SOAP 1.2 | Envelope, header processing, body, fault | Course validation rules or access grants |
| XSD | Shape and values of application XML elements | HTTP address or server behavior |
| WSDL 1.1 | Abstract operation and concrete binding/service address | Working implementation or deployment |
| HTTP and TLS | Carry the request and protect a connection when configured | Application authorization or end-to-end business semantics |

A remote call differs from a function in the same process: it has
serialization, latency, independent deployments and possible lost replies.
Even for this read, a retry may return a newer seat count. The interface
cannot promise a consistent snapshot across multiple reads by itself.
SOAP is not automatically more secure, reliable, or transactional than
an HTTP/JSON API. Those properties depend on the selected standards,
configuration, application behavior, and operations.

## 2. XML names and schema

The application namespace is `urn:learning-course:v1`. An XML expanded
name is a namespace URI plus a local name. Prefixes such as `c` are aliases:
`c:GetCourse` and `course:GetCourse` can identify the same element if both
prefixes are bound to that URI. Merely spelling the same local name under a
different URI is not equivalent. Namespace URIs identify names; this URN
is not an instruction to fetch a network resource.

The schema's `elementFormDefault="qualified"` means its local elements,
including `courseId`, `course`, and `title`, are in that namespace.
Element order matters because these complex types use `xs:sequence`.
Escape XML text correctly: for example, a title containing an ampersand
is written `Research &amp; Design`. Never build XML by concatenating
untrusted text; use an XML writer. Namespace-aware parsers must resolve
QName-valued content as well as element names.

The local XSD has no external schema references. Its global declarations:

| Declaration | Required content |
| --- | --- |
| `GetCourse` | `courseId`: nonempty string, maximum 128 characters |
| `GetCourseResponse` | One `course` of global complex type `Course` |
| `Course` type | `id`, `title`: nonempty strings; `seats`: integer from 0 to 2147483647 |
| `CourseFault` | `code`: `INVALID_REQUEST` or `NOT_FOUND`; `message`: nonempty string |

The `Course` type is a global type, not a global element; its use here is
the qualified `course` element inside the response. All fields are required
once and in the shown order; an extra element is rejected by this schema.
Unlike the request identifier, response `id` and `title` have **no maximum
length declared**. The JSON OpenAPI `Course` also has no such maximum.
The JSON path parameter and XML request ID both have the 128-character
limit; that does not make it a response field constraint.
XSD `minLength` means at least one character; it does not by itself reject
a whitespace-only string. A stricter business rule would need an explicit
agreement and validation.

<details class="learning-answer">
<summary>Predict: Can a response title contain 201 characters?</summary>
<p>Yes, the contract has no maximum title length. It must still be a nonempty XML string, and a real service may need separately agreed operational limits.</p>
</details>

## 3. WSDL: abstract interface to concrete port

WSDL describes an interface; it is not required for every possible SOAP
exchange. This particular file uses the **WSDL 1.1** definitions namespace
`http://schemas.xmlsoap.org/wsdl/` and its **SOAP 1.2** binding extension
namespace `http://schemas.xmlsoap.org/wsdl/soap12/`. WSDL 1.1 does not
mean SOAP 1.1. The SOAP envelope version is a separate choice.

Follow the references in the actual file:

1. `types` includes the local `course_api.xsd` under the same application
   target namespace. It defines payload elements, not the envelope.
2. Each `message` has one part referring to a global XSD element:
   request `GetCourse`, response `GetCourseResponse`, or fault `CourseFault`.
3. `CoursePortType` declares one abstract operation with input, output,
   and named fault messages. It does not say where to connect.
4. `CourseSoap12Binding` references that port type. It specifies SOAP 1.2,
   document style, literal body and fault, HTTP transport, and action
   `urn:learning-course:v1:GetCourse`.
5. `CourseService` contains a port that references the binding and gives
   the illustrative address `https://learn.example/soap/course`.

The operation is the logical action; a binding determines the concrete
message and transport conventions; the port combines a binding with an
address. The action is an agreed identifier, not authorization or a URL
to visit. Document/literal means the body carries XML conforming to the
declared element schema; it is not a promise that every SOAP server shares
the same wrappers or naming convention.

Every `tns:` and `c:` reference in this file resolves by namespace and
local name. The prefix text itself is not a globally unique identifier.
WSDL types include a local XSD, but the XSD itself is self-contained.
Tooling must resolve that relative file when loading the WSDL.
In a real integration, distribute and version both files together and
check compatibility with the actual partner's tools and configuration.

<details class="learning-answer">
<summary>Check: Does the schema alone supply the service address?</summary>
<p>No. The XSD defines application data. The WSDL service port supplies the illustrative address and refers to a binding.</p>
</details>

## 4. A SOAP 1.2 read, on the wire

The following is a teaching request, not a command sent to a server:

```http
POST /soap/course HTTP/1.1
Host: learn.example
Content-Type: application/soap+xml; charset=utf-8; action="urn:learning-course:v1:GetCourse"
```

The HTTP body is the complete XML envelope below. The `env` URI identifies
SOAP 1.2; `c` identifies this application's payload. No header is necessary
for this illustrative contract.

<!-- example: soap-get-course-request -->
```xml
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
              xmlns:c="urn:learning-course:v1">
  <env:Body>
    <c:GetCourse>
      <c:courseId>course-101</c:courseId>
    </c:GetCourse>
  </env:Body>
</env:Envelope>
```

The service would first parse the envelope, process any targeted mandatory
headers, validate the body against the agreed schema, then apply its own
identity, authorization and business rules. Validation is not a substitute
for any of those rules. The read looks up `course-101`, without modifying it.
The following successful HTTP response might use status 200 and
`Content-Type: application/soap+xml; charset=utf-8`:

<!-- example: soap-get-course-response -->
```xml
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
              xmlns:c="urn:learning-course:v1">
  <env:Body>
    <c:GetCourseResponse>
      <c:course>
        <c:id>course-101</c:id>
        <c:title>API Fundamentals</c:title>
        <c:seats>29</c:seats>
      </c:course>
    </c:GetCourseResponse>
  </env:Body>
</env:Envelope>
```

The body payload validates against the application XSD, while the
surrounding envelope obeys SOAP's own rules. A schema validator applied
only to the `GetCourseResponse` element does not validate HTTP, the
SOAP envelope, a server implementation, or the truth of the seat count.

For comparison, the existing HTTP/JSON interface would read
`GET /courses/course-101` and represent the same course as
`{"id":"course-101","title":"API Fundamentals","seats":29}`.
Its `GET` and optional conditional request semantics are not automatically
inherited by a SOAP operation sent using `POST`. Both can be read-only;
neither format alone controls caching, authorization, or data freshness.

<details class="learning-answer">
<summary>Predict: Does the HTTP POST make this an enrollment?</summary>
<p>No. POST carries this SOAP exchange; the declared GetCourse operation is a read. HTTP method alone does not turn it into an enrollment.</p>
</details>

## 5. Faults are structured outcomes

Suppose the caller requests a well-formed identifier that the catalogue
does not contain. For this teaching contract the service can return a
SOAP 1.2 `Sender` fault with application detail `NOT_FOUND`.
The following is the body of an illustrative fault response:

<!-- example: soap-not-found-fault -->
```xml
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
              xmlns:c="urn:learning-course:v1">
  <env:Body>
    <env:Fault>
      <env:Code>
        <env:Value>env:Sender</env:Value>
      </env:Code>
      <env:Reason>
        <env:Text xml:lang="en">Course not found.</env:Text>
      </env:Reason>
      <env:Detail>
        <c:CourseFault>
          <c:code>NOT_FOUND</c:code>
          <c:message>No course matches the requested identifier.</c:message>
        </c:CourseFault>
      </env:Detail>
    </env:Fault>
  </env:Body>
</env:Envelope>
```

The envelope's `Code` classifies the SOAP fault. `env:Sender` is a QName:
its prefix must resolve to the SOAP 1.2 envelope namespace. The human
`Reason` text has a language; application consumers should use the
structured detail rather than parse English text. `CourseFault` is the
application detail declared by the WSDL and validated by the XSD.
`INVALID_REQUEST` is the other declared application code. A malformed XML
envelope or header-processing fault may occur before the service can
produce this application detail; not every fault must contain it.

In the SOAP 1.2 HTTP binding a Sender fault maps to HTTP 400, and a Receiver
fault maps to HTTP 500. Those transport statuses are not the business
outcome: `NOT_FOUND` is the application's detail, not necessarily HTTP
404. Proxies and failures outside the SOAP processor can instead return
non-SOAP HTTP errors or no response. Clients should distinguish a SOAP
fault, non-SOAP transport failure, and timeout; they should not assume
every HTTP error has a parseable SOAP body.

An invalid request generally needs correction, not an unchanged retry.
A transient receiver or network failure may justify a bounded retry with
backoff and a deadline. This read has no enrollment side effect, but a
retry can return a different current value. If a separate mutation were
introduced, timeout alone would not reveal whether it committed; that
operation would need explicit idempotency and transaction design.

<details class="learning-answer">
<summary>Predict: Is NOT_FOUND necessarily an HTTP 404 in this example?</summary>
<p>No. It is application detail within a SOAP Sender fault. The SOAP 1.2 HTTP binding maps Sender to HTTP 400; transport intermediaries can produce other failures.</p>
</details>

## 6. Do not mix SOAP versions

SOAP 1.2 uses `http://www.w3.org/2003/05/soap-envelope` for the
envelope and `application/soap+xml` for this HTTP binding. Its action is
represented by the media type's `action` parameter when used here.
SOAP 1.1 instead uses the envelope namespace
`http://schemas.xmlsoap.org/soap/envelope/`, typically `text/xml` and
the `SOAPAction` HTTP header. SOAP 1.1's usual top-level fault codes include
`Client` and `Server`; SOAP 1.2 uses `Sender` and `Receiver`.

These are not interchangeable prefixes or cosmetic renames. A SOAP 1.1
envelope sent to a SOAP 1.2-only endpoint may produce a version mismatch
or another failure. A WSDL 1.1 document can describe a SOAP 1.2 binding,
as this one does; its WSDL namespace is not the envelope namespace.
Agree on version, binding, action, media type and fault handling before
generating or configuring either side.

<details class="learning-answer">
<summary>Predict: Does WSDL 1.1 force the Client and Server fault names?</summary>
<p>No. The SOAP binding version decides the envelope and fault vocabulary. This WSDL 1.1 file selects SOAP 1.2 Sender and Receiver.</p>
</details>

## 7. Headers, trust, and safe parsing

SOAP headers are optional blocks preceding the body. They can carry
different kinds of information, not just authentication. A header can be
targeted to a SOAP role; a node playing that role must understand and
process a header marked `mustUnderstand`, or generate the appropriate SOAP
fault rather than silently ignore it. Headers not targeted at that node
have different processing requirements. This contract does not invent a
mandatory authentication header.

Use TLS with appropriate certificate verification to protect the connection
to the configured endpoint. TLS termination at an intermediary changes
the trust boundary; connection security alone is not necessarily
end-to-end message security. A real WS-Security profile may define tokens,
signatures, timestamps and other policy, but only when both sides agree,
implement, and configure it. SOAP or WSDL alone does not activate it.
No sample in this lesson claims a verified XML signature, authenticated
identity, or replay defense.

For untrusted XML, disable DTD processing and external entity resolution,
including entity expansion; do not allow network retrieval of arbitrary
schemas. Apply input size, depth, time, and resource limits appropriate to
the deployment. Load the reviewed local schema, not a schema location
supplied by an attacker. Use a maintained namespace-aware parser and
safe XML serialization. Validate the message actually used by application
code, and verify any real signature according to the agreed profile before
trusting its protected content. Schema-valid data can still be unauthorized
or malicious.

Identity and authorization must be enforced by the service: decide who may
read which course and avoid leaking sensitive details in faults and logs.
Replay protection requires an explicitly designed and enforced mechanism,
such as an agreed timestamp and nonce policy where applicable; merely
placing a timestamp in a header is not enough.
Manage certificates, secrets, clock skew and audit retention separately.

<details class="learning-answer">
<summary>Check: Does a generated proxy automatically verify identity and prevent replay?</summary>
<p>No. Those properties require an agreed security profile, correct configuration, verification and enforcement by the participating systems.</p>
</details>

## 8. Generated proxies and operational reality

A WSDL-aware tool can generate language-specific client bindings and
server interfaces. The generated proxy usually handles some serialization
and dispatch plumbing; exact APIs depend on the tool and version.
This lesson does not claim a tested SDK or present runnable client code.
Conceptually, configure the endpoint and approved security profile, create
the request, invoke the operation with a deadline, and handle both
application faults and transport failures. A real application must also
implement the server-side lookup, authorization, telemetry, and validation.

The generated interface does not implement transactions, security policy,
replay defense, retries, or business correctness merely because a WSDL
exists. Confirm what the chosen runtime actually supports. Set connect and
read deadlines; bound retries, concurrency and payload sizes. Instrument
latency, outcome classes and correlation identifiers without logging
credentials or unnecessary personal data. A correlation ID aids diagnosis;
it is not proof of identity.

For failures, distinguish an unavailable endpoint from a contract fault
and a rejected access decision. A health check is not proof that the next
request will succeed. Test the actual partner's timeout and fault behavior
in a safe environment. This course has no running SOAP service, so these
are operational recommendations, not measured production claims.

## 9. Changed requirement: add a course description

The LMS now wants an optional description. Adding an element to an XSD
may look harmless, but existing strict clients validate against the old
sequence and reject an unexpected element. Old generated models may drop
it, reject it, or behave differently depending on their runtime.
Making it required also breaks senders that do not supply it.
Adding a field in a JSON API is not automatically safe either: the
current OpenAPI `Course` explicitly rejects additional properties.

First agree on semantics, size and privacy. Then choose a compatibility
strategy with real consumers: a new namespace and versioned contract or
endpoint, negotiated representation, or a coordinated deployment with
appropriate compatibility tests. Continue serving the old shape for old
clients when the agreement requires it; publish a retirement schedule and
measure usage before removal. A versioned namespace is one possible policy,
not magic negotiation. The checked-in v1 schema remains unchanged here.

If the changed requirement is to enroll a learner instead, do not call this
read twice or silently add a side effect. Design a separate operation and
contract, authentication and authorization, seat concurrency, atomicity,
idempotency scope and retention, retry behavior, and observable outcomes.
An XSD can describe a key field; it cannot enforce the durable deduplication
or the database transaction behind it.

<details class="learning-answer">
<summary>Predict: Will a strict v1 client accept an extra description element?</summary>
<p>No. The current sequence allows exactly the three declared course fields. A compatible rollout needs an explicit agreement and consumer testing.</p>
</details>

## 10. Decision and transfer

| Requirement | Reasonable choice | Cost to examine |
| --- | --- | --- |
| Existing partner requires this SOAP profile | Keep a SOAP adapter with the agreed WSDL, schema and security configuration | XML tooling, policy interoperability, careful version rollout |
| Browser-facing catalogue under your control | Consider the existing HTTP/JSON contract | Design and document caching, errors, authorization and evolution |
| Different clients require both | Map between explicitly versioned interfaces | Translation, loss of semantics, ownership and extra failure boundary |

Do not equate older with useless or newer with inherently better. XML
verbosity can add bandwidth and processing cost, but actual performance
depends on messages, network, implementation and traffic; no benchmark
is claimed here. SOAP standards and tooling can help integrate an existing
ecosystem, yet the deployed profile and partner interoperability matter
more than a technology label. A gateway does not eliminate the need to
test both sides or decide which system owns each rule.

Transfer this design to a library: replace course with book and lookup by
book ID. The same envelope and schema distinctions apply. A loan operation
is a different, state-changing requirement: an uncertain reply requires
its own safe retry and concurrency design. Do not infer a loan from a
read-only book lookup.

<details class="learning-answer">
<summary>Predict: Can a SOAP gateway guarantee the partner's business rules?</summary>
<p>No. It can translate and enforce rules it actually implements, but the partner and gateway must agree on semantics and test the complete interaction.</p>
</details>

## References and scope

The original [section 12](../07-SENIOR-DESIGN-GUIDE.md#12-soap-and-xml-apis)
lists legacy uses, tooling and tradeoffs; its short interview advice is not
a reason to omit the detailed contract here.
[Section 15](../07-SENIOR-DESIGN-GUIDE.md#15-api-data-models-and-contracts)
compares REST, GraphQL, gRPC and event contracts; the WSDL and XSD above
add the missing SOAP contract without altering that source.

Public specifications: [SOAP 1.2 Part 1: Messaging Framework](https://www.w3.org/TR/soap12-part1/),
[SOAP 1.2 Part 2: Adjuncts](https://www.w3.org/TR/soap12-part2/),
[WSDL 1.1](https://www.w3.org/TR/2001/NOTE-wsdl-20010315/),
[WSDL 1.1 SOAP 1.2 Binding](https://www.w3.org/Submission/wsdl11soap12/),
and [XML Schema Part 1](https://www.w3.org/TR/xmlschema-1/).
These explain public standards, not any private partner's implementation.
