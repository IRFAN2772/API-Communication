import { collectHeadings } from "./course-coverage.mjs";

export const seniorReadingDestinations = [
  { id: "journey", path: "docs/GUIDED-SENIOR-DESIGN.md", anchor: "senior-baseline" },
  { id: "estimates", path: "docs/lessons/REQUIREMENTS-AND-ESTIMATION.md" },
  { id: "rest", path: "docs/01-GUIDED-REST.md" },
  { id: "graphql", path: "docs/02-GUIDED-GRAPHQL.md" },
  { id: "rpc", path: "docs/03-GUIDED-RPC-AND-GRPC.md" },
  { id: "realtime", path: "docs/04-GUIDED-REALTIME.md" },
  { id: "webhooks", path: "docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md" },
  { id: "async", path: "docs/05-GUIDED-ASYNC.md" },
  { id: "soap", path: "docs/lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md" },
  { id: "contracts", path: "docs/lessons/API-CONTRACTS-AND-LIFECYCLE.md" },
  { id: "partitions", path: "docs/lessons/SHARDING-CACHING-AND-INFRASTRUCTURE.md" },
  { id: "consistency", path: "docs/lessons/REGIONS-AND-CONSISTENCY.md" },
  { id: "reliability", path: "docs/lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md" },
  { id: "security", path: "docs/lessons/REST-AUTH-AND-EVOLUTION.md" },
  { id: "evolution", path: "docs/lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md" },
  { id: "outbox", path: "docs/lessons/OUTBOX-INBOX-AND-WORKFLOWS.md" },
];

export function mapSeniorHeadings(markdown) {
  const sections = {
    3: "estimates", 4: "estimates", 5: "rest", 6: "graphql", 7: "rpc", 8: "realtime",
    9: "realtime", 10: "webhooks", 11: "async", 12: "soap", 15: "contracts",
    16: "partitions", 17: "partitions", 18: "partitions", 19: "consistency",
    20: "reliability", 21: "security", 22: "reliability", 23: "evolution",
    24: "reliability", 25: "outbox", 26: "realtime", 28: "partitions",
  };
  const subsections = {
    "15.1": "rest", "15.2": "graphql", "15.3": "rpc", "15.4": "async",
    "19.4": "outbox", "21.5": "webhooks", "21.6": "realtime",
    "24.1": "rest", "24.2": "graphql", "24.3": "rpc", "24.4": "realtime", "24.5": "async",
  };
  let family = "journey";
  return collectHeadings(markdown).map(heading => {
    const section = /^(\d+)\.\s/.exec(heading.text);
    const subsection = /^(\d+\.\d+)\s/.exec(heading.text);
    if (heading.level === 2 && section) family = sections[section[1]] || "journey";
    else if (heading.level === 3 && subsection && subsections[subsection[1]]) family = subsections[subsection[1]];
    const destination = seniorReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/07-SENIOR-DESIGN-GUIDE.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
