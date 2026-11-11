import { collectHeadings } from "./course-coverage.mjs";

export const realtimeReadingDestinations = [
  { id: "choice", path: "docs/04-GUIDED-REALTIME.md", anchor: "rt-choice" },
  { id: "updates", path: "docs/lessons/REALTIME-RECOVERY-AND-FLOW.md" },
  { id: "webhooks", path: "docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md" },
  { id: "background", path: "docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md" },
  { id: "push", path: "docs/lessons/PUSH-NOTIFICATION-DELIVERY.md" },
  { id: "media", path: "docs/lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md" },
];

export function mapRealtimeHeadings(markdown) {
  let family = "choice";
  const parts = { 1: "updates", 2: "webhooks", 3: "background", 4: "push", 5: "media" };
  return collectHeadings(markdown).map(heading => {
    if (heading.level === 1) {
      const part = /^Part ([1-5])\b/.exec(heading.text);
      if (part) family = parts[part[1]];
    }
    const destination = realtimeReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/04-REALTIME-COMMUNICATION.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
