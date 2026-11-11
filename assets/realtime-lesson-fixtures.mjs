import { progressUpdates } from "./rpc-lesson-fixtures.mjs";

// Independent preview-progress scenario: these updates do not allocate seats.
export const realtimeCourse = { id: "course-101", title: "API Fundamentals", seats: 30 };
export const realtimeLearner = "learner-7";
export const progressEvents = progressUpdates.map(update => ({
  id: update.eventId,
  event: "progress",
  data: { courseId: update.courseId, percentComplete: update.percentComplete },
}));
export const sseBody = ": keepalive\n\n" + progressEvents.map(event =>
  `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
export const websocketRequestKey = "dGhlIHNhbXBsZSBub25jZQ==";
export const websocketAccept = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
export const classroomMessage = {
  courseId: "course-101",
  messageId: "message-1",
  text: "Ready for class",
};
export const completionEvent = {
  id: "completion-42",
  type: "course.completed",
  data: { courseId: "course-101", learnerId: "learner-7" },
};
export const completionBody = JSON.stringify(completionEvent);
export const pushHint = { type: "course.completed", courseId: "course-101", eventId: "completion-42" };
export const progressRetentionSeconds = 300;
export const replayWindowSeconds = 300;
export const allowedFutureSeconds = 30;
export const webhookTimestamp = Math.floor(Date.parse("2026-11-11T10:00:00Z") / 1000);
export const webhookTestKey = "lesson-test-key-not-a-secret"; // Public test fixture, never a production credential.
