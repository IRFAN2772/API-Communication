const chapters = [
  { path: "/docs/00-GUIDED-FUNDAMENTALS", title: "Fundamentals", group: "Foundation", deck: "Start with one course request. Change the requirement and explain the trade-off." },
  { path: "/docs/01-GUIDED-REST", title: "REST APIs", group: "Foundation", deck: "Evolve one course contract; explain the state, failure, and trade-off at every step." },
  { path: "/docs/02-GUIDED-GRAPHQL", title: "GraphQL", group: "Core protocols", deck: "Compare REST alternatives, select a shape, and account for the work behind it." },
  { path: "/docs/03-GUIDED-RPC-AND-GRPC", title: "RPC & gRPC", group: "Core protocols", deck: "Compare typed contracts, then follow remote failure, streams, and their operational costs." },
  { path: "/docs/04-GUIDED-REALTIME", title: "Real-time communication", group: "Communication layer", deck: "Compare freshness, direction, recovery and delivery rather than choosing a permanent connection by default." },
  { path: "/docs/05-GUIDED-ASYNC", title: "Async APIs & events", group: "Communication layer", deck: "Follow one completion through durable intent, delivery, replay and bounded recovery." },
  { path: "/docs/06-GUIDED-ARCHITECTURE", title: "API architecture", group: "Platform layer", deck: "Evolve a small backend through justified boundaries, explicit contracts and bounded capacity." },
  { path: "/docs/07-GUIDED-EXPERT-DESIGN", title: "Expert API design", group: "Mastery", deck: "Follow compatible change, measured reliability and justified coordination without a mandatory technology stack." },
  { path: "/docs/GUIDED-SENIOR-DESIGN", title: "Senior design guide", group: "Companion guide", deck: "Build and review one requirements-driven design, with explicit estimates, ownership and recovery." },
  { path: "/docs/GUIDED-CASE-STUDIES", title: "System design case studies", group: "Companion guide", deck: "Work complete transfer cases with explicit assumptions, authority, ambiguous failures and trade-offs." },
];

const referencePages = [
  { path: "/docs/00-FUNDAMENTALS", title: "Fundamentals — complete reference", group: "Complete reference" },
  { path: "/docs/01-REST-APIS", title: "REST APIs — complete reference", group: "Complete reference" },
  { path: "/docs/02-GRAPHQL", title: "GraphQL — complete reference", group: "Complete reference" },
  { path: "/docs/03-RPC-AND-GRPC", title: "RPC & gRPC — complete reference", group: "Complete reference" },
  { path: "/docs/04-REALTIME-COMMUNICATION", title: "Real-time — complete reference", group: "Complete reference" },
  { path: "/docs/05-ASYNC-APIS", title: "Async APIs — complete reference", group: "Complete reference" },
  { path: "/docs/06-API-ARCHITECTURE", title: "API architecture — complete reference", group: "Complete reference" },
  { path: "/docs/08-EXPERT-API-DESIGN", title: "Expert API design — complete reference", group: "Complete reference" },
  { path: "/docs/07-SENIOR-DESIGN-GUIDE", title: "Senior design — complete reference", group: "Complete reference" },
  { path: "/docs/09-SYSTEM-DESIGN-CASE-STUDIES", title: "Case studies — complete reference", group: "Complete reference" },
  { path: "/docs/COURSE-CONTENT-MAP", title: "All topics & reading destinations", group: "Complete reference" },
  { path: "/docs/CONTENT-CORRECTIONS", title: "Corrections & distinctions", group: "Complete reference" },
  { path: "/docs/lessons/REST-HTTP-CONTRACTS", title: "HTTP contracts & representations", group: "REST related lessons" },
  { path: "/docs/lessons/REST-COLLECTIONS-AND-CACHING", title: "Collections, caching & validators", group: "REST related lessons" },
  { path: "/docs/lessons/REST-AUTH-AND-EVOLUTION", title: "Access & contract evolution", group: "REST related lessons" },
  { path: "/docs/lessons/REST-RELIABILITY-AND-OPERATIONS", title: "Reliability & operations", group: "REST related lessons" },
  { path: "/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING", title: "GraphQL execution, errors & batching", group: "GraphQL related lessons" },
  { path: "/docs/lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION", title: "GraphQL cost, caching & evolution", group: "GraphQL related lessons" },
  { path: "/docs/lessons/GRPC-PROTOBUF-AND-EVOLUTION", title: "Protobuf, wire format & evolution", group: "gRPC related lessons" },
  { path: "/docs/lessons/GRPC-LIFECYCLE-AND-OPERATIONS", title: "gRPC lifecycle, streaming & operations", group: "gRPC related lessons" },
  { path: "/docs/lessons/REALTIME-RECOVERY-AND-FLOW", title: "Real-time recovery & flow control", group: "Real-time related lessons" },
  { path: "/docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS", title: "Webhooks & background jobs", group: "Real-time related lessons" },
  { path: "/docs/lessons/PUSH-NOTIFICATION-DELIVERY", title: "Push notification delivery", group: "Real-time related lessons" },
  { path: "/docs/lessons/WEBRTC-MEDIA-AND-CONNECTIVITY", title: "WebRTC media & connectivity", group: "Real-time related lessons" },
  { path: "/docs/lessons/BROKERS-DELIVERY-AND-RECOVERY", title: "Brokers, delivery & recovery", group: "Async related lessons" },
  { path: "/docs/lessons/OUTBOX-INBOX-AND-WORKFLOWS", title: "Outbox, inbox & workflows", group: "Async related lessons" },
  { path: "/docs/lessons/EVENT-MODELS-AND-PROJECTIONS", title: "Event models & projections", group: "Async related lessons" },
  { path: "/docs/lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING", title: "Gateways, BFFs & load balancing", group: "Architecture related lessons" },
  { path: "/docs/lessons/SERVICE-MESH-AND-TRUST", title: "Service mesh & trust", group: "Architecture related lessons" },
  { path: "/docs/lessons/API-CONTRACTS-AND-LIFECYCLE", title: "API contracts & lifecycle", group: "Architecture related lessons" },
  { path: "/docs/lessons/BACKPRESSURE-AND-CAPACITY", title: "Backpressure & capacity", group: "Architecture related lessons" },
  { path: "/docs/lessons/CONTRACT-EVOLUTION-AND-CONSUMERS", title: "Contract evolution & consumers", group: "Expert related lessons" },
  { path: "/docs/lessons/REGIONS-AND-CONSISTENCY", title: "Regions & consistency", group: "Expert related lessons" },
  { path: "/docs/lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY", title: "Distributed transactions & recovery", group: "Expert related lessons" },
  { path: "/docs/lessons/CONSENSUS-AND-COORDINATION", title: "Consensus & coordination", group: "Expert related lessons" },
  { path: "/docs/lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS", title: "Reliability, observability & incidents", group: "Expert related lessons" },
  { path: "/docs/lessons/TENANCY-USAGE-AND-GOVERNANCE", title: "Tenancy, usage & governance", group: "Expert related lessons" },
  { path: "/docs/lessons/REQUIREMENTS-AND-ESTIMATION", title: "Requirements & estimation", group: "Senior related lessons" },
  { path: "/docs/lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS", title: "SOAP, XML & enterprise contracts", group: "Senior related lessons" },
  { path: "/docs/lessons/SHARDING-CACHING-AND-INFRASTRUCTURE", title: "Sharding, caching & infrastructure", group: "Senior related lessons" },
  { path: "/docs/lessons/CASE-WHATSAPP-MESSAGING", title: "WhatsApp-style messaging", group: "Case study lessons" },
  { path: "/docs/lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA", title: "Instagram-style feeds & media", group: "Case study lessons" },
  { path: "/docs/lessons/CASE-NETFLIX-PLAYBACK", title: "Netflix-style playback", group: "Case study lessons" },
  { path: "/docs/lessons/CASE-UBER-DISPATCH-AND-PAYMENTS", title: "Uber-style dispatch & payments", group: "Case study lessons" },
  { path: "/docs/lessons/CASE-TWITTER-TIMELINES", title: "Twitter-style timelines", group: "Case study lessons" },
  { path: "/docs/lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY", title: "YouTube-style uploads & delivery", group: "Case study lessons" },
  { path: "/docs/lessons/CASE-STUDY-TRANSFERS", title: "Other-system transfer exercises", group: "Case study lessons" },
];

function routePath(hash) {
  return (hash.replace(/^#/, "").split("?")[0] || "/")
    .replace(/\.md$/i, "")
    .replace(/\/$/, "") || "/";
}

const root = document.documentElement;
const menu = document.getElementById("studio-menu");
const focus = document.getElementById("studio-focus");
const depth = document.getElementById("studio-depth");
const backdrop = document.getElementById("studio-nav-backdrop");
const topCurrent = document.querySelector(".studio-top-current");
const mobile = matchMedia("(max-width: 768px)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let activePath = "";
let restoreFocusAfterLesson = false;
let navigationWasOpen = false;
let observedSidebar;
let pendingNavigation;

function setDepth(enabled) {
  root.dataset.studioDepth = enabled ? "deep" : "flat";
  depth.setAttribute("aria-pressed", String(enabled));
  depth.setAttribute("aria-label", enabled ? "Decorative depth enabled" : "Decorative depth disabled");
}

function isNavigationOpen() {
  if (root.classList.contains("studio-focus")) return false;
  return mobile.matches ? document.body.classList.contains("close") : !document.body.classList.contains("close");
}

function syncNavigation() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const open = isNavigationOpen();
  const overlay = open && mobile.matches;
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Close chapter navigation" : "Open chapter navigation");
  sidebar.inert = !open;
  sidebar.setAttribute("aria-hidden", String(!open));
  root.classList.toggle("studio-nav-open", overlay);
  backdrop.hidden = !overlay;
  const content = document.querySelector("section.content");
  if (content) content.inert = overlay;
  document.querySelector(".studio-brand").inert = overlay;
  document.querySelector(".studio-tools").inert = overlay;
  if (navigationWasOpen && !open && sidebar.contains(document.activeElement)) {
    menu.focus({ preventScroll: true });
  }
  navigationWasOpen = open;
}

function setNavigation(open) {
  if (open && root.classList.contains("studio-focus")) {
    root.classList.remove("studio-focus");
    focus.setAttribute("aria-pressed", "false");
    updateTopCurrent();
  }
  document.body.classList.toggle("close", mobile.matches ? open : !open);
  syncNavigation();
}

function updateTopCurrent() {
  const chapter = [...chapters, ...referencePages].find(item => item.path === activePath);
  topCurrent.textContent = root.classList.contains("studio-focus")
    ? "Focus reading"
    : chapter ? chapter.title : "Learn through the problem";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function decorateSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  if (sidebar !== observedSidebar) {
    sidebarObserver.disconnect();
    sidebarObserver.observe(sidebar, { childList: true, subtree: true });
    observedSidebar = sidebar;
  }
  sidebar.id = "studio-chapters";
  sidebar.setAttribute("aria-label", "Course chapter navigation");
  const name = sidebar.querySelector(".app-name");
  if (name && !name.querySelector(".studio-sidebar-intro")) {
    name.append(element("span", "studio-sidebar-intro", "10 chapters. One connected journey."));
  }
  const search = sidebar.querySelector(".search input");
  if (search) search.setAttribute("aria-label", "Search all course chapters");
  sidebar.querySelectorAll(".sidebar-nav a[href]").forEach(link => {
    const url = new URL(link.href);
    const path = routePath(url.hash);
    const index = chapters.findIndex(item => item.path === path);
    const headingLink = new URLSearchParams(url.hash.split("?")[1] || "").has("id");
    const reference = referencePages.some(item => item.path === path);
    if (!headingLink && (index >= 0 || reference || path === "/")) {
      link.dataset.studioIndex = index >= 0 ? String(index + 1).padStart(2, "0") : reference ? "REF" : "HQ";
      if (path === activePath) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  });
  menu.hidden = false;
  root.classList.add("studio-enhanced");
  syncNavigation();
}

function readingMetadata(main, home) {
  if (home) return ["10 connected chapters", "Free & open source", "Self-paced"];
  const copy = main.cloneNode(true);
  copy.querySelectorAll(".studio-lesson-head, api-visual, course-map, rest-visual, rest-design, .rest-learning-path, .rlp-footer, .docsify-pagination-container, script, style").forEach(node => node.remove());
  const words = (copy.textContent.match(/\S+/g) || []).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  const sections = main.querySelectorAll(":scope > h2, :scope > .rest-path-section > h2").length;
  const metadata = [main.querySelector(".rest-hero") ? `Full chapter: about ${minutes} min to read` : `About ${minutes} min to read`];
  if (sections) metadata.push(`${sections} sections`);
  metadata.push(main.querySelector("api-visual, rest-visual") ? "Reference + interactive examples" : "Reference chapter");
  return metadata;
}

function makeLessonHeader(main) {
  const chapter = [...chapters, ...referencePages].find(item => item.path === activePath);
  const home = activePath === "/";
  const title = chapter?.title || (home ? "Your systems journey starts here." : main.querySelector("h1")?.textContent || "Course reference");
  const group = chapter?.group || (home ? "Zero to hero" : "Reference");
  const chapterIndex = chapters.indexOf(chapter);
  const header = element("div", "studio-lesson-head");
  header.dataset.studioPath = activePath;
  const breadcrumb = element("nav", "studio-breadcrumbs");
  breadcrumb.setAttribute("aria-label", "Breadcrumb");
  const trail = element("ol");
  const homeItem = element("li");
  const homeLink = element("a", "", "Studio");
  homeLink.href = "#/";
  homeItem.append(homeLink);
  const groupItem = element("li", "", group);
  const currentItem = element("li", "", home ? "Course map" : title);
  currentItem.setAttribute("aria-current", "page");
  trail.append(homeItem, groupItem, currentItem);
  breadcrumb.append(trail);
  header.append(breadcrumb);
  if (["/docs/00-FUNDAMENTALS", "/docs/01-REST-APIS", "/docs/02-GRAPHQL", "/docs/03-RPC-AND-GRPC", "/docs/04-REALTIME-COMMUNICATION", "/docs/05-ASYNC-APIS", "/docs/06-API-ARCHITECTURE", "/docs/07-SENIOR-DESIGN-GUIDE", "/docs/08-EXPERT-API-DESIGN", "/docs/09-SYSTEM-DESIGN-CASE-STUDIES"].includes(activePath)) {
    const notice = element("p", "studio-reference-note", "This original reference is preserved unchanged. Read the corrected explanations and distinctions alongside it: ");
    const link = element("a", "", "Corrections & distinctions");
    link.href = "#/docs/CONTENT-CORRECTIONS";
    notice.append(link);
    header.append(notice);
  }
  if (document.body.classList.contains("course-reading") || main.querySelector("course-map, .phase-zero-hero, .rest-hero")) {
    if (!home) {
      const metadata = element("ul", "studio-lesson-meta");
      metadata.setAttribute("aria-label", "Learning metadata");
      readingMetadata(main, false).forEach(text => metadata.append(element("li", "", text)));
      header.append(metadata);
    }
    return header;
  }
  const banner = element("div", "studio-lesson-banner");
  const copy = element("div", "studio-lesson-copy");
  const eyebrow = element("p", "studio-eyebrow", home ? "A STUDIO FOR SYSTEMS THINKING" : chapterIndex >= 0 ? `${group} / Chapter ${String(chapterIndex + 1).padStart(2, "0")}` : chapter ? group : "THE COURSE LIBRARY");
  const heading = element("p", "studio-lesson-title", title);
  const deck = element("p", "studio-lesson-deck", chapter?.deck || (home
    ? "Learn how modern systems talk. Explore the concepts, follow the messages, then design with intention."
    : "Explore the original course reference, examples, and explanations."));
  const metadata = element("ul", "studio-lesson-meta");
  metadata.setAttribute("aria-label", "Learning metadata");
  readingMetadata(main, home).forEach(text => metadata.append(element("li", "", text)));
  copy.append(eyebrow, heading, deck, metadata);
  const stage = element("div", "studio-stage");
  stage.setAttribute("aria-hidden", "true");
  stage.innerHTML = `<div class="studio-plane studio-plane-back"></div>
    <div class="studio-plane studio-plane-middle"></div>
    <div class="studio-plane"><svg viewBox="0 0 100 58">
      <rect x="4" y="18" width="23" height="23" rx="5"/>
      <rect x="39" y="9" width="23" height="40" rx="5"/>
      <rect x="74" y="18" width="23" height="23" rx="5"/>
      <path d="M27 29h12m23 0h12M47 20h7m-7 8h7m-7 8h7"/>
    </svg></div><span class="studio-stage-caption">LEARN / CONNECT / DESIGN</span>`;
  banner.append(copy, stage);
  header.append(banner);
  return header;
}

function resetReadingPosition() {
  const documentScroller = document.scrollingElement || document.documentElement;
  const content = document.querySelector("section.content");
  documentScroller.scrollTo({ top: 0, behavior: "instant" });
  if (content && content !== documentScroller) {
    content.scrollTo({ top: 0, behavior: "instant" });
  }
}

function refreshLesson() {
  const main = document.querySelector(".markdown-section");
  if (!main || !main.childElementCount) return;
  const previousPath = activePath;
  const navigation = pendingNavigation;
  pendingNavigation = undefined;
  activePath = routePath(location.hash);
  document.body.classList.toggle("course-reading",
    ["/", "/docs/00-GUIDED-FUNDAMENTALS", "/docs/01-GUIDED-REST", "/docs/02-GUIDED-GRAPHQL", "/docs/03-GUIDED-RPC-AND-GRPC", "/docs/04-GUIDED-REALTIME", "/docs/05-GUIDED-ASYNC", "/docs/06-GUIDED-ARCHITECTURE", "/docs/07-GUIDED-EXPERT-DESIGN", "/docs/GUIDED-SENIOR-DESIGN", "/docs/GUIDED-CASE-STUDIES", "/docs/COURSE-CONTENT-MAP", "/docs/CONTENT-CORRECTIONS"].includes(activePath) ||
    activePath.startsWith("/docs/lessons/"));
  const renderedPath = activePath;
  const resetScroll = previousPath !== renderedPath && navigation?.path === renderedPath &&
    !new URLSearchParams(location.hash.split("?")[1] || "").has("id");
  main.tabIndex = -1;
  main.setAttribute("aria-label", "Lesson content");
  // Docsify keeps the same article across routes; replace only our own chrome.
  const oldHeader = main.querySelector(":scope > .studio-lesson-head");
  if (!oldHeader || oldHeader.dataset.studioPath !== activePath) {
    oldHeader?.remove();
    main.prepend(makeLessonHeader(main));
  }
  updateTopCurrent();
  decorateSidebar();
  if (restoreFocusAfterLesson) {
    main.focus({ preventScroll: true });
    restoreFocusAfterLesson = false;
  }
  requestAnimationFrame(() => {
    if (resetScroll && routePath(location.hash) === renderedPath &&
        !new URLSearchParams(location.hash.split("?")[1] || "").has("id")) {
      resetReadingPosition();
    }
    window.dispatchEvent(new Event("scroll"));
  });
}

menu.addEventListener("click", event => {
  // Docsify's mobile body handler must not immediately close this custom toggle.
  event.stopPropagation();
  const open = !isNavigationOpen();
  setNavigation(open);
  if (open && mobile.matches) {
    const first = document.querySelector(".sidebar .search input, .sidebar a[href]");
    first?.focus({ preventScroll: true });
  }
});

focus.addEventListener("click", () => {
  const enabled = root.classList.toggle("studio-focus");
  focus.setAttribute("aria-pressed", String(enabled));
  if (enabled && mobile.matches) document.body.classList.remove("close");
  updateTopCurrent();
  syncNavigation();
  requestAnimationFrame(() => window.dispatchEvent(new Event("scroll")));
});

depth.addEventListener("click", () => {
  if (!reducedMotion.matches) setDepth(root.dataset.studioDepth !== "deep");
});
backdrop.addEventListener("click", event => {
  event.stopPropagation();
  setNavigation(false);
  menu.focus({ preventScroll: true });
});

document.querySelector(".studio-skip").addEventListener("click", event => {
  const main = document.querySelector(".markdown-section");
  if (!main) return;
  event.preventDefault();
  if (mobile.matches) setNavigation(false);
  main.focus({ preventScroll: true });
  main.scrollIntoView({ block: "start", behavior: "auto" });
});

document.addEventListener("click", event => {
  if (!(event.target instanceof Element) || event.defaultPrevented || event.button > 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[href]");
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash.startsWith("#/")) return;
  const path = routePath(url.hash);
  const anchor = new URLSearchParams(url.hash.split("?")[1] || "").has("id");
  // Docsify's link detector misses deeply nested brand/SVG clicks.
  const navigation = !anchor && path !== activePath ? { path } : undefined;
  pendingNavigation = navigation;
  if (navigation) {
    queueMicrotask(() => {
      if (event.defaultPrevented && pendingNavigation === navigation && routePath(location.hash) !== path) {
        pendingNavigation = undefined;
      }
    });
  }
  if (!link.closest(".sidebar") || !mobile.matches || !isNavigationOpen()) return;
  setNavigation(false);
  if (path === activePath) {
    document.querySelector(".markdown-section")?.focus({ preventScroll: true });
  } else {
    restoreFocusAfterLesson = true;
  }
}, { capture: true });

document.addEventListener("keydown", event => {
  if (!mobile.matches || !isNavigationOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    setNavigation(false);
    menu.focus({ preventScroll: true });
  } else if (event.key === "Tab") {
    const targets = [menu, ...document.querySelectorAll(".sidebar a[href], .sidebar button, .sidebar input, .sidebar select, .sidebar [tabindex]")];
    const available = targets.filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
    const first = available[0];
    const last = available[available.length - 1];
    if (event.shiftKey && (document.activeElement === first || !available.includes(document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !available.includes(document.activeElement))) {
      event.preventDefault();
      first?.focus();
    }
  }
});

mobile.addEventListener("change", () => {
  document.body.classList.remove("close");
  syncNavigation();
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) setDepth(false);
});

const sidebarObserver = new MutationObserver(decorateSidebar);
new MutationObserver(syncNavigation).observe(document.body, { attributes: true, attributeFilter: ["class"] });
window.addEventListener("studio:lesson-ready", refreshLesson);
window.addEventListener("hashchange", () => {
  if (pendingNavigation && routePath(location.hash) !== pendingNavigation.path) {
    pendingNavigation = undefined;
  }
});
setDepth(false);
focus.hidden = false;
focus.setAttribute("aria-label", "Focus reading");
depth.hidden = false;
refreshLesson();
