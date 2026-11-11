export const rpcCourses = [
  { id: "course-101", title: "API Fundamentals", seats: 30 },
  { id: "course-102", title: "REST Studio", seats: 20 },
];
export const courseRequest = { courseId: "course-101" };
export const enrollmentRequest = { courseId: "course-101", idempotencyKey: "enroll-7-a" };
export const enrollmentReply = {
  enrollment: { id: "enrollment-42", courseId: "course-101", learnerId: "learner-7" },
  course: { id: "course-101", title: "API Fundamentals", seats: 29 },
};
export const progressUpdates = [
  { courseId: "course-101", percentComplete: 20, eventId: "progress-20" },
  { courseId: "course-101", percentComplete: 40, eventId: "progress-40" },
];
export const rpcCallShapes = [
  { service: "CourseService", method: "GetCourse", requestStream: false, responseStream: false },
  { service: "CourseService", method: "Enroll", requestStream: false, responseStream: false },
  { service: "ProgressService", method: "WatchProgress", requestStream: false, responseStream: true },
  { service: "ProgressService", method: "RecordProgress", requestStream: true, responseStream: false },
  { service: "ProgressService", method: "Discuss", requestStream: true, responseStream: true },
];
