import { collectHeadings } from "./course-coverage.mjs";

export const expertReadingDestinations = [
  { id: "baseline", path: "docs/07-GUIDED-EXPERT-DESIGN.md", anchor: "expert-baseline" },
  { id: "contracts", path: "docs/lessons/CONTRACT-EVOLUTION-AND-CONSUMERS.md" },
  { id: "regions", path: "docs/lessons/REGIONS-AND-CONSISTENCY.md" },
  { id: "reliability", path: "docs/lessons/RELIABILITY-OBSERVABILITY-AND-INCIDENTS.md" },
  { id: "transactions", path: "docs/lessons/DISTRIBUTED-TRANSACTIONS-AND-RECOVERY.md" },
  { id: "consensus", path: "docs/lessons/CONSENSUS-AND-COORDINATION.md" },
  { id: "tenancy", path: "docs/lessons/TENANCY-USAGE-AND-GOVERNANCE.md" },
];

export function mapExpertHeadings(markdown) {
  const modules = {
    1: "contracts", 2: "contracts", 3: "regions", 4: "reliability", 5: "transactions",
    6: "reliability", 7: "regions", 8: "consensus", 9: "tenancy", 10: "tenancy",
  };
  let family = "baseline";
  return collectHeadings(markdown).map(heading => {
    if (heading.level === 2) {
      const match = /^Phase 7\.(10|[1-9])\b/.exec(heading.text);
      if (match) family = modules[match[1]];
    }
    const destination = expertReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/08-EXPERT-API-DESIGN.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
