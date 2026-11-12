import { collectHeadings } from "./course-coverage.mjs";

export const asyncReadingDestinations = [
  { id: "fundamentals", path: "docs/05-GUIDED-ASYNC.md", anchor: "async-message" },
  { id: "brokers", path: "docs/lessons/BROKERS-DELIVERY-AND-RECOVERY.md" },
  { id: "models", path: "docs/lessons/EVENT-MODELS-AND-PROJECTIONS.md" },
  { id: "workflows", path: "docs/lessons/OUTBOX-INBOX-AND-WORKFLOWS.md" },
];

export function mapAsyncHeadings(markdown) {
  let part = 1;
  let family = "fundamentals";
  return collectHeadings(markdown).map(heading => {
    if (heading.level === 1) {
      const match = /^Part ([1-5])\b/.exec(heading.text);
      if (match) {
        part = Number(match[1]);
        family = part === 1 ? "fundamentals" : part === 5 ? "models" : "brokers";
      }
    }
    if (part === 5) {
      if (/Outbox|Inbox|Saga|Choreography|Orchestration|Distributed Transactions/.test(heading.text)) family = "workflows";
      else if (/Event Sourcing|Event Store|Snapshot|CQRS|Event vs Command|Event-Driven Thinking/.test(heading.text)) family = "models";
    }
    const destination = asyncReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/05-ASYNC-APIS.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
