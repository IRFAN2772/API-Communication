// Deterministic teaching models. No HTTP, persistence, clocks, or external effects.
const copy = value => JSON.parse(JSON.stringify(value));
const owns = (object, key) => Object.hasOwn(object, key);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validTitle = value => typeof value === "string" && value.trim().length > 0 && value.length <= 80;
const validSeats = value => Number.isInteger(value) && value >= 0 && value <= 200;
const validCourse = value => isObject(value) && validTitle(value.title) && validSeats(value.seats);
const reasons = { 200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 404: "Not Found", 409: "Conflict", 412: "Precondition Failed", 428: "Precondition Required" };
const reply = (status, body = null, headers = {}) => ({ status, headers, body });
const fail = (status, error) => reply(status, { error });

export function initialCourses() {
  return { courses: [{ id: "course-101", title: "API Fundamentals", seats: 30 }], nextId: 102 };
}

export function applyCourseRequest(state, request) {
  if (!isObject(state) || !Array.isArray(state.courses) || !Number.isSafeInteger(state.nextId) || state.nextId < 102 ||
      !state.courses.every(course => validCourse(course) && typeof course.id === "string") ||
      new Set(state.courses.map(course => course.id)).size !== state.courses.length) {
    throw new TypeError("Invalid course storage snapshot");
  }
  if (!isObject(request) || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
      typeof request.path !== "string" || !/^\/courses(?:\/course-\d+)?$/.test(request.path)) {
    throw new TypeError("Use a supported teaching method and /courses resource path");
  }
  const next = copy(state);
  const { method, path, body } = request;
  const id = path.split("/")[2];
  if ((method === "POST") !== !id) throw new RangeError("POST targets the collection; other teaching methods target a course");
  if (method === "POST") {
    if (!validCourse(body) || Object.keys(body).some(key => !["title", "seats"].includes(key))) {
      return { state: next, response: fail(400, "title (1-80 characters) and seats (0-200) are required") };
    }
    if (next.nextId === Number.MAX_SAFE_INTEGER) throw new RangeError("Course ID sequence exhausted");
    const course = { id: `course-${next.nextId++}`, title: body.title, seats: body.seats };
    if (next.courses.some(value => value.id === course.id)) throw new RangeError("Course ID sequence collides");
    next.courses.push(course);
    return { state: next, response: reply(201, copy(course), { Location: `/courses/${course.id}` }) };
  }
  const index = next.courses.findIndex(course => course.id === id);
  if (index < 0) return { state: next, response: fail(404, "Course not found") };
  if (method === "GET") return { state: next, response: reply(200, copy(next.courses[index])) };
  if (method === "DELETE") {
    next.courses.splice(index, 1);
    return { state: next, response: reply(204) };
  }
  const allowed = isObject(body) && Object.keys(body).length > 0 && Object.keys(body).every(key => ["title", "seats"].includes(key));
  const merged = allowed ? { ...next.courses[index], ...body } : null;
  if (!allowed || !validCourse(merged) || (method === "PUT" && !validCourse(body))) {
    return { state: next, response: fail(400, method === "PUT" ? "PUT requires the complete title and seats representation" : "PATCH needs valid title and/or seats fields") };
  }
  next.courses[index] = { id, title: merged.title, seats: merged.seats };
  return { state: next, response: reply(200, copy(next.courses[index])) };
}

export function initialOrders() {
  return { orders: [], keys: {} };
}

const validPayload = payload => isObject(payload) &&
  ["course-101", "course-202"].includes(payload.courseId) && payload.learnerId === "learner-7" &&
  Object.keys(payload).length === 2;
const fingerprint = payload => JSON.stringify([payload.courseId, payload.learnerId]);

export function submitOrder(state, payload, key = null, { commit = true } = {}) {
  if (!isObject(state) || !Array.isArray(state.orders) || !isObject(state.keys)) throw new TypeError("Invalid order storage snapshot");
  if (typeof commit !== "boolean") throw new TypeError("commit must be boolean");
  if (key !== null && (typeof key !== "string" || !/^[a-z0-9-]{1,64}$/.test(key))) throw new TypeError("Key must be 1-64 lowercase letters, digits, or hyphens");
  const next = copy(state);
  if (!validPayload(payload)) return { state: next, response: fail(400, "Use a fictional course and learner-7"), replayed: false, committed: false };
  const scoped = key === null ? null : `learner-7:POST/orders:${key}`;
  if (scoped !== null && owns(next.keys, scoped)) {
    const entry = next.keys[scoped];
    if (entry.fingerprint !== fingerprint(payload)) {
      return { state: next, response: fail(409, "Idempotency key already bound to a different payload"), replayed: false, committed: false };
    }
    return { state: next, response: copy(entry.response), replayed: true, committed: false };
  }
  // A single modeled transaction commits the order AND replay record, or neither.
  if (!commit) return { state: next, response: null, replayed: false, committed: false };
  const order = { id: `order-${next.orders.length + 1}`, courseId: payload.courseId, learnerId: payload.learnerId };
  const response = reply(201, order, { Location: `/orders/${order.id}` });
  next.orders.push(copy(order));
  if (scoped !== null) next.keys[scoped] = { fingerprint: fingerprint(payload), response: copy(response) };
  return { state: next, response, replayed: false, committed: true };
}

export function initialDocument() {
  return { id: "course-101", title: "API Fundamentals", seats: 30, revision: 1 };
}

export function courseTag(document) {
  if (!isObject(document) || !validCourse(document) || document.id !== "course-101" ||
      !Number.isSafeInteger(document.revision) || document.revision < 1) throw new TypeError("Invalid versioned course");
  return `"course-101-v${document.revision}"`;
}

export function updateCourse(document, replacement, ifMatch, { requireMatch = true } = {}) {
  const tag = courseTag(document);
  if (typeof requireMatch !== "boolean") throw new TypeError("requireMatch must be boolean");
  if (ifMatch !== null && typeof ifMatch !== "string") throw new TypeError("ifMatch must be a quoted tag or null");
  if (!validCourse(replacement) || Object.keys(replacement).some(key => !["title", "seats"].includes(key))) {
    return { state: copy(document), response: fail(400, "PUT requires valid title and seats") };
  }
  if (ifMatch === null && requireMatch) return { state: copy(document), response: fail(428, "This API requires If-Match for updates") };
  if (ifMatch !== null && ifMatch !== tag) return { state: copy(document), response: fail(412, "If-Match does not strongly match the current ETag") };
  if (document.revision === Number.MAX_SAFE_INTEGER) throw new RangeError("Revision sequence exhausted");
  const next = { id: document.id, ...replacement, revision: document.revision + 1 };
  return { state: next, response: reply(200, { id: next.id, title: next.title, seats: next.seats }, { ETag: courseTag(next) }) };
}

export const lessons = Object.freeze({
  anatomy: Object.freeze({
    title: "A request is a contract, not a magic URL.",
    eyebrow: "01 / RESOURCE LAB",
    intro: "Choose a method or failure. Follow the same course through routing, validation, storage, and the HTTP reply.",
    scenarios: Object.freeze({ read: "GET / read", create: "POST / create", replace: "PUT / replace", patch: "PATCH / change seats", remove: "DELETE / remove", invalid: "400 / invalid body", missing: "404 / missing course" }),
    limit: "Fixed course schema, no authentication, no real server. PATCH uses this API's small JSON field-update contract, not a universal patch format.",
  }),
  retry: Object.freeze({
    title: "The response vanished. Did the order?",
    eyebrow: "02 / FAILURE LAB",
    intro: "Lose a reply after a commit, then retry. Compare two orders with one atomically recorded result.",
    scenarios: Object.freeze({ duplicate: "No key / duplicate effect", protected: "Persisted key / replay", mismatch: "Same key / different payload", rollback: "Crash before commit / retry" }),
    limit: "Fictional enrollment orders only. Atomic local storage is an assumed contract, not real persistence. No external payments, exactly-once proof, expiration, or real concurrency.",
  }),
  etag: Object.freeze({
    title: "Two editors. One version boundary.",
    eyebrow: "03 / CONCURRENCY LAB",
    intro: "A changes the title; B changes seats from an old copy. Watch a stale replacement erase A, or stop at an If-Match boundary.",
    scenarios: Object.freeze({ guarded: "If-Match / prevent lost update", blind: "No guard / overwrite A", weak: "Weak tag / cannot match", missing: "Required header / missing" }),
    limit: "One selected representation, synthetic strong tags, serialized editor actions. Real systems must compare the version and write atomically. ETags are opaque, not always hashes.",
  }),
});

function requestText(method, path, body = null, headers = {}) {
  return [`${method} ${path} HTTP/1.1`, "Host: learn.example", "Accept: application/json",
    ...(body === null ? [] : ["Content-Type: application/json"]), ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
    ...(body === null ? [] : ["", JSON.stringify(body, null, 2)])].join("\n");
}

function responseText(response) {
  if (!response) return "No HTTP response produced yet.";
  return [`HTTP/1.1 ${response.status} ${reasons[response.status]}`,
    ...Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`),
    ...(response.body === null ? [] : ["Content-Type: application/json", "", JSON.stringify(response.body, null, 2)])].join("\n");
}

function recorder(initial) {
  const frames = [];
  let state = initial;
  return {
    set(next) { state = next; },
    add(title, explanation, active, client, server, request, response, event, decision, delivered = false) {
      frames.push({ title, explanation, active, client, server, snapshot: copy(state), storage: JSON.stringify(state, null, 2),
        request, response: responseText(response), status: response?.status ?? null, delivered, event, decision,
        metrics: { orders: state.orders?.length ?? 0, keys: Object.keys(state.keys ?? {}).length, revision: state.revision ?? 0 }, step: frames.length });
    },
    frames,
  };
}

const event = (from, to, label, kind = "normal") => ({ from, to, label, kind });
const decision = (question, branches, selected) => ({ question, branches, selected });

function anatomyTrace(scenario) {
  const choices = {
    read: { method: "GET", path: "/courses/course-101" },
    create: { method: "POST", path: "/courses", body: { title: "REST Studio", seats: 20 } },
    replace: { method: "PUT", path: "/courses/course-101", body: { title: "REST Studio", seats: 20 } },
    patch: { method: "PATCH", path: "/courses/course-101", body: { seats: 20 } },
    remove: { method: "DELETE", path: "/courses/course-101" },
    invalid: { method: "POST", path: "/courses", body: { title: "", seats: -1 } },
    missing: { method: "GET", path: "/courses/course-999" },
  };
  const spec = choices[scenario];
  const request = requestText(spec.method, spec.path, spec.body);
  const before = initialCourses();
  const result = applyCourseRequest(before, spec);
  const trace = recorder(before);
  const branch = result.response.status === 400 ? "Invalid / 400" : result.response.status === 404 ? "Missing / 404" : "Valid / execute";
  const tree = decision("Can this request proceed?", ["Invalid / 400", "Missing / 404", "Valid / execute"], branch);
  trace.add("Compose the contract", "The path names a resource. The method defines the requested semantics. Headers describe the representation; the blank line separates headers from a body.", "client", "Draft request; no result known", "Idle", request, null, event("client", "client", "compose"), tree);
  trace.add("Cross the API boundary", "These are readable HTTP/1.1 teaching transcripts, not browser network traffic. GET has no body here; JSON write bodies follow the blank line.", "request", "Waiting for response", `${spec.method} ${spec.path} arriving`, request, null, event("client", "server", spec.method), tree);
  trace.add("Route and validate", "This fictional API validates title and seats before creating or replacing a course. Resource existence is checked for item requests. Failure must not mutate storage.", "server", "Still waiting", result.response.status >= 400 ? branch : "Valid request; prepare storage operation", request, null, event("server", "storage", "validate / lookup"), tree);
  trace.set(result.state);
  trace.add(result.response.status >= 400 ? "Reject without a write" : spec.method === "GET" ? "Read a representation" : "Apply one storage operation",
    result.response.status >= 400 ? "400 means this body fails the declared contract; 404 means there is no matching course. Both leave the before-snapshot intact." :
      spec.method === "GET" ? "A read returns a copy. It does not enroll anyone or change seats." :
        spec.method === "POST" ? "The server allocates course-102 and returns Location. Repeating this POST would create another resource." :
          spec.method === "PUT" ? "PUT supplies both writable fields. It replaces the course representation, while the server-owned ID is preserved." :
            spec.method === "PATCH" ? "This API assigns seats=20 and preserves title. Repeating this assignment has the same intended effect; increment-style PATCH need not." :
              "DELETE removes the course mapping. A later DELETE may return 404; that different reply does not undo method idempotency.",
    "storage", "Does not yet know the outcome", `${result.response.status} ready, not delivered`, request, null, event("storage", "server", "snapshot"), tree);
  trace.add("Return the status and representation", result.response.status === 204 ? "204 is success with no content, not a synonym for deletion. There is deliberately no JSON body." : "Read the status, headers, and body together. A 201 reply identifies the created resource; errors carry a useful explanation in this API.",
    "response", "Response in flight", `Produced ${result.response.status}`, request, result.response, event("server", "client", `${result.response.status}`), tree);
  trace.add("Separate effect from knowledge", "The received reply makes the outcome known to the client. Storage changed only if the requested write was valid; switching scenarios resets the entire example.",
    "client", `Received ${result.response.status}; ${result.response.status >= 400 ? "show the error" : "render the result"}`, "Completed", request, result.response, event("client", "client", "known outcome"), tree, true);
  return trace.frames;
}

function retryTrace(scenario) {
  const key = scenario === "duplicate" ? null : "enroll-7";
  const payload = { courseId: "course-101", learnerId: "learner-7" };
  const headers = key === null ? {} : { "Idempotency-Key": key };
  const request = requestText("POST", "/orders", payload, headers);
  const before = initialOrders();
  const first = submitOrder(before, payload, key, { commit: scenario !== "rollback" });
  const retriedPayload = scenario === "mismatch" ? { ...payload, courseId: "course-202" } : payload;
  const retryRequest = requestText("POST", "/orders", retriedPayload, headers);
  const second = submitOrder(first.state, retriedPayload, key);
  const trace = recorder(before);
  const tree = decision("Retry's persisted key lookup", ["Absent / create", "Match / replay", "Mismatch / 409"],
    scenario === "mismatch" ? "Mismatch / 409" : scenario === "protected" ? "Match / replay" : "Absent / create");
  trace.add("One intent: reserve a course order", "The learner requests a fictional enrollment order. No charge, bank, or external provider exists in this example.", "client", "Wants one order; no result known", "Idle", request, null, event("client", "client", "one intent"), null);
  trace.add("First attempt arrives", key === null ? "Without a key, each POST is a separate create command. The server has no retry identity to look up." : "The key is scoped to learner-7 and POST /orders. A canonical fingerprint binds the two semantic body fields, independent of JSON property order.", "request", "Waiting on attempt 1", key === null ? "No replay contract" : "Key absent; enter modeled transaction", request, null, event("client", "server", "attempt 1"), null);
  trace.set(first.state);
  trace.add(scenario === "rollback" ? "Crash before commit: neither record exists" : "Atomic commit: effect and result together",
    scenario === "rollback" ? "The modeled transaction aborts before commit. There is no order and no replay entry. A retry can create the first order." :
      key === null ? "order-1 is stored. The 201 response exists on the server, but the client has not received it." :
        "order-1 and the key/fingerprint/201 result commit together. There is no modeled state with a committed order but a missing key.",
    "storage", "Still waiting; cannot see storage", scenario === "rollback" ? "Transaction aborted; no response" : "Committed; 201 ready", request, first.response, event("server", "storage", scenario === "rollback" ? "abort" : "commit", scenario === "rollback" ? "failure" : "normal"), null);
  trace.add(scenario === "rollback" ? "No reply reaches the learner" : "Drop the response, not the order",
    "A timeout is an observation about waiting, not a verdict on the server. Inspect the storage snapshot: this selected story tells us what really happened, while the learner cannot infer it.",
    "lost", "Timed out; outcome UNKNOWN", scenario === "rollback" ? "No committed work" : "Committed work; response lost", request, first.response, event("server", "client", "no delivery", "failure"), null);
  trace.add("Retry crosses the same boundary", scenario === "mismatch" ? "The retry wrongly reuses enroll-7 for course-202. The key must not silently return course-101 as if it fulfilled this different intent." : "The client retries after an unknown outcome. A new key would be a new intent, not a replay of the first one.", "request", "Waiting on attempt 2", "Inspect persisted key and payload", retryRequest, null, event("client", "server", "attempt 2"), tree);
  trace.set(second.state);
  trace.add(second.replayed ? "Replay the stored response" : second.response.status === 409 ? "Reject the conflicting intent" : "Commit a new order",
    second.replayed ? "The same key and semantic payload return the original status, Location, and body. There is still only one order." :
      second.response.status === 409 ? "409 is this API's documented key-mismatch policy. The existing order and key record remain unchanged." :
        scenario === "rollback" ? "The aborted attempt left nothing behind, so this retry commits order-1 and its replay entry." : "The server creates order-2. A timeout plus an unprotected POST has duplicated the intended effect.",
    "storage", "Does not yet know retry outcome", second.replayed ? "Persisted result reused" : `Produced ${second.response.status}`, retryRequest, second.response, event("storage", "server", second.replayed ? "replay" : second.response.status === 409 ? "reject" : "commit"), tree);
  trace.add("Deliver attempt 2", "A stored result only resolves uncertainty when the reply is eventually received. A received conflict is a known error, unlike a timeout.",
    "response", "Retry response in flight", `Sent ${second.response.status}`, retryRequest, second.response, event("server", "client", String(second.response.status)), tree);
  trace.add("Count effects, not packets", `${second.state.orders.length} order(s), ${Object.keys(second.state.keys).length} replay record(s). The model assumes one atomic local commit. It does not prove exactly-once behavior for an external payment or arbitrary distributed workflow.`,
    "client", `Received ${second.response.status}; ${second.response.status === 409 ? "resolve key misuse" : "order result known"}`, "Completed", retryRequest, second.response, event("client", "client", "known outcome"), tree, true);
  return trace.frames;
}

function etagTrace(scenario) {
  const before = initialDocument();
  const originalTag = courseTag(before);
  const a = updateCourse(before, { title: "REST Studio", seats: 30 }, originalTag);
  const header = scenario === "blind" || scenario === "missing" ? null : scenario === "weak" ? `W/${originalTag}` : originalTag;
  const bBody = { title: "API Fundamentals", seats: 24 };
  const b = updateCourse(a.state, bBody, header, { requireMatch: scenario !== "blind" });
  const bRequest = requestText("PUT", "/courses/course-101", bBody, header === null ? {} : { "If-Match": header });
  const readRequest = requestText("GET", "/courses/course-101");
  const readResponse = reply(200, { id: before.id, title: before.title, seats: before.seats }, { ETag: originalTag });
  const trace = recorder(before);
  const tree = decision("Does B's precondition allow a write?", ["No guard / overwrite", "Strong match / write", "Missing or stale / reject"],
    scenario === "blind" ? "No guard / overwrite" : "Missing or stale / reject");
  trace.add("Both editors read version 1", "A and B independently receive the same course and quoted strong ETag. B's local copy still includes the original title.", "client", `A and B: title=API Fundamentals, seats=30, tag=${originalTag}`, "Served the selected representation", readRequest, readResponse, event("server", "client", "both read v1"), null, true);
  trace.add("A submits the new title", "A sends a complete writable representation with If-Match v1. The server must compare and write inside one atomic boundary, not check then write later.", "request", "A saving title; B still holds v1", "Strong tag matches v1", requestText("PUT", "/courses/course-101", { title: "REST Studio", seats: 30 }, { "If-Match": originalTag }), null, event("client", "server", "A / If-Match v1"), null);
  trace.set(a.state);
  trace.add("A commits version 2", "The title is now REST Studio. A gets the new ETag. B has not fetched this representation, so B still has v1 and the old title.", "storage", `A knows v2; B still holds ${originalTag}`, "Committed A; current tag is v2", requestText("PUT", "/courses/course-101", { title: "REST Studio", seats: 30 }, { "If-Match": originalTag }), a.response, event("server", "storage", "commit v2"), null, true);
  trace.add("B saves seats from the stale copy", scenario === "blind" ? "B sends seats=24 AND the old title without a guard. This blind-write API variant accepts stale replacements." :
    scenario === "missing" ? "B omits If-Match. This API explicitly requires a guard and will respond 428; that requirement is a policy, not universal HTTP behavior." :
      scenario === "weak" ? "A weak tag describes semantic equivalence, not the byte-level strong identity required by If-Match. It cannot pass a strong comparison." :
        "B sends If-Match v1, but storage is v2. Repeating B's PUT may be idempotent, yet it is not safe against someone else's intervening update.",
    "request", "B intends only seats=24, but sends old title too", "Evaluate B's precondition", bRequest, null, event("client", "server", "B / stale PUT"), tree);
  trace.set(b.state);
  trace.add(scenario === "blind" ? "Lost update: A's title disappears" : `Stop before the write: ${b.response.status}`,
    scenario === "blind" ? "The entire replacement is accepted. Seats become 24, but the title reverts to API Fundamentals. Idempotency alone did not protect A." :
      "The compare-and-write boundary rejects B without changing the document or revision. 412 reports a failed precondition; 428 reports a required but absent guard.",
    scenario === "blind" ? "storage" : "server", scenario === "blind" ? "B receives 200; A's change lost" : `B receives ${b.response.status}; must resolve`, `Produced ${b.response.status}`, bRequest, b.response, event("server", scenario === "blind" ? "storage" : "client", scenario === "blind" ? "overwrite v3" : "reject, no write", scenario === "blind" ? "failure" : "normal"), tree, true);
  if (scenario !== "blind") {
    const latest = a.state;
    const getLatest = reply(200, { id: latest.id, title: latest.title, seats: latest.seats }, { ETag: courseTag(latest) });
    trace.add("Fetch and review the current representation", "B fetches v2, sees A's title, and explicitly chooses to preserve it while setting seats=24. A real merge needs user or domain rules; do not blindly retry the stale body with a new tag.",
      "response", "B now holds v2; reviews the merge", "Served current document and ETag", readRequest, getLatest, event("server", "client", "B / fetch v2"), tree, true);
    const merged = { title: latest.title, seats: 24 };
    const final = updateCourse(latest, merged, courseTag(latest));
    const mergeRequest = requestText("PUT", "/courses/course-101", merged, { "If-Match": courseTag(latest) });
    trace.add("Submit the reviewed merge with v2", "The new precondition matches the current version. If another editor changed it again, the server would reject again instead of trusting the earlier read.",
      "request", "B requests reviewed title + seats", "Strong match / prepare atomic write", mergeRequest, null, event("client", "server", "B / If-Match v2"), decision("Does B's precondition allow a write?", tree.branches, "Strong match / write"));
    trace.set(final.state);
    trace.add("Version 3 preserves both intended changes", "REST Studio + 24 seats. Retry keys identify repeated commands; If-Match checks representation freshness. They solve different problems and can be combined in a documented API contract.",
      "storage", "A's title preserved; B receives v3", "Atomic update completed", mergeRequest, final.response, event("server", "storage", "merged v3"), decision("Does B's precondition allow a write?", tree.branches, "Strong match / write"), true);
  } else {
    trace.add("A 200 does not mean everyone wins", "The server fulfilled B's unguarded request, but A's intent was lost. Compare the guarded scenario: a conflict followed by an explicit merge preserves both changes.",
      "client", "B sees 200; A's title was overwritten", "Completed blind replacement", bRequest, b.response, event("server", "client", "200 / lost update"), tree, true);
  }
  return trace.frames;
}

export function lessonTrace(lesson, scenario = undefined) {
  if (!owns(lessons, lesson)) throw new RangeError("Unknown REST lesson");
  const selected = scenario ?? Object.keys(lessons[lesson].scenarios)[0];
  if (!owns(lessons[lesson].scenarios, selected)) throw new RangeError("Unknown REST scenario");
  return ({ anatomy: anatomyTrace, retry: retryTrace, etag: etagTrace })[lesson](selected);
}

export function lessonFrame(lesson, scenario, step) {
  if (!Number.isSafeInteger(step)) throw new TypeError("Step must be a finite safe integer");
  const frames = lessonTrace(lesson, scenario);
  return frames[Math.max(0, Math.min(step, frames.length - 1))];
}
