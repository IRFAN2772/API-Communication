export const coursePhases = [
  {
    id: "phase-0", number: 0, title: "Fundamentals", layer: "Foundation",
    path: "docs/00-GUIDED-FUNDAMENTALS.md", x: 80, y: 145, visual: true,
    summary: "One request, then one changed requirement at a time.",
    prerequisite: "No API experience needed. Bring basic familiarity with using a browser.",
    outcomes: ["Follow one course request and explain what each side knows.", "Predict what changes when data grows or a response is lost.", "Compare alternatives without treating complexity as an upgrade."],
  },
  {
    id: "phase-1", number: 1, title: "REST APIs", layer: "Foundation",
    path: "docs/01-GUIDED-REST.md", x: 245, y: 145, visual: true,
    summary: "Evolve the same course contract through new requirements.",
    prerequisite: "Phase 0: clients, servers, requests, responses, and HTTP basics.",
    outcomes: ["Model resources with URLs, methods, and status codes.", "Reason about idempotency, retries, caching, and pagination.", "Design a production REST boundary instead of just a CRUD endpoint."],
  },
  {
    id: "phase-2", number: 2, title: "GraphQL", layer: "Core protocols",
    path: "docs/02-GUIDED-GRAPHQL.md", x: 430, y: 70,
    summary: "Compare data shapes, then trace their execution and cost.",
    prerequisite: "Phase 1: REST resource design and the costs of fetching data.",
    outcomes: ["Read schemas, queries, mutations, and resolver boundaries.", "Recognize N+1 queries and use batching deliberately.", "Balance client flexibility against query cost, caching, and federation."],
  },
  {
    id: "phase-3", number: 3, title: "RPC & gRPC", layer: "Core protocols",
    path: "docs/03-GUIDED-RPC-AND-GRPC.md", x: 430, y: 220,
    summary: "Follow a typed remote call without hiding its failures.",
    prerequisite: "Phase 1: request/response semantics. GraphQL is a parallel comparison, not a prerequisite.",
    outcomes: ["Define typed service contracts using Protocol Buffers.", "Compare RPC calls with resource-oriented REST.", "Understand HTTP/2, streaming, deadlines, and failure handling."],
  },
  {
    id: "phase-4", number: 4, title: "Real-Time", layer: "Communication",
    path: "docs/04-GUIDED-REALTIME.md", x: 620, y: 145,
    summary: "Change the freshness requirement before changing the transport.",
    prerequisite: "Foundation phases; compare GraphQL and gRPC before combining communication patterns.",
    outcomes: ["Choose between polling, SSE, WebSocket, and push.", "Understand connection lifetime and webhook delivery risks.", "Explain WebRTC signaling, peer connections, and STUN/TURN."],
  },
  {
    id: "phase-5", number: 5, title: "Async APIs", layer: "Communication",
    path: "docs/05-ASYNC-APIS.md", x: 810, y: 145,
    summary: "Separate accepting work from finishing it.",
    prerequisite: "Phase 4: live communication and delivery trade-offs.",
    outcomes: ["Distinguish work queues from durable event streams.", "Reason about retries, ordering, dead letters, and delivery guarantees.", "Connect outbox, Saga, CQRS, and event sourcing to actual requirements."],
  },
  {
    id: "phase-6", number: 6, title: "Architecture", layer: "Platform",
    path: "docs/06-API-ARCHITECTURE.md", x: 1000, y: 145,
    summary: "Compose the system, not just the endpoint.",
    prerequisite: "Phases 0-5: synchronous, real-time, and asynchronous communication.",
    outcomes: ["Place gateways, BFFs, load balancers, and service meshes.", "Describe API contracts with OpenAPI.", "Protect capacity with backpressure and flow control."],
  },
  {
    id: "phase-7", number: 7, title: "Expert Design", layer: "Mastery",
    path: "docs/08-EXPERT-API-DESIGN.md", x: 1190, y: 145,
    summary: "Design for change, failure, and distance.",
    prerequisite: "Phase 6: architecture boundaries and operational trade-offs.",
    outcomes: ["Evolve APIs without breaking consumers.", "Reason about consistency, consensus, and distributed transactions.", "Design multi-region systems with latency budgets and reliability goals."],
  },
];

export const companionGuides = [
  {
    id: "senior-guide", title: "Senior Design Guide", layer: "Companion guide",
    path: "docs/07-SENIOR-DESIGN-GUIDE.md",
    summary: "A decision framework you can revisit.",
    prerequisite: "Use alongside any phase. The foundation helps; experienced developers can begin here.",
    outcomes: ["Translate requirements into a communication strategy.", "Compare latency, reliability, coupling, and operational cost.", "Explain a design decision instead of prescribing one protocol everywhere."],
  },
  {
    id: "case-studies", title: "System Design Case Studies", layer: "Companion guide",
    path: "docs/09-SYSTEM-DESIGN-CASE-STUDIES.md",
    summary: "Put the conversations together.",
    prerequisite: "Phases 0-7 recommended. Use the Senior Design Guide as a reference.",
    outcomes: ["Study WhatsApp, Instagram, Netflix, Uber, Twitter/X, and YouTube.", "Combine APIs, real-time connections, queues, and storage.", "Trace architectural trade-offs through end-to-end system designs."],
  },
];

export const requestHops = [
  { title: "01 / The client asks", text: "Your browser sends GET /courses. This is a request for data, not a direct connection to the database.", active: "client", wire: "outbound" },
  { title: "02 / The gateway routes", text: "The gateway applies the API boundary and routes the request to the course service. A gateway is useful here, not mandatory for every API.", active: "gateway", wire: "routing" },
  { title: "03 / The service reads", text: "The course service looks up records in storage and builds a response. It owns the data-access decision; the client does not.", active: "service", wire: "storage" },
  { title: "04 / The answer returns", text: "The service returns a response through the gateway to the client. The lower event branch illustrates optional deferred work, not a required step in this read.", active: "client", wire: "return" },
];

export function lessonRoute(path) {
  if (![...coursePhases, ...companionGuides].some((lesson) => lesson.path === path)) {
    throw new RangeError(`Unknown course lesson: ${path}`);
  }
  return `#/${path.replace(/\.md$/, "")}`;
}

function architectureScene() {
  return `<svg class="cm-architecture" viewBox="0 0 640 500" role="img" aria-label="Illustrative architecture: a browser requests a course through an API gateway, the course service reads storage, and a response returns. A separate optional event branch leads to deferred work.">
    <defs>
      <linearGradient id="cm-platform" x2="0.9" y2="1"><stop stop-color="#233958"/><stop offset="1" stop-color="#101b30"/></linearGradient>
      <linearGradient id="cm-screen" x2="0.8" y2="1"><stop stop-color="#132941"/><stop offset="1" stop-color="#061424"/></linearGradient>
      <linearGradient id="cm-hub" x2="0.5" y2="1"><stop stop-color="#a5fff0"/><stop offset="1" stop-color="#28a992"/></linearGradient>
      <linearGradient id="cm-service" x2="1" y2="1"><stop stop-color="#819cff"/><stop offset="1" stop-color="#4153ad"/></linearGradient>
      <pattern id="cm-grid" width="44" height="24" patternUnits="userSpaceOnUse"><path d="M0 12 22 0 44 12 22 24Z" fill="none" stroke="#8ca6d2" stroke-opacity=".13"/></pattern>
    </defs>
    <path class="cm-ground" d="M25 285 315 112 614 282 324 466Z" fill="url(#cm-grid)"/>
    <path class="cm-platform-edge" d="M78 290 321 147 566 288 566 308 323 449 78 310Z" fill="#0d1729" stroke="#344561"/>
    <path d="M78 290 321 147 566 288 323 429Z" fill="url(#cm-platform)" stroke="#547296" stroke-opacity=".6"/>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3">
      <path class="cm-scene-wire" data-wire="outbound" d="M173 233 251 277 296 251" stroke="#8aa7ed"/>
      <path class="cm-scene-wire" data-wire="routing" d="M341 233 406 196 448 220" stroke="#83e8d5"/>
      <path class="cm-scene-wire" data-wire="storage" d="M463 259 501 281 467 302" stroke="#9cb1ff"/>
      <path class="cm-scene-wire" data-wire="return" d="M453 273 351 330 267 330 144 259" stroke="#edbc7c" stroke-dasharray="7 7"/>
      <path d="M420 270 363 302 277 353" stroke="#6f879f" stroke-dasharray="4 8"/>
    </g>
    <g class="cm-scene-object" data-object="client">
      <path d="M108 189 181 231 181 169 108 127Z" fill="#1b2b49" stroke="#aac6ff" stroke-width="2"/>
      <path d="M117 184 173 216 173 173 117 141Z" fill="url(#cm-screen)"/>
      <path d="M108 189 181 231 203 219 130 177Z" fill="#647da6" stroke="#b2c9e8"/>
      <path d="M126 191 164 213 175 207 137 185Z" fill="#2b4164"/>
      <path d="M128 156 146 166M128 165 160 184M128 174 151 187" fill="none" stroke="#8cf3dc" stroke-width="3"/>
      <circle cx="148" cy="149" r="3" fill="#efbe86"/>
      <text x="107" y="112">CLIENT</text><text class="cm-scene-small" x="107" y="96">your browser</text>
    </g>
    <g class="cm-scene-object" data-object="gateway">
      <path d="M270 222 315 195 361 222 361 249 316 276 270 249Z" fill="#206d6b" stroke="#88e8d3"/>
      <path d="M270 222 315 249 361 222 315 195Z" fill="url(#cm-hub)"/>
      <path d="M315 249V276" stroke="#acecde"/>
      <path d="M297 222 315 211 334 222 315 233Z" fill="#142f42" stroke="#d3fff3"/>
      <path d="M308 220 316 216 324 221 316 226Z" fill="#b5ffe7"/>
      <path d="M285 246 294 251M338 250 348 244" stroke="#98f6e5" stroke-width="3"/>
      <text x="262" y="179">API GATEWAY</text><text class="cm-scene-small" x="278" y="163">the boundary</text>
    </g>
    <g class="cm-scene-object" data-object="service">
      <path d="M419 150 463 175 489 160 445 135Z" fill="#a7bbff" stroke="#c1ceff"/>
      <path d="M419 150V233L463 258V175Z" fill="url(#cm-service)" stroke="#a6b9ff"/>
      <path d="M463 175 489 160V243L463 258Z" fill="#283873" stroke="#a6b9ff"/>
      <path d="M421 178 463 202M421 205 463 229" stroke="#243865" stroke-width="3"/>
      <path d="M430 165 450 177M430 192 450 204M430 219 450 231" stroke="#d6dfff" stroke-width="3"/>
      <circle cx="425" cy="162" r="2" fill="#91ffe0"/><circle cx="425" cy="189" r="2" fill="#91ffe0"/><circle cx="425" cy="216" r="2" fill="#91ffe0"/>
      <text x="388" y="112">COURSE SERVICE</text><text class="cm-scene-small" x="405" y="96">business logic</text>
    </g>
    <g class="cm-scene-object cm-storage" data-object="storage">
      <path d="M446 312V358C446 380 515 380 515 358V312Z" fill="#47648a" stroke="#b2ceec"/>
      <ellipse cx="480.5" cy="312" rx="34.5" ry="15" fill="#9ab8d3" stroke="#d0e6f7"/>
      <path d="M446 328C446 350 515 350 515 328M446 344C446 366 515 366 515 344" fill="none" stroke="#a0c6dd"/>
      <ellipse cx="480.5" cy="312" rx="17" ry="6" fill="#526f94"/>
      <text x="456" y="405">STORAGE</text>
    </g>
    <g class="cm-scene-object">
      <path d="M175 347 255 394 320 357 240 310Z" fill="#142d3d" stroke="#699798"/>
      <path d="M175 347V361L255 408V394M255 408 320 371V357" fill="#122131" stroke="#699798"/>
      <path d="M194 345 212 355 229 345 211 335ZM224 362 242 372 259 362 241 352ZM254 379 272 389 289 379 271 369Z" fill="#65b5ad" stroke="#b7e3d3"/>
      <text x="125" y="409">EVENTS / JOBS</text><text class="cm-scene-small" x="125" y="428">optional deferred work</text>
    </g>
    <g class="cm-wire-label"><text x="183" y="272">GET /courses</text><text x="377" y="343">response</text></g>
    <g fill="#b1ffec"><circle cx="251" cy="277" r="4"/><circle cx="406" cy="196" r="4"/></g>
  </svg>`;
}

function markup() {
  return `<div class="cm-topline"><span class="cm-wordmark"><i aria-hidden="true"></i> API / COMMUNICATION</span><span class="cm-topnote">A free, open learning studio</span></div>
    <section class="cm-hero" aria-label="API Communication: Zero to Hero">
      <div class="cm-hero-copy">
        <p class="cm-eyebrow">FROM FIRST REQUEST TO DISTRIBUTED SYSTEM</p>
        <p class="cm-title">Make systems<br><em>speak.</em><span class="cm-title-dot" aria-hidden="true"></span></p>
        <p class="cm-intro">Don't just call an API.<br>Understand the entire conversation.</p>
        <p class="cm-description">An evolving field guide to the messages, contracts, and trade-offs behind modern software. Start with one request. Build toward systems that survive scale and failure.</p>
        <div class="cm-actions"><a class="cm-primary" href="${lessonRoute(coursePhases[0].path)}">Start Phase 0 <span aria-hidden="true">&#8599;</span></a><a class="cm-secondary" href="${lessonRoute(coursePhases[1].path)}">Continue with REST <span aria-hidden="true">&#8594;</span></a></div>
        <div class="cm-facts"><span><b>08</b> learning phases</span><span><b>02</b> companion guides</span><span>Browser-native. No account.</span></div>
      </div>
      <div class="cm-observatory">
        <div class="cm-scene-top"><span class="cm-eyebrow">A REQUEST, IN PERSPECTIVE</span><span class="cm-scene-tag">Illustration / not a live API</span></div>
        <div class="cm-scene-viewport"><div class="cm-scene-depth">${architectureScene()}</div></div>
        <div class="cm-trace-caption" aria-live="polite" aria-atomic="true"><strong data-hop-title></strong><p data-hop-text></p></div>
        <div class="cm-trace-controls"><div class="cm-hop-dots" role="img" aria-label="Request step 1 of 4">${requestHops.map(() => '<i aria-hidden="true"></i>').join("")}</div><button type="button" data-action="hop">Next hop <span aria-hidden="true">&#8594;</span></button><button type="button" data-action="animate">Animate request</button></div>
      </div>
    </section>
    <section class="cm-curriculum" aria-labelledby="cm-route-title">
      <div class="cm-route-heading"><div><p class="cm-eyebrow">THE LEARNING TOPOLOGY</p><p id="cm-route-title" class="cm-section-title">Every connection has a reason.</p></div><div class="cm-view-controls" role="group" aria-label="Course map presentation"><button type="button" data-action="depth" aria-pressed="true">Depth view</button><button type="button" data-action="static" aria-pressed="false">Static mode</button></div></div>
      <p class="cm-map-intro">Follow the foundation, explore the two protocol branches, then bring the patterns together. Select a node to inspect it. <strong>Selection never opens a lesson.</strong></p>
      <div class="cm-map-legend"><span><i class="cm-legend-line" aria-hidden="true"></i> Suggested learning sequence</span><span><i class="cm-legend-branch" aria-hidden="true"></i> Parallel protocol explorations</span><span>Tab to a node; arrow keys, Home, and End move between phases.</span></div>
      <p class="cm-scroll-hint">The topology scrolls horizontally on smaller screens. Focus this region and use the arrow keys, or swipe.</p>
      <div class="cm-map-scroll" tabindex="0" role="region" aria-label="Scrollable learning topology">
        <div class="cm-map-plane">
          <svg class="cm-map-wires" viewBox="0 0 1280 300" aria-hidden="true">
            <defs><pattern id="cm-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#35445d" stroke-width=".6"/></pattern></defs>
            <rect width="1280" height="300" fill="url(#cm-map-grid)"/>
            <path class="cm-route-wire" d="M80 145H245M620 145H1190"/>
            <path class="cm-route-wire cm-route-branch" d="M245 145H335V70H430M335 145V220H430M430 70H525V145H620M430 220H525V145"/>
            <path class="cm-route-direction" d="m171 140 7 5-7 5m362-80 7 5-7 5m0 140 7 5-7 5m365-80 7 5-7 5m186-5 7 5-7 5"/>
            <text x="84" y="282">FOUNDATION</text><text x="368" y="282">CORE PROTOCOLS</text><text x="656" y="282">COMMUNICATION</text><text x="1000" y="282">PLATFORM / MASTERY</text>
          </svg>
          <div class="cm-phase-nodes" role="group" aria-label="Select a learning phase">${coursePhases.map(phase => `<button class="cm-phase-node" type="button" data-lesson="${phase.id}" style="--cm-x:${phase.x / 12.8}%;--cm-y:${phase.y}px" aria-pressed="false" aria-controls="cm-lesson-preview"><span class="cm-phase-number">PHASE ${String(phase.number).padStart(2, "0")}</span><strong>${phase.title}</strong><span class="cm-node-format">${phase.visual ? "Visual + reading" : "Reading module"}</span><span class="cm-node-pin" aria-hidden="true"></span></button>`).join("")}</div>
        </div>
      </div>
      <div class="cm-route-bottom">
        <div class="cm-preview" id="cm-lesson-preview" aria-live="polite" aria-atomic="true"><div class="cm-preview-top"><span class="cm-eyebrow" data-preview-layer></span><span class="cm-availability" data-preview-format></span></div><p class="cm-preview-title" data-preview-title></p><p class="cm-preview-summary" data-preview-summary></p><div class="cm-preview-content"><div><strong class="cm-small-label">BEFORE YOU BEGIN</strong><p data-preview-prerequisite></p></div><div><strong class="cm-small-label">WHAT YOU WILL LEARN</strong><ul data-preview-outcomes></ul></div></div><a class="cm-primary cm-open-lesson" data-open-lesson>Open lesson <span aria-hidden="true">&#8599;</span></a></div>
        <aside class="cm-companions" aria-label="Optional companion guides"><p class="cm-eyebrow">OFF THE NUMBERED PATH</p><p class="cm-companion-title">Two lenses.<br>A wider view.</p><p class="cm-companion-copy">Reference and application, not extra phases. Revisit these when you need to reason across the whole system.</p><div class="cm-guide-buttons">${companionGuides.map((guide, index) => `<button type="button" data-lesson="${guide.id}" aria-pressed="false" aria-controls="cm-lesson-preview"><span class="cm-guide-icon" aria-hidden="true">${index ? "&#9671;" : "&#10035;"}</span><span><strong>${guide.title}</strong><small>${index ? "See the patterns in real system designs" : "Choose by requirements, not by hype"}</small></span><span aria-hidden="true">&#8599;</span></button>`).join("")}</div><p class="cm-rollout"><span aria-hidden="true"></span>Reading material: all phases and guides.<br>Interactive lesson rollout: Phases 0 and 1.</p></aside>
      </div>
      <p class="cm-mode-note" data-mode-note></p>
    </section>
    <div class="cm-reference-divider"><span class="cm-eyebrow">KEEP EXPLORING</span><p>The original field guide continues below.</p><span aria-hidden="true">&#8595;</span></div>`;
}

if (typeof window !== "undefined" && !customElements.get("course-map")) {
  class CourseMap extends HTMLElement {
    connectedCallback() {
      if (this.lifecycle) return;
      this.lifecycle = new AbortController();
      this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.staticMode = this.motion.matches;
      this.depth = !this.motion.matches;
      this.hop = 0;
      this.selected = coursePhases[0];
      this.animating = false;
      const surface = document.createElement("div");
      surface.className = "cm-studio";
      surface.innerHTML = markup();
      this.classList.add("cm-course-map");
      this.replaceChildren(surface);
      this.dataset.enhanced = "true";
      document.body.classList.add("course-home");
      const options = { signal: this.lifecycle.signal };
      this.addEventListener("click", event => this.handleClick(event), options);
      this.addEventListener("keydown", event => this.handleKey(event), options);
      this.motion.addEventListener("change", () => {
        if (this.motion.matches) {
          this.staticMode = true;
          this.depth = false;
          this.stopTrace();
        }
        this.updatePresentation();
      }, options);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stopTrace();
      }, options);
      this.updateSelection();
      this.updateHop();
      this.updatePresentation();
    }

    disconnectedCallback() {
      this.stopTrace();
      this.lifecycle?.abort();
      this.lifecycle = null;
      delete this.dataset.enhanced;
      if (!document.querySelector("course-map[data-enhanced]")) {
        document.body.classList.remove("course-home");
      }
    }

    handleClick(event) {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("button");
      if (!button || !this.contains(button)) return;
      if (button.dataset.lesson) {
        const selected = [...coursePhases, ...companionGuides].find(lesson => lesson.id === button.dataset.lesson);
        if (!selected) throw new RangeError(`Unknown course map selection: ${button.dataset.lesson}`);
        this.selected = selected;
        this.updateSelection();
      } else if (button.dataset.action === "depth") {
        this.depth = !this.depth;
        this.updatePresentation();
      } else if (button.dataset.action === "static") {
        this.staticMode = !this.staticMode;
        this.stopTrace();
        this.updatePresentation();
      } else if (button.dataset.action === "hop") {
        this.stopTrace();
        this.hop = (this.hop + 1) % requestHops.length;
        this.updateHop();
      } else if (button.dataset.action === "animate") {
        if (this.animating) this.stopTrace();
        else this.startTrace();
      }
    }

    handleKey(event) {
      if (!(event.target instanceof Element) || !event.target.matches(".cm-phase-node")) return;
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const buttons = [...this.querySelectorAll(".cm-phase-node")];
      const current = buttons.indexOf(event.target);
      const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + direction + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
      buttons[next].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      this.selected = coursePhases[next];
      this.updateSelection();
    }

    updateSelection() {
      const lesson = this.selected;
      this.querySelectorAll("[data-lesson]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.lesson === lesson.id));
      });
      this.querySelector("[data-preview-layer]").textContent = "number" in lesson ? `PHASE ${String(lesson.number).padStart(2, "0")} / ${lesson.layer}` : lesson.layer;
      this.querySelector("[data-preview-format]").textContent = lesson.visual ? "Visual lessons + reading" : "Reading available";
      this.querySelector("[data-preview-title]").textContent = lesson.title;
      this.querySelector("[data-preview-summary]").textContent = lesson.summary;
      this.querySelector("[data-preview-prerequisite]").textContent = lesson.prerequisite;
      const outcomes = lesson.outcomes.map(text => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      });
      this.querySelector("[data-preview-outcomes]").replaceChildren(...outcomes);
      const link = this.querySelector("[data-open-lesson]");
      link.href = lessonRoute(lesson.path);
      link.setAttribute("aria-label", `Open ${lesson.title} lesson`);
    }

    updateHop() {
      const hop = requestHops[this.hop];
      this.querySelector("[data-hop-title]").textContent = hop.title;
      this.querySelector("[data-hop-text]").textContent = hop.text;
      this.querySelectorAll("[data-object]").forEach(object => {
        object.classList.toggle("cm-active-object", object.dataset.object === hop.active || (this.hop === 2 && object.dataset.object === "storage"));
      });
      this.querySelectorAll("[data-wire]").forEach(wire => {
        wire.classList.toggle("cm-active-wire", wire.dataset.wire === hop.wire);
      });
      const dots = this.querySelector(".cm-hop-dots");
      dots.setAttribute("aria-label", `Request step ${this.hop + 1} of ${requestHops.length}`);
      [...dots.children].forEach((dot, index) => dot.classList.toggle("cm-current-hop", index === this.hop));
    }

    startTrace() {
      if (this.motion.matches || this.staticMode) {
        this.querySelector("[data-mode-note]").textContent = "Animated walkthroughs are disabled in static or reduced-motion mode. Use Next hop to follow the same request manually.";
        return;
      }
      this.hop = 0;
      this.animating = true;
      this.dataset.animating = "true";
      this.querySelector('[data-action="animate"]').textContent = "Stop animation";
      this.updateHop();
      const advance = () => {
        if (!this.isConnected) {
          this.stopTrace();
          return;
        }
        if (this.hop === requestHops.length - 1) {
          this.stopTrace();
          return;
        }
        this.hop += 1;
        this.updateHop();
        this.timer = window.setTimeout(advance, 1800);
      };
      this.timer = window.setTimeout(advance, 1800);
    }

    stopTrace() {
      window.clearTimeout(this.timer);
      this.timer = null;
      this.animating = false;
      this.dataset.animating = "false";
      const button = this.querySelector('[data-action="animate"]');
      if (button) button.textContent = "Animate request";
    }

    updatePresentation() {
      this.dataset.depth = String(this.depth);
      this.dataset.static = String(this.staticMode || this.motion.matches);
      this.querySelector('[data-action="depth"]').setAttribute("aria-pressed", String(this.depth));
      this.querySelector('[data-action="static"]').setAttribute("aria-pressed", String(this.staticMode || this.motion.matches));
      this.querySelector('[data-action="static"]').disabled = this.motion.matches;
      this.querySelector('[data-action="animate"]').disabled = this.staticMode || this.motion.matches;
      this.querySelector("[data-mode-note]").textContent = this.motion.matches
        ? "Reduced motion is active. The scene is static; Next hop and every course-map control still work. You can enable depth independently."
        : this.staticMode
          ? "Static mode: no animated walkthrough or transitions. Use Next hop to inspect the request at your own pace."
          : "Motion is opt-in: Animate request runs one four-hop illustration and stops. No progress is tracked or saved.";
    }
  }
  customElements.define("course-map", CourseMap);
}
