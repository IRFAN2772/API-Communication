import { lessons, lessonTrace } from "./rest-models.mjs";

const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let instance = 0;
const symbols = {
  client: '<rect x="10" y="12" width="44" height="30" rx="4"/><path d="M20 51h24M32 42v9"/>',
  server: '<rect x="12" y="8" width="40" height="48" rx="5"/><path d="M12 24h40M12 40h40M20 16h2M20 32h2M20 48h2M30 16h14M30 32h14M30 48h14"/>',
  storage: '<ellipse cx="32" cy="14" rx="22" ry="8"/><path d="M10 14v34c0 12 44 12 44 0V14M10 30c0 12 44 12 44 0"/>',
};

class RestVisual extends HTMLElement {
  connectedCallback() {
    if (this.lifecycle) return;
    this.kind = this.getAttribute("lesson");
    if (!Object.hasOwn(lessons, this.kind)) {
      const error = document.createElement("p");
      error.setAttribute("role", "alert");
      error.textContent = `REST studio could not load: unknown lesson "${this.kind}". The static lesson below remains available.`;
      this.prepend(error);
      return;
    }
    this.uid = `rest-${++instance}`;
    this.step = 0;
    this.scenario = Object.keys(lessons[this.kind].scenarios)[0];
    this.frames = lessonTrace(this.kind, this.scenario);
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.lifecycle = new AbortController();
    const options = { signal: this.lifecycle.signal };
    this.render();
    this.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (button && this.contains(button)) this.act(button.dataset.action);
    }, options);
    this.addEventListener("change", event => {
      if (!event.target.matches("[data-scenario]")) return;
      this.stop();
      this.scenario = event.target.value;
      this.frames = lessonTrace(this.kind, this.scenario);
      this.step = 0;
      this.update();
    }, options);
    this.addEventListener("keydown", event => {
      if (event.target.closest("select, input, summary, a, pre, .rs-scroll")) return;
      const action = { ArrowLeft: "previous", ArrowRight: "next", Home: "reset" }[event.key];
      if (action) {
        event.preventDefault();
        this.act(action);
      }
      if (event.key === "Escape") this.stop();
    }, options);
    this.motion.addEventListener("change", () => { this.stop(); this.update(); }, options);
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.stop(); }, options);
    window.addEventListener("pagehide", () => this.stop(), options);
    this.update();
  }

  disconnectedCallback() {
    this.stop();
    this.lifecycle?.abort();
    this.lifecycle = null;
  }

  render() {
    const lesson = lessons[this.kind];
    this.classList.add("rest-studio");
    this.setAttribute("role", "region");
    this.setAttribute("aria-labelledby", `${this.uid}-title`);
    this.innerHTML = `<header class="rs-header"><div><span class="rs-kicker">${lesson.eyebrow}</span><h3 id="${this.uid}-title">${lesson.title}</h3><p>${lesson.intro}</p></div><span class="rs-chip">LOCAL MODEL<br>NO NETWORK</span></header>
      <label class="rs-select" for="${this.uid}-scenario">Explore an outcome <select id="${this.uid}-scenario" data-scenario>${Object.entries(lesson.scenarios).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
      <div class="rs-stage" data-depth="true" data-active="client">
        <div class="rs-floor" aria-hidden="true"></div><div class="rs-rail" aria-hidden="true"><span class="rs-packet"></span></div>
        ${["client", "server", "storage"].map((name, index) => `<div class="rs-node" data-node="${name}"><span class="rs-node-number">0${index + 1} / ${name.toUpperCase()}</span><svg viewBox="0 0 64 64" aria-hidden="true" class="rs-icon">${symbols[name]}</svg><strong>${name === "client" && this.kind === "etag" ? "Editors A + B" : name === "client" ? "Learner client" : name === "server" ? "Course API" : "Storage boundary"}</strong><p data-state="${name}"></p></div>`).join("")}
      </div>
      <div class="rs-outcomes"><span data-outcome></span><span data-measure></span></div>
      <div class="rs-narration" aria-live="polite" aria-atomic="true"><span class="rs-kicker" data-step></span><h4 data-title></h4><p data-explanation></p></div>
      <div class="rs-controls" role="group" aria-label="Walkthrough controls">
        <button type="button" data-action="previous">Previous</button><button type="button" data-action="play" aria-pressed="false">Play</button><button type="button" data-action="next">Next step</button><button type="button" data-action="reset">Reset</button><button type="button" data-action="depth" aria-pressed="true">Depth view</button>
      </div><progress data-progress max="${this.frames.length}" value="1" aria-label="Walkthrough progress"></progress>
      <p class="rs-motion" data-motion></p>
      <div class="rs-chart-heading"><h4>Trace the boundary crossings</h4><span>CLIENT / API / STORAGE</span></div>
      <p class="rs-scroll-hint">The timeline records simulated steps, not real latency. On narrow screens, swipe it or focus it and use arrow keys.</p>
      <div class="rs-scroll" tabindex="0" role="region" aria-label="Scrollable HTTP sequence timeline"><div data-timeline></div></div>
      <div class="rs-decision"><h4 data-question></h4><div class="rs-scroll" tabindex="0" role="region" aria-label="Scrollable decision tree" data-tree></div></div>
      <div class="rs-inspect"><section><h4>Request / current attempt</h4><pre tabindex="0" data-request></pre></section><section><h4>Server response / not necessarily delivered</h4><pre tabindex="0" data-response></pre></section></div>
      <details class="rs-snapshot" open><summary>Inspect storage at this step</summary><pre tabindex="0" data-snapshot></pre></details>
      <p class="rs-limit"><strong>Model boundary:</strong> ${lesson.limit} All data resets on scenario changes, Reset, or navigation.</p>`;
  }

  act(action) {
    if (action === "depth") {
      const stage = this.querySelector(".rs-stage");
      const enabled = stage.dataset.depth !== "true";
      stage.dataset.depth = String(enabled);
      this.querySelector('[data-action="depth"]').setAttribute("aria-pressed", String(enabled));
      return;
    }
    if (action === "play") {
      if (this.timer) { this.stop(); return; }
      if (this.motion.matches) return;
      if (this.step === this.frames.length - 1) this.step = 0;
      this.timer = setInterval(() => {
        this.step++;
        if (this.step === this.frames.length - 1) this.stop();
        this.update();
      }, 4200);
      this.update();
      return;
    }
    this.stop();
    if (action === "reset") this.step = 0;
    else if (action === "previous") this.step = Math.max(0, this.step - 1);
    else if (action === "next") this.step = Math.min(this.frames.length - 1, this.step + 1);
    this.update();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    const button = this.querySelector('[data-action="play"]');
    if (button) {
      button.textContent = "Play";
      button.setAttribute("aria-pressed", "false");
    }
  }

  text(selector, value) {
    this.querySelector(selector).textContent = value;
  }

  update() {
    const frame = this.frames[this.step];
    this.text("[data-state=client]", frame.client);
    this.text("[data-state=server]", frame.server);
    const snapshot = frame.snapshot;
    this.text("[data-state=storage]", this.kind === "anatomy"
      ? `${snapshot.courses.length} course(s); ${snapshot.courses.map(course => `${course.id}: ${course.title}, ${course.seats} seats`).join("; ") || "no course record"}`
      : this.kind === "retry" ? `${frame.metrics.orders} order(s) / ${frame.metrics.keys} persisted key(s)`
        : `${snapshot.title} / ${snapshot.seats} seats / v${snapshot.revision}`);
    this.text("[data-outcome]", frame.status === null ? "No response produced yet" : `${frame.status} ${frame.delivered ? "/ client received" : "/ NOT received yet"}`);
    this.querySelector(".rs-outcomes").dataset.error = String(frame.status >= 400 || frame.active === "lost");
    this.text("[data-measure]", this.kind === "retry" ? `Effects: ${frame.metrics.orders} order(s)` : this.kind === "etag" ? `Current revision: ${frame.metrics.revision}` : `Records: ${snapshot.courses.length}`);
    this.text("[data-step]", `STEP ${this.step + 1} / ${this.frames.length}`);
    for (const name of ["title", "explanation", "request", "response"]) this.text(`[data-${name}]`, frame[name]);
    this.text("[data-snapshot]", frame.storage);
    this.querySelector('[data-action="previous"]').disabled = this.step === 0;
    this.querySelector('[data-action="next"]').disabled = this.step === this.frames.length - 1;
    const play = this.querySelector('[data-action="play"]');
    play.disabled = this.motion.matches;
    play.textContent = this.timer ? "Pause" : "Play";
    play.setAttribute("aria-pressed", String(Boolean(this.timer)));
    this.text("[data-motion]", this.motion.matches ? "Reduced motion: animation and Play are disabled. Previous, Next step, Reset, and the flat view remain available." : "No autoplay. Play advances every 4.2 seconds. Pause any time; Left/Right step, Home resets, Escape pauses when controls are focused.");
    const progress = this.querySelector("[data-progress]");
    progress.max = this.frames.length;
    progress.value = this.step + 1;
    progress.setAttribute("aria-valuetext", `Step ${this.step + 1} of ${this.frames.length}`);
    const stage = this.querySelector(".rs-stage");
    stage.dataset.active = frame.active;
    const packet = this.querySelector(".rs-packet");
    packet.dataset.travel = frame.active;
    // Clone only the decorative packet to restart a one-shot transition on a step.
    packet.replaceWith(packet.cloneNode(true));
    this.timeline();
    this.tree(frame.decision);
  }

  timeline() {
    const width = Math.max(720, 140 + this.frames.length * 100);
    const lanes = { client: 80, server: 155, storage: 230 };
    const arrow = `${this.uid}-arrow`;
    const steps = this.frames.slice(0, this.step + 1).map((frame, index) => {
      const x = 165 + index * 100;
      const { from, to, label, kind } = frame.event;
      const y1 = lanes[from], y2 = lanes[to];
      return `<g class="rs-event ${index === this.step ? "is-current" : ""} ${kind === "failure" ? "is-failure" : ""}"><text x="${x}" y="28" text-anchor="middle">${index + 1}</text>
        ${from === to ? `<circle cx="${x}" cy="${y1}" r="7"/>` : `<path d="M${x} ${y1}V${y2}" marker-end="url(#${arrow})"/><circle cx="${x}" cy="${y1}" r="4"/>`}
        <text x="${x}" y="275" text-anchor="middle">${escape(label)}</text>
        ${this.kind === "retry" ? `<rect class="rs-effect-bar" x="${x - 14}" y="${330 - frame.metrics.orders * 20}" width="28" height="${frame.metrics.orders * 20}"/><text x="${x}" y="351" text-anchor="middle">${frame.metrics.orders}</text>` : ""}
      </g>`;
    }).join("");
    this.querySelector("[data-timeline]").innerHTML = `<svg class="rs-timeline" viewBox="0 0 ${width} ${this.kind === "retry" ? 370 : 295}" role="img" aria-label="Sequence through step ${this.step + 1}. ${escape(this.frames[this.step].event.label)}. Dashed amber lines indicate loss, abort, or overwrite. The narration and state cards give the same outcome.">
      <defs><marker id="${arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="context-stroke"/></marker></defs>
      ${Object.entries(lanes).map(([name, y]) => `<text x="12" y="${y + 5}">${name.toUpperCase()}</text><path class="rs-lane" d="M110 ${y}H${width - 20}"/>`).join("")}
      ${this.kind === "retry" ? '<text x="12" y="322">ORDERS</text><path class="rs-lane" d="M110 330H' + (width - 20) + '"/>' : ""}${steps}</svg>`;
  }

  tree(value) {
    this.querySelector(".rs-decision").hidden = !value;
    if (!value) return;
    this.text("[data-question]", value.question);
    this.querySelector("[data-tree]").innerHTML = `<svg class="rs-tree" viewBox="0 0 720 120" role="img" aria-label="${escape(value.question)} Selected branch: ${escape(value.selected)}">
      <path class="rs-lane" d="M360 5V30H120V55M360 30V55M360 30H600V55"/>
      ${value.branches.map((branch, index) => `<g class="${branch === value.selected ? "is-selected" : ""}"><rect x="${index * 240 + 10}" y="55" width="220" height="50" rx="10"/><text x="${index * 240 + 120}" y="85" text-anchor="middle">${escape(branch)}</text></g>`).join("")}</svg><p class="rs-selected">Selected path: <strong>${escape(value.selected)}</strong></p>`;
  }
}

if (!customElements.get("rest-visual")) customElements.define("rest-visual", RestVisual);
