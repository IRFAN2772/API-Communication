import { collectHeadings } from "./course-coverage.mjs";

export const restReadingDestinations = [
  { id: "resources", question: "How do we name and operate on a course?", path: "docs/01-GUIDED-REST.md", anchor: "rest-resources" },
  { id: "messages", question: "What does the complete HTTP contract mean?", path: "docs/lessons/REST-HTTP-CONTRACTS.md" },
  { id: "collections", question: "How do we bound, query, and cache changing data?", path: "docs/lessons/REST-COLLECTIONS-AND-CACHING.md" },
  { id: "reliability", question: "What happens after a lost response or repeated effect?", path: "docs/lessons/REST-RELIABILITY-AND-OPERATIONS.md" },
  { id: "auth", question: "Who may act, and how does the contract evolve?", path: "docs/lessons/REST-AUTH-AND-EVOLUTION.md" },
  { id: "operations", question: "How do we bound load and diagnose failures?", path: "docs/lessons/REST-RELIABILITY-AND-OPERATIONS.md" },
  { id: "data-shape", question: "Does the screen need REST aggregation or another query interface?", path: "docs/01-GUIDED-REST.md", anchor: "rest-data-shape" },
];

// Recommendations inherit the original Part/Chapter context, while the exact source
// destination remains available for every heading, including repeated examples.
export function mapRestHeadings(markdown) {
  let part = 0;
  let family = "resources";
  return collectHeadings(markdown).map(heading => {
    if (heading.level === 1) {
      const match = /^Part ([1-6]):/.exec(heading.text);
      if (match) {
        part = Number(match[1]);
        family = { 1: "resources", 2: "messages", 3: "collections", 4: "reliability", 5: "collections", 6: "auth" }[part];
      } else if (heading.text === "Why REST Was Not Enough") {
        part = 7;
        family = "data-shape";
      }
    }
    if (part === 6 && heading.level === 2 && /^Chapter [4-9]:/.test(heading.text)) {
      family = "operations";
    }
    const destination = restReadingDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/01-REST-APIS.md",
      recommended: destination.path,
      ...(destination.anchor ? { anchor: destination.anchor } : {}),
    };
  });
}
