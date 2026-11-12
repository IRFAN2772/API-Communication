export const messagingCase = {
  messageId: "message-101",
  conversationId: "conversation-7",
  senderId: "sender-1",
  recipientId: "recipient-2",
  requestKey: "send-101-a",
  ciphertext: "opaque-demo-bytes",
  recipientDevices: ["recipient-2-phone", "recipient-2-web"],
};
export const messagingScale = {
  dailyActiveUsers: 500_000_000,
  messagesPerActiveUserPerDay: 40,
  secondsPerDay: 86_400,
  peakFactor: 5,
  averageMessageBodyBytes: 1_000,
  retentionDays: 30,
  assumedConcurrentConnections: 500_000_000,
  assumedConnectionsPerGateway: 100_000,
};
export const photoCase = {
  photoId: "photo-101",
  authorId: "author-1",
  uploadId: "photo-upload-101",
  sourceVersion: 1,
  sourceObject: "photos/photo-101/source-v1",
  requiredVariants: ["thumbnail", "display"],
};
export const fanoutCase = {
  postId: "post-101",
  authorId: "author-1",
  requestKey: "post-101-a",
  recipients: ["reader-1", "reader-2", "reader-3"],
  ordinaryFollowers: 3,
  broadcasterFollowers: 1_000_000,
  postsPerSecond: 20,
};
export const playbackCase = {
  sessionId: "playback-101",
  assetId: "movie-101",
  assetGeneration: 7,
  segmentSeconds: 4,
  representations: [
    { id: "low", bitrateBitsPerSecond: 1_000_000 },
    { id: "mid", bitrateBitsPerSecond: 3_000_000 },
    { id: "high", bitrateBitsPerSecond: 6_000_000 },
  ],
  estimatedThroughputBitsPerSecond: 4_000_000,
  safetyFraction: 0.75,
};
export const uploadCase = {
  uploadId: "upload-101",
  videoId: "video-101",
  ownerId: "uploader-1",
  parts: [{ number: 1, body: "abc" }, { number: 2, body: "def" }],
  expectedBytes: 6,
  requiredVariants: ["low", "high"],
};
export const uploadScale = {
  uploadedHoursPerMinute: 500,
  minutesPerDay: 1_440,
  averageVideoDurationHours: 0.25,
  resolutions: 5,
  formats: 3,
  sourceBytesPerHour: 1_000_000_000,
};
export const rideCase = {
  rideId: "ride-101",
  riderId: "rider-1",
  driverId: "driver-1",
  requestKey: "ride-101-a",
  offerToken: 7,
  nowMs: 10_000,
  offerExpiresAtMs: 20_000,
  chargeKey: "charge-ride-101",
  fareCents: 1_500,
  currency: "USD",
};
export const locationCase = {
  nowMs: 10_000,
  maxAgeMs: 5_000,
  rider: { xKm: 0, yKm: 0 },
  drivers: [
    { id: "driver-1", xKm: 1, yKm: 0, observedAtMs: 9_000 },
    { id: "driver-2", xKm: 0.1, yKm: 0, observedAtMs: 2_000 },
  ],
};
export const expiryCase = {
  contentId: "snap-101",
  createdAtMs: 0,
  expiresAtMs: 86_400_000,
  nowMs: 86_400_000,
};
export const liveWindowCase = { firstSegment: 101, lastSegment: 103, segmentSeconds: 4 };
