import { collectHeadings } from "./course-coverage.mjs";

export const architectureReadingDestinations = [
  { id: "baseline", path: "docs/06-GUIDED-ARCHITECTURE.md", anchor: "arch-baseline" },
  { id: "edge", path: "docs/lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md" },
  { id: "mesh", path: "docs/lessons/SERVICE-MESH-AND-TRUST.md" },
  { id: "contract", path: "docs/lessons/API-CONTRACTS-AND-LIFECYCLE.md" },
  { id: "capacity", path: "docs/lessons/BACKPRESSURE-AND-CAPACITY.md" },
  { id: "next", path: "docs/06-GUIDED-ARCHITECTURE.md", anchor: "arch-next" },
];

export function mapArchitectureHeadings(markdown) {
  let family = "baseline";
  const sections = { 1: "edge", 2: "edge", 3: "edge", 4: "mesh", 5: "contract", 6: "capacity" };
  return collectHeadings(markdown).map(heading => {
    if (heading.level === 2) {
      const section = /^Phase 6\.([1-6])\b/.exec(heading.text);
      if (section) family = sections[section[1]];
      else if (/^Phase 6 Completion\b/.test(heading.text)) family = "next";
    }
    const destination = architectureReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/06-API-ARCHITECTURE.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
