import { architectureCourse, enrollmentResponse } from "./architecture-lesson-fixtures.mjs";

export const expertCourse = structuredClone(architectureCourse);
export const expertEnrollment = structuredClone(enrollmentResponse);
export const proposedCourseRepresentation = {
  ...expertCourse,
  summary: "A requirement-driven introduction to API communication.",
};
export const partitionCase = {
  courseId: "course-101",
  initialSeats: 1,
  learners: ["learner-8", "learner-9"],
  replicas: ["A", "B", "C"],
  term: 12,
};
export const reliabilityWindow = {
  eligibleRequests: 1_000_000,
  badRequests: 2_000,
  target: 0.999,
};
export const burnWindow = { eligibleRequests: 10_000, badRequests: 50, target: 0.999, minutes: 5 };
export const latencySamplesMs = [...Array(94).fill(50), ...Array(4).fill(200), ...Array(2).fill(1000)];
export const fanoutBudget = {
  overallMs: 800,
  edgeMs: 40,
  identityMs: 60,
  courseMs: 120,
  enrollmentMs: 200,
  recommendationsMs: 300,
  composeMs: 50,
  returnMs: 50,
};
export const tenantCase = {
  verifiedTenant: "org-a",
  verifiedLearner: "learner-7",
  enrollment: { tenantId: "org-a", ...expertEnrollment },
  foreignTenant: "org-b",
  usageEvent: { id: "usage-42", tenantId: "org-a", operation: "catalogue.read", units: 3 },
};
export const reservationCase = {
  intentId: "reserve-license-8-a",
  learnerId: "learner-8",
  courseId: "course-101",
  reservationId: "reservation-8",
  providerKey: "license-reservation-8",
};
