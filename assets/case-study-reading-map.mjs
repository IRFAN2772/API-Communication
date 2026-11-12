import { collectHeadings } from "./course-coverage.mjs";

export const caseStudyDestinations = [
  { id: "method", path: "docs/GUIDED-CASE-STUDIES.md", anchor: "case-method" },
  { id: "messaging", path: "docs/lessons/CASE-WHATSAPP-MESSAGING.md" },
  { id: "photos", path: "docs/lessons/CASE-INSTAGRAM-FEEDS-AND-MEDIA.md" },
  { id: "playback", path: "docs/lessons/CASE-NETFLIX-PLAYBACK.md" },
  { id: "dispatch", path: "docs/lessons/CASE-UBER-DISPATCH-AND-PAYMENTS.md" },
  { id: "fanout", path: "docs/lessons/CASE-TWITTER-TIMELINES.md" },
  { id: "uploads", path: "docs/lessons/CASE-YOUTUBE-UPLOADS-AND-DELIVERY.md" },
  { id: "transfers", path: "docs/lessons/CASE-STUDY-TRANSFERS.md" },
];

export function mapCaseStudyHeadings(markdown) {
  const cases = { 1: "messaging", 2: "photos", 3: "playback", 4: "dispatch", 5: "fanout", 6: "uploads" };
  let family = "method";
  let transferAnchor;
  return collectHeadings(markdown).map(heading => {
    if (heading.level === 2) {
      transferAnchor = undefined;
      const match = /^Case Study ([1-6]):/.exec(heading.text);
      if (match) family = cases[match[1]];
      else family = heading.text === "How Other Systems Map" ? "transfers" : "method";
    }
    if (family === "transfers" && heading.level === 3) {
      transferAnchor = {
        "Amazon / Amazon Prime": "transfer-amazon",
        LinkedIn: "transfer-linkedin",
        Snapchat: "transfer-snapchat",
        "JioHotstar (Indian Streaming)": "transfer-live-sports",
      }[heading.text];
    }
    const destination = caseStudyDestinations.find(item => item.id === family);
    return {
      ...heading,
      family,
      source: "docs/09-SYSTEM-DESIGN-CASE-STUDIES.md",
      recommended: destination.path,
      ...((transferAnchor || destination.anchor) ? { anchor: transferAnchor || destination.anchor } : {}),
    };
  });
}
