import { completionEvent } from "./realtime-lesson-fixtures.mjs";

// Independent post-enrollment timeline; earlier preview resets do not carry over.
export const asyncCourse = { id: "course-101", title: "API Fundamentals", seats: 29 };
export const asyncLearner = "learner-7";
export const asyncEnrollment = "enrollment-42";
export const completionFact = structuredClone(completionEvent);
export const emailCommand = {
  id: "email-completion-42",
  type: "SendCompletionEmail",
  completionId: "completion-42",
  courseId: "course-101",
  learnerId: "learner-7",
};
export const certificateCommand = {
  id: "certificate-completion-42",
  type: "IssueCertificate",
  completionId: "completion-42",
  courseId: "course-101",
  learnerId: "learner-7",
};

// An alternative event-store envelope, not an implicit change to the webhook body.
export const aggregateId = "learner-7/course-101/enrollment-42";
export const projectionEvents = [
  {
    id: "progress-20", type: "course.progress-recorded", aggregateId, version: 1,
    data: { courseId: "course-101", learnerId: "learner-7", percentComplete: 20 },
  },
  {
    id: "progress-40", type: "course.progress-recorded", aggregateId, version: 2,
    data: { courseId: "course-101", learnerId: "learner-7", percentComplete: 40 },
  },
  { ...structuredClone(completionEvent), aggregateId, version: 3 },
];
export const queueBudget = {
  arrivalsPerSecond: 10,
  processingPerSecond: 4,
  overloadSeconds: 60,
  recoveryArrivalsPerSecond: 2,
};
export const classicConsumerGroup = { partitions: 2, consumers: 3 };
