# gRPC lesson: Protobuf wire format and evolution

This standalone lesson follows a fictional Course API, not a production
service. Start with `course-101`, **API Fundamentals**, and 30 seats.
Authenticated `learner-7` enrolls with key `enroll-7-a`; successful commit
creates `enrollment-42` and leaves 29 seats. A read and a mutation have
very different failure implications, even when both look like method calls.

Read the [guided gRPC journey](../03-GUIDED-RPC-AND-GRPC.md),
[original RPC reference](../03-RPC-AND-GRPC.md),
[lifecycle and operations](GRPC-LIFECYCLE-AND-OPERATIONS.md),
[Phase 0](../00-GUIDED-FUNDAMENTALS.md),
[REST reliability](REST-RELIABILITY-AND-OPERATIONS.md),
[content map](../COURSE-CONTENT-MAP.md), and
[corrections ledger](../CONTENT-CORRECTIONS.md).
The [complete shared contract](../contracts/course_api.proto) and
[fixtures](../../assets/rpc-lesson-fixtures.mjs) are the source for every
example here. Diagnostic JSON represents data, not the actual gRPC wire.

## 1. Separate style, encoding, and transport

RPC models an interaction as a named remote operation and its input and
output. REST is an architectural style centered on resources, uniform
interface constraints and representations. A resource-oriented HTTP API can
also invoke operations; an RPC endpoint can use JSON over HTTP. Neither
style determines the encoding or transport by itself.
The [gRPC FAQ](https://grpc.io/docs/what-is-grpc/faq/) uses “gRPC Remote
Procedure Calls” for the name. RPC is the broader remote-operation idea;
gRPC is an open-source framework, not a requirement to use Google services.

In this course native gRPC normally uses HTTP/2, generated service
interfaces, and Protobuf message encoding. gRPC supports other serializers
in some implementations; do not treat Protobuf as a synonym for all RPC.
REST commonly uses JSON, but can use other representations and HTTP/2 too.
A browser-facing JSON API may be more convenient than native gRPC; a typed
internal service with streaming may benefit from gRPC. Measure the actual
workload instead of assuming either one always wins.

| Question | This example | Independent choice |
| --- | --- | --- |
| Interaction style | RPC method `GetCourse` | Resource-oriented REST |
| Message encoding | Protobuf | JSON or another format |
| Transport | Native gRPC over HTTP/2 | Ordinary HTTP APIs can use HTTP/2 |
| Interface | Shared schema and generated bindings | Handwritten client or HTTP description |

A local function call and a remote call are not equivalent. The network can
fail, response delivery can be lost, and independent processes can deploy
different versions. A generated function signature hides serialization
plumbing, not latency, identity checks, timeouts, or failure uncertainty.

For example, a JSON HTTP interface can be inspected with ordinary HTTP
tools, while native gRPC tooling understands its framing and statuses.
Generated clients reduce repeated parsing code but add a schema and runtime
versioning step to each supported language. These costs are not defects:
they are tradeoffs to evaluate against the number of callers, frequency of
change and need for streaming. A gateway can support multiple clients, but
its mappings and operational behavior also need independent tests.

<details class="learning-answer">
<summary>Check: does choosing RPC require Protobuf?</summary>
<p>No. RPC is an interaction style; the encoding and transport are separate choices. This lesson chooses Protobuf and native gRPC over HTTP/2.</p>
</details>

## 2. Read the actual shared contract

The file declares `syntax = "proto3"` and package `learning.v1`.
The package is part of the service's fully qualified name, such as
`learning.v1.CourseService`. It is not a DNS host or an authorization rule.
Service declarations define method shapes; message declarations define
fields and their numbered wire identities.
These are interface boundaries, not deployment instructions: one server
process can register both services.

The five contract methods are:

| Service | Method | Request | Response |
| --- | --- | --- | --- |
| `CourseService` | `GetCourse` | `GetCourseRequest` | `Course` |
| `CourseService` | `Enroll` | `EnrollRequest` | `EnrollReply` |
| `ProgressService` | `WatchProgress` | `GetCourseRequest` | stream of `ProgressUpdate` |
| `ProgressService` | `RecordProgress` | stream of `ProgressUpdate` | `ProgressSummary` |
| `ProgressService` | `Discuss` | stream of `ClassroomMessage` | stream of `ClassroomMessage` |

Each `stream` keyword changes the cardinality of one direction. For
example, `WatchProgress` accepts one request and can return many updates;
`Discuss` can exchange many messages independently in both directions.
Lifecycle, ordering and reconnection are covered in the companion lesson.

The field map below is a compact reference, not a replacement schema:

| Message | Fields: name, type, tag |
| --- | --- |
| `GetCourseRequest` | `course_id` string 1 |
| `Course` | `id` string 1; `title` string 2; `seats` int32 3; `description` optional string 4 |
| `EnrollRequest` | `course_id` string 1; `idempotency_key` string 2 |
| `Enrollment` | `id` string 1; `course_id` string 2; `learner_id` string 3 |
| `EnrollReply` | `enrollment` Enrollment 1; `course` Course 2 |
| `ProgressUpdate` | `course_id` string 1; `percent_complete` int32 2; `event_id` string 3 |
| `ProgressSummary` | `accepted_count` int32 1; `last_percent` int32 2 |
| `ClassroomMessage` | `course_id` string 1; `message_id` string 2; `text` string 3 |

The tags are field numbers, not field values. Identifiers happen to be
strings in this contract. Do not silently change them to integers because
an ID looks numeric elsewhere. `int32` has a signed range of -2,147,483,648
to 2,147,483,647; the server must separately reject negative seat counts or
percentages outside the chosen 0–100 business range. The type alone does
not express those rules.

## 3. Generated clients are adapters, not magic

A Protobuf compiler and a language's gRPC plugin can generate message types
and client/server interfaces from the same `.proto` file. Typical bindings
exist for languages such as Java, Go, Python, C++ and C#. The precise command,
versions, async API, package layout and runtime dependencies depend on the
language and installation. This lesson requires none of those tools and
does not assume `protoc` or a plugin is installed.

Conceptually, build and run a real application in these steps:

1. Review and version the shared contract.
2. Install compatible compiler, plugin and runtime using that project's policy.
3. Generate language-specific messages and service bindings.
4. Implement server methods and register the service.
5. Construct a client channel, configure identity and deadline, and call a stub.
6. Validate application data, handle statuses, and test old and new clients.

A generated stub serializes an input, invokes the remote method and decodes
responses or reports failure. The server binding dispatches to application
code; generated types do not implement seat allocation or authentication.
Generated APIs vary by runtime. In particular, some use camelCase field
names, others expose snake_case or language-specific accessors.

### Worked read: request and response

This is **diagnostic JSON**, not literal bytes on a native gRPC connection.
It uses lowerCamelCase as in the shared JavaScript fixtures; the `.proto`
uses lower_snake_case. `courseId` corresponds to `course_id` tag 1.
A particular binding's object representation need not be ProtoJSON.

```json
{"courseId":"course-101"}
```

Assuming the course exists and no concurrent enrollment has changed it,
a diagnostic response before enrollment is:

```json
{"id":"course-101","title":"API Fundamentals","seats":30}
```

A later read after the illustrated enrollment may return seats 29. A
snapshot does not reserve a seat and is not a guarantee of future state.
The server authenticates and authorizes requests according to its policy.
A missing course can be reported with `NOT_FOUND` in the example policy;
a generated stub cannot infer that policy from the message definition.

<details class="learning-answer">
<summary>Predict: if a read returned 30 seats, does that reserve one?</summary>
<p>No. A read is a snapshot, not an allocation. A concurrent enrollment can change availability before the caller acts.</p>
</details>

## 4. Presence is a contract decision

`Course.description` is an `optional string`. Its absence is distinguishable
from a present empty string in APIs that expose proto3 explicit presence.
The first diagnostic object omits the field; the second supplies it as empty:

```json
{"id":"course-101","title":"API Fundamentals","seats":30}
```

```json
{"id":"course-101","title":"API Fundamentals","seats":30,"description":""}
```

Applications can assign meanings to these states: for example, absent means
no description supplied while empty means intentionally blank. That meaning
is a documented policy, not inherent in the word `optional`. An optional
field is not a database transaction, a validation rule or an update command.

By contrast `seats` is an implicit-presence proto3 scalar. When absent, its
API value is the scalar default, zero; an implicit scalar's ordinary API does
not distinguish omitted from explicitly set to zero. Zero seats can mean a
real full course; it does **not** mean the course does not exist. Use the
RPC status or an explicit application model to represent absence.

For partial updates, specify which fields are intended to change. A
`FieldMask` is one possible design, but this course contract has no update
method. The following is an illustrative design excerpt, **not** a complete
proto program or an existing RPC:

```text
update_mask: paths = ["description"]
course.description: ""
```

The server's update policy must say whether that clears the description,
sets it to an empty value, or rejects it. A mask alone does not choose.

<details class="learning-answer">
<summary>Check: can implicit seats distinguish omitted from explicit zero?</summary>
<p>No. Both read as zero under implicit scalar presence. A zero value does not establish that the course is missing.</p>
</details>

## 5. Inspect bytes, without calling them JSON

Protobuf encodes field numbers and wire types, not field names. A field key
is the varint `(field_number << 3) | wire_type`. Wire type 0 represents a
varint; wire type 2 represents a length-delimited value such as a string.
The following examples show selected messages, not a universal byte order
for all equivalent serialized messages.

For `Course.seats = 30`, field number 3 and wire type 0 yield key
`(3 << 3) | 0 = 24`, or hex `18`. The value 30 is hex `1e` as a
single-byte varint. Thus the selected field encoding is `18 1e`.
Larger varints can occupy multiple bytes. Negative `int32` values use the
signed type's Protobuf varint representation and can be long; `sint32` is
a different type, not a safe casual replacement.

For the complete `GetCourseRequest` with `course_id = "course-101"`,
UTF-8 contains exactly 10 bytes. Field 1, wire type 2 gives key `0a`;
length 10 gives `0a`; ASCII characters have the following hex bytes:

```text
0a 0a 63 6f 75 72 73 65 2d 31 30 31
```

This is 12 bytes total: one key, one length and ten payload bytes. Byte
length is not always character count: non-ASCII UTF-8 can use multiple
bytes per character. This hex is a worked serialization diagnostic, not
a JSON object and not a display of captured network traffic.

### The gRPC envelope and HTTP/2 frames

Each gRPC message has a five-byte prefix: one compressed flag byte followed
by a four-byte unsigned big-endian message length. The length counts the
message bytes after the prefix, not the prefix itself. For our uncompressed
12-byte request, the selected full gRPC message is:

```text
00 00 00 00 0c 0a 0a 63 6f 75 72 73 65 2d 31 30 31
```

Flag `00` means the message is uncompressed; `00 00 00 0c` is length 12.
A compressed message's flag and length describe the transmitted compressed
message; compression must be supported and negotiated by the endpoints.
This example omits HTTP/2 frame headers, HTTP metadata, TLS records and TCP
packets. One gRPC message is not necessarily one HTTP/2 DATA frame or one
network packet: intermediaries may split or combine data.

Protobuf is a compact binary encoding, **not compressed JSON**. Optional
message compression is separate. HTTP/2 header compression compresses HTTP
header fields, not Protobuf message bodies. Compactness and speed depend on
schema, data, runtime and workload, so compare measured end-to-end costs.

<details class="learning-answer">
<summary>Predict: how many bytes does the example gRPC prefix report?</summary>
<p>Twelve message bytes, not seventeen. The five-byte prefix is excluded from its own length.</p>
</details>

## 6. Evolve without reinterpreting old data

Field numbers are durable wire identities. Never reuse a removed field's
number, even for an unrelated field or a field with the same wire type.
Reserve its old name as well to protect schema and JSON-facing usage. The
following is a **partial hypothetical revision**, not the shared schema or
a complete proto program. Suppose a former field `legacy_label` used 5:

```text
reserved 5;
reserved "legacy_label";
```

These are two separate valid reservation statements when placed inside the
appropriate message. Do not reserve a still-active field or silently modify
the published contract in this lesson. Number and name reservations serve
different purposes; reserving a name does not prevent number reuse.

Adding a field at a fresh number is often wire-compatible with old readers:
they can skip data with unknown field numbers. But whether unknown fields
are retained through parse-and-reserialize depends on the library and on
intermediate format conversion. Do not promise that JSON conversion,
field-by-field copying, or every implementation preserves them. Test the
actual path, including gateways and persistent storage.

Wire compatibility is not semantic safety. An old client may ignore a new
field that the server now considers necessary to interpret a price, or use
a default that changes business meaning. Changing a field type can affect
wire interpretation or lose values even where encodings appear compatible.
Never casually change types, reuse tags, or assume successful parsing means
correct behavior. Consult the Protobuf compatibility guidance for the
specific change and validate application invariants.

Changing a field's name while retaining its number can leave binary parsing
working but break generated source code, JSON names, field masks or stored
JSON. A new enum value can also break an exhaustive client switch even if
its wire format can carry the value. Design an unknown/default branch and
test old clients with new values. The shared course contract currently has
no enum; this is a hypothetical evolution hazard.

### ProtoJSON is a mapping, not native gRPC wire JSON

ProtoJSON is a defined JSON mapping for Protobuf messages. It generally
uses lowerCamelCase names, and represents `int64` values as decimal strings
to preserve precision across JSON consumers. `seats` is `int32`, not
`int64`, and is shown as a JSON number here. The fixture objects are
readable diagnostics; native gRPC transmits encoded messages, not these JSON
characters. ProtoJSON has different evolution behavior from binary
Protobuf, particularly around names and unknown fields. Its parsers and
options should be tested for the actual deployment.

### A staged release exercise

1. Preserve the published tags and add a genuinely optional field at a new tag.
2. Generate new client and server bindings with supported tool versions.
3. Deploy readers that tolerate old and new data before writers rely on it.
4. Test generated old clients against the new server and new clients against
   the old server, including absent fields and default values.
5. Exercise binary storage, queues and JSON gateways for unknown-field loss.
6. Observe failures and adoption; require new semantics only after migration.
7. Deprecate, remove and reserve a field only after all required readers migrate.

This rollout costs coordination and testing. It is worthwhile for independently
deployed clients, durable messages and long-lived services. For a small
one-process experiment, local types might be simpler; once stored or exchanged,
compatibility still matters. Version package names only with a deliberate
migration strategy, not as a substitute for compatibility tests.

<details class="learning-answer">
<summary>Check: does successful decoding prove a schema change is safe?</summary>
<p>No. Old code can ignore a field or interpret defaults incorrectly, and JSON conversion may lose unknown fields. Test semantics and real conversion paths.</p>
</details>

## 7. Make the design choice explicit

Use typed gRPC with Protobuf where shared contracts, generated bindings,
internal service calls or streaming justify the tooling and deployment
coordination. Avoid assuming it is the easiest public browser interface,
or that every small payload becomes faster. A JSON REST interface can be
more accessible for ad hoc clients and caches; a gateway or transcoding
layer is another choice, with its own semantic and operational costs.

Before shipping, ask:

- Which callers are deployed independently and how long do they live?
- Are field presence, defaults and validation documented?
- Are removed numbers and names reserved?
- Can old generated clients safely handle new server responses?
- Does any JSON conversion discard data needed later?
- Have representative payloads, deadlines and failures been measured?
- Does authentication and authorization apply to every operation?

## Primary references

- [Protobuf language guide: proto3](https://protobuf.dev/programming-guides/proto3/)
- [Protobuf encoding guide](https://protobuf.dev/programming-guides/encoding/)
- [Protobuf field presence](https://protobuf.dev/programming-guides/field_presence/)
- [ProtoJSON format and evolution](https://protobuf.dev/programming-guides/json/)
- [gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [gRPC over HTTP/2 protocol](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)
- [HTTP/2 RFC 9113](https://www.rfc-editor.org/rfc/rfc9113)
