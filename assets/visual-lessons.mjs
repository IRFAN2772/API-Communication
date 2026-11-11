import { requestFrame, requestScenarios, decisions, queueTick, queueLimit, workerRate, queuePresets } from "./visual-models.mjs";

const icon = {
  client: '<rect x="-19" y="-14" width="38" height="25" rx="4"/><path d="M-10 18h20M0 11v7"/>',
  server: '<rect x="-19" y="-17" width="38" height="34" rx="4"/><path d="M-19 0h38M-11-8h3M-11 9h3M0-8h11M0 9h11"/>',
  storage: '<ellipse cy="-12" rx="21" ry="8"/><path d="M-21-12v25c0 11 42 11 42 0v-25M-21 1c0 11 42 11 42 0"/>',
};
const controls = `<div class="vl-controls">
  <button type="button" data-action="back">Previous</button>
  <button type="button" data-action="play">Play walkthrough</button>
  <button type="button" data-action="next">Next step</button>
  <button type="button" data-action="reset">Reset</button>
  <button type="button" data-action="depth" aria-pressed="true">Depth view</button>
</div>`;

function networkDiagram() {
  return `<p class="vl-diagram-hint">Swipe the diagram horizontally, or focus it and use the arrow keys. Every state is also described below.</p><div class="vl-scene" data-depth="true" tabindex="0" role="region" aria-label="Scrollable request diagram"><svg class="vl-network" viewBox="0 0 720 225" role="img" aria-label="Client sends a request to the API; the API queries storage and returns a response. The state cards below describe each step.">
    <defs><marker id="vl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
    <path class="vl-wire" d="M172 105H282M438 105H548" marker-end="url(#vl-arrow)"/>
    <path class="vl-wire vl-return" d="M548 150H438M282 150H172" marker-end="url(#vl-arrow)"/>
    ${[["client", "Your browser", 95], ["server", "Course API", 360], ["storage", "Storage", 625]].map(([kind, title, x]) => `<g class="vl-node" data-node="${kind}" transform="translate(${x},110)">
      <rect class="vl-node-shadow" x="-70" y="-52" width="145" height="105" rx="16"/>
      <rect class="vl-node-face" x="-75" y="-60" width="145" height="105" rx="16"/>
      <g class="vl-icon" transform="translate(0,-20)">${icon[kind]}</g>
      <text y="26" text-anchor="middle">${title}</text>
    </g>`).join("")}
    <text x="227" y="88" text-anchor="middle">request</text><text x="493" y="88" text-anchor="middle">lookup</text>
    <text x="227" y="183" text-anchor="middle">response</text><text x="493" y="183" text-anchor="middle">record</text>
    <circle class="vl-packet" r="7" cx="180" cy="105"/>
  </svg></div>`;
}

class ApiVisual extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.kind = this.getAttribute("lesson");
    this.step = 0;
    this.scenario = "found";
    this.preset = "balanced";
    this.queue = { time: 0, queued: 0, processed: 0, rejected: 0 };
    this.history = [0];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.lifecycle = new AbortController();
    this.render();
    this.addEventListener("click", (event) => this.click(event), { signal: this.lifecycle.signal });
    this.addEventListener("change", (event) => {
      if (event.target.matches("[data-scenario]")) {
        this.stop();
        this.scenario = event.target.value;
        this.step = 0;
        this.update();
      }
    }, { signal: this.lifecycle.signal });
    this.motion.addEventListener("change", () => { this.stop(); this.update(); }, { signal: this.lifecycle.signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.stop(); }, { signal: this.lifecycle.signal });
    this.update();
  }

  disconnectedCallback() {
    this.stop();
    this.lifecycle?.abort();
    this.initialized = false;
  }

  render() {
    this.classList.add("api-visual");
    if (this.kind === "request") {
      this.innerHTML = `<header class="vl-heading"><span class="vl-eyebrow">01 / FOLLOW THE MESSAGE</span><h3>One click. Three perspectives.</h3><p>Open a course and see what the browser, API, and storage each know.</p></header>
        <label class="vl-select">Change the story <select data-scenario>${Object.entries(requestScenarios).map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></label>
        ${networkDiagram()}
        <div class="vl-state-grid">${["client", "server", "storage"].map(name => `<div><span>${name === "client" ? "Client knows" : name === "server" ? "API state" : "Storage state"}</span><strong data-state="${name}"></strong></div>`).join("")}</div>
        <div class="vl-narration" aria-live="polite" aria-atomic="true"><span class="vl-step"></span><h4 data-title></h4><p data-explanation></p></div>
        <div class="vl-progress" role="img" aria-label="Walkthrough progress">${Array.from({ length: 6 }, () => "<i></i>").join("")}</div>
        ${controls}
        <p class="vl-motion-note"></p>
        <details class="vl-wire-details"><summary>Inspect the HTTP messages</summary><div class="vl-message-grid"><div><h4>Request</h4><pre data-request></pre></div><div><h4>Server response</h4><pre data-response></pre></div></div><p>This simplified read has no write side effect. HTTP syntax is illustrated, not transmitted; no server or personal data is involved.</p></details>`;
    } else if (this.kind === "decision") {
      this.choice = "browse";
      this.innerHTML = `<header class="vl-heading"><span class="vl-eyebrow">02 / FOLLOW THE REQUIREMENT</span><h3>Choose the conversation, not the trend.</h3><p>The same learning platform can have different interaction needs. Select a feature to trace one reasonable starting point.</p></header>
        <div class="vl-choices" role="group" aria-label="Learning platform feature">${Object.entries(decisions).map(([key, value]) => `<button type="button" data-choice="${key}" aria-pressed="false">${value.label}</button>`).join("")}</div>
        <p class="vl-diagram-hint">Swipe to explore the branches. The selected path and reasoning are written below.</p>
        <div class="vl-tree-scroll" tabindex="0" role="region" aria-label="Scrollable communication decision tree"><svg class="vl-tree" viewBox="0 0 720 190" role="img" aria-label="A feature branches into request/response, live updates, or deferred work. The selected path is also written below.">
          <path class="vl-wire" d="M360 47V80H120V115M360 80V115M360 80H600V115"/>
          <rect x="240" y="8" width="240" height="40" rx="10"/><text x="360" y="34">What does the feature need?</text>
          ${["Request / response", "Live updates", "Deferred work"].map((branch, index) => `<g data-branch="${branch}"><rect x="${index * 240 + 15}" y="115" width="210" height="48" rx="10"/><text x="${index * 240 + 120}" y="144">${branch}</text></g>`).join("")}
        </svg></div>
        <div class="vl-decision" aria-live="polite" aria-atomic="true"><span class="vl-eyebrow" data-path></span><h4 data-method></h4><p data-reason></p><pre data-example></pre><div class="vl-message-grid"><div><h4>Why not something else?</h4><p data-alternative></p></div><div><h4>What you still own</h4><p data-cost></p></div></div></div>
        <p class="vl-footnote">A decision aid, not a universal rule. These categories overlap: gRPC can stream, GraphQL can support subscriptions, and a product can combine methods.</p>`;
    } else if (this.kind === "queue") {
      this.innerHTML = `<header class="vl-heading"><span class="vl-eyebrow">03 / SEE THE BOTTLENECK</span><h3>A queue buys time. Not infinite capacity.</h3><p>Completion emails arrive as jobs. Each worker can finish ${workerRate} jobs per simulated second. Change the traffic, then advance time.</p></header>
        <div class="vl-choices" role="group" aria-label="Traffic scenario">${Object.entries(queuePresets).map(([key, value]) => `<button type="button" data-preset="${key}" aria-pressed="false">${value.label}</button>`).join("")}</div>
        <div class="vl-rate-line"><strong data-arrival></strong><span>→</span><strong>Queue / ${queueLimit} slots</strong><span>→</span><strong data-workers></strong></div>
        <div class="vl-slots" role="img" aria-label="Empty queue">${Array.from({ length: queueLimit }, () => "<i></i>").join("")}</div>
        <div class="vl-state-grid"><div><span>Waiting jobs</span><strong data-queued></strong></div><div><span>Completed total</span><strong data-processed></strong></div><div><span>Rejected total</span><strong data-rejected></strong></div></div>
        <svg class="vl-chart" viewBox="0 0 720 155" role="img" aria-label="Queue history. Exact recent values are available below."><path class="vl-grid" d="M42 20H695M42 70H695M42 120H695"/><text x="4" y="25">24</text><text x="4" y="75">12</text><text x="12" y="125">0</text><polyline class="vl-chart-line" points="42,120"/><text x="42" y="148">waiting jobs / last 30 simulated seconds</text></svg>
        <div class="vl-narration" aria-live="polite" aria-atomic="true"><span class="vl-step"></span><p data-explanation></p></div>
        <div class="vl-controls"><button type="button" data-action="next">Advance 1 second</button><button type="button" data-action="play">Run simulation</button><button type="button" data-action="reset">Reset</button></div>
        <p class="vl-motion-note"></p>
        <details><summary>Model assumptions and exact history</summary><p>Workers drain existing jobs first; arrivals enter afterward. The waiting queue holds at most 24 jobs. Overflow is explicitly rejected, not silently lost. Real systems also need durable storage, retry policies, and visibility into failures. This deterministic browser model does not demonstrate broker guarantees.</p><p>Changing a scenario preserves the backlog and totals; Reset clears them. Playback stops after 30 ticks so it never runs indefinitely.</p><p data-history></p></details>`;
    } else {
      throw new Error(`Unknown visual lesson: ${this.kind}`);
    }
  }

  click(event) {
    const button = event.target.closest("button");
    if (!button || !this.contains(button)) return;
    if (button.dataset.choice) {
      this.choice = button.dataset.choice;
    } else if (button.dataset.preset) {
      this.stop();
      this.preset = button.dataset.preset;
    } else {
      switch (button.dataset.action) {
        case "next": this.stop(); this.advance(); break;
        case "back": this.stop(); this.step = Math.max(0, this.step - 1); break;
        case "reset":
          this.stop(); this.step = 0;
          this.queue = { time: 0, queued: 0, processed: 0, rejected: 0 };
          this.history = [0]; break;
        case "play": this.timer ? this.stop() : this.play(); break;
        case "depth": {
          const enabled = button.getAttribute("aria-pressed") !== "true";
          button.setAttribute("aria-pressed", String(enabled));
          this.querySelector(".vl-scene").dataset.depth = String(enabled);
          break;
        }
      }
    }
    this.update();
  }

  advance() {
    if (this.kind === "request") this.step = Math.min(5, this.step + 1);
    if (this.kind === "queue") {
      const { arrival, workers } = queuePresets[this.preset];
      this.queue = queueTick(this.queue, arrival, workers);
      this.history.push(this.queue.queued);
      this.history = this.history.slice(-31);
    }
  }

  play() {
    if (this.motion.matches) return;
    if (this.kind === "request" && this.step === 5) this.step = 0;
    let ticks = 0;
    this.timer = setInterval(() => {
      this.advance();
      ticks++;
      if ((this.kind === "request" && this.step === 5) || ticks >= 30) this.stop();
      this.update();
    }, this.kind === "request" ? 2400 : 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    const button = this.querySelector('[data-action="play"]');
    if (button) button.textContent = this.kind === "request" ? "Play walkthrough" : "Run simulation";
  }

  text(selector, value) {
    this.querySelector(selector).textContent = value;
  }

  update() {
    if (this.kind === "request") {
      const frame = requestFrame(this.scenario, this.step);
      this.text("[data-title]", frame.title);
      this.text("[data-explanation]", frame.explanation);
      this.text(".vl-step", `STEP ${this.step + 1} / 6`);
      for (const key of ["client", "server", "storage"]) this.text(`[data-state="${key}"]`, frame[key]);
      this.text("[data-request]", frame.request);
      this.text("[data-response]", frame.response);
      this.querySelector(".vl-network").dataset.active = frame.active;
      this.querySelectorAll(".vl-progress i").forEach((el, i) => el.classList.toggle("is-filled", i <= this.step));
      this.querySelector(".vl-progress").setAttribute("aria-label", `Step ${this.step + 1} of 6`);
      this.querySelector('[data-action="back"]').disabled = this.step === 0;
      this.querySelector('[data-action="next"]').disabled = this.step === 5;
    } else if (this.kind === "decision") {
      const choice = decisions[this.choice];
      this.querySelectorAll("[data-choice]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.choice === this.choice)));
      this.querySelectorAll("[data-branch]").forEach(el => el.classList.toggle("is-active", el.dataset.branch === choice.branch));
      this.text("[data-path]", `${choice.label} / ${choice.branch}`);
      for (const key of ["method", "reason", "example", "alternative", "cost"]) this.text(`[data-${key}]`, choice[key]);
    } else if (this.kind === "queue") {
      const { arrival, workers } = queuePresets[this.preset];
      this.querySelectorAll("[data-preset]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.preset === this.preset)));
      this.text("[data-arrival]", `${arrival} jobs/s arrive`);
      this.text("[data-workers]", `${workers} workers / ${workers * workerRate} jobs/s`);
      for (const key of ["queued", "processed", "rejected"]) this.text(`[data-${key}]`, String(this.queue[key]));
      this.querySelectorAll(".vl-slots i").forEach((el, index) => el.classList.toggle("is-filled", index < this.queue.queued));
      this.querySelector(".vl-slots").setAttribute("aria-label", `${this.queue.queued} of ${queueLimit} queue slots occupied`);
      this.querySelector(".vl-chart-line").setAttribute("points", this.history.map((n, i) => `${42 + i * 653 / 30},${120 - n * 100 / queueLimit}`).join(" "));
      this.text(".vl-step", `SIMULATED TIME / ${this.queue.time}s`);
      this.text("[data-explanation]", arrival > workers * workerRate
        ? "Arrivals exceed processing capacity by 6 jobs/s. The queue fills; once full, some new jobs are rejected. A queue alone cannot solve sustained overload."
        : arrival < workers * workerRate ? "Capacity exceeds arrivals by 4 jobs/s. Existing backlog can drain. In this model, each tick ends with at least the newly arrived jobs waiting."
        : "Arrivals match maximum processing capacity. After the first tick, the queue stays steady—but there is no spare capacity to recover from a spike.");
      this.text("[data-history]", this.history.map((value, index) => `t=${this.queue.time - this.history.length + 1 + index}s: ${value} waiting`).join("; "));
    }
    const play = this.querySelector('[data-action="play"]');
    if (play) {
      play.disabled = this.motion.matches;
      play.textContent = this.timer ? "Pause" : this.kind === "request" ? "Play walkthrough" : "Run simulation";
      this.text(".vl-motion-note", this.motion.matches ? "Reduced motion is on. Use the step buttons to explore at your own pace." : "Nothing plays automatically. Pause or step through at your own pace.");
    }
  }
}

customElements.define("api-visual", ApiVisual);
