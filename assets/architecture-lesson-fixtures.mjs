import { asyncCourse, asyncLearner, asyncEnrollment } from "./async-lesson-fixtures.mjs";

export const architectureCourse = structuredClone(asyncCourse);
export const architectureLearner = asyncLearner;
export const architectureEnrollment = asyncEnrollment;
export const enrollmentResponse = {
  id: "enrollment-42",
  courseId: "course-101",
  learnerId: "learner-7",
};
export const catalogueResponse = {
  courses: [structuredClone(asyncCourse), { id: "course-102", title: "REST Studio", seats: 20 }],
  nextCursor: null,
};
export const stableObservation = { arrivalsPerSecond: 40, meanTimeInSystemSeconds: 0.125 };
export const requestCapacityModel = {
  concurrency: 4,
  serviceSeconds: 0.05,
  waitingCapacity: 40,
  overloadArrivalsPerSecond: 100,
  recoveryArrivalsPerSecond: 60,
};
