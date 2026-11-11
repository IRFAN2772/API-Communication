import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contracts = readFileSync(new URL("../docs/lessons/REST-HTTP-CONTRACTS.md", import.meta.url), "utf8");
const collections = readFileSync(new URL("../docs/lessons/REST-COLLECTIONS-AND-CACHING.md", import.meta.url), "utf8");
const pages = [contracts, collections];

function blocks(page, language) {
  return [...page.matchAll(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, "g"))]
    .map(match => match[1]);
}

function headerBody(block) {
  const separator = block.indexOf("\n\n");
  assert.notEqual(separator, -1, "header/body excerpt must have a blank line");
  const lines = block.slice(0, separator).split("\n");
  const headers = new Map(lines.slice(1).map(line => {
    const colon = line.indexOf(":");
    assert.ok(colon > 0, `invalid header: ${line}`);
    return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
  }));
  return { start: lines[0], headers, body: block.slice(separator + 2) };
}

test("the read request is fully framed and JSON response fixture is exact", () => {
  const request = blocks(contracts, "http")[0];
  assert.equal(request, "GET /courses/course-101?view=full HTTP/1.1\nHost: learn.example\nAccept: application/json\n");
  const url = new URL(request.split("\n")[0].split(" ")[1], "https://learn.example");
  assert.equal(url.pathname, "/courses/course-101");
  assert.equal(url.searchParams.get("view"), "full");
  const response = headerBody(blocks(contracts, "http")[1]);
  assert.equal(response.start, "HTTP/1.1 200 OK");
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(response.body), { id: "course-101", title: "API Fundamentals", seats: 30 });
});

test("creation and Problem Details excerpts have correct status, media type and data", () => {
  const http = blocks(contracts, "http");
  const created = headerBody(http.find(block => block.startsWith("HTTP/1.1 201")));
  assert.equal(created.headers.get("location"), "/courses/course-101/enrollments/enrollment-42");
  assert.equal(created.headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(created.body), {
    id: "enrollment-42", courseId: "course-101", learnerId: "learner-7",
  });
  const problem = headerBody(http.find(block => block.startsWith("HTTP/1.1 409")));
  const detail = JSON.parse(problem.body);
  assert.equal(problem.headers.get("content-type"), "application/problem+json");
  assert.equal(detail.status, Number(problem.start.split(" ")[1]));
  assert.equal(detail.type, "https://learn.example/problems/no-seats");
  assert.equal(detail.title, "No seats available");
  assert.equal(detail.instance, "/problems/request-42");
  for (const page of pages) for (const block of blocks(page, "json")) JSON.parse(block);
});

test("the three patch bodies have materially different null and retry behavior", () => {
  const json = blocks(contracts, "json").map(JSON.parse);
  const assignment = json.find(value => value.seats === 20 && "description" in value);
  const merge = json.find(value => value.description === null && value.tags?.[0] === "http");
  const patch = json.find(Array.isArray);
  const original = { seats: 30, description: "Intro", tags: ["api", "rest"] };
  const assigned = { ...original, ...assignment };
  assert.equal(assigned.description, null);
  assert.equal(assigned.seats, 20);
  const merged = structuredClone(original);
  for (const [key, value] of Object.entries(merge)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  assert.equal(Object.hasOwn(merged, "description"), false);
  assert.deepEqual(merged.tags, ["http"]);
  const patched = structuredClone(original);
  assert.deepEqual(patch, [
    { op: "replace", path: "/description", value: null },
    { op: "remove", path: "/tags/0" },
  ]);
  patched.description = patch[0].value;
  patched.tags.splice(0, 1);
  assert.deepEqual(patched.tags, ["rest"]);
  patched.tags.splice(0, 1);
  assert.deepEqual(patched.tags, [], "repeating an array removal is not idempotent");
});

test("fixture catalogue, filtering and live-view insertion produce the taught pages", () => {
  const values = blocks(collections, "json").map(JSON.parse);
  for (const page of values) assert.deepEqual(Object.keys(page), ["courses", "nextCursor"]);
  const catalogue = values[0].courses;
  assert.deepEqual(catalogue, [
    { id: "course-101", title: "API Fundamentals", seats: 30 },
    { id: "course-102", title: "REST Studio", seats: 20 },
  ]);
  assert.deepEqual(catalogue.filter(c => c.seats >= 20 && c.title.toLowerCase().includes("api"))
    .map(c => c.id), ["course-101"]);
  assert.deepEqual(catalogue.filter(c => c.seats >= 21).map(c => c.id), ["course-101"]);
  const first = values[1];
  assert.deepEqual(first.courses, [catalogue[0]]);
  assert.equal(first.nextCursor, "c1-example-opaque");
  const nextLine = blocks(collections, "http").find(block => block.includes("cursor="));
  const nextUrl = new URL(nextLine.split(" ")[1], "https://learn.example");
  assert.equal(nextUrl.searchParams.get("cursor"), first.nextCursor);
  assert.equal(nextUrl.searchParams.get("sort"), "title");
  assert.equal(nextUrl.searchParams.get("limit"), "1");
  const inserted = { id: "course-100", title: "Advanced API", seats: 10 };
  const titleKey = c => c.title.toLowerCase();
  const ordered = [...catalogue, inserted].sort((a, b) => titleKey(a) < titleKey(b) ? -1 : titleKey(a) > titleKey(b) ? 1 : a.id.localeCompare(b.id));
  assert.equal(ordered.slice(1, 2)[0].id, first.courses[0].id, "offset repeats the first item");
  const boundary = first.courses[0];
  const after = ordered.filter(c => titleKey(c) > titleKey(boundary) || (titleKey(c) === titleKey(boundary) && c.id > boundary.id)).slice(0, 1);
  assert.deepEqual(after, values[2].courses);
  assert.equal(values[2].nextCursor, null);
  assert.ok(!after.some(c => c.id === inserted.id), "earlier concurrent insert is missed in live view");
});

test("the collection limit and schema extension are explicit", () => {
  assert.match(collections, /Integer from 1 through 20, default 20/);
  assert.match(collections, /a `limit` of zero or greater than 20/);
  assert.match(collections, /does not silently clamp/);
  assert.match(contracts, /independent extended-schema\s+exercise/);
  assert.match(contracts, /minimal contract does not automatically accept/);
});

test("weak read validators, strong write validators, and 304 metadata differ", () => {
  const http = blocks(collections, "http");
  const initial = headerBody(http.find(block => block.startsWith("HTTP/1.1 200")));
  const condition = http.find(block => block.includes("If-None-Match:"));
  const weakTag = condition.match(/If-None-Match: (.+)/)[1];
  const tag = initial.headers.get("etag");
  const weakEqual = (a, b) => a.replace(/^W\//, "") === b.replace(/^W\//, "");
  const strongEqual = (a, b) => !a.startsWith("W/") && !b.startsWith("W/") && a === b;
  assert.ok(weakEqual(weakTag, tag));
  assert.equal(strongEqual(weakTag, tag), false);
  assert.equal(strongEqual('"course-101-v1"', '"course-101-v2"'), false);
  const notModified = http.find(block => block.startsWith("HTTP/1.1 304"));
  assert.ok(!notModified.includes("\n\n"), "304 example contains no body");
  for (const header of ["Date:", "Cache-Control:", "ETag:", "Vary:"]) assert.ok(notModified.includes(header));
  assert.deepEqual(JSON.parse(initial.body), { id: "course-101", title: "API Fundamentals", seats: 30 });
});

test("illustrative write decisions reject input before mutation and stale preconditions", () => {
  const original = { id: "course-101", title: "API Fundamentals", seats: 30 };
  let state = structuredClone(original);
  const write = ({ contentType, ifMatch, patch }) => {
    if (contentType !== "application/json") return 415;
    if (ifMatch !== '"course-101-v2"') return 412;
    state = { ...state, ...patch };
    return 200;
  };
  assert.equal(write({ contentType: "text/plain", ifMatch: '"course-101-v1"', patch: { seats: 20 } }), 415);
  assert.deepEqual(state, original);
  assert.equal(write({ contentType: "application/json", ifMatch: '"course-101-v1"', patch: { seats: 20 } }), 412);
  assert.deepEqual(state, original);
  assert.equal(write({ contentType: "application/json", ifMatch: '"course-101-v2"', patch: { seats: 20 } }), 200);
  assert.equal(state.seats, 20);
});

test("all excerpt lengths, when supplied, match the actual UTF-8 body", () => {
  for (const page of pages) for (const block of blocks(page, "http")) {
    if (!/^Content-Length:/mi.test(block)) continue;
    const message = headerBody(block);
    assert.equal(Number(message.headers.get("content-length")), Buffer.byteLength(message.body));
    assert.doesNotMatch(message.start, /^HTTP\/\S+ (204|304) /);
  }
});

test("lesson boundaries, closed HTML answers and internal anchors remain usable", () => {
  for (const page of pages) {
    const lines = page.split("\n").length;
    assert.ok(lines >= 300 && lines <= 450, `standalone lesson depth: ${lines} lines`);
    const details = [...page.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
    assert.ok(details.length >= 3);
    assert.equal((page.match(/<details\b/g) ?? []).length, details.length);
    for (const [, attributes, body] of details) {
      assert.match(attributes, /class="learning-answer"/);
      assert.doesNotMatch(attributes, /\bopen\b/);
      assert.match(body, /<summary>[\s\S]+?<\/summary>/);
      assert.match(body, /<(?:p|ol|ul)>/);
      assert.doesNotMatch(body, /```|^\s*#{1,6}\s/m);
    }
    const ids = [...page.matchAll(/<a id="([^"]+)"><\/a>/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    const links = [...page.matchAll(/\]\(#([^)]+)\)/g)].map(match => match[1]);
    assert.ok(links.length >= 2);
    for (const link of links) assert.ok(ids.includes(link), `missing internal anchor ${link}`);
    for (const path of ["../01-GUIDED-REST.md", "../01-REST-APIS.md", "../00-GUIDED-FUNDAMENTALS.md",
      "../COURSE-CONTENT-MAP.md", "../CONTENT-CORRECTIONS.md"]) assert.ok(page.includes(`](${path})`), path);
    assert.doesNotMatch(page, /<script\b|<details[^>]*\bopen\b/i);
  }
});
