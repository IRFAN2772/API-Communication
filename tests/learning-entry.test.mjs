import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coursePhases } from "../assets/course-map.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the reading journey is primary without replacing the original Phase Zero route", () => {
  const readme = read("README.md");
  const sidebar = read("_sidebar.md");
  assert.match(readme, /Start the Phase 0 journey\]\(docs\/00-GUIDED-FUNDAMENTALS\.md\)/);
  assert.match(sidebar, /Phase 0 — Fundamentals\]\(\/docs\/00-GUIDED-FUNDAMENTALS\.md\)/);
  assert.match(sidebar, /Phase 0 — Original complete reference\]\(\/docs\/00-FUNDAMENTALS\.md\)/);
  assert.match(sidebar, /All topics & reading destinations\]\(\/docs\/COURSE-CONTENT-MAP\.md\)/);
  assert.equal(coursePhases[0].path, "docs/00-GUIDED-FUNDAMENTALS.md");
  assert.equal(coursePhases[1].path, "docs/01-GUIDED-REST.md");
  assert.equal(coursePhases[2].path, "docs/02-GUIDED-GRAPHQL.md");
  assert.equal(coursePhases[3].path, "docs/03-GUIDED-RPC-AND-GRPC.md");
  assert.equal(coursePhases[4].path, "docs/04-GUIDED-REALTIME.md");
  assert.match(sidebar, /Phase 1 — REST APIs\]\(\/docs\/01-GUIDED-REST\.md\)/);
  assert.match(sidebar, /Phase 1 — Original complete reference\]\(\/docs\/01-REST-APIS\.md\?view=reference\)/);
  assert.match(sidebar, /Phase 2 — GraphQL\]\(\/docs\/02-GUIDED-GRAPHQL\.md\)/);
  assert.match(sidebar, /Phase 2 — Original complete reference\]\(\/docs\/02-GRAPHQL\.md\)/);
  assert.match(sidebar, /Phase 3 — RPC & gRPC\]\(\/docs\/03-GUIDED-RPC-AND-GRPC\.md\)/);
  assert.match(sidebar, /Phase 3 — Original complete reference\]\(\/docs\/03-RPC-AND-GRPC\.md\)/);
  assert.match(sidebar, /Phase 4 — Real-Time\]\(\/docs\/04-GUIDED-REALTIME\.md\)/);
  assert.match(sidebar, /Phase 4 — Original complete reference\]\(\/docs\/04-REALTIME-COMMUNICATION\.md\)/);
  assert.ok(read("assets/studio.mjs").includes('link.href = "#/docs/CONTENT-CORRECTIONS"'));
});

test("the cinematic course map is optional, not a prerequisite to reading", () => {
  const readme = read("README.md");
  const disclosure = readme.match(/<details class="optional-course-map">([\s\S]*?)<\/details>/);
  assert.ok(disclosure);
  assert.ok(disclosure[1].includes("<course-map>"));
  assert.ok(readme.indexOf("Start the Phase 0 journey") < readme.indexOf("<details"));
  assert.match(disclosure[1], /Complete original Phase 0 reference/);
});

test("reading pages suppress duplicate banners and decorative depth is off by default", () => {
  const script = read("assets/studio.mjs");
  const html = read("index.html");
  assert.match(script, /setDepth\(false\);/);
  assert.match(script, /classList\.toggle\("course-reading"/);
  assert.match(script, /document\.body\.classList\.contains\("course-reading"\)/);
  assert.match(html, /id="studio-depth"[\s\S]*?aria-pressed="false"/);
  assert.ok(!html.includes("docsify-progress@"));
});
