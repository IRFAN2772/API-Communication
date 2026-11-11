export const requestScenarios = {
  found: "Course exists",
  missing: "Course does not exist",
  lost: "Response is lost",
};

export function requestFrame(scenario, step) {
  if (!Object.hasOwn(requestScenarios, scenario)) throw new RangeError("Unknown request scenario");
  if (!Number.isInteger(step) || step < 0 || step > 5) throw new RangeError("Request step must be 0–5");
  const missing = scenario === "missing";
  const lost = scenario === "lost";
  const path = missing ? "/courses/999" : "/courses/123";
  const response = missing
    ? '404 Not Found\n{"error":"Course not found"}'
    : '200 OK\n{"id":123,"title":"API Fundamentals"}';
  const frames = [
    ["A learner opens a course", "The browser needs course data. It knows the API address, not the database credentials.", "client", "Not sent", "Waiting for a request", "Not queried"],
    ["Send the request", `The client sends GET ${path}. GET asks to read a representation; it does not enroll the learner.`, "request", "Waiting for a response", "Request arriving", "Not queried"],
    ["Check the request", "The API checks the request and any required access rules, then asks storage for the course. An API boundary is not automatic security: these checks must be implemented.", "lookup", "Waiting for a response", "Looking up the course", "Lookup in progress"],
    ["Storage answers the API", missing ? "No matching course exists. The server can report this without leaking database details." : "Storage returns the course record to the API, not directly to the browser.", "storage", "Waiting for a response", "Preparing an HTTP response", missing ? "No matching record" : "Course 123 found"],
    ["Return the response", lost ? "The server produced a 200 response, but it is lost before the browser receives it. Server success and client knowledge are different." : `The API returns ${missing ? "404" : "200"} with a body. A received 404 is a known application outcome, not a network timeout.`, lost ? "lost" : "response", lost ? "Still waiting" : missing ? "Knows course is missing" : "Received course data", `Sent ${missing ? "404" : "200"}`, missing ? "No matching record" : "Course 123 found"],
    [lost ? "Timeout means uncertainty" : "The client uses the result", lost ? "The client stops waiting. It cannot infer the server outcome from a timeout alone. Retrying this read is different from retrying a payment; writes need a duplicate-effect policy." : missing ? "Show a useful not-found message. Repeating the same request will not fix a nonexistent ID." : "The page renders the course title. One user action involved a request, server-side work, and a response.", "client", lost ? "Timed out; outcome unknown" : missing ? "Show not-found message" : "Render course title", `Completed ${missing ? "404" : "200"}`, missing ? "No matching record" : "Course 123 found"],
  ];
  const [title, explanation, active, client, server, storage] = frames[step];
  return { title, explanation, active, client, server, storage, request: `GET ${path} HTTP/1.1\nAccept: application/json`, response: step < 4 ? "No response sent yet." : response, step };
}

export const decisions = {
  browse: {
    label: "Browse a course", branch: "Request / response", method: "Start with REST",
    example: "GET /courses/123 → 200 + course data",
    reason: "A resource-oriented HTTP endpoint fits a straightforward read and is easy to inspect.",
    alternative: "A REST BFF can aggregate a screen. Consider GraphQL when several clients genuinely need flexible selections; it does not make backend work free.",
    cost: "Define errors, access rules, caching, and compatibility. Internal services can also use REST.",
  },
  progress: {
    label: "Watch report progress", branch: "Live updates", method: "Consider SSE",
    example: "Server → browser: report 25%, 60%, ready",
    reason: "The live stream only needs server-to-client events. The browser can still send separate HTTP requests.",
    alternative: "Polling may be simpler if a few seconds of delay is acceptable. SSE needs reconnect, retention, and proxy-buffering decisions.",
    cost: "A persistent connection is not a promise of delivery. Define event IDs and recovery after a disconnect.",
  },
  chat: {
    label: "Join classroom chat", branch: "Live updates", method: "Consider WebSocket",
    example: "Learner ↔ classroom: messages and typing events",
    reason: "Frequent, low-latency messages need to move in both directions over a persistent connection.",
    alternative: "HTTP sends plus polling or SSE can also work. Choose based on interaction frequency and operational complexity.",
    cost: "Specify authentication, heartbeats, reconnects, message acknowledgments, and slow-client limits.",
  },
  email: {
    label: "Send a completion email", branch: "Deferred work", method: "Consider a queue",
    example: "Course completed → queued job → email worker",
    reason: "Email can happen after the user-facing operation, so its latency need not block the response.",
    alternative: "A simple background worker may suffice. Add a broker only when durability, distribution, or throughput requirements justify it.",
    cost: "Acceptance is not completion. Plan durable publication, retries, duplicate effects, and failure visibility.",
  },
  internal: {
    label: "Call an internal service", branch: "Request / response", method: "Consider gRPC",
    example: "Course service → recommendation service: GetSuggestions",
    reason: "Controlled clients and servers can benefit from typed contracts and generated client code.",
    alternative: "REST remains valid internally. Compare client support, debugging, deployment ownership, and measured workload—not a universal speed claim.",
    cost: "A remote call can fail independently. Set deadlines and define cancellation, compatibility, and retry behavior.",
  },
};

export const queuePresets = {
  balanced: { label: "Balanced traffic", arrival: 4, workers: 2 },
  burst: { label: "Traffic spike", arrival: 10, workers: 2 },
  recover: { label: "Recovery capacity", arrival: 4, workers: 4 },
};

export const queueLimit = 24;
export const workerRate = 2;
export function queueTick(state, arrival, workers) {
  for (const value of [state.queued, state.processed, state.rejected, state.time, arrival, workers]) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError("Queue inputs must be nonnegative integers");
  }
  if (state.queued > queueLimit) throw new RangeError("Queue exceeds its limit");
  // Discrete teaching model: workers first drain existing jobs, then new jobs arrive.
  const completed = Math.min(state.queued, workers * workerRate);
  const remaining = state.queued - completed;
  const accepted = Math.min(arrival, queueLimit - remaining);
  return {
    time: state.time + 1,
    queued: remaining + accepted,
    processed: state.processed + completed,
    rejected: state.rejected + arrival - accepted,
  };
}
