import { designResources, designResource, designScenarios, designStages, designTrace, designCheck, evaluateDesignAnswer } from "./rest-design-models.mjs";

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
let instance = 0;

export class RestDesign extends (globalThis.HTMLElement ?? class {}) {
  connectedCallback() {
    if (this.lifecycle) return;
    const mount = this.querySelector("[data-rd-enhancement]");
    if (!mount) {
      if (!this.querySelector("[data-rd-error]")) {
        const error = document.createElement("p");
        error.dataset.rdError = "";
        error.setAttribute("role", "alert");
        error.textContent = "The design controls could not load: the enhancement slot is missing. Use the static endpoint reference.";
        this.prepend(error);
      }
      return;
    }
    this.uid = `rest-design-${++instance}`;
    this.classList.add("rest-design");
    this.scenario = "choose";
    this.resource = "courses";
    this.step = 0;
    this.frames = designTrace(this.scenario);
    this.lifecycle = new AbortController();
    this.render(mount);
    const options = { signal: this.lifecycle.signal };
    this.addEventListener("click", event => {
      const target = event.target.closest?.("button");
      if (!target || !this.contains(target)) return;
      if (target.hasAttribute("data-rd-action")) this.act(target.dataset.rdAction);
      else if (target.hasAttribute("data-rd-step")) this.go(Number(target.dataset.rdStep));
      else if (target.hasAttribute("data-rd-resource")) {
        this.resource = target.dataset.rdResource;
        this.updateResource();
      } else if (target.hasAttribute("data-rd-check")) {
        const result = evaluateDesignAnswer(this.querySelector("[data-rd-answer]").value);
        this.text("[data-rd-feedback]", result.explanation);
        this.querySelector("[data-rd-feedback]").dataset.correct = String(result.correct);
      }
    }, options);
    this.addEventListener("change", event => {
      if (!event.target.matches?.("[data-rd-scenario]")) return;
      this.scenario = event.target.value;
      this.frames = designTrace(this.scenario);
      this.step = 0;
      this.update();
    }, options);
    this.addEventListener("keydown", event => {
      if (!event.target.closest?.("[data-rd-controls], [data-rd-stages]")) return;
      const action = { ArrowLeft: "previous", ArrowRight: "next", Home: "reset" }[event.key];
      if (!action) return;
      event.preventDefault();
      this.act(action);
    }, options);
    this.updateResource();
    this.update();
  }

  disconnectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = null;
  }

  render(mount) {
    mount.innerHTML = `<div class="rd-workbench" data-rd-ui>
      <div class="rd-vocabulary"><p class="rd-kicker">EXPLORE THE RESOURCE TREE</p>
        <div class="rd-resource-buttons" role="group" aria-label="Explore learning-platform resources">
          ${Object.entries(designResources).map(([id, resource]) => `<button type="button" data-rd-resource="${id}" aria-pressed="${id === "courses"}">${resource.label}</button>`).join("")}
        </div>
        <p class="rd-resource-note" data-rd-resource-note aria-live="polite" aria-atomic="true"></p>
        <p class="rd-hint">These buttons explain the vocabulary. The HTTP walkthrough below always targets Courses; related-resource endpoints are not simulated.</p>
      </div>
      <label class="rd-select" for="${this.uid}-scenario">Choose an intent
        <select id="${this.uid}-scenario" data-rd-scenario>${Object.entries(designScenarios).map(([id, choice]) => `<option value="${id}">${escape(choice.label)}</option>`).join("")}</select>
      </label>
      <p class="rd-intent" data-rd-intent></p>
      <ol class="rd-stages" data-rd-stages aria-label="Intent to visible state">
        ${designStages.map((stage, step) => `<li><button type="button" data-rd-step="${step}"><span>0${step + 1}</span>${stage.label}</button></li>`).join("")}
      </ol>
      <svg class="rd-flow" viewBox="0 0 600 56" aria-hidden="true" focusable="false">
        <path d="M60 28H540"/><path d="m165 22 8 6-8 6m120-12 8 6-8 6m120-12 8 6-8 6m120-12 8 6-8 6"/>
        ${designStages.map((stage, step) => `<g data-rd-flow="${step}"><circle cx="${60 + step * 120}" cy="28" r="20"/><text x="${60 + step * 120}" y="33" text-anchor="middle">${step + 1}</text></g>`).join("")}
      </svg>
      <div class="rd-narration" aria-live="polite" aria-atomic="true"><p class="rd-kicker" data-rd-position></p><h4 data-rd-title></h4><p data-rd-explanation></p></div>
      <div class="rd-controls" data-rd-controls role="group" aria-label="Design walkthrough controls">
        <button type="button" data-rd-action="previous">Previous</button><button type="button" data-rd-action="next">Next step</button><button type="button" data-rd-action="reset">Reset intent</button>
      </div>
      <progress data-rd-progress max="${designStages.length}" value="1" aria-label="Design walkthrough progress"></progress>
      <p class="rd-hint">Nothing plays automatically. Tab to any control; Enter / Space activate buttons. On step buttons and navigation controls, Left / Right step and Home resets. Scenario changes and Reset intent start from the original catalogue.</p>
      <div class="rd-contract">
        <section><h4>Client → Course API</h4><pre tabindex="0" aria-label="HTTP request transcript" data-rd-request></pre></section>
        <section><h4>Course API → client</h4><p class="rd-status" data-rd-status></p><pre tabindex="0" aria-label="HTTP response transcript" data-rd-response></pre></section>
      </div>
      <div class="rd-state">
        <section><h4>Starting catalogue</h4><div data-rd-before></div></section>
        <section><h4>What the client shows now</h4><div data-rd-visible></div></section>
      </div>
      <p class="rd-visibility" data-rd-visibility></p>
      <details class="rd-snapshot"><summary>Inspect simulated storage at this step</summary><pre tabindex="0" data-rd-snapshot></pre></details>
      <div class="rd-check"><h4>Try the mental model</h4>
        <label for="${this.uid}-answer">${designCheck.question}</label>
        <select id="${this.uid}-answer" data-rd-answer>${Object.entries(designCheck.options).map(([id, text]) => `<option value="${id}">${escape(text)}</option>`).join("")}</select>
        <button type="button" data-rd-check>Check answer</button><p data-rd-feedback aria-live="polite" aria-atomic="true">Choose an answer, then check it. No score is stored.</p>
      </div>
      <p class="rd-limit"><strong>Model boundary:</strong> deterministic, local teaching snapshots, not real HTTP. Each intent starts with course-101 / API Fundamentals / 30 seats. POST creates course-102 / REST Studio / 20 seats. PATCH uses the studio's JSON field-assignment contract. No backend, authentication, cascading deletes, payment, dependencies, or data storage. Reduced-motion users get the same manual controls; there is no playback.</p>
    </div>`;
  }

  act(action) {
    if (action === "previous") this.go(this.step - 1);
    else if (action === "next") this.go(this.step + 1);
    else if (action === "reset") {
      this.querySelector("[data-rd-answer]").value = "read";
      this.text("[data-rd-feedback]", "Choose an answer, then check it. No score is stored.");
      this.querySelector("[data-rd-feedback]").removeAttribute("data-correct");
      this.go(0);
    } else throw new RangeError(`Unknown design action: ${action}`);
  }

  go(step) {
    if (!Number.isSafeInteger(step)) throw new TypeError("Design step must be a safe integer");
    this.step = Math.max(0, Math.min(this.frames.length - 1, step));
    this.update();
  }

  text(selector, value) {
    this.querySelector(selector).textContent = value;
  }

  updateResource() {
    const resource = designResource(this.resource);
    this.text("[data-rd-resource-note]", `${resource.label}: ${resource.description} ${resource.connection}`);
    for (const button of this.querySelectorAll("[data-rd-resource]")) {
      button.setAttribute("aria-pressed", String(button.dataset.rdResource === this.resource));
    }
  }

  catalogue(selector, courses) {
    this.querySelector(selector).innerHTML = courses.length
      ? courses.map(course => `<article class="rd-course"><span>${escape(course.id)}</span><strong>${escape(course.title)}</strong><p>${course.seats} seats</p></article>`).join("")
      : '<p class="rd-empty">No courses in this catalogue snapshot.</p>';
  }

  update() {
    const frame = this.frames[this.step];
    this.text("[data-rd-intent]", designScenarios[this.scenario].intent);
    this.text("[data-rd-position]", `STEP ${this.step + 1} / ${this.frames.length}`);
    this.text("[data-rd-title]", frame.title);
    this.text("[data-rd-explanation]", frame.explanation);
    this.text("[data-rd-request]", frame.request);
    this.text("[data-rd-response]", frame.response);
    this.text("[data-rd-status]", frame.status === null ? "No HTTP status yet" : `${frame.status} ${reasonsForStatus(frame.status)} / ${frame.delivered ? "client received" : "reply produced, not received yet"}`);
    this.text("[data-rd-visibility]", frame.visibility);
    this.text("[data-rd-snapshot]", JSON.stringify(frame.snapshot, null, 2));
    this.catalogue("[data-rd-before]", frame.before.courses);
    this.catalogue("[data-rd-visible]", frame.visible.courses);
    for (const button of this.querySelectorAll("[data-rd-step]")) {
      if (Number(button.dataset.rdStep) === this.step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    for (const node of this.querySelectorAll("[data-rd-flow]")) node.dataset.active = String(Number(node.dataset.rdFlow) === this.step);
    this.querySelector('[data-rd-action="previous"]').disabled = this.step === 0;
    this.querySelector('[data-rd-action="next"]').disabled = this.step === this.frames.length - 1;
    this.querySelector("[data-rd-progress]").value = this.step + 1;
  }
}

function reasonsForStatus(status) {
  const reasons = { 200: "OK", 201: "Created", 204: "No Content" };
  if (!Object.hasOwn(reasons, status)) throw new RangeError(`Unexpected design status: ${status}`);
  return reasons[status];
}

if (globalThis.customElements && !customElements.get("rest-design")) customElements.define("rest-design", RestDesign);
