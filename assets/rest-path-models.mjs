export const restPath = "/docs/01-REST-APIS";

export const restStages = [
  { id: 0, title: "Overview & quick reference", summary: "The complete roadmap and lookup tables", outcome: "Use the original quick reference and table of contents, then return to any learning stage.", story: "Meet the learning platform and preview its API contract." },
  { id: 1, title: "Model the resources", summary: "Resources, URLs, and methods", outcome: "Translate a learner's requirement into a resource, an address, and an HTTP operation.", story: "Build the course catalogue: list, open, create, update, and remove a course." },
  { id: 2, title: "Follow the messages", summary: "Requests, responses, and status", outcome: "Read an entire HTTP exchange and explain what the client knows from its response.", story: "Follow the same course through headers, a JSON body, server processing, and a result." },
  { id: 3, title: "Shape the collection", summary: "Filters, sorting, and pagination", outcome: "Design a bounded collection response instead of returning every record.", story: "Let learners search, filter, and page through the course catalogue." },
  { id: 4, title: "Make retries safe", summary: "Uncertainty and duplicate effects", outcome: "Distinguish a repeated request from a repeated business effect and explain the limits of a replay contract.", story: "Enroll a learner in that course; lose the response and examine the retry." },
  { id: 5, title: "Reuse and protect state", summary: "Caching, validators, and conflicts", outcome: "Explain cache revalidation and why checking a version prevents a lost update.", story: "Reuse the course representation, then let two editors meet at its version boundary." },
  { id: 6, title: "Operate the contract", summary: "Evolution, access, and resilience", outcome: "Explain how the same course API evolves, controls access, and handles production failures.", story: "Take the course catalogue toward production without treating a new technology as an automatic upgrade." },
];

export function stageFromPartTitle(title) {
  const match = /^Part ([1-6]):/.exec(title.trim());
  return match ? Number(match[1]) : null;
}

export function readRestRoute(hash) {
  const raw = hash.replace(/^#/, "");
  const [path, query = ""] = raw.split("?");
  if (path.replace(/\.md$/i, "").replace(/\/$/, "") !== restPath) return null;
  const params = new URLSearchParams(query);
  const stageText = params.get("stage");
  const view = params.get("view");
  const invalidStage = stageText !== null && !/^[0-6]$/.test(stageText);
  const invalidView = view !== null && view !== "guided" && view !== "reference";
  return {
    mode: invalidStage || invalidView ? "reference" : view || "guided",
    stage: invalidStage ? 1 : stageText === null ? 1 : Number(stageText),
    anchor: params.get("id"),
    warning: invalidStage || invalidView ? "This learning-path link has an unrecognized stage or view. The full reference is shown so no lesson content is inaccessible." : "",
  };
}

export function restStageHash(mode, stage) {
  if (!["guided", "reference"].includes(mode)) throw new RangeError("Unknown REST reading mode");
  if (!Number.isInteger(stage) || stage < 0 || stage > 6) throw new RangeError("Unknown REST learning stage");
  return `#${restPath}?view=${mode}&stage=${stage}`;
}

export function resolveRestSelection(route, anchorStages) {
  if (!route) throw new TypeError("A REST route is required");
  if (route.mode === "reference" || !route.anchor) return { ...route };
  const stage = anchorStages.get(route.anchor);
  return stage === undefined
    ? { ...route, mode: "reference" }
    : { ...route, stage };
}
