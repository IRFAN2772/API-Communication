import { applyCourseRequest, initialCourses } from "./rest-models.mjs";

const copy = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") freeze(child);
  }
  return Object.freeze(value);
};

export const designResources = freeze({
  users: {
    label: "Users", target: "/users/learner-7",
    description: "Who is learning? learner-7 identifies a learner, not a course.",
    connection: "A learner can browse courses, accumulate progress, and earn certificates.",
  },
  courses: {
    label: "Courses", target: "/courses/course-101",
    description: "What can they learn? course-101 is API Fundamentals, initially with 30 seats.",
    connection: "This walkthrough operates on the course catalogue. Creating REST Studio adds course-102.",
  },
  progress: {
    label: "Progress", target: "Learner + course progress",
    description: "How far has learner-7 advanced in API Fundamentals?",
    connection: "Progress relates a learner to a course. Reading the catalogue does not change progress.",
  },
  certificates: {
    label: "Certificates", target: "Learner + completed course",
    description: "What completion evidence has learner-7 earned for a course?",
    connection: "A certificate relates to a learner and a completed course; deleting a course is not earning one.",
  },
});

export const designStages = freeze([
  { id: "intent", label: "Intent" },
  { id: "resource", label: "Resource" },
  { id: "request", label: "HTTP request" },
  { id: "response", label: "Response" },
  { id: "visible", label: "Visible state" },
]);

export const designScenarios = freeze({
  choose: {
    label: "Choose the resource", intent: "Find the thing behind “fetch course details”.",
    target: "/courses/course-101", request: null,
    effect: "Choosing Courses identifies a resource; it does not send a request or change storage.",
    visible: "The catalogue is unchanged. Choose Read one course to fetch API Fundamentals.",
  },
  collection: {
    label: "Read the catalogue", intent: "Show learner-7 which courses are available.",
    target: "/courses", request: { method: "GET", path: "/courses" },
    effect: "Read a collection representation. No course, enrollment, or progress record is created.",
    visible: "The catalogue shows API Fundamentals with 30 seats. A read is not an enrollment.",
  },
  read: {
    label: "Read one course", intent: "Open the details of API Fundamentals.",
    target: "/courses/course-101", request: { method: "GET", path: "/courses/course-101" },
    effect: "Read one representation without changing the course.",
    visible: "The details show course-101: API Fundamentals, 30 seats.",
  },
  create: {
    label: "Create a course", intent: "An author adds REST Studio to the catalogue.",
    target: "/courses", request: { method: "POST", path: "/courses", body: { title: "REST Studio", seats: 20 } },
    effect: "Allocate course-102. Return 201 and Location: /courses/course-102, retaining course-101.",
    visible: "REST Studio, course-102, appears beside API Fundamentals in the catalogue.",
  },
  patch: {
    label: "Patch course seats", intent: "Change only API Fundamentals' seats from 30 to 20.",
    target: "/courses/course-101", request: { method: "PATCH", path: "/courses/course-101", body: { seats: 20 } },
    effect: "Assign seats=20 while preserving the server-owned ID and the title API Fundamentals.",
    visible: "API Fundamentals still has the same ID and title; its displayed seats are now 20.",
  },
  delete: {
    label: "Delete a course", intent: "An author removes API Fundamentals from the catalogue.",
    target: "/courses/course-101", request: { method: "DELETE", path: "/courses/course-101" },
    effect: "Remove the course mapping. Return 204 with no body, not an empty JSON object.",
    visible: "The catalogue has no course card. This model does not cascade into progress or certificates.",
  },
});

const reasons = { 200: "OK", 201: "Created", 204: "No Content" };

function requestText(request) {
  if (!request) return "No HTTP request. Naming a resource is a design choice, not a network operation.";
  return [`${request.method} ${request.path} HTTP/1.1`, "Host: learn.example", "Accept: application/json",
    ...(request.body ? ["Content-Type: application/json", "", JSON.stringify(request.body, null, 2)] : [])].join("\n");
}

function responseText(response) {
  if (!response) return "No HTTP response: no request was sent.";
  return [`HTTP/1.1 ${response.status} ${reasons[response.status]}`,
    ...Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`),
    ...(response.body === null ? [] : ["Content-Type: application/json", "", JSON.stringify(response.body, null, 2)])].join("\n");
}

export function designResource(id) {
  if (!Object.hasOwn(designResources, id)) throw new RangeError(`Unknown design resource: ${id}`);
  return designResources[id];
}

export function designTrace(scenario = "choose") {
  if (!Object.hasOwn(designScenarios, scenario)) throw new RangeError(`Unknown design scenario: ${scenario}`);
  const choice = designScenarios[scenario];
  const before = initialCourses();
  // The studio models item GETs; the design lesson also needs a collection read.
  const result = scenario === "collection"
    ? { state: copy(before), response: { status: 200, headers: {}, body: copy(before.courses) } }
    : choice.request ? applyCourseRequest(before, choice.request) : { state: copy(before), response: null };
  const explanations = [
    choice.intent,
    `${choice.target} names ${choice.target === "/courses" ? "the course collection" : "one course"}. Users, Progress, and Certificates are related resources, not substitutes for Courses.`,
    choice.request
      ? `${choice.request.method} gives the operation; ${choice.target} gives the target. ${choice.request.body ? "The JSON body supplies data under this API's contract." : "This request needs no body."}`
      : "Do not put the action in /getCourseDetails. Choose a resource first, then choose the HTTP method.",
    choice.effect,
    choice.visible,
  ];
  return designStages.map((stage, step) => ({
    step, stage: stage.id, title: stage.label, explanation: explanations[step],
    target: choice.target, method: choice.request?.method ?? null,
    request: step >= 2 ? requestText(choice.request) : "Not composed yet. Start with the intent and resource.",
    response: step >= 3 ? responseText(result.response) : "No response produced yet.",
    status: step >= 3 ? result.response?.status ?? null : null,
    delivered: step === 4 && result.response !== null,
    before: copy(before),
    snapshot: copy(step >= 3 ? result.state : before),
    visible: copy(step === 4 ? result.state : before),
    visibility: step === 4 ? choice.visible
      : step === 3 && choice.request ? "The API has produced a reply; the client has not received it yet."
        : "The client still shows the starting catalogue. No result is known yet.",
  }));
}

export function designFrame(scenario, step) {
  if (!Number.isSafeInteger(step)) throw new TypeError("Design step must be a safe integer");
  const frames = designTrace(scenario);
  return frames[Math.min(frames.length - 1, Math.max(0, step))];
}

export const designCheck = freeze({
  question: "Which request changes only the seats of API Fundamentals to 20?",
  options: {
    read: "GET /courses/course-101",
    create: "POST /courses with a new course",
    patch: 'PATCH /courses/course-101 with {"seats":20}',
    delete: "DELETE /courses/course-101",
  },
});

export function evaluateDesignAnswer(answer) {
  if (!Object.hasOwn(designCheck.options, answer)) throw new RangeError(`Unknown self-check answer: ${answer}`);
  const explanations = {
    read: "GET reads the course; it must not request a seats change.",
    create: "POST /courses creates a new course with a new ID, rather than editing course-101.",
    patch: "Correct. This API's PATCH assigns seats=20, preserving course-101 and its title. Repeating this assignment still ends at 20.",
    delete: "DELETE removes the course mapping; it does not assign a field.",
  };
  return { correct: answer === "patch", explanation: explanations[answer] };
}
