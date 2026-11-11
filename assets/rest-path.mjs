import { restStages, readRestRoute, resolveRestSelection, restStageHash, stageFromPartTitle } from "./rest-path-models.mjs";

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function button(text, data, className) {
  const result = node("button", className, text);
  result.type = "button";
  Object.assign(result.dataset, data);
  return result;
}

class RestLearningPath {
  constructor(main) {
    this.main = main;
    this.lifecycle = new AbortController();
    this.sections = new Map();
    this.anchorStages = new Map();
    this.mode = "guided";
    this.stage = 1;
    this.prepare();
    this.render();
    this.selectFromRoute(false);
    main.addEventListener("click", event => {
      const control = event.target.closest(".rest-learning-path button, .rlp-footer button");
      if (!control) return;
      if (control.dataset.mode) this.select(control.dataset.mode, this.stage);
      if (control.dataset.stage !== undefined) this.select("guided", Number(control.dataset.stage));
      if (control.dataset.direction) this.select("guided", this.stage + Number(control.dataset.direction));
    }, { signal: this.lifecycle.signal });
  }

  prepare() {
    const children = [...this.main.children];
    const partHeadings = children.filter(el => el.tagName === "H1" && stageFromPartTitle(el.textContent) !== null);
    if (partHeadings.length !== 6 || partHeadings.some((el, i) => stageFromPartTitle(el.textContent) !== i + 1)) {
      throw new Error("The REST learning path requires the six original Part headings in order.");
    }
    const hero = children.find(el => el.classList.contains("rest-hero"));
    if (!hero) throw new Error("The REST learning path requires its original chapter introduction.");
    this.hero = hero;
    let section;
    let stage = 0;
    const first = children.indexOf(hero) + 1;
    for (const child of children.slice(first)) {
      if (child.classList.contains("studio-lesson-head")) continue;
      if (child.classList.contains("docsify-pagination-container")) {
        this.pagination = child;
        continue;
      }
      const part = child.tagName === "H1" ? stageFromPartTitle(child.textContent) : null;
      if (!section || part !== null) {
        stage = part ?? 0;
        section = node("section", "rest-path-section");
        section.dataset.restStage = String(stage);
        section.setAttribute("aria-label", restStages[stage].title);
        this.main.insertBefore(section, child);
        this.sections.set(stage, section);
      }
      section.append(child);
    }
    for (const [id, section] of this.sections) {
      for (const heading of section.querySelectorAll("[id]")) this.anchorStages.set(heading.id, id);
    }
    this.main.dataset.restPath = "ready";
    document.body.classList.add("rest-path-active");
  }

  render() {
    this.path = node("section", "rest-learning-path");
    this.path.setAttribute("aria-label", "REST learning path");
    const heading = node("header", "rlp-heading");
    heading.append(
      node("span", "rlp-eyebrow", "ONE PLATFORM / SIX CONNECTED STAGES"),
      node("p", "rlp-title", "Build the contract, one idea at a time."),
      node("p", "rlp-deck", "Follow the same course catalogue from resources to production. Guided view changes what is visible, not what the chapter contains. Every original explanation remains in Full reference."),
    );
    const modes = node("div", "rlp-mode");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "REST reading view");
    modes.append(button("Guided lessons", { mode: "guided" }), button("Full reference", { mode: "reference" }));
    const story = node("div", "rlp-story");
    story.append(
      node("span", "rlp-eyebrow", "OUR CONTINUING EXAMPLE"),
      node("p", "", "One learning platform. A course catalogue, a learner, and an enrollment—not a new app at every step."),
      node("p", "", "Original company comparisons and other domains remain as transfer examples. Learn the core mechanism here first, then compare where else it applies."),
    );
    const stages = node("div", "rlp-stages");
    stages.setAttribute("role", "group");
    stages.setAttribute("aria-label", "Choose a REST learning stage");
    restStages.slice(1).forEach(stage => {
      const choice = button("", { stage: String(stage.id) });
      choice.setAttribute("aria-controls", `rest-learning-stage-${stage.id}`);
      choice.append(node("span", "rlp-number", String(stage.id).padStart(2, "0")), node("span", "rlp-stage-title", stage.title), node("span", "rlp-stage-summary", stage.summary));
      stages.append(choice);
      this.sections.get(stage.id).id = `rest-learning-stage-${stage.id}`;
    });
    const overview = node("div", "rlp-overview");
    overview.append(button("Overview & quick reference", { stage: "0" }), node("span", "", "Stage position is not a completion score. No progress is stored."));
    this.current = node("div", "rlp-current");
    this.current.setAttribute("aria-live", "polite");
    this.current.setAttribute("aria-atomic", "true");
    this.currentTitle = node("p", "rlp-current-title");
    this.currentOutcome = node("p", "rlp-current-outcome");
    this.currentStory = node("p", "rlp-current-story");
    this.current.append(this.currentTitle, this.currentStory, this.currentOutcome);
    this.outline = node("details", "rlp-section-links");
    this.outline.append(node("summary", "", "Jump within this stage"));
    this.outlineLinks = node("div", "rlp-outline");
    this.outline.append(this.outlineLinks);
    this.warning = node("p", "rlp-warning");
    this.warning.setAttribute("role", "alert");
    this.warning.hidden = true;
    this.path.append(heading, modes, story, stages, overview, this.current, this.outline, this.warning);
    this.hero.after(this.path);
    this.footer = node("div", "rlp-footer");
    this.footer.setAttribute("role", "navigation");
    this.footer.setAttribute("aria-label", "REST stage navigation");
    this.previous = button("Previous stage", { direction: "-1" });
    this.next = button("Next stage", { direction: "1" });
    this.position = node("span", "rlp-position");
    this.footer.append(this.previous, this.position, this.next);
    const last = this.sections.get(6);
    last.after(this.footer);
  }

  selectFromRoute(scrollAnchor) {
    const route = readRestRoute(location.hash);
    if (!route) return;
    const selection = resolveRestSelection(route, this.anchorStages);
    this.show(selection.mode, selection.stage);
    this.warning.textContent = selection.warning;
    this.warning.hidden = !selection.warning;
    if (scrollAnchor && route.anchor) this.revealAnchor(route.anchor, true);
  }

  show(mode, stage) {
    const stageInfo = restStages[stage];
    if (!stageInfo) throw new RangeError("Unknown REST learning stage");
    this.mode = mode;
    this.stage = stage;
    this.main.dataset.restMode = mode;
    this.path.dataset.mode = mode;
    for (const [id, section] of this.sections) {
      const hide = mode === "guided" && id !== stage;
      if (hide && !section.hidden) {
        section.querySelectorAll("rest-visual, api-visual, rest-design").forEach(el => el.stop?.());
      }
      section.hidden = hide;
    }
    if (this.pagination) this.pagination.hidden = mode === "guided" && stage !== 6;
    this.path.querySelectorAll("[data-mode]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.mode === mode)));
    this.path.querySelectorAll("[data-stage]").forEach(el => el.setAttribute("aria-pressed", String(Number(el.dataset.stage) === stage && mode === "guided")));
    this.currentTitle.textContent = mode === "reference" ? "Full reference / the complete REST chapter" : stage === 0 ? stageInfo.title : `STAGE ${String(stage).padStart(2, "0")} / ${stageInfo.title}`;
    this.currentStory.textContent = mode === "reference" ? "All six stages and the original overview are visible together. Existing section links still work." : stageInfo.story;
    this.currentOutcome.textContent = mode === "reference" ? "Switch back to Guided lessons whenever you want a smaller reading surface." : `Your goal: ${stageInfo.outcome}`;
    const sourceHeadings = mode === "reference"
      ? this.main.querySelectorAll(".rest-path-section > h2, .rest-path-section > h3")
      : this.sections.get(stage).querySelectorAll(":scope > h2, :scope > h3");
    this.outlineLinks.replaceChildren(...[...sourceHeadings].filter(el => el.id).map(el => {
      const link = node("a", "", el.textContent);
      const params = new URLSearchParams({ id: el.id });
      if (mode === "reference") params.set("view", "reference");
      link.href = `#/docs/01-REST-APIS?${params}`;
      return link;
    }));
    this.outline.firstElementChild.textContent = mode === "reference" ? "Jump within the full reference" : "Jump within this stage";
    this.footer.hidden = mode === "reference";
    this.previous.disabled = stage === 0;
    this.previous.textContent = stage === 1 ? "Back to overview" : stage > 1 ? `Previous: ${restStages[stage - 1].title}` : "Previous stage";
    this.next.textContent = stage < 6 ? `Next: ${restStages[stage + 1].title}` : "Final REST stage";
    this.next.disabled = stage === 6;
    this.position.textContent = stage === 0 ? "Overview / six learning stages" : `Stage ${stage} of 6 / ${stageInfo.title}`;
    window.dispatchEvent(new Event("scroll"));
  }

  select(mode, stage) {
    this.show(mode, stage);
    this.warning.hidden = true;
    const hash = restStageHash(mode, stage);
    if (location.hash !== hash) history.pushState(null, "", hash);
    this.outline.open = false;
    this.current.tabIndex = -1;
    this.current.focus({ preventScroll: true });
    this.current.scrollIntoView({ block: "start", behavior: "instant" });
    window.dispatchEvent(new Event("scroll"));
  }

  revealAnchor(id, scroll) {
    const target = [...this.main.querySelectorAll("[id]")].find(el => el.id === id);
    if (!target) return;
    const stage = this.anchorStages.get(id);
    if (this.mode === "guided" && stage !== undefined && stage !== this.stage) this.show("guided", stage);
    else if (this.mode === "guided" && target.closest(".rest-path-section")?.hidden) this.show("reference", this.stage);
    if (scroll) requestAnimationFrame(() => {
      if (target.isConnected) target.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  dispose() {
    this.lifecycle.abort();
    this.sections.forEach(section => section.querySelectorAll("rest-visual, api-visual, rest-design").forEach(el => el.stop?.()));
    document.body.classList.remove("rest-path-active");
  }
}

let active;
function initialize() {
  const main = document.querySelector(".markdown-section");
  const route = readRestRoute(location.hash);
  if (active && (!active.path.isConnected || !route || active.main !== main)) {
    active.dispose();
    active = undefined;
  }
  if (!route || !main?.querySelector(".rest-hero") || main.dataset.restPath === "failed") return;
  if (active) {
    active.selectFromRoute(true);
    return;
  }
  try {
    active = new RestLearningPath(main);
    if (route.anchor) active.revealAnchor(route.anchor, true);
  } catch (error) {
    console.error("REST guided reading could not initialize", error);
    main.querySelectorAll(":scope > .rest-path-section").forEach(section => {
      section.replaceWith(...section.childNodes);
    });
    main.querySelectorAll(":scope > .rest-learning-path, :scope > .rlp-footer").forEach(el => el.remove());
    const pagination = main.querySelector(":scope > .docsify-pagination-container");
    if (pagination) pagination.hidden = false;
    delete main.dataset.restMode;
    main.dataset.restPath = "failed";
    document.body.classList.remove("rest-path-active");
    const alert = node("p", "rlp-warning", "Guided reading could not initialize. The original reference remains available below.");
    alert.setAttribute("role", "alert");
    main.querySelector(".rest-hero").after(alert);
  }
}

window.addEventListener("studio:lesson-ready", initialize);
window.addEventListener("popstate", () => {
  if (active?.path.isConnected) active.selectFromRoute(true);
});
window.addEventListener("hashchange", () => {
  if (active?.path.isConnected) active.selectFromRoute(true);
});
document.addEventListener("click", event => {
  if (!(event.target instanceof Element) || event.button > 0 || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const link = event.target.closest("a[href]");
  if (!link || link.target === "_blank") return;
  const url = new URL(link.href);
  const route = url.origin === location.origin && url.pathname === location.pathname ? readRestRoute(url.hash) : null;
  if (route?.anchor && active?.path.isConnected) {
    const params = new URLSearchParams(url.hash.split("?")[1] || "");
    if (active.mode === "reference" && !params.has("view")) {
      event.preventDefault();
      params.set("view", "reference");
      location.hash = `#/docs/01-REST-APIS?${params}`;
      active.revealAnchor(route.anchor, true);
      return;
    }
    if (route.mode === "reference") active.show("reference", active.stage);
    active.revealAnchor(route.anchor, true);
  }
}, { capture: true });
initialize();
