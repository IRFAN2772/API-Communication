import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { chapters, chapterHeadings, collectHeadings } from "../assets/course-coverage.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex");
const filenames = [
  "00-FUNDAMENTALS.md", "01-REST-APIS.md", "02-GRAPHQL.md",
  "03-RPC-AND-GRPC.md", "04-REALTIME-COMMUNICATION.md", "05-ASYNC-APIS.md",
  "06-API-ARCHITECTURE.md", "07-SENIOR-DESIGN-GUIDE.md",
  "08-EXPERT-API-DESIGN.md", "09-SYSTEM-DESIGN-CASE-STUDIES.md",
];
const library = read("docs/COURSE-CONTENT-MAP.md");
const journey = read("docs/00-GUIDED-FUNDAMENTALS.md");
const sections = library.split(/^## /m).slice(1);
const hasLink = (text, destination) => text.includes(`](${destination})`);

test("the manifest inventories the ten original chapters, not the guided entry", () => {
  assert.deepEqual(chapters.map((chapter) => chapter.filename), filenames);
  const actual = readdirSync(new URL("docs/", root))
    .filter((name) => /^\d\d-(?!GUIDED-).*\.md$/.test(name)).sort();
  assert.deepEqual(actual, filenames);
  assert.equal(new Set(chapters.map((chapter) => chapter.destination)).size, 10);
  assert.equal(chapters.reduce((sum, chapter) => sum + chapter.headingCount, 0), 1482);
});

test("heading collection preserves duplicates and skips fenced code", () => {
  const sample = [
    "# Same", "## Same", "```md", "# Hidden", "````", "### Back",
    "~~~js", "## Hidden too", "~~~", "    # Indented code", "###### Last",
  ].join("\n");
  assert.deepEqual(collectHeadings(sample), [
    { line: 1, level: 1, text: "Same" },
    { line: 2, level: 2, text: "Same" },
    { line: 6, level: 3, text: "Back" },
    { line: 11, level: 6, text: "Last" },
  ]);
});

test("every retained source byte and heading maps to the complete chapter", () => {
  for (const chapter of chapters) {
    assert.equal(hash(chapter.destination), chapter.sha256, chapter.filename);
    const headings = chapterHeadings(chapter, read(chapter.destination));
    assert.equal(headings.length, chapter.headingCount, chapter.filename);
    assert.deepEqual(headings.map(({ line, level, text }) => ({ line, level, text })),
      collectHeadings(read(chapter.destination)));
    assert.ok(headings.every((heading) => heading.destination === chapter.destination));
    assert.ok(chapter.title && chapter.phase && chapter.classification);
    assert.ok(chapter.topics.length >= 5, chapter.filename);
    for (const topic of chapter.topics) {
      assert.equal(topic.destination, chapter.destination);
      assert.ok(headings.some((heading) => heading.line === topic.line && heading.text === topic.text),
        `${chapter.filename}:${topic.line} ${topic.text}`);
    }
  }
});

test("library provides a full chapter route, question and topic families for each entry", () => {
  for (const chapter of chapters) {
    const matches = sections.filter((section) => hasLink(section, chapter.filename));
    assert.equal(matches.length, 1, chapter.filename);
    const section = matches[0].replace(/\s+/g, " ").toLowerCase();
    assert.match(section, /main-path question:/);
    assert.match(section, /related \/ prerequisites:/);
    for (const topic of chapter.topics) {
      assert.ok(section.includes(topic.label.toLowerCase()), `${chapter.filename}: ${topic.label}`);
    }
  }
  for (const term of ["SOAP and XML", "WebRTC", "consensus", "monetisation", "Depth needed"]) {
    assert.ok(library.includes(term), term);
  }
});

test("selected chapter anchors were already present in the original tables of contents", () => {
  const links = [
    ["01-REST-APIS.md", "why-caching-exists"],
    ["04-REALTIME-COMMUNICATION.md", "423-what-is-webrtc"],
    ["05-ASYNC-APIS.md", "why-message-queues-exist"],
    ["07-SENIOR-DESIGN-GUIDE.md", "12-soap-and-xml-apis"],
  ];
  for (const [file, fragment] of links) {
    assert.ok(hasLink(library, `${file}#${fragment}`));
    assert.ok(hasLink(read(`docs/${file}`), `#${fragment}`));
  }
});

test("guided journey links every original chapter and the library", () => {
  for (const filename of filenames) assert.ok(hasLink(journey, filename), filename);
  assert.ok(hasLink(journey, "COURSE-CONTENT-MAP.md"));
  assert.ok(hasLink(library, "00-GUIDED-FUNDAMENTALS.md"));
});

test("raw notes remain preserved sources, not extra chapters", () => {
  const notes = [
    ["exrta.txt", "5832b28db55bc00c8c616b74c8b5f967e9ea5c69187281678655371c56bd6dd9"],
    ["phase-7.txt", "06ccbd8810383d83ff11bad34c82c0bd321c6712fa6992d80d469c6d214366d9"],
  ];
  for (const [path, sha256] of notes) {
    assert.ok(existsSync(new URL(path, root)), path);
    assert.equal(hash(path), sha256, path);
    assert.ok(hasLink(library, `../${path}`));
    assert.ok(!chapters.some((chapter) => chapter.filename === path));
  }
});
