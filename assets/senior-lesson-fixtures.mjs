import { expertCourse, expertEnrollment } from "./expert-lesson-fixtures.mjs";
import { completionFact, emailCommand, certificateCommand } from "./async-lesson-fixtures.mjs";

export const seniorCourse = structuredClone(expertCourse);
export const seniorEnrollment = structuredClone(expertEnrollment);
export const seniorCompletion = structuredClone(completionFact);
export const seniorEmailCommand = structuredClone(emailCommand);
export const seniorCertificateCommand = structuredClone(certificateCommand);
export const trafficAssumptions = {
  registeredUsers: 100_000_000,
  dailyActiveUsers: 10_000_000,
  callsPerActiveUserPerDay: 100,
  secondsPerDay: 86_400,
  peakFactor: 5,
  planningPeakRequestsPerSecond: 60_000,
  averageResponseBodyBytes: 5_000,
  largerResponseBodyBytes: 50_000,
};
export const connectionAssumptions = {
  simultaneousConnections: 1_000_000,
  stateBytesPerConnection: 50_000,
  reconnectFraction: 0.01,
  reconnectWindowSeconds: 20,
};
export const retentionAssumptions = {
  eventFraction: 0.05,
  averageEventBodyBytes: 2_000,
  retentionDays: 7,
  replicationFactor: 3,
};
export const burstAssumptions = {
  offeredEventsPerSecond: 5_000,
  serviceEventsPerSecond: 4_000,
  waitingCapacity: 10_000,
  recoveryEventsPerSecond: 3_000,
};
export const shardCase = {
  tenantId: "org-a",
  courseId: "course-101",
  source: "shard-a",
  target: "shard-b",
  initialEpoch: 7,
  nextEpoch: 8,
  initialRecordVersion: 1,
  nextRecordVersion: 2,
  initialLabel: "daily",
  changedLabel: "weekly",
};
export const soapContract = {
  envelopeNamespace: "http://www.w3.org/2003/05/soap-envelope",
  applicationNamespace: "urn:learning-course:v1",
  wsdlNamespace: "http://schemas.xmlsoap.org/wsdl/",
  soapBindingNamespace: "http://schemas.xmlsoap.org/wsdl/soap12/",
  operation: "GetCourse",
  action: "urn:learning-course:v1:GetCourse",
  endpoint: "https://learn.example/soap/course",
};
