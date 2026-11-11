[← Back to Main README](../README.md) | [Previous: Fundamentals](00-FUNDAMENTALS.md) | [Next: GraphQL →](02-GRAPHQL.md)

---

# Phase 1 — REST APIs: Zero to Hero

<div class="rest-hero">
<span class="rs-kicker">PHASE 01 / THE REST STUDIO</span>
<p class="rest-hero-title">See the contract.<br>Break the connection.<br>Protect the state.</p>
<p class="rest-hero-copy">One learning platform. Three experiments. Follow a resource through HTTP, lose a reply after a commit, and let two editors meet at a version boundary. Every step exposes what the client knows, what the API decides, and what storage actually contains.</p>
<div class="rest-hero-system" aria-label="Client, API, and storage are separate boundaries">
<span>CLIENT<br>knowledge</span><b aria-hidden="true">→</b><span>API<br>contract</span><b aria-hidden="true">→</b><span>STORAGE<br>effect</span>
</div>
<nav class="rest-route" aria-label="Phase 1 visual route">
<a href="#/docs/01-REST-APIS?id=visual-example-http-resource-lab"><span>01 / METHOD + MESSAGE</span><strong>Open the resource lab</strong>Read, create, replace, patch, delete; then reject an invalid request.</a>
<a href="#/docs/01-REST-APIS?id=visual-example-lost-response-and-retry"><span>02 / TIMEOUT + RETRY</span><strong>Lose the response</strong>Compare duplicate orders, persisted replay, and key conflicts.</a>
<a href="#/docs/01-REST-APIS?id=visual-example-two-editors-and-etags"><span>03 / VERSION + CONFLICT</span><strong>Meet the second editor</strong>Prevent a lost update, fetch the new version, and review a merge.</a>
</nav>
<p class="rest-route-note"><strong>Visual route:</strong> jump to these three worked examples and their adjacent theory. <strong>Complete reading:</strong> use the Table of Contents below for the full original chapter, including design, caching, and production patterns. These routes complement each other; the long reference has not been replaced.</p>
</div>

**Before you begin:** Know client, server, request, response, URL, and JSON from Phase 0. You do **not** need HTTP/2 or HTTP/3 internals. The scenes use readable HTTP/1.1 transcripts to teach semantics shared across HTTP versions.

**One course catalogue across the stages:** Our primary example is the fictional Course API at `learn.example`: `course-101` is **API Fundamentals** (initially 30 seats), an author can create `course-102` (**REST Studio**, 20 seats), and `learner-7` browses the catalogue. Later `/orders` examples model enrollment orders for this same course, not an unrelated shopping application or a real payment. Each visual experiment starts from its own stated snapshot; one experiment never saves changes into another. Company, product, and social-app examples are optional transfer scenarios for applying the same principles elsewhere.

**Studio controls:** Nothing starts automatically. Choose an outcome, then use Previous / Next step / Play / Reset. Keyboard users can Tab to each control; Left/Right step, Home resets, and Escape pauses while controls are focused. Reduced-motion preference disables playback and animation, but manual steps remain. Depth view can be turned off. All examples run locally with fictional data: no server, account, real enrollment, or payment.

Before we learn GraphQL, gRPC, API Gateways, Authentication, etc., we must master REST APIs because:

```
Modern backend systems are built on top of HTTP.

REST = The most common way people use HTTP.
```

Think of REST as:

```
TCP/IP = Road System
HTTP = Traffic Rules
REST = Driving Style
```

We'll build on HTTP request/response fundamentals. HTTP/1.1, HTTP/2, and HTTP/3 differ in framing and transport; you can learn their internals separately without blocking this chapter.

---

## Quick Reference Card

### HTTP Methods

| Method | Action         | Idempotent | Safe |
| ------ | -------------- | ---------- | ---- |
| GET    | Read           | ✅         | ✅   |
| POST   | Create         | ❌         | ❌   |
| PUT    | Replace        | ✅         | ❌   |
| PATCH  | Partial Update | Depends    | ❌   |
| DELETE | Delete         | ✅         | ❌   |

### Status Codes

| Code | Meaning              | Category        |
| ---- | -------------------- | --------------- |
| 200  | Success              | ✅ Success      |
| 201  | Created              | ✅ Success      |
| 204  | Success, no content  | ✅ Success      |
| 304  | Not Modified         | ↪ 3xx / cache validation |
| 400  | Invalid Request      | ❌ Client Error |
| 401  | Valid authentication required | ❌ Client Error |
| 403  | No Permission        | ❌ Client Error |
| 404  | Not Found            | ❌ Client Error |
| 409  | Conflict             | ❌ Client Error |
| 412  | Precondition Failed  | ❌ Client Error |
| 428  | Precondition Required (API policy) | ❌ Client Error |
| 429  | Rate Limited         | ❌ Client Error |
| 500  | Internal Error       | 💥 Server Error |
| 503  | Service Unavailable  | 💥 Server Error |

**Semantics, not slogans:** POST asks the target resource to process the supplied representation; creation is one common use. PUT creates or replaces the target's state under its contract. PATCH's patch format must be defined by the API. GET, PUT, and DELETE are idempotent in their **intended effect**, not necessarily identical in their responses. POST is not idempotent by method semantics, though an API can add a documented replay contract. A 304 is in the 3xx class but does not tell the browser to navigate elsewhere.

---

## Table of Contents

- [REST APIs — Zero to Hero Roadmap](#rest-apis--zero-to-hero-roadmap)
- [Part 1: What is REST?](#part-1-what-is-rest)
  - [Chapter 1: What Problem Was REST Trying to Solve?](#chapter-1-what-problem-was-rest-trying-to-solve)
    - [Resource](#resource)
  - [Chapter 2: URLs in REST](#chapter-2-urls-in-rest)
    - [URI vs URL](#uri-vs-url)
    - [REST Naming Rules](#rest-naming-rules)
  - [Chapter 3: HTTP Methods](#chapter-3-http-methods)
    - [GET](#get)
    - [POST](#post)
    - [PUT](#put)
    - [PATCH](#patch)
    - [DELETE](#delete)
  - [First REST API Design](#first-rest-api-design)
- [Part 2: Request, Response, Status Codes, JSON](#part-2-request-response-status-codes-json)
  - [REST Request-Response Lifecycle](#rest-request-response-lifecycle)
  - [Chapter 1: Anatomy of an HTTP Request](#chapter-1-anatomy-of-an-http-request)
    - [Request Line](#part-1-request-line)
    - [Headers](#part-2-headers)
  - [Chapter 2: Request Body](#chapter-2-request-body)
    - [JSON Fundamentals](#json-fundamentals)
  - [Chapter 3: Anatomy of Response](#chapter-3-anatomy-of-response)
  - [Chapter 4: Status Codes](#chapter-4-status-codes)
- [Part 3: Real-World REST API Design](#part-3-real-world-rest-api-design)
  - [Chapter 1: Path Parameters](#chapter-1-path-parameters)
  - [Chapter 2: Query Parameters](#chapter-2-query-parameters)
  - [Chapter 3: Filtering](#chapter-3-filtering)
  - [Chapter 4: Sorting](#chapter-4-sorting)
  - [Chapter 5: Searching](#chapter-5-searching)
  - [Chapter 6: Pagination](#chapter-6-pagination)
    - [Offset Pagination](#offset-pagination)
    - [Cursor Pagination](#cursor-pagination)
- [Part 4: Idempotency & Distributed Systems](#part-4-idempotency--distributed-systems)
  - [Chapter 1: Safe vs Unsafe Methods](#chapter-1-safe-vs-unsafe-methods)
  - [Chapter 2: Idempotency](#chapter-2-idempotency)
  - [Chapter 3: Why Retries Exist](#chapter-3-why-retries-exist)
  - [Chapter 4: Idempotency Keys](#chapter-4-idempotency-keys)
  - [Chapter 5: Payment API Design](#chapter-5-payment-api-design)
  - [Chapter 6: What Happens During Failure?](#chapter-6-what-happens-during-failure)
  - [Chapter 7: Real Company Examples](#chapter-7-real-company-examples)
  - [Chapter 8: System Design Interview Mindset](#chapter-8-system-design-interview-mindset)
- [Part 5: HTTP Caching — From Zero to Hero](#part-5-http-caching--from-zero-to-hero)
  - [Why Caching Exists](#why-caching-exists)
  - [Cache Hit vs Cache Miss](#cache-hit-vs-cache-miss)
  - [Where Can Cache Exist?](#where-can-cache-exist)
  - [Cache-Control Header](#cache-control-header)
  - [ETag](#etag)
  - [304 Not Modified](#304-not-modified)
  - [Last-Modified Header](#last-modified-header)
  - [Cache Patterns in System Design](#cache-patterns-in-system-design)
- [Part 6: Production REST APIs](#part-6-production-rest-apis)
  - [Chapter 1: The API Evolution Problem](#chapter-1-the-api-evolution-problem)
  - [Chapter 2: API Versioning](#chapter-2-api-versioning)
  - [Chapter 3: Authentication](#chapter-3-authentication)
  - [Chapter 4: Rate Limiting](#chapter-4-rate-limiting)
  - [Chapter 5: API Gateway](#chapter-5-api-gateway)
  - [Chapter 6: Timeouts](#chapter-6-timeouts)
  - [Chapter 7: Retries](#chapter-7-retries)
  - [Chapter 8: Circuit Breaker](#chapter-8-circuit-breaker)
  - [Chapter 9: Observability](#chapter-9-observability)
- [Why REST Was Not Enough](#why-rest-was-not-enough)
  - [Problem 1: Under-Fetching](#problem-1-multiple-round-trips)
  - [Problem 2: Over-Fetching](#problem-2-over-fetching)
  - [REST vs GraphQL Mindset](#rest-vs-graphql-mindset)
  - [Did GraphQL Replace REST?](#did-graphql-replace-rest)
- [REST Mastery Checklist](#rest-mastery-checklist)
- [Next Lesson — GraphQL From Zero to Hero](#next-lesson--graphql-from-zero-to-hero-part-1)

---

## REST APIs — Zero to Hero Roadmap

Today we'll cover:

```
PART 1
✅ What is REST?
✅ Why REST was invented?
✅ What is a Resource?
✅ URLs
✅ URI vs URL
✅ HTTP Methods

PART 2
✅ Request Structure
✅ Response Structure
✅ Status Codes
✅ JSON

PART 3
✅ Designing your first REST API

Later lessons:
⏳ Pagination
⏳ Filtering
⏳ Sorting
⏳ Caching
⏳ Rate Limiting
⏳ Idempotency
⏳ API Versioning
⏳ API Gateway
⏳ Production REST Design
```

---

# Part 1: What is REST?

## Chapter 1: What Problem Was REST Trying to Solve?

Let's go back to early internet.
As an **optional transfer scenario**, imagine Amazon in the early days.
They have:

```
Customers
Orders
Products
Payments
Reviews
```

Many applications need access:

```
Website
Mobile App
Internal Admin Portal
Partners
Warehouses
```

Question:

```
How should these systems communicate?
```

Everyone was inventing their own style.
Example:

```
GetCustomer()
FetchUser()
ReadProduct()
CustomerLookup()
```

No consistency.
Different systems used:

```
XML
Custom protocols
SOAP
Binary protocols
Random naming conventions
```

It became chaos.

Then Roy Fielding introduced REST.
His idea was:

```
The web is already successful.

Let's use HTTP properly.
```

Instead of thinking:

```
Functions
Actions
Methods
```

Think:

```
Resources
```

This was revolutionary.

### Resource

Most important word in REST.
Let's understand deeply.
In our learning platform, **Users, Courses, Progress, and Certificates** are resources. The question "fetch API Fundamentals" points to a course, not a function named `getCourseDetails`.

**Optional transfer scenario:** imagine Instagram.
What exists inside Instagram?

```
Users
Posts
Comments
Messages
Stories
Likes
Followers
```

Every one of these is a resource.

Think like this:

```
Resource = Any thing that exists in your system.
```

Examples:

```
User
Course
Book
Product
Order
Cart
Payment
Video
Movie
Tweet
Photo
Post
```

### Rule #1 of REST

REST deals with:

```
Resources
NOT actions
```

Bad Design:

```http
/getCourse
/fetchCourse
/removeCourse
/updateCourse
```

Looks like function calls.

Better REST Design:

```http
/courses
/courses/course-101
```

Resource-focused.

### Why Resources?

Imagine a city.
We can describe the city using:

```
House
Road
School
Hospital
Police Station
```

These are entities.
Similarly:

```
Your system = city
Resources = entities
```

REST asks:

```
"What thing are we working on?"
```

Not:

```
"What function are we executing?"
```

---

## Chapter 2: URLs in REST

Every resource gets an address.
Exactly like:

```
Your Home Address
```

REST resource address:

```http
/users
/courses
/orders
/products
```

These addresses are URLs.

Example

```http
https://learn.example/courses
```

means:

```
Course resource collection
```

Specific course:

```http
https://learn.example/courses/course-101
```

means:

```
Course whose id = course-101: API Fundamentals
```

Think:

```
/courses
|
+--- course-101: API Fundamentals (starting catalogue)
+--- course-102: REST Studio (after the create example)
```

Specific item:

```http
/courses/course-101
```

**Optional product transfer:** `https://amazon.com/products` identifies a product collection; `/products/123` identifies product 123 and `/products/3` identifies product 3. The collection-versus-item distinction is the same.

### URI vs URL

Interview favourite.
Most developers confuse this.

Think:

```
URI = Identifier
URL = Identifier + Location
```

Example:

```
user:123
```

This identifies something.
URI ✅
URL ❌

Example:

```
https://learn.example/courses/course-101
```

Identifies resource.
Has location.
URI ✅ URL ✅

Rule:

```
Every URL is URI.

Not every URI is URL.
```

### REST Naming Rules

Bad:

```http
/getCourses
/createCourse
/deleteCourse
```

Good:

```http
/courses
/courses/course-101
```

Because actions come from HTTP methods.

**Optional product naming transfer:**

Bad:

```http
/productsList
```

Good:

```http
/products
```

Bad:

```http
/product
```

Good:

```http
/products
```

Plural is common convention.

---

## Chapter 3: HTTP Methods

Now magic begins.
Remember:

```
URL tells us WHAT resource.

HTTP Method tells us WHAT operation.
```

Example:

```http
/courses
```

We now need operation.

### GET

Means:

```
Fetch data
```

Example:

```http
GET /courses
```

Meaning:

```
Give me the course collection.
```

Example:

```http
GET /courses/course-101
```

Meaning:

```
Give me course-101: API Fundamentals.
```

#### Real Example

Course API:

```http
GET /courses/course-101
```

Server:

```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 30
}
```

GET should NOT modify anything.
Bad:

```http
GET /createOrder
```

Very wrong.

More precisely: GET must not request a business-state change. Incidental logging or metrics can still happen; "safe" describes the requested semantics, not zero server-side activity.

### POST

Means:

```
Create something.
```

Example:

```http
POST /courses
```

Body:

```json
{
  "title": "REST Studio",
  "seats": 20
}
```

Meaning:

```
Create a new course.
```

Server:

```json
{
  "id": "course-102",
  "title": "REST Studio",
  "seats": 20
}
```

New resource created.

### PUT

Means:

```
Replace an existing resource.
```

Imagine the writable fields of API Fundamentals (the server-owned ID remains `course-101`):

```json
{
  "title": "API Fundamentals",
  "seats": 30
}
```

PUT:

```http
PUT /courses/course-101
```

```json
{
  "title": "REST Studio",
  "seats": 20
}
```

Both writable fields are replaced; the server-owned ID is preserved. This replacement scenario renames course-101, rather than creating course-102.

Result:

```json
{
  "id": "course-101",
  "title": "REST Studio",
  "seats": 20
}
```

The complete writable representation is updated.

### PATCH

Means:

```
Partial update.
```

Current:

```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 30
}
```

PATCH:

```http
PATCH /courses/course-101
```

```json
{
  "seats": 20
}
```

Result:

```json
{
  "id": "course-101",
  "title": "API Fundamentals",
  "seats": 20
}
```

Only one field changed.

**Optional transfer scenario:**
Instagram update bio:

```http
PATCH /users/123
```

### DELETE

Means:

```
Remove resource.
```

Example:

```http
DELETE /courses/course-101
```

Meaning:

```
Remove course-101 from the catalogue.
```

### HTTP Method Cheat Sheet

| Method | Action         |
| ------ | -------------- |
| GET    | Read           |
| POST   | Create         |
| PUT    | Replace        |
| PATCH  | Partial Update |
| DELETE | Delete         |

Memorise this forever.

---

## First REST API Design

Let's design a learning platform, as in the original Skillsoft example, without needing an account, paid tool, or backend. Start with one connected story: **learner-7 wants to browse API Fundamentals**, and an author manages the same course catalogue.

<rest-design class="rest-design">
<header>
<p class="rd-kicker">COURSE API / FROM INTENT TO VISIBLE STATE</p>
<h3>One platform. Four resources. One contract to follow.</h3>
<p>Choose the thing first, then describe the operation. Follow intent → resource → HTTP request → response → visible state. A catalogue read is not enrollment, progress, or a certificate.</p>
</header>
<div class="rd-map">
<svg class="rd-tree" viewBox="0 0 280 250" role="img" aria-label="Resource tree: a learning platform has Users, Courses, Progress, and Certificates. Courses is the resource used in the HTTP walkthrough.">
<path d="M42 42V218M42 80H90M42 126H90M42 172H90M42 218H90"></path>
<rect x="12" y="10" width="250" height="34" rx="8"></rect>
<text x="26" y="32">Learning platform</text>
<rect x="90" y="62" width="172" height="34" rx="8"></rect>
<text x="104" y="84">Users</text>
<rect class="rd-tree-course" x="90" y="108" width="172" height="34" rx="8"></rect>
<text x="104" y="130">Courses / our target</text>
<rect x="90" y="154" width="172" height="34" rx="8"></rect>
<text x="104" y="176">Progress</text>
<rect x="90" y="200" width="172" height="34" rx="8"></rect>
<text x="104" y="222">Certificates</text>
</svg>
<ul class="rd-resource-list" aria-label="Resource tree text alternative">
<li><strong>Users</strong><span>Who learns? learner-7 is the learner, not the course being fetched.</span></li>
<li><strong>Courses</strong><span>What can they learn? course-101 is API Fundamentals; creating REST Studio adds course-102.</span></li>
<li><strong>Progress</strong><span>How far has a learner advanced in a course? A course GET does not update progress.</span></li>
<li><strong>Certificates</strong><span>What completion evidence has a learner earned for a course? A course GET does not issue one.</span></li>
</ul>
</div>
<div data-rd-enhancement></div>
<details class="rd-reference" open>
<summary>Static reference — all five course endpoint examples</summary>
<p>Each row starts independently with course-101, API Fundamentals, 30 seats. These are the same five operations as the original design; course-101 replaces the illustrative item ID 123. The course-102 card exists only after the create example.</p>
<div class="rd-table-wrap" tabindex="0" role="region" aria-label="Scrollable five-endpoint course contract">
<table>
<thead><tr><th scope="col">Intent → resource</th><th scope="col">HTTP request</th><th scope="col">Response → visible state</th></tr></thead>
<tbody>
<tr><td><strong>Read Courses</strong><br>Browse the collection.</td><td><code>GET /courses</code><br>No request body.</td><td><code>200 OK</code> + a JSON array containing API Fundamentals. Show the catalogue; no write or enrollment occurs.</td></tr>
<tr><td><strong>Get specific course</strong><br>Open API Fundamentals.</td><td><code>GET /courses/course-101</code><br>No request body.</td><td><code>200 OK</code> + <code>{"id":"course-101","title":"API Fundamentals","seats":30}</code>. Show its details; storage is unchanged.</td></tr>
<tr><td><strong>Create course</strong><br>Add REST Studio to the collection.</td><td><code>POST /courses</code><br>JSON body: <code>{"title":"REST Studio","seats":20}</code>.</td><td><code>201 Created</code> + the new course JSON and <code>Location: /courses/course-102</code>. Show both courses; the server allocates the new ID.</td></tr>
<tr><td><strong>Update course</strong><br>Change only API Fundamentals' seats.</td><td><code>PATCH /courses/course-101</code><br>JSON body: <code>{"seats":20}</code>.</td><td><code>200 OK</code> + course-101 with 20 seats. Preserve the ID and title; update the visible seats after receiving the reply.</td></tr>
<tr><td><strong>Delete course</strong><br>Remove API Fundamentals.</td><td><code>DELETE /courses/course-101</code><br>No request body.</td><td><code>204 No Content</code>, no response body. Remove the course card; no cascading progress or certificate behavior is modeled.</td></tr>
</tbody>
</table>
</div>
<p><strong>Read the contract, not just the URL:</strong> the HTTP/1.1 teaching requests use <code>Host: learn.example</code> and <code>Accept: application/json</code>; JSON write bodies use <code>Content-Type: application/json</code>. Responses with JSON declare that media type; a 204 has no body. This PATCH uses the same small field-assignment contract as the resource lab, not a universal patch format.</p>
<p><strong>Connected trace:</strong> “change only seats” → course-101 → PATCH with seats 20 → 200 with the updated representation → the existing API Fundamentals card shows 20 seats. The API can finish its write before the client receives the reply; sending a request alone is not proof that the visible state should change.</p>
<p>Simple. Predictable. Beautiful. That is the REST philosophy: a stable resource address, an explicit operation, and a result the client can interpret.</p>
</details>
<details class="rd-reference">
<summary>Self-check — which resource, request, and visible change?</summary>
<p>For “change only API Fundamentals' seats to 20”: should you target Users or Courses? Should you POST a second course, or PATCH the existing one? Does a 204 contain an empty JSON object?</p>
<p><strong>Answers:</strong> Courses, specifically <code>/courses/course-101</code>. PATCH with <code>{"seats":20}</code> preserves the ID and title under this API's contract. A 204 has no body at all. The catalogue read does not create an enrollment for learner-7.</p>
</details>
<p class="rd-limit"><strong>Without JavaScript:</strong> the resource tree, five endpoint examples, connected trace, and self-check above remain readable. With JavaScript, manual controls add request/response transcripts and before/after cards. All data is fictional and resets; nothing is sent or saved.</p>
</rest-design>

### REST Mental Model

Whenever you see a requirement, do not start by putting a **Function**, **Method**, or **Action** name into a URL. Think **Resource** first: “What thing are we working on?” Then choose the HTTP method for the intended action. HTTP methods still matter; the principle is to separate the address from the operation, not to pretend the operation does not exist.

<div class="rest-design">
<p class="rd-kicker">REQUIREMENT → RESOURCE → CONTRACT</p>
<p><strong>Primary story:</strong> “fetch course details” means learner-7 wants a representation of API Fundamentals. Courses is the resource family; course-101 identifies the item; GET asks to read it. A successful 200 response lets the client render its details without changing enrollment or progress.</p>
<div class="rd-table-wrap" tabindex="0" role="region" aria-label="Scrollable resource-oriented mental model examples">
<table>
<thead><tr><th scope="col">Requirement</th><th scope="col">Action-shaped URL</th><th scope="col">Resource + HTTP method</th></tr></thead>
<tbody>
<tr><td>Fetch course details</td><td><code>/getCourseDetails</code></td><td><code>GET /courses/course-101</code></td></tr>
<tr><td>Create course — primary example</td><td><code>/createCourse</code></td><td><code>POST /courses</code></td></tr>
<tr><td>Create user — optional transfer</td><td><code>/createUser</code></td><td><code>POST /users</code></td></tr>
<tr><td>Delete order — optional transfer</td><td><code>/deleteOrder</code></td><td><code>DELETE /orders/123</code>, if that API permits deletion.</td></tr>
</tbody>
</table>
</div>
<p>The original user and order requirements remain useful transfer exercises; they do not change our primary Course API story. Later enrollment orders relate learner-7 to course-101. Compare the URL shapes by their semantics, not the designer's job title.</p>
</div>

### Interview Golden Rule

When designing REST APIs:

```
URL => Resource

Method => Action

Body => Data

Status => Result
```

This single sentence can carry you through most backend interviews.

### Homework Thought Exercise

Try to design REST APIs for:

**Optional transfer exercises:** the companies below provide alternative domains, not a replacement for our continuing course example.

```
WhatsApp

Resources:
- Users
- Chats
- Messages
- Groups

Instagram

Resources:
- Users
- Posts
- Comments
- Reels
- Stories

Amazon

Resources:
- Products
- Orders
- Cart
- Payments
```

Just identify resources and available HTTP methods.

### Next Lesson (Very Important)

Before pagination and versioning, we'll cover:

```
✅ Complete HTTP Request Anatomy
✅ Headers
✅ Request Body
✅ Response Body
✅ Status Codes (200,201,204,400,401,403,404,409,429,500)
✅ JSON Deep Dive
✅ How browser/Postman actually call REST APIs
✅ Complete request-response lifecycle
```

This is where REST starts becoming real engineering instead of simple CRUD.

---

# Part 2: Request, Response, Status Codes, JSON

Now we're moving from:

```
REST Basics
↓
Real REST Engineering
```

Everything we learned before answered:

```
WHAT resource?
WHAT operation?
```

Now we'll learn:

```
How does a request actually travel?
What is inside a request?
What is inside a response?
How do servers communicate success/failure?
Why are headers so important?
```

This chapter is the foundation of:

```
Authentication
Caching
API Gateway
Rate Limiting
Microservices
GraphQL
gRPC
```

Without this, later topics won't make sense.

## REST Request-Response Lifecycle

Let's start with the complete picture.
Imagine learner-7 opens the learning platform.
You click:

```
View API Fundamentals (course-101)
```

Browser/App sends:

```http
GET /courses/course-101
```

The journey looks like:

```
Client
|
| HTTP Request
|
V
Load Balancer
|
V
API Server
|
V
Database
|
V
API Server
|
| HTTP Response
|
V
Client
```

```mermaid
sequenceDiagram
    participant C as Client
    participant LB as Load Balancer
    participant API as API Server
    participant DB as Database

    C->>LB: HTTP Request (GET /courses/course-101)
    LB->>API: Forward Request
    API->>DB: Query Data
    DB-->>API: Return Data
    API-->>LB: HTTP Response
    LB-->>C: HTTP Response (200 OK + JSON)
```

This is called:

```
Request → Processing → Response
```

Everything in REST follows this.

---

## Chapter 1: Anatomy of an HTTP Request

A request contains multiple parts.
Think of a courier package.

```
Package
├── Destination Address
├── Instructions
├── Labels
└── Content
```

HTTP request is similar.
Structure:

```http
POST /courses HTTP/1.1
Host: learn.example
Authorization: Bearer xyz
Content-Type: application/json

{
"title":"REST Studio",
"seats":20
}
```

Let's understand every piece.

### Visual example: HTTP resource lab

**Theory first — separate the address from the operation.** `/courses/course-101` names one course; `/courses` names the collection. The method tells the API what you want to do to that target. `Accept` asks for a response representation; `Content-Type` describes a supplied body. Neither header validates a body or grants access on its own. The blank line marks the end of headers in these HTTP/1.1 transcripts.

Our fictional course contract is deliberately small:

| Method + target | Supplied body | Intended effect | Reply in this example |
| --- | --- | --- | --- |
| `GET /courses/course-101` | None | Read the course; do not enroll anyone | `200` + course JSON |
| `POST /courses` | `{"title":"REST Studio","seats":20}` | Allocate a new course ID | `201` + JSON + `Location: /courses/course-102` |
| `PUT /courses/course-101` | Both `title` and `seats` | Replace the writable representation, preserve server-owned ID | `200` + replacement |
| `PATCH /courses/course-101` | `{"seats":20}` | Assign one field; retain the title | `200` + changed course |
| `DELETE /courses/course-101` | None | Remove the course mapping | `204`, no body |
| Invalid create | Empty title or seats outside 0–200 | Reject before a write | `400` + error JSON |
| Read a missing ID | None | No matching resource to represent | `404` + error JSON |

The model accepts titles of 1–80 characters with some non-whitespace text, and integer seats from 0–200. A complete PUT supplies both writable fields; this PATCH uses a declared JSON field-assignment contract, **not** JSON Patch or JSON Merge Patch. A real API also needs authentication, authorization, media-type checks, and a published schema. They are outside this scene, not magically provided by REST.

<rest-visual lesson="anatomy">
<p><strong>Static walkthrough — resource lab:</strong> Begin with course-101, title API Fundamentals, seats 30. GET returns 200 without changing it. POST creates course-102 and returns 201 with Location. PUT changes title and seats; PATCH changes only seats. DELETE removes course-101 and returns 204 with no body. An invalid POST returns 400 without a write; GET course-999 returns 404 without a write. With JavaScript available, choose each outcome and inspect the request, response, and before/after storage snapshots.</p>
</rest-visual>

**Worked trace:** choose **PATCH / change seats**. At step 1 the client has a draft body and storage still has 30 seats. At step 3 the API validates the assignment. At step 4 storage contains 20 seats and the original title, while the client still does not know the result. Only step 6 confirms receipt of the response. Contrast **400 / invalid body**: storage never changes. A request being sent is not evidence of a successful write.

**Why status and effect are different:** DELETE can return `204` once and `404` later, while its intended effect remains "that resource mapping is absent." GET can return different JSON after another editor changes the course, while still being safe and idempotent. PUT at a missing target can create a resource if that API permits it; this bounded lab deliberately returns `404` instead. These choices are part of the API contract.

**Self-check:** (1) Does changing `Accept` to JSON make invalid seats valid? (2) If you PATCH seats to 20 twice, do you end at 10? (3) Does a 204 have an empty JSON object as its body?

<details>
<summary>Answers — resource lab</summary>
<p>(1) No. Representation negotiation and schema validation are separate. (2) No. This assignment ends at 20 both times; an increment/decrement operation would have different semantics. (3) No. A 204 response has no content; it is not an empty-object response and is not exclusive to DELETE.</p>
</details>

**Primary references:** [HTTP method semantics, RFC 9110 §9](https://www.rfc-editor.org/rfc/rfc9110.html#section-9), [201 Created, §15.3.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.2), [204 No Content, §15.3.5](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.5), and [PATCH, RFC 5789 §2](https://www.rfc-editor.org/rfc/rfc5789.html#section-2). These standards define HTTP semantics; the course schema and status policies above are original teaching choices.

### Part 1: Request Line

Example:

```http
GET /courses/course-101 HTTP/1.1
```

Contains:

```
Method
Path
Protocol Version
```

Breakdown:

```
GET → Operation
/courses/course-101 → Resource
HTTP/1.1 → Protocol Version
```

Example:

```http
:method: POST
:scheme: https
:authority: learn.example
:path: /orders
```

Means:

```
Create an enrollment order for learner-7 and course-101
using HTTP/2
```

That is an illustrative set of HTTP/2 pseudo-headers, not an HTTP/1.1 request line. HTTP/2 and HTTP/3 do not transmit a textual `POST /orders HTTP/2` start line.

### Part 2: Headers

Headers are metadata.
Think:

```
Letter
|
+-- Main message
|
+-- Extra notes
```

Headers are extra notes.
Example:

```http
Authorization: Bearer xyz
```

Meaning:

```
I am user XYZ.
```

Example:

```http
Content-Type: application/json
```

Meaning:

```
I am sending JSON.
```

Example:

```http
Accept: application/json
```

Meaning:

```
Please return JSON.
```

Headers are extremely important.
Later:

```
Authentication
Caching
Rate Limiting
API Gateway
CDNs
```

all heavily depend on headers.

#### Common Headers

Let's learn the important ones.

##### Host

Example:

```http
Host: learn.example
```

Tells server:

```
Which website?
```

Important because:

```
Many websites can run on same IP.
```

##### User-Agent

Example:

```http
User-Agent: Chrome
```

Meaning:

```
I am Chrome browser.
```

or

```
I am Android App.
```

Server can customise response.

##### Content-Type

Super important.
Example:

```http
Content-Type: application/json
```

Meaning:

```
Request body is JSON.
```

Other examples:

```
application/json

application/xml

multipart/form-data

text/plain
```

##### Accept

Example:

```http
Accept: application/json
```

Meaning:

```
I want JSON response.
```

This is called:

```
Content Negotiation
```

#### Content Negotiation — Deeper Look

Content negotiation is how client and server agree on the format of data exchanged.

The client says what it wants:

```http
Accept: application/json
```

The client says what it is sending:

```http
Content-Type: application/json
```

The server can support multiple formats:

```
application/json
application/xml
text/html
application/yaml
```

If the server cannot produce what the client wants:

```http
406 Not Acceptable
```

Real-world example:

Older SOAP clients may send:

```http
Accept: application/xml
```

Modern mobile apps send:

```http
Accept: application/json
```

Same API, different response formats.

This is also how API versioning can work via headers:

```http
Accept: application/vnd.company.v2+json
```

Content negotiation can support backward-compatible format evolution without changing URLs when the API defines that contract.

We'll revisit later.

##### Authorization

Very important.
Example:

```http
Authorization: Bearer abc123
```

Meaning:

```
I am authenticated.
```

Without this:

```
No access
```

Usually used for:

```
JWT
OAuth
Access Tokens
```

#### Example Request

```http
GET /courses/course-101 HTTP/1.1
Host: learn.example
Authorization: Bearer xyz
Accept: application/json
```

Read it like English:

```
Fetch course-101: API Fundamentals
from the learning platform
I am supplying credentials; the server must check them
Return JSON
```

---

## Chapter 2: Request Body

Question:

```
Where is actual data sent?
```

Answer:

```
Request Body
```

Example:
Create a course.

```http
POST /courses
```

Body:

```json
{
  "title": "REST Studio",
  "seats": 20
}
```

Think:

```
POST
PUT
PATCH
```

usually have body.

Think:

```
GET
DELETE
```

normally don't.

### Why JSON?

Imagine sending data.
Bad:

```
title=api-fundamentals-seats=30
```

Hard to parse.

JSON:

```json
{
  "title": "API Fundamentals",
  "seats": 30
}
```

Beautiful.
Readable.
Language-independent.

This is why REST loves JSON.

### JSON Fundamentals

Object:

```json
{
  "title": "API Fundamentals"
}
```

Multiple values:

```json
{
  "title": "API Fundamentals",
  "seats": 30
}
```

Array:

```json
["API Fundamentals", "REST Studio"]
```

Nested:

```json
{
  "title": "API Fundamentals",
  "topics": ["HTTP", "REST"]
}
```

Real API Response

An illustrative learner representation can nest course data (these extra learner/topic fields are not part of the bounded studio schema):

```json
{
  "id": "learner-7",
  "name": "Example learner",
  "courses": [
    {
      "id": "course-101",
      "title": "API Fundamentals",
      "seats": 30
    }
  ]
}
```

You'll see structures like this daily.

---

## Chapter 3: Anatomy of Response

Server receives request.
Now server responds.
Structure:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
"id":"course-101",
"title":"API Fundamentals",
"seats":30
}
```

Response contains:

```
Status Line
Headers
Body
```

Example:

```http
HTTP/1.1 200 OK
```

Breakdown:

```
HTTP Version
Status Code
Status Text
```

---

## Chapter 4: Status Codes

One of the most important topics.
Status Codes tell:

```
What happened?
```

Without reading body.

### Easy Way to Memorise

```
1xx -> Information

2xx -> Success

3xx -> Redirection class (includes cache validation with 304)

4xx -> Client Error

5xx -> Server Error
```

Memorise this forever.

### 200 OK

Most common.
Means:

```
Everything worked.
```

Example:

```http
GET /courses/course-101
```

Response:

```http
200 OK
```

### 201 Created

Means:

```
New resource created.
```

Example:

```http
POST /courses
```

Response:

```http
201 Created
```

### 204 No Content

Means:

```
Success

Nothing to return
```

Example:

```http
DELETE /courses/course-101
```

Response:

```http
204 No Content
```

### Client Errors

The request cannot be fulfilled as submitted: for example, its credentials, syntax, target, or preconditions may be unsuitable. A 4xx is not a moral judgement or proof that the user made a mistake; stale versions and policy conflicts are normal application outcomes.

#### 400 Bad Request

Example:

```json
{
  "title": "",
  "seats": -1
}
```

Server:

```http
400 Bad Request
```

Meaning:

```
Request invalid.
```

#### 401 Unauthorized

Means:

```
Valid authentication credentials are missing or invalid.
```

Example:

```
No token.
```

Server:

```http
401 Unauthorized
WWW-Authenticate: Bearer
```

401 requires an authentication challenge appropriate to the scheme. A logged-in user can still receive 401 when credentials expire.

#### 403 Forbidden

Different from 401.
401:

```
Who are you?
```

403:

```
I refuse to fulfill this request
```

Often this means an authenticated user lacks permission, but 403 does not itself prove the server knows the user's identity.

Example:
Employee trying to access:

```
Admin endpoint
```

Response:

```http
403 Forbidden
```

#### 404 Not Found

Very common.
Example:

```http
GET /courses/course-999
```

This course doesn't exist.
Response:

```http
404 Not Found
```

#### 409 Conflict

Super important in real systems.
**Optional user-account transfer example** (the course schema above does not contain an email field):

```
Email must be unique.
```

Existing:

```
abc@gmail.com
```

New request:

```
abc@gmail.com
```

Server:

```http
409 Conflict
```

Meaning:

```
Resource state conflicts.
```

#### 429 Too Many Requests

Rate limiting.
Example:

```
You made
10,000 requests
in 1 minute
```

Server:

```http
429 Too Many Requests
```

Very common in public APIs.

### Server Errors

These are server fault.
Not client fault.

#### 500 Internal Server Error

Most famous.
Example:

```
Database crashed.
Null pointer exception.
Unexpected exception.
```

Response:

```http
500 Internal Server Error
```

#### 503 Service Unavailable

Means:

```
Server temporarily unavailable.
```

Example:

```
Maintenance
Database outage
Deployment issue
```

### Status Code Interview Table

| Code | Meaning              |
| ---- | -------------------- |
| 200  | Success              |
| 201  | Created              |
| 204  | Success, no content  |
| 400  | Invalid Request      |
| 401  | Valid authentication required |
| 403  | No Permission        |
| 404  | Not Found            |
| 409  | Conflict             |
| 412  | Precondition Failed  |
| 428  | Precondition Required (API policy) |
| 429  | Rate Limited         |
| 500  | Internal Error       |
| 503  | Service Unavailable  |

204 means successful fulfillment with no content, not specifically deletion. 401 means valid authentication is required, not simply "not logged in." Use the more precise definitions above.

Memorise.

### Real API Example

Request:

```http
POST /courses
```

Body:

```json
{
  "title": "REST Studio",
  "seats": 20
}
```

Response:

```http
201 Created
Location: /courses/course-102
```

Body:

```json
{
  "id": "course-102",
  "title": "REST Studio",
  "seats": 20
}
```

Another example.
Request:

```http
GET /courses/course-999
```

Course missing.
Response:

```http
404 Not Found
```

Body:

```json
{
  "error": "Course not found"
}
```

### Complete Mental Model

Whenever browser/app calls API:

```
Request
|
|-- Method
|-- URL
|-- Headers
|-- Body
|
V

Server

|
|-- Validation
|-- Business Logic
|-- Database
|
V

Response

|
|-- Status Code
|-- Headers
|-- Response Body
|
V

Client
```

This entire flow happens in milliseconds.

### What Senior Engineers Think About

These are **design questions beyond CRUD**, not claims about a job title.

When they see:

```http
POST /orders
```

Here the order is an enrollment request for learner-7 and course-101, extending our course story.

They immediately think:

```
What headers are required?

What body schema?

What status codes?

What auth mechanism?

What happens if DB fails?

What if client retries?

What if request duplicates?

What if server times out?
```

That's the difference between CRUD coding and system design thinking.

### Next Lesson (Extremely Important)

We'll cover:

```
✅ Query Parameters
✅ Path Parameters
✅ Pagination
✅ Filtering
✅ Sorting
✅ Searching
✅ API Design Patterns

Example:

GET /courses?page=2&pageSize=20

GET /courses?topic=rest

GET /courses?sort=title

GET /courses?search=API+Fundamentals
```

This is where APIs start resembling real-world systems like Amazon, Instagram, Skillsoft, Netflix, and WhatsApp.

**Optional transfer:** `GET /products?category=laptop` and `GET /users?sort=name` apply the same query-parameter idea to products and users.

---

# Part 3: Real-World REST API Design

Now we move from:

```
Basic REST
↓
Real-world REST APIs
```

Until now we learned:

```http
GET /users/123
POST /users
PATCH /users/123
DELETE /users/123
```

But real companies like:

```
Amazon
Instagram
Facebook
Netflix
Skillsoft
WhatsApp
```

don't stop there.
The biggest challenge becomes:
"How do we return only the data the user wants?"
This is where:

```
Path Parameters
Query Parameters
Pagination
Filtering
Sorting
Searching
```

become essential.

## Phase 1.3 — Real World REST API Design

### Problem #1

Imagine Amazon.
Database contains:

```
100 Million Products
```

User opens app.
Request:

```http
GET /products
```

Question:
Should server return:

```
100 million products?
```

Of course not.
Response would be:

```
Huge payload
Slow response
Server crash
Network congestion
Phone hangs
```

So we need techniques.

---

## Chapter 1: Path Parameters

Imagine:

```
Users
Products
Courses
Orders
```

Sometimes we need:

```
ALL users
```

Sometimes:

```
ONE specific user
```

Example:

```http
GET /users
```

means:

```
All users
```

Specific user:

```http
GET /users/123
```

means:

```
User whose id = 123
```

Here:

```
123
```

is called:

```
Path Parameter
```

because it is part of URL path.

Example:

```http
GET /courses/45
```

Path parameter:

```
45
```

Example:

```http
GET /orders/987
```

Path parameter:

```
987
```

Visualise:

```
/users/{id}

/courses/{courseId}

/orders/{orderId}
```

Path Parameters identify:

```
Specific Resource
```

Remember this.
Interview favourite question.

### Path Parameter Rule

Use path parameters when:

```
You know exactly which resource.
```

Example:

```http
/users/123
```

Not:

```http
/users?id=123
```

Both may work.
But REST style prefers:

```http
/users/123
```

for specific resource.

---

## Chapter 2: Query Parameters

Now imagine Amazon.
User wants:

```
Only laptops
```

Should we create:

```http
/products/laptops
```

Maybe.
But tomorrow:

```
Mobile
TV
Tablet
Camera
```

Becomes messy.

Instead:

```http
GET /products?category=laptop
```

Everything after:

```
?
```

is query parameter.

Example:

```http
GET /products?category=laptop
```

Meaning:

```
Show products
where category=laptop
```

Another:

```http
GET /products?brand=apple
```

Meaning:

```
Only Apple products
```

Multiple:

```http
GET /products?brand=apple&category=laptop
```

Meaning:

```
Apple laptops only
```

Think:

```
Path Parameters
=
Identity

Query Parameters
=
Filters
```

Memorise.

### Easy Interview Rule

Path:

```http
/users/123
```

Specific thing.

Query:

```http
/users?country=india
```

Filtered collection.

### Real World Examples

Instagram:

```http
GET /posts?user=123
```

Netflix:

```http
GET /movies?genre=action
```

Skillsoft:

```http
GET /courses?skill=system-design
```

Amazon:

```http
GET /products?category=laptop
```

---

## Chapter 3: Filtering

Filtering reduces results.

Without filtering:

```http
GET /courses
```

Returns:

```
All courses
```

Maybe:

```
20,000 courses
```

User wants:

```
Only Java courses
```

Request:

```http
GET /courses?topic=java
```

User wants:

```
Intermediate Java
```

Request:

```http
GET /courses?topic=java&level=intermediate
```

Real response:

```json
[
  {
    "id": 1,
    "title": "Advanced Java"
  }
]
```

Filtering can be:

```
Topic
Category
Price
Status
Author
Date
Country
Language
```

Anything.

---

## Chapter 4: Sorting

Now imagine:

```http
GET /courses
```

Many results.
How should they be ordered?

Maybe:

```
Newest First
```

Request:

```http
GET /courses?sort=createdAt
```

Maybe:

```
Highest Rated
```

Request:

```http
GET /courses?sort=rating
```

Descending:

```http
GET /courses?sort=-rating
```

Common convention.
Meaning:

```
Highest rating first.
```

Ascending:

```http
GET /courses?sort=rating
```

Meaning:

```
Lowest rating first.
```

### Real Companies

Amazon:

```
Price Low to High
Price High to Low
Best Selling
Newest
```

All implemented with sorting.

Example:

```http
GET /products?sort=price
```

or

```http
GET /products?sort=-price
```

---

## Chapter 5: Searching

Most important API feature.
Example:
User types:

```
system design
```

Search box.

Request:

```http
GET /courses?search=system design
```

Server:

```
Find matching courses
```

Response:

```json
[
  {
    "title": "System Design Fundamentals"
  }
]
```

Real World:
Google:

```
search
```

Amazon:

```
search product
```

Netflix:

```
search movie
```

Skillsoft:

```
search courses
```

Search usually uses:

```
Database indexes
Elasticsearch/OpenSearch
Vector Search
AI Search
```

We'll cover later.

---

## Chapter 6: Pagination

VERY IMPORTANT.
Senior engineer favourite.
Interview favourite.
Production favourite.

Let's understand.
Imagine:

```
100 million users
```

Request:

```http
GET /users
```

What happens?

Server tries sending:

```
100 million users
```

Response size:

```
Huge
```

Problems:

```
Memory explosion
Network latency
Mobile app freeze
Database pressure
```

Solution:
Pagination.
Meaning:

```
Return little by little.
```

### Book Analogy

Book has:

```
500 pages
```

You don't read all pages together.
You read:

```
Page 1
Page 2
Page 3
```

REST pagination is same.

### Offset Pagination

Most common.
Request:

```http
GET /users?page=1&pageSize=20
```

Means:

```
Give first 20 users.
```

Next page:

```http
GET /users?page=2&pageSize=20
```

Means:

```
Give next 20 users.
```

Response:

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 500,
  "data": []
}
```

#### How Database Executes

Page 1:

```sql
LIMIT 20 OFFSET 0
```

Page 2:

```sql
LIMIT 20 OFFSET 20
```

Page 3:

```sql
LIMIT 20 OFFSET 40
```

Simple.
Easy.
Very common.

#### Problem With Offset Pagination

Imagine Instagram.
User has:

```
10 million posts
```

Request:

```http
GET /posts?page=100000
```

Database:

```sql
OFFSET 9999990
```

Very expensive.
Server scans countless rows.
Slow.

At scale:

```
Instagram
Facebook
Twitter
LinkedIn
```

avoid large offsets.

### Cursor Pagination

Used by big tech.
Instead of:

```
Page Number
```

We use:

```
Cursor
```

Example:

```http
GET /posts?cursor=abc123
```

Meaning:

```
Start after record abc123.
```

Response:

```json
{
"data":[...],
"nextCursor":"xyz789"
}
```

Next request:

```http
GET /posts?cursor=xyz789
```

Very fast.

#### Real Example

Instagram Feed:

```
Load more posts
Load more posts
Load more posts
```

Often implemented using cursor pagination.

### Pagination Comparison

Offset Pagination

```
Easy
Simple
Jump to page 100
```

But:

```
Slow at scale
```

Cursor Pagination

```
Fast
Scalable
Ideal for feeds
```

But:

```
Harder to implement
```

### Senior Engineer Rule

```
Admin Panels
Reports
Dashboards
=
Offset Pagination
```

```
Feeds
Chats
Notifications
Activity Streams
=
Cursor Pagination
```

### Example Production API

Let's combine everything.

```http
GET /courses?
topic=java
&level=intermediate
&sort=-rating
&page=2
&pageSize=20
```

Meaning:

```
Java Courses
Intermediate Only
Highest Rating First
Second Page
20 Results
```

This is what real APIs look like.

### Design Exercise

Let's design Skillsoft APIs.
Get all courses

```http
GET /courses
```

Course details

```http
GET /courses/123
```

Search courses

```http
GET /courses?search=system design
```

Filter by skill

```http
GET /courses?skill=java
```

Sort by rating

```http
GET /courses?sort=-rating
```

Paginate

```http
GET /courses?page=1&pageSize=20
```

Combine everything

```http
GET /courses?
search=system design
&level=intermediate
&sort=-rating
&page=1
&pageSize=20
```

This is exactly how production-grade REST APIs evolve.

### Senior System Design Thinking

Whenever you see:

```http
GET /courses
```

Ask:

```
How many courses?

100?
1000?
1 million?
100 million?
```

Because API design changes with scale.
A junior engineer thinks:

```
Can it work?
```

A senior engineer thinks:

```
Can it still work with 100 million records?
```

### Next Important Phase

Now we're ready for the part that separates ordinary developers from backend engineers:

```
✅ Idempotency
✅ Safe vs Unsafe HTTP Methods
✅ Why GET is special
✅ Why PUT behaves differently from POST
✅ Duplicate Requests
✅ Retry Mechanisms
✅ Network Failures
✅ Distributed System Problems
✅ Payment API Design (Stripe-like)
```

This is where REST meets distributed systems and system design. This is one of the most important concepts for senior backend interviews.

---

# Part 4: Idempotency & Distributed Systems

Now we enter the phase where REST stops being CRUD and starts becoming Distributed Systems Engineering.
This is one of the most important concepts for:

```
Senior Backend Engineers
System Design Interviews
Payment Systems
E-commerce Platforms
Banking Applications
Microservices
```

Today we'll learn:

```
✅ Safe vs Unsafe Operations
✅ Idempotency
✅ Why Retries Are Dangerous
✅ Network Failures
✅ Duplicate Requests
✅ Payment API Design
✅ Stripe/UPI/Banking Patterns
✅ Real Production Failures
```

### The Problem Most Beginners Never Think About

Imagine you're buying a laptop on Amazon.
You click:

```
Pay ₹50,000
```

The mobile app sends:

```http
POST /payments
```

Server starts processing.
Suddenly:

```
Network disconnects
```

Your mobile never receives a response.
Now what?

Most users do this:

```
Click Pay Again
```

or

```
App automatically retries
```

Now server receives:

```
Payment Request #1
Payment Request #2
```

Question:

```
Should customer be charged once?

or

twice?
```

Obviously:

```
ONCE
```

But how?
This is where Idempotency comes in.

---

## Chapter 1: Safe vs Unsafe Methods

Before idempotency, let's learn another important idea.

### Safe Methods

Safe means:

```
This operation only reads data.

No state change.
```

Examples:

```http
GET /users/123

GET /products

GET /courses
```

These are safe.

Example:

```http
GET /products/100
```

You can call:

```
1 time
10 times
1000 times
```

Result remains same.
Nothing changes.

Therefore:

```
GET = Safe Method
```

### Unsafe Methods

Unsafe means:

```
Changes server state.
```

Examples:

```http
POST /orders

POST /payments

DELETE /users/123

PATCH /users/123
```

These modify data.

So:

```
GET -> Safe

POST -> Unsafe

PATCH -> Unsafe

PUT -> Unsafe

DELETE -> Unsafe
```

Memorise.
Interview favourite.

---

## Chapter 2: Idempotency

The most misunderstood REST concept.

### Simple Definition

An operation is idempotent if:

```
Running it once

or

Running it 100 times

produces same final state.
```

For HTTP, this means the **intended effect on the server** of multiple identical requests is the same as one. It does not promise identical response bytes or status codes, prevent incidental logs, or protect against another client's intervening update. Distinguish three questions: is a method safe, is its intended effect idempotent, and does this API have a replay/deduplication contract?

### Real-Life Example

Imagine a room.
Light switch currently:

```
OFF
```

Command:

```
Turn OFF
```

Run once:

```
OFF
```

Run again:

```
OFF
```

Run again:

```
OFF
```

State unchanged.
This is idempotent.

### Another Example

Door.
Current state:

```
Closed
```

Command:

```
Close Door
```

Run 1 time:

```
Closed
```

Run 10 times:

```
Closed
```

Same result.
Idempotent.

### Non-Idempotent Example

Bank Account
Balance:

```
₹1000
```

Operation:

```
Add ₹100
```

Run once:

```
₹1100
```

Run again:

```
₹1200
```

Run again:

```
₹1300
```

Different state each time.
NOT idempotent.

### REST Methods and Idempotency

#### GET

```http
GET /users/123
```

Read only.
No requested business-state change. The returned data can change over time.
✅ Idempotent

#### DELETE

```http
DELETE /users/123
```

First call:

```
User deleted.
```

Second call:

```
Still deleted.
```

Final state same.
✅ Idempotent

#### PUT

```http
PUT /users/123

{
"name":"Irfan"
}
```

Run:

```
1 time
10 times
100 times
```

Final state:

```json
{
  "name": "Irfan"
}
```

Same.
✅ Idempotent

#### PATCH

Depends.
Example:

```json
{
  "name": "Mohammad"
}
```

Repeat:
Same state.
✅ Can be idempotent

But:

```json
{
  "increaseBalanceBy": 100
}
```

Repeat:
Balance keeps changing.
❌ Not idempotent

#### POST

Usually:
❌ NOT idempotent
Why?
Example:

```http
POST /orders
```

Run twice:

```
Order #1
Order #2
```

Two orders created.
Different state.

### Interview Table

| Method | Idempotent?    |
| ------ | -------------- |
| GET    | ✅ Idempotent  |
| PUT    | ✅ Idempotent  |
| DELETE | ✅ Idempotent  |
| POST   | ❌ Usually Not |
| PATCH  | Depends        |

Very important.

---

## Chapter 3: Why Retries Exist

In distributed systems:

```
Networks fail
Servers crash
Packets drop
Load balancers restart
Databases timeout
```

Failures are NORMAL.
Not exceptional.

Imagine:

```http
POST /payments
```

Request sent.
Server processes payment.
Response gets lost.
Client sees:

```
Timeout
```

Client now thinks:

```
Payment failed
```

That is a tempting but invalid conclusion: the only justified observation is **"no response received before my timeout; outcome unknown."**

But actually:

```
Payment succeeded
```

Huge problem.

### The Two Generals Problem

System A:

```
Payment App
```

System B:

```
Bank
```

A sends:

```
Charge customer.
```

B processes.
B sends:

```
Success.
```

Message lost.
Now:

```
A doesn't know.
B doesn't know that A knows.
```

This problem exists everywhere.
You cannot completely eliminate uncertainty in distributed systems.
You design around it.

---

## Chapter 4: Idempotency Keys

A production pattern, provided the API implements and documents its guarantees.

Imagine Stripe.
Client generates:

```
payment-123456
```

Request:

```http
POST /payments

Idempotency-Key: payment-123456
```

Server stores:

```
Key
Result
```

Database:

```
payment-123456 → SUCCESS
```

If request retries:

```http
POST /payments

Idempotency-Key: payment-123456
```

Server checks:

```
Already processed.
```

Returns the recorded response under the API's replay contract.

Result:

```
1 payment

not

2 payments
```

This desired result is not guaranteed by a header alone. The service must scope the key, bind it to the request, coordinate concurrent attempts, and durably couple the replay record to the business effect. An external processor also needs its own idempotency/reconciliation contract; a local database transaction cannot atomically commit a remote charge.

### Visual example: Lost response and retry

**Theory first — a timeout changes knowledge, not necessarily state.** The client sends a command, the API may commit it, and the return message may disappear. From the client's perspective, "server never received it" and "server committed it but the reply was lost" can look the same. Retrying a create command without a duplicate-effect contract can therefore create another resource.

We use **fictional enrollment orders**, not payments:

```http
POST /orders HTTP/1.1
Host: learn.example
Content-Type: application/json
Idempotency-Key: enroll-7

{"courseId":"course-101","learnerId":"learner-7"}
```

The server-owned replay record in this model contains:

```text
Scope: authenticated learner-7 + POST /orders + enroll-7
Fingerprint: canonical semantic pair [courseId, learnerId]
Result: status 201 + Location /orders/order-1 + original response body

Atomic modeled commit:
  order-1 AND its key/fingerprint/result record
  OR neither
```

The identity of the learner is assumed here; a real API derives it from verified credentials, never trusts a body field for authorization. Canonicalization is intentionally limited to these two known fields: JSON property order does not change the fingerprint. A production service must define canonicalization for its actual schema.

<rest-visual lesson="retry">
<p><strong>Static walkthrough — lost response:</strong> Without a key, attempt 1 creates order-1, its 201 response is lost, and retry creates order-2. With a scoped persisted key, order-1 and its replay record commit together; the same retry returns the original 201 and creates no second order. Reusing that key with course-202 returns this API's 409 conflict without a write. A crash before the atomic commit leaves neither record; the retry creates order-1. A timeout alone tells the client none of these outcomes.</p>
</rest-visual>

**Worked experiment:** run **No key / duplicate effect**, stopping at step 4. The client says UNKNOWN, but the storage snapshot already contains order-1. Continue to the retry: the graph's order count rises from 1 to 2. Reset and select **Persisted key / replay**: the same lost response occurs, yet the count stays at 1 after the retry. The exact recorded status, Location, and body return; replaying `201` does not mean a new order was created.

**Now challenge the contract:**

- **Same key / different payload:** change course-101 to course-202 while retaining enroll-7. The recorded fingerprint does not match. This API returns `409` rather than silently pretending the first order fulfilled a different command. The precise mismatch status is an API policy, not universal `Idempotency-Key` behavior.
- **Crash before commit / retry:** both the order and replay record remain absent. The next attempt creates the first order. Compare this with the lost-reply case, where work already committed.
- **Concurrent arrivals:** not actually executed in this serialized animation. The model assumes the database enforces one owner/commit for the scoped key. A naive "check absent, do work, insert key later" allows two requests to race or a crash to leave an effect without a record.
- **A new key:** represents a new intent under this contract and can create another order. Keep one key across retries of the same intent; do not reuse it for unrelated work.
- **Expiration or independent effects:** replay safety is limited by retention and scope. After expiry a request may be processed again. Emails, external fulfillment, and remote charges need additional coordination; this model has no such effects.

**Self-check:** (1) Did the first request fail merely because its reply was lost? (2) Can the API replay course-101 as success for a retry requesting course-202? (3) Does a browser showing one order prove external payments happen exactly once?

<details>
<summary>Answers — retry lab</summary>
<p>(1) No. In the lost-reply stories the first order committed; the learner's knowledge is uncertain. (2) Not under this contract. It must reject the changed intent and preserve the existing records. (3) No. This is a deterministic local model with an assumed atomic commit, no real persistence, no concurrent execution, and no payment provider. Real systems must handle retention, crash recovery, provider contracts, and reconciliation.</p>
</details>

**Primary references:** [HTTP idempotency and retry semantics, RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) and [Stripe's documented idempotent-request contract](https://docs.stripe.com/api/idempotent_requests). The latter is an example of one provider's behavior, not a standard that all APIs inherit. Our fictional order protocol, atomic boundary, and `409` policy are simplified teaching choices.

### Real UPI Example

Since you've previously dealt with UPI disputes, this becomes easy to understand.
You pay:

```
₹500
```

UPI app shows:

```
Processing...
```

Network fails.
You wonder:

```
Did money go?

or

Did it not go?
```

Banking systems rely on:

```
Transaction IDs
Reference Numbers
Idempotency
Reconciliation Jobs
```

to ensure duplicates are not processed.

---

## Chapter 5: Payment API Design

Beginner design:

```http
POST /chargeCard
```

Dangerous.

Better:

```http
POST /payments
```

Headers:

```http
Idempotency-Key: abc123
```

Body:

```json
{
  "amount": 50000,
  "currency": "INR"
}
```

### Server Flow

```
Receive authenticated request
|
Bind scoped key to semantic payload
|
Persisted result exists?
|-- Different payload: reject under API policy
|-- Same payload: replay recorded result
|-- Absent: coordinate ownership, perform/recover work,
            durably record result, then reply
```

```mermaid
flowchart TD
    A[Authenticate and scope key] --> B{Persisted key and payload}
    B -->|Matching completed intent| C[Replay recorded response]
    B -->|Different intent| X[Reject conflict]
    B -->|Absent| D[Coordinate ownership and durable intent]
    D --> E[Perform or recover provider operation]
    E --> F[Durably record result then reply]
```

**Do not implement the old check-then-charge shortcut.** Local order creation can couple the effect and key record in one database transaction, as the scene assumes. A remote payment is outside that transaction: it needs provider-side idempotency, recoverable intent/state, and reconciliation. In-flight duplicates, failures, and retention must have explicit policies. Renaming a URL to `/payments` alone does not make an API safe.

### Architecture

```
Client
|
V
Payment API
|
V
Idempotency Store
|
V
Payment Processor
|
V
Bank
```

This is how many modern payment APIs work.

---

## Chapter 6: What Happens During Failure?

Let's analyse.

### Failure 1

Client crashes before request sent.
Result:

```
No payment.
```

Easy.

### Failure 2

Server never receives request.
Result:

```
No payment.
```

Easy.

### Failure 3

Server processes payment.
Response lost.
Result:

```
Payment happened.
Client unaware.
```

Dangerous.

### Failure 4

Client retries.
Without idempotency:

```
Double charge.
```

Disaster.

### Failure 5

Client retries.
With idempotency:

```
Return previous response.
```

Useful only within the documented key scope, retention, and durable-effect contract. Uncertain or in-flight operations may need recovery rather than immediate replay.

---

## Chapter 7: Real Company Examples

### Amazon

When placing orders:

```
Retries happen.
Network issues happen.
```

Order APIs need:

```
Idempotency
Deduplication
Unique Order IDs
```

otherwise:

```
Customer receives 5 laptops.
```

### Stripe

One of the most famous examples.
Stripe strongly promotes:

```
Idempotency Keys
```

because payment retries are unavoidable.

### WhatsApp

When sending messages:

```
Retry if delivery uncertain.
```

Each message gets:

```
Message ID
```

used for deduplication.

### Instagram

Like operation:

```http
POST /like
```

may be retried.
Backend often uses:

```
UserId + PostId uniqueness
```

to avoid multiple identical likes.

---

## Chapter 8: System Design Interview Mindset

When interviewer says:

```
Design Payment System
```

Don't immediately draw databases.
Think:

```
What if request retries?

What if response is lost?

What if payment succeeded but client timed out?

What if request arrives twice?

What if server crashes halfway?
```

These questions separate:

```
Junior Engineer
```

from

```
Senior Engineer
```

### Golden Rule

Whenever you see:

```http
POST
```

Ask yourself:

```
Will duplicate requests be harmful?
```

If answer is:

```
YES
```

You probably need:

```
Idempotency Key
Deduplication
Unique Request ID
```

### Complete REST Mental Model So Far

```
Resources
|
├── URLs
├── HTTP Methods
├── Headers
├── Request Body
├── Response Body
├── Status Codes
├── Path Parameters
├── Query Parameters
├── Filtering
├── Sorting
├── Pagination
├── Safety
└── Idempotency
```

You are now beyond the level of most developers who only know:

```
GET
POST
PUT
DELETE
```

and think REST is finished.

### Next Phase (Senior Backend Level)

Now we'll learn what powers almost every production API:

```
✅ HTTP Caching
✅ Cache-Control Header
✅ ETag
✅ Last-Modified
✅ CDN Caching
✅ Browser Caching
✅ 304 Not Modified
✅ Why Instagram/Amazon don't hit DB on every request
✅ Cache Invalidation (the hardest problem in computer science 😄)
```

This is where REST meets performance engineering and large-scale system design.

---

# Part 5: HTTP Caching — From Zero to Hero

Now we are entering one of the most important topics in system design:
REST API Caching — From Zero to Hero
This is where engineers start thinking:

```
Not:
"How do I get data?"

But:

"How do I avoid getting data again?"
```

Because at scale:

```
Getting data is expensive.

Avoiding getting data is cheap.
```

## Why Caching Exists

Let's start with a simple example.
Imagine Instagram.
A celebrity posts a new image.

```
100 Million followers
```

open Instagram.
Every user requests:

```http
GET /posts/123
```

Without caching:

```
100 Million Requests
|
V
Database
```

Database explodes.

Think about it.
Post data is:

```json
{
  "id": 123,
  "caption": "Hello World"
}
```

Same for everyone.
Why fetch it from database 100 million times?
Makes no sense.

### The Restaurant Analogy

Restaurant has:

```
Kitchen
```

making food.
Suppose:

```
100 customers
```

ask for:

```
Same tea
```

Bad:

```
Cook tea 100 times.
```

Better:

```
Cook once.
Keep ready.
Serve repeatedly.
```

That's caching.

### What is Cache?

Cache = Temporary storage of frequently used data.
Think:

```
Fast Copy
```

of original data.

### Without Cache

```
Client
|
V
Server
|
V
Database
```

Every request hits database.

### With Cache

```
Client
|
V
Server
|
V
Cache
|
V
Database
```

Most requests stop at cache.
Database rests.

### Real Numbers

Let's say:

```
Database Query = 50 ms

Cache Query = 1 ms
```

100 requests:
Without cache:

```
100 × 50 ms
```

With cache:

```
100 × 1 ms
```

Massive difference.

---

## Cache Hit vs Cache Miss

The most important cache terminology.

### Cache Hit

Data found in cache.

```
Request
|
Cache
|
Found
```

Response immediately.
Example:

```
GET /courses/123
```

Course already cached.
Result:

```
1 ms response
```

Awesome.

### Cache Miss

Data not found.

```
Request
|
Cache
|
Not Found
|
Database
```

Database queried.
Then stored in cache.
Future requests become fast.

Flow:

```
Request
|
Cache Miss
|
Database
|
Save To Cache
|
Return Response
```

```mermaid
flowchart TD
    A[Client Request] --> B{Cache Lookup}
    B -->|Cache Hit| C[Return Cached Data<br/>~1ms]
    B -->|Cache Miss| D[Query Database<br/>~50ms]
    D --> E[Save to Cache]
    E --> F[Return Response]
```

### Cache Hit Ratio

Senior engineers monitor this constantly.
Formula:

```
Cache Hits
-------------
Total Requests
```

Example:

```
900 hits
100 misses
```

Hit rate:

```
900 / 1000 = 90%
```

Excellent.

Example:

```
50 hits
950 misses
```

Hit rate:

```
5%
```

Cache useless.

### Interview Rule

```
Higher Cache Hit Ratio
=
Lower Database Load
```

---

## Where Can Cache Exist?

Beginners think:

```
Only one cache.
```

Reality:

```
Many layers.
```

### Layer 1: Browser Cache

Your browser caches:

```
Images
CSS
JavaScript
Fonts
API Responses
```

Flow:

```
Browser
|
| Check Local Cache
|
Found?
|
Yes
|
Show immediately
```

No network.
Super fast.

### Layer 2: CDN Cache

Examples:

```
Cloudflare
Akamai
Fastly
CloudFront
```

Flow:

```
User
|
V
CDN
|
Found?
|
Yes
|
Return
```

Origin server never touched.
Massive scale.

Example:
When you download:

```
Instagram Image
Netflix Thumbnail
Amazon Product Image
```

Often served from CDN.

### Layer 3: API Cache

Inside backend.
Example:

```
Redis
Memcached
```

Architecture:

```
API
|
Redis
|
Database
```

Request:

```http
GET /courses/123
```

Redis:

```
Course already present.
```

Database avoided.

---

## Cache-Control Header

Now we enter REST-specific caching.
Server can tell browser:

```
How long this response can be reused.
```

Using:

```http
Cache-Control
```

header.

### Example

```http
Cache-Control: max-age=60
```

Meaning:

```
Use this response for 60 seconds.
```

No need to call server again.

Flow:

```
Request
|
Server
|
Return Response
|
Tell Browser:
Store for 60 sec
```

Next request within 60 sec:

```
No network.
```

Super fast.

### Common Cache-Control Directives

#### max-age

```http
Cache-Control: max-age=3600
```

Meaning:

```
Cache for 1 hour.
```

#### no-store

```http
Cache-Control: no-store
```

Meaning:

```
Never cache.
```

Used for:

```
Banking
Sensitive Data
OTP APIs
```

#### no-cache

Important.
Many developers misunderstand.
It does NOT mean:

```
Don't cache.
```

It means:

```
Cache it

But verify before reuse.
```

#### public

```http
Cache-Control: public
```

Meaning:

```
CDNs may cache.
```

#### private

```http
Cache-Control: private
```

Meaning:

```
Only browser should cache.
```

Not shared caches.

### Problem: What If Data Changes?

Suppose:

```
User Profile Cached
```

Current response:

```json
{
  "name": "Irfan"
}
```

User changes name.
Now:

```json
{
  "name": "Irfanuddin"
}
```

Cache still has old version.
Problem.

This is called:
Stale Data
Cache contains:

```
Old Information
```

And this leads to:
Cache Invalidation
The hardest part of caching.

Famous joke:

```
There are only two hard things in Computer Science:

1. Cache Invalidation
2. Naming Things
```

---

## ETag

Beautiful solution.
Think of ETag as:

```
Fingerprint of data
```

Example response:

```http
ETag: "abc123"
```

Meaning:

```
Current version fingerprint = abc123
```

Browser stores:

```
Data
+
ETag
```

Next request:

```http
If-None-Match: "abc123"
```

Meaning:

```
I already have version abc123.

Has anything changed?
```

Server checks.
If unchanged:

```http
304 Not Modified
```

No body returned.
Tiny response.
Super efficient.

An ETag is an **opaque, quoted validator** for a selected representation. It need not be a hash. A strong tag such as `"abc123"` identifies a byte-equivalent representation; a weak tag such as `W/"abc123"` allows semantic equivalence. `If-None-Match` uses weak comparison and, on GET/HEAD, can lead to `304`. Conditional writes with `If-Match` require **strong comparison** and reject a non-matching precondition with `412`.

### Visual example: Two editors and ETags

**Theory first — repeated writes and stale writes are different problems.** Idempotency asks whether repeating *one command* duplicates its intended effect. Optimistic concurrency asks whether *someone else changed the representation* since you read it. A repeatable PUT can still overwrite another editor's work.

Both editors begin with:

```http
HTTP/1.1 200 OK
ETag: "course-101-v1"
Content-Type: application/json

{"id":"course-101","title":"API Fundamentals","seats":30}
```

A saves a new title using `If-Match: "course-101-v1"` and the server commits version 2. B's old copy still has the original title. B then sends a complete replacement:

```http
PUT /courses/course-101 HTTP/1.1
Host: learn.example
Content-Type: application/json
If-Match: "course-101-v1"

{"title":"API Fundamentals","seats":24}
```

If the server atomically compares that tag against current version 2 **before applying the write**, the precondition fails and storage remains unchanged:

```http
HTTP/1.1 412 Precondition Failed
Content-Type: application/json

{"error":"If-Match does not strongly match the current ETag"}
```

<rest-visual lesson="etag">
<p><strong>Static walkthrough — two editors:</strong> A and B read version 1. A changes the title to REST Studio and commits version 2. With no guard, B's stale PUT changes seats to 24 but restores the old title: A's update is lost. With If-Match v1, B receives 412 without a write. B fetches v2, reviews a merge preserving A's title, and writes the merged representation with If-Match v2. Version 3 contains REST Studio and 24 seats. A weak tag cannot strongly match; a missing required guard receives this API's 428.</p>
</rest-visual>

**Worked experiment:** select **No guard / overwrite A** and advance to the storage write. The reply is `200`, the revision is 3, and A's title has disappeared. Now select **If-Match / prevent lost update**. At the rejection boundary, revision stays 2 and A's title survives. B performs a new GET, explicitly reviews a merge, and submits it with the newly received tag. The final revision 3 contains **REST Studio + 24 seats**.

**The merge is a decision, not an automatic retry.** Replacing the stale header with a fresh tag while sending the same old body can still erase A's title. Preserve changes through a user-reviewed or domain-aware merge. If another writer commits before B's reviewed merge, B's new precondition must fail again. Compare and write must be atomic; a separate version check followed by an unguarded write reintroduces a race.

| Mechanism | Question answered | Scene behavior |
| --- | --- | --- |
| Idempotency key | Is this a repeat of the same command? | Replay a stored result; reject a changed intent |
| `If-Match` | Is the selected representation still the one I read? | Strong match permits the write; stale/weak tag gets `412` |
| Required guard policy | Must this API receive a write precondition? | Missing `If-Match` gets `428` here |
| `If-None-Match` on GET | Does my stored representation still match? | An unchanged representation can produce `304`, with no response content |

`428` is an explicit policy choice, not the response every API gives for an absent header. The scene models one strong tag on one selected JSON representation, with synthetic monotonically increasing versions. It does not implement tag lists, wildcard preconditions, compression variants, or actual concurrent database transactions. Real ETags are opaque: clients store and resend them, not parse version numbers.

**Self-check:** (1) Is PUT's idempotency enough to preserve A's edit? (2) Can `W/"course-101-v2"` satisfy `If-Match` for the current strong tag? (3) Should a rejected conditional PUT receive `304`? (4) Can an idempotency key replace a freshness check?

<details>
<summary>Answers — editor lab</summary>
<p>(1) No. Identical command effects do not prevent stale replacements. (2) No. If-Match requires strong comparison; weak tags cannot satisfy it. (3) No. A failed write precondition normally produces 412. 304 applies to conditional GET/HEAD cache validation. (4) No. Replay identity and representation freshness are different contracts; an API may need both, with documented evaluation/replay rules.</p>
</details>

**Primary references:** [Entity tags, RFC 9110 §8.8.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3), [If-Match, §13.1.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1), [If-None-Match, §13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2), [412, §15.5.13](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.13), and [428, RFC 6585 §3](https://www.rfc-editor.org/rfc/rfc6585.html#section-3).

---

## 304 Not Modified

Important status code.
Meaning:

```
Your cached copy is still valid.
```

Instead of sending:

```json
{
huge response...
}
```

Server sends:

```http
304 Not Modified
```

Just a few bytes.

### Real Example

You visit:

```
Amazon Home Page
```

Many assets already cached.
Server sends:

```http
304 Not Modified
```

rather than sending everything again.

---

## Last-Modified Header

Another validation approach.
Response:

```http
Last-Modified: Tue, 7 Jul 2026 10:00:00 GMT
```

Next request:

```http
If-Modified-Since: Tue, 7 Jul 2026 10:00:00 GMT
```

Server checks.
unchanged?
Return:

```http
304 Not Modified
```

Difference:
ETag

```
Version-based
```

More precise.

Last-Modified

```
Time-based
```

Simpler.

### Instagram Example

User opens profile.
First request:

```http
GET /profile/123
```

Database:

```
Hit
```

Response cached.

Second request:

```
Browser Cache Hit
```

No server call.

Third request after expiry:

```
ETag Validation
```

Server:

```http
304 Not Modified
```

Tiny response.
Very fast.

### API Design Interview Question

Interviewer asks:

```
Design Product API

GET /products/123
```

Senior engineer thinks:

```
Highly read heavy.

Should cache.

Could use:
- Redis
- CDN
- Cache-Control
- ETag
- 304 Not Modified
```

Junior engineer thinks:

```
Just query database.
```

Big difference.

---

## Cache Patterns in System Design

### Cache Aside (Most Popular)

Flow:

```
Request
|
Cache
|
Miss
|
Database
|
Cache Result
|
Response
```

Used by:

```
Most applications
```

including:

```
Node.js
Java
Spring
.NET
Go
```

### Write Through

When updating:

```
Update DB
Update Cache
```

same time.

### Write Back

Update:

```
Cache First
```

Database updated later.
Very fast.
Used carefully.

### Real Company Examples

#### Netflix

Cache:

```
Metadata
Movie Info
Recommendations
Artwork
```

to avoid hitting databases constantly.

#### Amazon

Caches:

```
Product Details
Reviews
Inventory snapshots
```

to handle massive read traffic.

#### Instagram

Caches:

```
Profiles
Posts
Follower Counts
```

because reads are enormous compared to writes.

#### WhatsApp

Uses caching heavily for:

```
Presence
Sessions
Routing information
```

because real-time systems cannot constantly query databases.

### Senior Engineer Mental Model

Whenever you see:

```http
GET /products/123
```

Ask:

```
How many reads?

100/day?
10,000/day?
10 Million/day?
```

If reads are high:

```
Cache.
```

Whenever you see:

```http
GET anything
```

Ask:

```
Can CDN cache it?

Can browser cache it?

Can Redis cache it?

Can we use ETag?

Can we return 304?
```

That's senior-level thinking.

### Database Indexing and API Performance

Caching is one side of performance. The other side is: how fast can the database answer?

Imagine:

```http
GET /users?email=irfan@example.com
```

Without index:

```
Database scans ALL rows.
10 million users.
Checks each one.
Slow.
```

With index on `email`:

```
Database jumps directly to matching row.
Microseconds.
```

This is called a database index.

Think of it like:

```
Book without index → read every page to find a topic
Book with index    → look up page number instantly
```

#### Common indexing patterns for APIs

| API Pattern                          | Index Needed                                     |
| ------------------------------------ | ------------------------------------------------ |
| `GET /users/{id}`                    | Primary key (automatic)                          |
| `GET /users?email=x`                 | Index on `email`                                 |
| `GET /orders?userId=x&status=active` | Composite index on `(userId, status)`            |
| `GET /products?sort=-createdAt`      | Index on `createdAt`                             |
| `GET /courses?search=system+design`  | Full-text index or search engine (Elasticsearch) |
| `GET /posts?cursor=abc123`           | Index on cursor column (e.g., `createdAt + id`)  |

#### Why this matters for API design

Every query parameter you expose in your API implies a database query pattern.

```
Filter field → needs index
Sort field   → needs index
Search field → needs full-text index or search engine
Pagination   → needs index on ordering column
```

Senior engineer rule:

```
Don't add a query parameter to your API
unless the database can answer it efficiently.
```

Without proper indexing:

- Pagination becomes slow at scale (OFFSET problem)
- Filtering creates full table scans
- Sorting forces expensive in-memory sorts
- Search becomes unusable

This is why many large-scale APIs use:

```
Primary DB     → exact lookups (by ID, by indexed field)
Elasticsearch  → search, full-text, facets
Redis          → pre-computed results, caches
CDN            → static/cacheable responses
```

Each API endpoint should have a clear data access path — and that path should be indexed.

### REST Phase 1 Progress

You now understand:

```
✅ Resources
✅ URLs
✅ HTTP Methods
✅ Status Codes
✅ Request Structure
✅ Response Structure
✅ Path Parameters
✅ Query Parameters
✅ Filtering
✅ Sorting
✅ Pagination
✅ Idempotency
✅ Safe vs Unsafe Methods
✅ Retries
✅ Caching
✅ Cache-Control
✅ ETag
✅ 304 Not Modified
```

At this point you know more REST fundamentals than many developers with several years of experience.

### Next (Production-Grade REST APIs)

The next phase is where REST meets large-scale architectures:

```
✅ API Versioning
✅ Backward Compatibility
✅ Breaking vs Non-Breaking Changes
✅ OpenAPI (Swagger)
✅ Authentication (JWT/OAuth2)
✅ Rate Limiting
✅ API Gateway
✅ Circuit Breakers
✅ Timeouts
✅ Retries
✅ Observability (Logs, Metrics, Traces)
```

This is the final step before we transition into GraphQL, RPC, and gRPC.

---

# Part 6: Production REST APIs

Now we're entering the final stage of Production-Grade REST APIs.
Up until now, we built APIs that work.
Now we're going to build APIs that survive:

```
Millions of users
Mobile app upgrades
Microservices
Third-party integrations
Server failures
Traffic spikes
Years of evolution
```

This is where many real systems fail.

## REST Phase 1.6 — Production REST APIs

Today we cover:

```
✅ API Versioning
✅ Backward Compatibility
✅ Breaking vs Non-Breaking Changes
✅ Authentication
✅ Authorization
✅ Rate Limiting
✅ API Gateway
✅ Timeouts
✅ Retries
✅ Circuit Breakers
✅ Observability
```

This is the final REST phase before GraphQL and gRPC.

---

## Chapter 1: The API Evolution Problem

Imagine you launched:

```http
GET /users/123
```

Response:

```json
{
  "id": 123,
  "name": "Irfan"
}
```

Everything works.

One year later business says:

```
Let's rename "name"
to
"fullName"
```

New API:

```json
{
  "id": 123,
  "fullName": "Irfan Mohammad"
}
```

Question:
What happens to old mobile apps?

Old app expects:

```json
{
  "name": "..."
}
```

Now receives:

```json
{
  "fullName": "..."
}
```

App crashes.

This is called:
Breaking Change
A change that may break existing clients.

### Breaking Changes

Examples:
Removing field
Old:

```json
{
  "name": "Irfan"
}
```

New:

```json
{}
```

Breaking ❌

Renaming field
Old:

```json
{
  "name": "Irfan"
}
```

New:

```json
{
  "fullName": "Irfan"
}
```

Breaking ❌

Changing data type
Old:

```json
{
  "age": 25
}
```

New:

```json
{
  "age": "twenty five"
}
```

Breaking ❌

Changing endpoint
Old:

```http
/users
```

New:

```http
/customers
```

Breaking ❌

### Non-Breaking Changes

Safe changes.

Adding optional field:
Old:

```json
{
  "id": 123,
  "name": "Irfan"
}
```

New:

```json
{
  "id": 123,
  "name": "Irfan",
  "country": "India"
}
```

Most clients ignore new fields.
Safe ✅

Senior Engineer Rule:

```
Adding fields = usually safe

Removing fields = dangerous
```

---

## Chapter 2: API Versioning

Question:
How do companies evolve APIs without breaking everyone?
Solution:

```
Versioning
```

Most common pattern:

```http
/v1/users

/v2/users
```

Example:
Version 1

```http
GET /v1/users/123
```

Returns:

```json
{
  "name": "Irfan"
}
```

Version 2

```http
GET /v2/users/123
```

Returns:

```json
{
  "fullName": "Irfan Mohammad"
}
```

Both coexist.

Architecture:

```
Mobile App v1
|
V
/v1 API

Mobile App v2
|
V
/v2 API
```

No breakage.

### Versioning Strategies

#### URL Versioning

Most popular.

```http
/v1/users
/v2/users
```

Easy.
Clear.

#### Header Versioning

```http
API-Version: 2
```

Cleaner URL.
Harder to debug.

#### Query Versioning

```http
/users?version=2
```

Rare.
Not preferred.

Interview Answer:

```
Use URL versioning unless
organisation standards say otherwise.
```

---

## Chapter 3: Authentication

Now things get interesting.
Question:
How does server know who you are?

Without auth:

```http
GET /users
```

Anyone can access.
Dangerous.

Authentication answers:

```
WHO ARE YOU?
```

Example:

```http
Authorization: Bearer xyz123
```

Server checks token.

If valid:

```
User identified.
```

If invalid:

```http
401 Unauthorized
```

### Authentication Flow

```
User Login
|
V
Auth Service
|
Generate Token
|
V
Client Stores Token
|
V
API Requests
```

Example:

```http
Authorization: Bearer eyJ...
```

Server reads token.
Identifies user.

### JWT (Most Common)

JWT = JSON Web Token
Contains:

```
User ID
Roles
Expiry
Claims
```

Structure:

```
Header.Payload.Signature
```

Example:

```
abc.xyz.123
```

Think of JWT as:

```
Digital ID Card
```

### The Full Authentication Spectrum

Before diving into JWT vs OAuth comparisons, it's important to understand all common authentication methods. Each solves a different problem.

#### Basic Authentication

The simplest method. Client sends username and password with every request.

```http
Authorization: Basic aXJmYW46cGFzc3dvcmQ=
```

The value is Base64-encoded `username:password`.

Example:

```
username: irfan
password: secret123
Base64:   aXJmYW46c2VjcmV0MTIz
```

How it works:

```
Client
  |
  | username:password (Base64)
  v
Server
  |
  | Decode + verify
  v
Allow / Deny
```

When Basic Auth is acceptable:

- Internal tools behind VPN
- Server-to-server communication with TLS
- Quick prototyping
- CLI tools calling private APIs

Why Basic Auth is dangerous for production:

- Credentials sent with **every** request
- If intercepted (no TLS), password is exposed
- No expiry — password works until changed
- No scoping — full access or nothing
- Cannot revoke a single session

Senior rule:

```
Never use Basic Auth over plain HTTP.
Always require HTTPS.
Prefer token-based auth for production.
```

#### Session-Based Authentication (Cookies)

This is the traditional web authentication model.

Flow:

```
1. User sends username + password (POST /login)
2. Server verifies credentials
3. Server creates a session (stored in memory/DB/Redis)
4. Server returns Set-Cookie header with session ID
5. Browser automatically sends cookie with every request
6. Server looks up session ID → finds user
```

```mermaid
sequenceDiagram
    participant Browser
    participant Server
    participant SessionStore as Session Store (Redis/DB)

    Browser->>Server: POST /login (username + password)
    Server->>SessionStore: Create session (sessionId → userId)
    Server-->>Browser: Set-Cookie: sessionId=abc123
    Browser->>Server: GET /profile (Cookie: sessionId=abc123)
    Server->>SessionStore: Lookup abc123 → userId=42
    Server-->>Browser: 200 OK (user profile)
```

The cookie:

```http
Set-Cookie: sessionId=abc123; HttpOnly; Secure; SameSite=Strict
```

Important cookie attributes:

| Attribute             | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `HttpOnly`            | JavaScript cannot access — prevents XSS theft   |
| `Secure`              | Only sent over HTTPS                            |
| `SameSite=Strict`     | Not sent on cross-site requests — prevents CSRF |
| `Max-Age` / `Expires` | Session expiry                                  |
| `Path` / `Domain`     | Scope of the cookie                             |

Session Auth strengths:

- Easy to implement in traditional web apps
- Server can invalidate any session instantly (revocation)
- Browser handles cookie automatically — no client-side token management

Session Auth weaknesses:

- Server must store session state (memory/Redis/DB)
- Scaling requires shared session store or sticky sessions
- Not ideal for mobile apps or third-party API consumers
- Cross-domain issues with cookies (CORS)
- Vulnerable to CSRF if `SameSite` not set properly

#### Session Auth vs Token Auth (JWT)

This is one of the most important design decisions.

| Aspect       | Session (Cookie)                   | Token (JWT)                       |
| ------------ | ---------------------------------- | --------------------------------- |
| State        | Server stores session              | Stateless — token contains claims |
| Storage      | Server-side (Redis/DB)             | Client-side (localStorage/cookie) |
| Scalability  | Needs shared session store         | Any server can verify             |
| Revocation   | Easy — delete session              | Hard — token valid until expiry   |
| Mobile apps  | Awkward — cookies don't fit mobile | Natural — send token in header    |
| Cross-domain | Complex (CORS + cookies)           | Simple — just a header            |
| Best for     | Traditional web apps               | APIs, mobile, microservices, SPAs |

Senior engineer rule:

```
Web app with server-rendered pages → Session/Cookie
API consumed by mobile/SPA/third-party → JWT/OAuth
Internal service-to-service → mTLS or JWT
```

### Authentication vs Authorization

Huge interview question.

Authentication:

```
WHO ARE YOU?
```

Example:

```
Login
Token
Password
Biometrics
```

Authorization:

```
What are you allowed to do?
```

Example:
User:

```
Irfan
```

Authenticated ✅

Requests:

```http
DELETE /admin/users
```

Server:

```
You're not admin.
```

Response:

```http
403 Forbidden
```

Easy Trick:

```
401
=
I don't know you.

403
=
I know you.
You can't do this.
```

---

## Chapter 4: Rate Limiting

Imagine public API.
One user sends:

```
1 million requests/sec
```

What happens?
Server dies.

Need protection.

Rate limiting:

```
Restrict requests.
```

Example:

```
100 requests/minute
```

Exceed limit:

```http
429 Too Many Requests
```

### Real World Examples

GitHub

```
Thousands requests/hour
```

limit.

Twitter/X

```
API limits
```

Payment APIs

```
Strict limits
```

to prevent attacks.

### Common Algorithms

Don't memorise deeply today.
Just know names.

#### Fixed Window

```
100 req/min
```

Simple.

#### Sliding Window

Smarter.
More accurate.

#### Token Bucket

Most popular.
Allows bursts.
Used widely.

Remember:

```
Rate Limiting
=
Protect infrastructure
```

---

## Chapter 5: API Gateway

Very important.
Suppose system grows.

### Without Gateway

```
Client
|
+--> User Service
|
+--> Course Service
|
+--> Payment Service
|
+--> Notification Service
```

Messy.

Client must know everything.
Bad.

### With Gateway

```
Client
|
V
API Gateway
|
+--> User Service
|
+--> Course Service
|
+--> Payment Service
|
+--> Notification Service
```

```mermaid
flowchart TD
    C[Client] --> GW[API Gateway]
    GW --> US[User Service]
    GW --> CS[Course Service]
    GW --> PS[Payment Service]
    GW --> NS[Notification Service]

    style GW fill:#f9f,stroke:#333,stroke-width:2px
```

Beautiful.

Gateway becomes front door.

Responsibilities:

```
Authentication

Rate Limiting

Routing

Request Logging

Metrics

TLS Termination

Caching
```

Examples:

```
Kong

NGINX

AWS API Gateway

Apigee

Envoy
```

---

## Chapter 6: Timeouts

Distributed systems rule:

```
Everything eventually fails.
```

Suppose:

```
User Service
```

calls:

```
Payment Service
```

Payment hangs forever.

Without timeout:

```
Request waits forever.
```

Bad.

With timeout:

```
Wait 3 seconds

Then fail.
```

Better.

Always set:

```
Client Timeout

Server Timeout
```

Interview Rule:

```
Never make network calls
without timeout.
```

---

## Chapter 7: Retries

Network failures happen.
Retry can help.

Example:

```
Packet lost.
```

Retry succeeds.

Example:

```
Temporary DB glitch.
```

Retry succeeds.

But retries are dangerous.

Bad:

```
Retry immediately
1000 times
```

Can kill system.

Better:

```
Exponential Backoff
```

Example:

```
Retry 1 = 1 sec

Retry 2 = 2 sec

Retry 3 = 4 sec

Retry 4 = 8 sec
```

This protects servers.

---

## Chapter 8: Circuit Breaker

Advanced topic.
Imagine:

```
Course Service
```

calls:

```
Payment Service
```

Payment Service down.

Without circuit breaker:

```
Keep calling.

Keep failing.

Waste resources.
```

With circuit breaker:

```
Failure rate high?
```

Then:

```
STOP CALLING
```

temporarily.

Analogy:
Electrical circuit.
Too much current?

```
Breaker opens.
```

Protects house.

System version:

```
Failures high?

Breaker opens.
```

Protects platform.

### Architecture

```
User Service
|
Circuit Breaker
|
Payment Service
```

Popular tools:

```
Resilience4j

Hystrix (legacy)

Envoy
```

---

## Chapter 9: Observability

How do companies diagnose failures?

Need visibility.
Three pillars:

### Logs

Record events.
Example:

```
User 123 requested course 456.
```

### Metrics

Numbers.
Example:

```
Requests/sec

Error Rate

Latency

CPU Usage
```

### Traces

Track request journey.
Example:

```
Gateway
|
User Service
|
Payment Service
|
Database
```

One trace shows full path.

Modern systems use:

```
OpenTelemetry

Prometheus

Grafana

Datadog

Splunk
```

---

## Final Production Architecture

```
Client
|
V
+----------------+
| API Gateway |
+--------+-------+
|
+--------------+--------------+
| |
V V

+-------------+ +-------------+
| User Service| |Course Service|
+------+------+\ /+------+------+
| \ / |
| \ / |
| Circuit Breaker |
| | |
V V V

Redis Payment Service DB
| |
| |
+------Logs----+
|
V

Metrics + Traces + Monitoring
```

```mermaid
flowchart TD
    Client --> GW[API Gateway<br/>Auth · Rate Limit · Routing]
    GW --> US[User Service]
    GW --> CS[Course Service]
    US --> Redis[(Redis Cache)]
    US --> CB{Circuit Breaker}
    CS --> CB
    CB --> PS[Payment Service]
    CS --> DB[(Database)]
    US --> OBS[Observability<br/>Logs · Metrics · Traces]
    CS --> OBS
    PS --> OBS

    style GW fill:#e1f5fe
    style CB fill:#fff3e0
    style OBS fill:#e8f5e9
```

---

## REST Mastery Checklist

You now understand:

```
✅ Resources
✅ URLs
✅ HTTP Methods
✅ Request/Response Structure
✅ Status Codes
✅ Headers
✅ JSON
✅ Path Parameters
✅ Query Parameters
✅ Filtering
✅ Sorting
✅ Pagination
✅ Safe vs Unsafe Methods
✅ Idempotency
✅ Retries
✅ Caching
✅ ETags
✅ 304 Not Modified
✅ Versioning
✅ Authentication
✅ Authorization
✅ Rate Limiting
✅ API Gateway
✅ Timeouts
✅ Circuit Breakers
✅ Observability
```

At this point, you're ready to move beyond REST and understand why GraphQL, RPC, and gRPC were created.
That's actually the perfect next step because now you know REST well enough to understand its limitations.
Next Topic: Why REST Was Not Enough
We'll begin with:

```
1. Over-fetching problem
2. Under-fetching problem
3. Mobile app challenges
4. Facebook's problem
5. Birth of GraphQL
6. REST vs GraphQL
```

And from there we'll move into GraphQL from zero → hero.

---

# Why REST Was Not Enough

Now you're finally ready to understand:
Why REST Was Not Enough
This is one of the most important moments in your API journey.
Most developers learn:

```
REST = API
```

But senior engineers know:

```
REST is only ONE way to build APIs.
```

Companies like:

```
Facebook
Instagram
Netflix
Shopify
GitHub
Airbnb
```

eventually encountered problems that REST wasn't solving well.
And that led to:

```
GraphQL
gRPC
RPC
Backend For Frontend (BFF)
```

Today we'll answer:

```
1. What problems does REST have?
2. Why did Facebook invent GraphQL?
3. What are Over-Fetching and Under-Fetching?
4. Why mobile apps suffered with REST?
5. Why GraphQL became popular?
```

## The REST Dream

REST says:

```
Everything is a resource.

Users
Posts
Comments
Orders
Products
Courses
```

Example:

```http
GET /users/123

GET /posts/456

GET /comments/789
```

This works beautifully.
For a while.

## Let's Build Instagram

Imagine you are building:

```
Instagram Profile Screen
```

Profile screen displays:

```
Profile Picture
Username
Bio
Followers Count
Following Count
Recent Posts
```

### REST Approach

First API:

```http
GET /users/123
```

Response:

```json
{
  "id": 123,
  "username": "irfan",
  "bio": "Software Engineer"
}
```

Good.

Now UI team says:

```
Need followers count.
```

New API:

```http
GET /users/123/followers-count
```

Need following count.
New API:

```http
GET /users/123/following-count
```

Need recent posts.
New API:

```http
GET /users/123/posts
```

Final screen requires:

```
4 API calls
```

```
Mobile App
|
+--> User API
|
+--> Followers API
|
+--> Following API
|
+--> Posts API
```

## Problem 1: Multiple Round Trips

Imagine user sitting in:

```
Village
Poor network
3G connection
```

Each call takes:

```
300 ms
```

Now:

```
4 × 300 ms
=
1200 ms
```

Profile feels slow.

This is called:
Under-Fetching
Important term.

### Under-Fetching

Meaning:

```
Single request
does not provide enough data.
```

Client keeps making:

```
More Requests
More Requests
More Requests
```

Example:

```http
GET /users/123
```

returns too little.
Need:

```http
GET /followers
GET /posts
GET /likes
GET /comments
```

Diagram:

```
Client
|
+--> API 1
|
+--> API 2
|
+--> API 3
|
+--> API 4
|
+--> API 5
```

Too many trips.

### Facebook's Problem

Imagine Facebook News Feed.
One post requires:

```
Post Data
Author Data
Comments
Likes
Reactions
Shared Count
Media Links
Advertisements
```

If each thing requires REST call:

```
Explosion of requests.
```

Mobile performance suffered badly.

---

## Problem 2: Over-Fetching

The opposite problem.

Imagine:

```http
GET /users/123
```

returns:

```json
{
  "id": 123,
  "name": "Irfan",
  "email": "abc@gmail.com",
  "phone": "123456",
  "address": "Hyderabad",
  "birthDate": "01-01-2000",
  "preferences": {},
  "settings": {},
  "socialLinks": []
}
```

But mobile screen needs only:

```
name
```

Everything else downloaded unnecessarily.

This is called:
Over-Fetching
Definition:

```
Server returns
more data than needed.
```

### Analogy

You go to restaurant.
Ask:

```
One tea
```

They bring:

```
Tea
Coffee
Milk
Juice
Water
Snacks
Cake
```

Mostly wasted.

REST often causes:

```
Over-Fetching
```

because server decides response shape.

### Real Mobile Problem

Remember:

```
Facebook created GraphQL
during mobile growth era.
```

Back then:

```
Slow cellular networks
Limited bandwidth
Expensive data
```

Every extra KB mattered.

REST response:

```
50 KB
```

Needed:

```
5 KB
```

90% wasted.
Huge issue at scale.

---

## REST Resource-Centric Thinking

REST thinks:

```
Users Resource
Posts Resource
Comments Resource
```

GraphQL thinks differently.

GraphQL asks:

```
What does the screen need?
```

Huge difference.

### REST View

```
Backend decides
response shape.
```

### GraphQL View

```
Client decides
response shape.
```

This idea changed everything.

### Example

REST:

```http
GET /users/123
```

Response fixed.

GraphQL:

```graphql
query {
  user(id: 123) {
    name
  }
}
```

Only name returned.

Need more?

```graphql
query {
  user(id: 123) {
    name
    bio
    followers
    posts {
      title
    }
  }
}
```

Only requested data returned.

---

## REST vs GraphQL Mindset

### REST Analogy

Restaurant Menu.

```
Combo Meal 1
Combo Meal 2
Combo Meal 3
```

You can only choose predefined combinations.

### GraphQL Analogy

Buffet.

```
Take only what you want.
```

```
1 tea
0 coffee
2 cakes
1 sandwich
```

Customised.

### REST vs GraphQL Mindset

REST:

```
Backend owns API shape.
```

GraphQL:

```
Frontend owns API shape.
```

This is the biggest conceptual difference.

### Why Frontend Developers Loved GraphQL

Before GraphQL:
Frontend team says:

```
Need one more field.
```

Backend team creates endpoint.
Deploy.
Wait.
Frontend updates.
Slow process.

GraphQL:
Frontend simply requests:

```graphql
user {
country
}
```

Done.
No new endpoint.

This increased developer productivity tremendously.

---

## Real Architecture Evolution

### Phase 1: Simple Startup

```
Frontend
|
REST
|
Backend
```

Perfect.

### Phase 2: Growing System

```
Frontend
|
+-- User API
|
+-- Post API
|
+-- Comment API
|
+-- Like API
|
+-- Feed API
```

Getting messy.

### Phase 3: GraphQL Gateway

```
Frontend
|
GraphQL
|
V
GraphQL Server
|
+----+----+----+
| | | |
User Post Like Comment
Svc Svc Svc Svc
```

One request.
Many services behind scenes.
Much cleaner for frontend teams.

---

## Did GraphQL Replace REST?

No.
This is one of the biggest misconceptions.
Many beginners think:

```
GraphQL is better.
```

Wrong.

Senior engineers think:

```
Different tools.
Different use cases.
```

REST excels at:

```
Public APIs
CRUD systems
Simple services
Caching
HTTP ecosystem
```

GraphQL excels at:

```
Frontend aggregation
Mobile apps
Complex screens
Many backend services
Flexible querying
```

### Why Companies Still Use REST

Even companies that use GraphQL heavily still use REST.
Example architecture:

```
Mobile App
|
GraphQL
|
GraphQL Layer
|
+----+----+----+
| | |
REST REST REST
Svc Svc Svc
```

Very common.

### Problems GraphQL Introduced

Every solution creates new problems.
GraphQL solved:

```
Over-Fetching
Under-Fetching
```

But created:

```
Complex Caching
Expensive Queries
N+1 Problem
Schema Management
Query Cost Control
Security Challenges
```

We'll learn those next.

---

## What You Learned Today

### REST Problems

#### Over-Fetching

```
Too much data returned.
```

Example:

```json
50 fields returned

Need only 2
```

#### Under-Fetching

```
Too little data returned.
```

Need:

```
Many API calls
```

to build one screen.

### Why Facebook Created GraphQL

Because:

```
Mobile apps needed:

Less bandwidth
Fewer requests
Flexible data
Faster UI development
```

REST wasn't solving those problems efficiently.

### Mental Model Before Next Lesson

Remember this forever:

```
REST:
Server decides data shape.

GraphQL:
Client decides data shape.
```

That single sentence explains 70% of GraphQL.

---

## Next Lesson — GraphQL From Zero to Hero (Part 1)

We'll cover:

```
✅ What exactly is GraphQL?
✅ Query
✅ Schema
✅ Type System
✅ Resolvers
✅ Mutations
✅ Subscriptions
✅ Real Instagram/Facebook examples
✅ GraphQL Request Lifecycle
✅ How GraphQL actually works internally
```

This is where we start learning GraphQL itself, not just why it was created.

---

[← Back to Main README](../README.md) | [Previous: Fundamentals](00-FUNDAMENTALS.md) | [Next: GraphQL →](02-GRAPHQL.md)
