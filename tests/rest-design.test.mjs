import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initialCourses, applyCourseRequest } from "../assets/rest-models.mjs";
import { designResources, designResource, designStages, designScenarios, designTrace, designFrame, designCheck, evaluateDesignAnswer } from "../assets/rest-design-models.mjs";
import { RestDesign } from "../assets/rest-design.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const expected = { choose: null, collection: 200, read: 200, create: 201, patch: 200, delete: 204 };

for (const [scenario, status] of Object.entries(expected)) {
  test(`${scenario}: five deterministic stages separate intent, storage, and visible state`, () => {
    const frames = designTrace(scenario);
    const reference = clone(frames);
    assert.equal(frames.length, 5);
    assert.deepEqual(frames, designTrace(scenario));
    assert.deepEqual(frames.map(frame => frame.stage), ["intent", "resource", "request", "response", "visible"]);
    for (const [index, frame] of frames.entries()) {
      assert.equal(frame.step, index);
      assert.equal(frame.title, designStages[index].label);
      for (const field of ["explanation", "request", "response", "visibility", "target"]) {
        assert.equal(typeof frame[field], "string");
        assert.ok(frame[field].length > 0);
      }
      assert.deepEqual(frame.before, initialCourses());
      if (index < 3) {
        assert.equal(frame.status, null);
        assert.deepEqual(frame.snapshot, initialCourses());
      }
      if (index < 4) {
        assert.equal(frame.delivered, false);
        assert.deepEqual(frame.visible, initialCourses());
      }
    }
    assert.equal(frames[3].status, status);
    assert.equal(frames[4].status, status);
    assert.equal(frames[4].delivered, scenario !== "choose");
    assert.deepEqual(frames[4].visible, frames[3].snapshot);
    assert.match(frames[0].request, /Not composed yet/);
    assert.match(frames[2].response, /No response produced yet/);
    if (status !== null) assert.match(frames[3].response, new RegExp(`^HTTP/1.1 ${status}`));
    frames[0].snapshot.courses[0].title = "Tampered";
    frames[3].visible.courses[0].title = "Tampered client";
    frames[4].before.courses.length = 0;
    assert.deepEqual(designTrace(scenario), reference);
    assert.deepEqual(frames[1].snapshot, initialCourses());
    assert.deepEqual(frames[0].before, initialCourses());
    assert.deepEqual(designTrace(scenario)[0].snapshot, initialCourses());
  });
}

test("resource choice does not fabricate an HTTP request, response, or storage write", () => {
  assert.deepEqual(designTrace(), designTrace("choose"));
  for (const frame of designTrace("choose")) {
    assert.equal(frame.method, null);
    assert.equal(frame.status, null);
    assert.equal(frame.delivered, false);
    assert.deepEqual(frame.snapshot, initialCourses());
  }
  assert.match(designTrace("choose")[2].request, /No HTTP request/);
  assert.match(designTrace("choose")[3].response, /No HTTP response/);
});

test("collection returns an array; item returns exactly the studio's course representation", () => {
  const collection = designTrace("collection").at(-1);
  const read = designTrace("read").at(-1);
  const body = response => JSON.parse(response.split("\n\n")[1]);
  assert.equal(collection.target, "/courses");
  assert.deepEqual(body(collection.response), initialCourses().courses);
  assert.equal(read.target, "/courses/course-101");
  assert.deepEqual(body(read.response), initialCourses().courses[0]);
  for (const frame of [collection, read]) {
    assert.deepEqual(frame.snapshot, initialCourses());
    assert.doesNotMatch(frame.request, /Content-Type/);
    assert.match(frame.request, /Host: learn\.example\nAccept: application\/json$/);
  }
});

test("writes reuse the studio contract and preserve exact IDs, fields, status, and headers", () => {
  for (const scenario of ["read", "create", "patch", "delete"]) {
    const result = applyCourseRequest(initialCourses(), designScenarios[scenario].request);
    const frame = designTrace(scenario).at(-1);
    assert.deepEqual(frame.snapshot, result.state);
    assert.equal(frame.status, result.response.status);
  }
  const created = designTrace("create").at(-1);
  assert.deepEqual(created.snapshot, {
    courses: [
      { id: "course-101", title: "API Fundamentals", seats: 30 },
      { id: "course-102", title: "REST Studio", seats: 20 },
    ], nextId: 103,
  });
  assert.match(created.request, /^POST \/courses HTTP\/1\.1/);
  assert.match(created.request, /Content-Type: application\/json\n\n\{/);
  assert.match(created.response, /^HTTP\/1\.1 201 Created\nLocation: \/courses\/course-102\nContent-Type: application\/json/);
  const patched = designTrace("patch").at(-1);
  assert.deepEqual(patched.snapshot.courses, [{ id: "course-101", title: "API Fundamentals", seats: 20 }]);
  assert.match(patched.request, /^PATCH \/courses\/course-101 HTTP\/1\.1/);
  assert.deepEqual(JSON.parse(patched.request.split("\n\n")[1]), { seats: 20 });
  const removed = designTrace("delete").at(-1);
  assert.deepEqual(removed.snapshot, { courses: [], nextId: 102 });
  assert.equal(removed.response, "HTTP/1.1 204 No Content");
  assert.doesNotMatch(removed.request, /Content-Type/);
});

test("navigation clamps ends and rejects unknown scenarios, resources, and invalid steps", () => {
  for (const scenario of Object.keys(designScenarios)) {
    assert.deepEqual(designFrame(scenario, -100), designTrace(scenario)[0]);
    assert.deepEqual(designFrame(scenario, 100), designTrace(scenario).at(-1));
    for (let step = 0; step < 5; step++) assert.deepEqual(designFrame(scenario, step), designTrace(scenario)[step]);
  }
  for (const value of ["unknown", "__proto__", "constructor", null]) {
    assert.throws(() => designTrace(value), RangeError);
    assert.throws(() => designResource(value), RangeError);
    assert.throws(() => evaluateDesignAnswer(value), RangeError);
  }
  for (const step of [NaN, Infinity, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => designFrame("read", step), TypeError);
  }
});

test("resources and self-check retain the whole platform vocabulary without inventing writes", () => {
  assert.deepEqual(Object.values(designResources).map(resource => resource.label), ["Users", "Courses", "Progress", "Certificates"]);
  for (const [id, resource] of Object.entries(designResources)) {
    assert.equal(designResource(id), resource);
    assert.ok(resource.description.length > 10);
    assert.ok(resource.connection.length > 10);
    assert.ok(Object.isFrozen(resource));
  }
  assert.match(designResources.users.description, /learner-7/);
  assert.match(designResources.courses.connection, /course-102/);
  assert.ok(Object.isFrozen(designScenarios.patch.request.body));
  const before = clone(designScenarios);
  for (const answer of Object.keys(designCheck.options)) {
    const result = evaluateDesignAnswer(answer);
    assert.equal(result.correct, answer === "patch");
    assert.ok(result.explanation.length > 20);
  }
  assert.deepEqual(designScenarios, before);
});

class NodeStub {
  constructor(dataset = {}) {
    this.dataset = { ...dataset };
    this.attributes = new Map();
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.disabled = false;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "data-correct") delete this.dataset.correct;
  }
  hasAttribute(name) {
    return this.attributes.has(name) || Object.hasOwn(this.dataset, name.replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()));
  }
  closest(selector) {
    if (selector === "button" && this.button) return this;
    if (selector === "[data-rd-controls], [data-rd-stages]" && this.navigation) return this;
    return null;
  }
  matches(selector) {
    return selector === "[data-rd-scenario]" && Object.hasOwn(this.dataset, "rdScenario");
  }
}

function controllerFixture() {
  const host = Object.create(RestDesign.prototype);
  const nodes = new Map();
  const selectors = ["[data-rd-enhancement]", "[data-rd-answer]", "[data-rd-feedback]", "[data-rd-scenario]",
    "[data-rd-intent]", "[data-rd-position]", "[data-rd-title]", "[data-rd-explanation]",
    "[data-rd-request]", "[data-rd-response]", "[data-rd-status]", "[data-rd-visibility]",
    "[data-rd-snapshot]", "[data-rd-before]", "[data-rd-visible]", "[data-rd-resource-note]", "[data-rd-progress]",
    '[data-rd-action="previous"]', '[data-rd-action="next"]'];
  for (const selector of selectors) nodes.set(selector, new NodeStub());
  nodes.get("[data-rd-answer]").value = "read";
  const steps = designStages.map((_, step) => new NodeStub({ rdStep: String(step) }));
  const flows = designStages.map((_, step) => new NodeStub({ rdFlow: String(step) }));
  const resources = Object.keys(designResources).map(id => new NodeStub({ rdResource: id }));
  const lists = { "[data-rd-step]": steps, "[data-rd-flow]": flows, "[data-rd-resource]": resources };
  const listeners = [];
  const fallback = { innerHTML: "Original five endpoint examples and mental model" };
  host.querySelector = selector => nodes.get(selector) ?? null;
  host.querySelectorAll = selector => lists[selector] ?? [];
  host.classList = { add() {} };
  host.contains = () => true;
  host.addEventListener = (type, callback, options) => listeners.push({ type, callback, signal: options.signal });
  const emit = (type, target, extra = {}) => {
    for (const listener of listeners) {
      if (listener.type === type && !listener.signal.aborted) listener.callback({ target, ...extra });
    }
  };
  host.connectedCallback();
  return { host, nodes, steps, flows, resources, listeners, fallback, emit };
}

test("controller enhances only its slot, keeps controls native, and initializes once", () => {
  const fixture = controllerFixture();
  const { host, nodes, listeners, fallback } = fixture;
  assert.equal(host.step, 0);
  assert.equal(host.scenario, "choose");
  assert.equal(listeners.length, 3);
  host.connectedCallback();
  assert.equal(listeners.length, 3);
  assert.match(nodes.get("[data-rd-enhancement]").innerHTML, /data-rd-ui/);
  assert.match(nodes.get("[data-rd-enhancement]").innerHTML, /type="button" data-rd-action="next"/);
  assert.match(nodes.get("[data-rd-enhancement]").innerHTML, /aria-label="Intent to visible state"/);
  assert.equal(fallback.innerHTML, "Original five endpoint examples and mental model");
  assert.equal(nodes.get('[data-rd-action="previous"]').disabled, true);
  assert.equal(nodes.get('[data-rd-action="next"]').disabled, false);
  assert.equal(nodes.get("[data-rd-progress]").value, 1);
});

test("all scenarios render exact final transcripts, storage, and visible cards in the controller", () => {
  const { host, nodes, emit } = controllerFixture();
  for (const scenario of Object.keys(designScenarios)) {
    emit("change", Object.assign(new NodeStub({ rdScenario: "" }), { value: scenario }));
    assert.equal(host.scenario, scenario);
    assert.equal(host.step, 0);
    host.go(4);
    const frame = designTrace(scenario).at(-1);
    assert.equal(nodes.get("[data-rd-response]").textContent, frame.response);
    assert.equal(nodes.get("[data-rd-request]").textContent, frame.request);
    assert.deepEqual(JSON.parse(nodes.get("[data-rd-snapshot]").textContent), frame.snapshot);
    const cards = nodes.get("[data-rd-visible]").innerHTML;
    assert.equal((cards.match(/class="rd-course"/g) ?? []).length, frame.visible.courses.length);
    for (const course of frame.visible.courses) {
      assert.ok(cards.includes(course.id));
      assert.ok(cards.includes(course.title));
      assert.ok(cards.includes(`${course.seats} seats`));
    }
    assert.equal(nodes.get('[data-rd-action="next"]').disabled, true);
  }
});

test("navigation, keyboard scope, resource controls, self-check, reset, and reconnect work", () => {
  const { host, nodes, steps, flows, resources, listeners, emit } = controllerFixture();
  const next = Object.assign(new NodeStub({ rdAction: "next" }), { button: true });
  emit("click", next);
  assert.equal(host.step, 1);
  const stepButton = Object.assign(steps[3], { button: true, navigation: true });
  emit("click", stepButton);
  assert.equal(host.step, 3);
  assert.equal(steps[3].attributes.get("aria-current"), "step");
  assert.equal(flows[3].dataset.active, "true");
  let prevented = 0;
  emit("keydown", stepButton, { key: "ArrowRight", preventDefault: () => prevented++ });
  assert.equal(host.step, 4);
  emit("keydown", stepButton, { key: "ArrowRight", preventDefault: () => prevented++ });
  assert.equal(host.step, 4);
  emit("keydown", new NodeStub(), { key: "Home", preventDefault: () => prevented++ });
  assert.equal(host.step, 4);
  assert.equal(prevented, 2);
  emit("keydown", stepButton, { key: "Home", preventDefault: () => prevented++ });
  assert.equal(host.step, 0);
  emit("click", Object.assign(resources[0], { button: true }));
  assert.equal(host.resource, "users");
  assert.match(nodes.get("[data-rd-resource-note]").textContent, /learner-7/);
  assert.equal(resources[0].attributes.get("aria-pressed"), "true");
  assert.equal(host.scenario, "choose");
  for (const answer of Object.keys(designCheck.options)) {
    nodes.get("[data-rd-answer]").value = answer;
    emit("click", Object.assign(new NodeStub({ rdCheck: "" }), { button: true }));
    assert.equal(nodes.get("[data-rd-feedback]").textContent, evaluateDesignAnswer(answer).explanation);
    assert.equal(nodes.get("[data-rd-feedback]").dataset.correct, String(answer === "patch"));
  }
  host.act("reset");
  assert.equal(nodes.get("[data-rd-answer]").value, "read");
  assert.equal(nodes.get("[data-rd-feedback]").dataset.correct, undefined);
  assert.throws(() => host.act("unknown"), RangeError);
  assert.throws(() => host.go(0.5), TypeError);
  host.disconnectedCallback();
  assert.ok(listeners.every(listener => listener.signal.aborted));
  emit("click", next);
  assert.equal(host.step, 0);
  host.connectedCallback();
  emit("click", next);
  assert.equal(host.step, 1);
  host.disconnectedCallback();
});

test("course cards escape text, including hostile titles, rather than interpreting markup", () => {
  const { host, nodes } = controllerFixture();
  host.catalogue("[data-rd-visible]", [{ id: 'course-"1', title: "<img src=x onerror=alert(1)>", seats: 20 }]);
  const html = nodes.get("[data-rd-visible]").innerHTML;
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /course-&quot;1/);
});

test("documentation keeps anchors, all five static examples, principles, and existing studios", async () => {
  const source = await readFile(new URL("../docs/01-REST-APIS.md", import.meta.url), "utf8");
  assert.deepEqual(source.match(/^# Part [1-6]: .+$/gm), [
    "# Part 1: What is REST?",
    "# Part 2: Request, Response, Status Codes, JSON",
    "# Part 3: Real-World REST API Design",
    "# Part 4: Idempotency & Distributed Systems",
    "# Part 5: HTTP Caching \u2014 From Zero to Hero",
    "# Part 6: Production REST APIs",
  ]);
  assert.equal((source.match(/^## First REST API Design$/gm) ?? []).length, 1);
  assert.equal((source.match(/^### REST Mental Model$/gm) ?? []).length, 1);
  const section = source.split("## First REST API Design\n")[1].split("### REST Mental Model\n")[0];
  const fallback = section.split('<details class="rd-reference" open>')[1].split("</details>")[0];
  assert.equal((fallback.match(/<tr><td>/g) ?? []).length, 5);
  for (const endpoint of ["GET /courses", "GET /courses/course-101", "POST /courses", "PATCH /courses/course-101", "DELETE /courses/course-101"]) {
    assert.ok(fallback.includes(`<code>${endpoint}</code>`), endpoint);
  }
  for (const resource of ["Users", "Courses", "Progress", "Certificates"]) assert.ok(section.includes(`<strong>${resource}</strong>`));
  assert.ok(section.includes("Resource tree text alternative"));
  assert.ok(section.includes("<div data-rd-enhancement></div>"));
  assert.ok(section.includes("Self-check"));
  assert.ok(source.includes("URL => Resource\n\nMethod => Action\n\nBody => Data\n\nStatus => Result"));
  for (const endpoint of ["POST /users", "DELETE /orders/123", "/getCourseDetails", "/createUser", "/deleteOrder"]) assert.ok(source.includes(endpoint));
  assert.deepEqual([...source.matchAll(/<rest-visual lesson="([^"]+)">/g)].map(match => match[1]), ["anatomy", "retry", "etag"]);
  const lifecycle = source.split("## REST Request-Response Lifecycle\n")[1].split("## Chapter 1: Anatomy of an HTTP Request\n")[0];
  assert.match(lifecycle, /GET \/courses\/course-101/);
  assert.doesNotMatch(lifecycle, /\/posts\/100/);
});

test("new CSS is strictly scoped and the enhancement has no playback, network, or persistence", async () => {
  const [css, controller, models] = await Promise.all([
    readFile(new URL("../assets/rest-design.css", import.meta.url), "utf8"),
    readFile(new URL("../assets/rest-design.mjs", import.meta.url), "utf8"),
    readFile(new URL("../assets/rest-design-models.mjs", import.meta.url), "utf8"),
  ]);
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    assert.ok(selector.startsWith(".rest-design") || selector.startsWith("@media"), selector);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(controller + models, /\b(?:fetch|setInterval|setTimeout|requestAnimationFrame|localStorage|sessionStorage|XMLHttpRequest)\s*(?:\(|\.)/);
  assert.doesNotMatch(controller, /this\.innerHTML\s*=/);
  assert.doesNotMatch(controller, /appendChild|insertBefore|replaceChildren/);
});
