import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutCode, readingLinks } from "./helpers/reading-links.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readingPages = [
  "README.md",
  "_sidebar.md",
  "docs/00-GUIDED-FUNDAMENTALS.md",
  "docs/01-GUIDED-REST.md",
  "docs/02-GUIDED-GRAPHQL.md",
  "docs/03-GUIDED-RPC-AND-GRPC.md",
  "docs/04-GUIDED-REALTIME.md",
  "docs/COURSE-CONTENT-MAP.md",
  "docs/CONTENT-CORRECTIONS.md",
  "docs/lessons/REST-HTTP-CONTRACTS.md",
  "docs/lessons/REST-COLLECTIONS-AND-CACHING.md",
  "docs/lessons/REST-AUTH-AND-EVOLUTION.md",
  "docs/lessons/REST-RELIABILITY-AND-OPERATIONS.md",
  "docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING.md",
  "docs/lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION.md",
  "docs/lessons/GRPC-PROTOBUF-AND-EVOLUTION.md",
  "docs/lessons/GRPC-LIFECYCLE-AND-OPERATIONS.md",
  "docs/lessons/REALTIME-RECOVERY-AND-FLOW.md",
  "docs/lessons/WEBHOOKS-AND-BACKGROUND-JOBS.md",
  "docs/lessons/PUSH-NOTIFICATION-DELIVERY.md",
  "docs/lessons/WEBRTC-MEDIA-AND-CONNECTIVITY.md",
];

for (const file of readingPages) {
  test(`${file}: every intended local reading destination exists`, () => {
    const links = readingLinks(readFileSync(resolve(root, file), "utf8"));
    const markdown = links.filter(link => link.kind === "markdown").map(link => link.href);
    assert.ok(markdown.every(href => !href.startsWith("#/")),
      `${file}: Markdown hash routes are interpreted as heading links by Docsify`);
    let checked = 0;
    for (const { href } of links) {
      if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
      if (href.startsWith("#/")) {
        const path = href.slice(2).split(/[?#]/)[0];
        if (!path) continue;
        assert.ok(existsSync(resolve(root, path.endsWith(".md") ? path : `${path}.md`)), `${file}: ${href}`);
        checked++;
      } else if (!href.startsWith("#") && href !== "/") {
        const path = href.split(/[?#]/)[0];
        const target = path.startsWith("/")
          ? resolve(root, decodeURIComponent(path.slice(1)))
          : resolve(root, dirname(file), decodeURIComponent(path));
        assert.ok(existsSync(target), `${file}: ${href}`);
        checked++;
      }
    }
    assert.ok(checked > 0, `${file} should have navigable local reading links`);
  });

}

test("REST journey destinations have explicit anchors, not guessed generated heading slugs", () => {
  const core = readFileSync(resolve(root, "docs/01-GUIDED-REST.md"), "utf8");
  for (const anchor of ["rest-resources", "rest-messages", "rest-collections", "rest-retries", "rest-caching", "rest-production", "rest-data-shape"]) {
    assert.ok(core.includes(`id="${anchor}"`), anchor);
  }
});

test("the site loads real local assets without a new package or runtime service", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  for (const match of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
    assert.ok(existsSync(resolve(root, match[1].split("?")[0])), match[1]);
  }
  assert.ok(!existsSync(resolve(root, "package.json")));
});

test("deeper Phase Zero lessons are reachable through explicit stable anchors", () => {
  let checked = 0;
  for (const file of readingPages) {
    const content = withoutCode(readFileSync(resolve(root, file), "utf8"));
    for (const [, href] of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const [path, fragment] = href.split("#");
      if (!fragment?.startsWith("phase0-")) continue;
      const target = path ? resolve(root, dirname(file), path) : resolve(root, file);
      assert.ok(readFileSync(target, "utf8").includes(`id="${fragment}"`), `${file}: ${href}`);
      checked++;
    }
  }
  assert.ok(checked >= 4, "Core and library links should both reach the retained deeper lessons");
});

test("illustrative inline HTML and fenced code are not mistaken for reading links", () => {
  const sample = 'Use `href="#/docs/..."` as an example.\n[Read](docs/00-GUIDED-FUNDAMENTALS.md)\n```html\n<a href="missing.md">example</a>\n```';
  const content = withoutCode(sample);
  assert.ok(!content.includes('href="#/docs/..."'));
  assert.ok(!content.includes('href="missing.md"'));
  assert.ok(content.includes("[Read](docs/00-GUIDED-FUNDAMENTALS.md)"));
});
