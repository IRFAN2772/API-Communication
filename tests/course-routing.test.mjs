import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { readingLinks } from "./helpers/reading-links.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const html = read("index.html");
const configScript = html.match(/<script>\s*(window\.\$docsify\s*=\s*\{[\s\S]*?\n\s*\};)\s*<\/script>/)?.[1];
assert.ok(configScript, "Docsify config must be present");
const context = { window: {}, URL };
runInNewContext(configScript, context);
const config = context.window.$docsify;

// Faithful excerpts of Docsify 4.13.1's router/util.js, history/base.js,
// history/hash.js, and render/compiler/link.js. The site pins this same version.
// https://github.com/docsifyjs/docsify/tree/v4.13.1/src/core
/*
MIT License
Copyright (c) 2016 - present Docsify Contributors
(https://github.com/docsifyjs/docsify/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
function parseQuery(query) {
  const res = {};
  query = query.trim().replace(/^(\?|#|&)/, "");
  if (!query) return res;
  query.split("&").forEach(function (param) {
    const parts = param.replace(/\+/g, " ").split("=");
    res[parts[0]] = parts[1] && decodeURIComponent(parts[1]);
  });
  return res;
}

function stringifyQuery(obj, ignores = []) {
  const qs = [];
  for (const key in obj) {
    if (ignores.indexOf(key) > -1) continue;
    qs.push(obj[key] ? `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`.toLowerCase() : encodeURIComponent(key));
  }
  return qs.length ? `?${qs.join("&")}` : "";
}

const cleanPath = path => path.replace(/^\/+/, "/").replace(/([^:])\/{2,}/g, "$1/");
const isAbsolutePath = path => /(:|(\/{2}))/g.test(path);
const getPath = (...args) => cleanPath(args.map(path => path.split("/").filter(p => p.indexOf("#") === -1).join("/")).join("/"));
function resolvePath(path) {
  const segments = path.replace(/^\//, "").split("/");
  let resolved = [];
  for (let i = 0, len = segments.length; i < len; i++) {
    const segment = segments[i];
    if (segment === "..") resolved.pop();
    else if (segment !== ".") resolved.push(segment);
  }
  return "/" + resolved.join("/");
}
const replaceSlug = path => path.replace("#", "?id=");

function parse(path) {
  let query = "";
  const hashIndex = path.indexOf("#");
  if (hashIndex >= 0) path = path.slice(hashIndex + 1);
  const queryIndex = path.indexOf("?");
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1);
    path = path.slice(0, queryIndex);
  }
  return { path, query: parseQuery(query) };
}

function toURL(path, params, currentRoute, relativePath = config.relativePath) {
  const local = currentRoute && path[0] === "#";
  const route = parse(replaceSlug(path));
  route.query = Object.assign({}, route.query, params);
  path = route.path + stringifyQuery(route.query);
  path = path.replace(/\.md(\?)|\.md$/, "$1");
  if (local) {
    const idIndex = currentRoute.indexOf("?");
    path = (idIndex > 0 ? currentRoute.substring(0, idIndex) : currentRoute) + path;
  }
  if (relativePath && path.indexOf("/") !== 0) {
    const currentDir = currentRoute.substring(0, currentRoute.lastIndexOf("/") + 1);
    return "#" + cleanPath(resolvePath(currentDir + path));
  }
  return "#" + cleanPath("/" + path);
}

// The link compiler calls toURL(href, null, router.getCurrentPath()) for
// ordinary internal Markdown links; raw HTML hrefs are not compiled.
const compileLink = (href, currentRoute, relativePath) => toURL(href, null, currentRoute, relativePath);

function getFile(path, pathname) {
  const base = config.basePath || "";
  const basePath = pathname.endsWith(".html") ? pathname + "#/" + base : pathname + "/" + base;
  const resolvedBase = /^(\/|https?:)/g.test(base) ? base : cleanPath(basePath);
  const ext = typeof config.ext === "string" ? config.ext : ".md";
  path = new RegExp(`\\.(${ext.replace(/^\./, "")}|html)$`, "g").test(path)
    ? path : /\/$/g.test(path) ? `${path}README${ext}` : `${path}${ext}`;
  path = path === `/README${ext}` ? config.homepage || path : path;
  return isAbsolutePath(path) ? path : getPath(resolvedBase, path);
}

test("the configured Docsify resolver fixes real chapter and lesson links", () => {
  assert.equal(config.relativePath, true);
  const cases = [
    ["/", "docs/00-GUIDED-FUNDAMENTALS.md", "#/docs/00-GUIDED-FUNDAMENTALS"],
    ["/docs/02-GUIDED-GRAPHQL", "02-GRAPHQL.md", "#/docs/02-GRAPHQL"],
    ["/docs/02-GUIDED-GRAPHQL", "01-GUIDED-REST.md", "#/docs/01-GUIDED-REST"],
    ["/docs/02-GUIDED-GRAPHQL", "lessons/GRAPHQL-EXECUTION-AND-BATCHING.md", "#/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING"],
    ["/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING", "../02-GRAPHQL.md", "#/docs/02-GRAPHQL"],
    ["/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING", "GRAPHQL-COST-CACHING-AND-EVOLUTION.md", "#/docs/lessons/GRAPHQL-COST-CACHING-AND-EVOLUTION"],
    ["/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING", "../01-REST-APIS.md?view=reference&stage=2", "#/docs/01-REST-APIS?view=reference&stage=2"],
    ["/docs/02-GUIDED-GRAPHQL?stage=2", "#some-heading", "#/docs/02-GUIDED-GRAPHQL?id=some-heading"],
    ["/docs/02-GUIDED-GRAPHQL", "02-GRAPHQL.md#some-heading", "#/docs/02-GRAPHQL?id=some-heading"],
    ["/docs/02-GUIDED-GRAPHQL", "02-GRAPHQL.md?view=Reference%20Guide", "#/docs/02-GRAPHQL?view=reference%20guide"],
  ];
  for (const [current, href, expected] of cases) {
    assert.equal(compileLink(href, current), expected, `${current} + ${href}`);
  }
  assert.equal(compileLink("02-GRAPHQL.md", "/docs/02-GUIDED-GRAPHQL", false), "#/02-GRAPHQL");
  assert.equal(compileLink("../02-GRAPHQL.md", "/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING", false), "#/../02-GRAPHQL");
  assert.ok(read("docs/02-GUIDED-GRAPHQL.md").includes("](02-GRAPHQL.md)"));
  assert.ok(read("docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING.md").includes("](../02-GRAPHQL.md)"));
});

test("the shared sidebar produces stable canonical targets for every page and pagination", () => {
  const hrefs = [...read("_sidebar.md").matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(hrefs.length > 10);
  for (const href of hrefs) {
    assert.ok(href === "/" || href.startsWith("/docs/"), href);
    if (href !== "/") assert.ok(existsSync(new URL(href.slice(1).split("?")[0], root)), href);
    const expected = compileLink(href, "/");
    for (const current of ["/docs/02-GUIDED-GRAPHQL", "/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING"]) {
      assert.equal(compileLink(href, current), expected, `${current}: ${href}`);
      assert.doesNotMatch(expected, /\/docs\/docs\//);
    }
  }
});

test("hash routes and raw HTML links preserve the hosting deployment path", () => {
  assert.ok(!config.basePath && !config.alias);
  const raw = read("docs/00-FUNDAMENTALS.md").match(/href="(#\/docs\/00-FUNDAMENTALS\?id=[^"]+)"/)?.[1];
  assert.ok(raw);
  for (const base of ["http://127.0.0.1:8000/", "https://example.github.io/API-Communication/"]) {
    for (const hash of [raw, compileLink("02-GRAPHQL.md", "/docs/02-GUIDED-GRAPHQL")]) {
      const url = new URL(hash, base);
      assert.equal(url.pathname, new URL(base).pathname);
      assert.equal(url.hash, hash);
    }
    assert.equal(getFile("/docs/02-GRAPHQL", new URL(base).pathname), `${new URL(base).pathname}docs/02-GRAPHQL.md`);
    assert.equal(getFile("/does-not-exist", new URL(base).pathname), `${new URL(base).pathname}does-not-exist.md`);
  }
});

test("Docsify treats Markdown hash links as headings rather than absolute routes", () => {
  assert.equal(compileLink("#/docs/01-REST-APIS?view=reference", "/docs/CONTENT-CORRECTIONS"),
    "#/docs/CONTENT-CORRECTIONS?id=%2fdocs%2f01-rest-apis%3fview");
  assert.equal(compileLink("/docs/01-REST-APIS.md?view=reference", "/docs/CONTENT-CORRECTIONS"),
    "#/docs/01-REST-APIS?view=reference");
});

test("legacy short routes redirect only known files, preserving queries and anchors", () => {
  const script = html.match(/<script>\s*(\/\/ Old Docsify links[\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "legacy canonicalization must execute before Docsify");
  assert.ok(html.indexOf(script) < html.indexOf("window.$docsify"));

  function runRedirect(url) {
    const listeners = {};
    const replacements = [];
    const location = {
      href: url,
      replace(next) {
        replacements.push(next);
        this.href = next;
      },
    };
    runInNewContext(script, {
      window: { location, addEventListener: (event, listener) => { listeners[event] = listener; } },
    });
    return { location, replacements, listeners };
  }

  for (const [array, directory] of [["chapters", "docs"], ["lessons", "docs/lessons"]]) {
    const list = script.match(new RegExp(`const ${array} = \\[([\\s\\S]*?)\\];`))?.[1];
    assert.ok(list);
    for (const [, name] of list.matchAll(/"([^"]+)"/g)) {
      assert.ok(existsSync(new URL(`${directory}/${name}.md`, root)), name);
      assert.equal(runRedirect(`http://localhost/#/${name}`).location.href, `http://localhost/#/${directory}/${name}`);
    }
  }

  for (const base of ["http://127.0.0.1:8000/", "https://example.github.io/API-Communication/"]) {
    const cases = [
      ["#/02-GRAPHQL", "#/docs/02-GRAPHQL"],
      ["#/01-GUIDED-REST", "#/docs/01-GUIDED-REST"],
      ["#/../02-GRAPHQL.md?view=reference&stage=2#some-heading", "#/docs/02-GRAPHQL?view=reference&stage=2&id=some-heading"],
      ["#/../REST-HTTP-CONTRACTS#request%20headers", "#/docs/lessons/REST-HTTP-CONTRACTS?id=request%20headers"],
      ["#/02-GRAPHQL#one&two", "#/docs/02-GRAPHQL?id=one%26two"],
      ["#/lessons/GRAPHQL-EXECUTION-AND-BATCHING", "#/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING"],
      ["#/../../01-GUIDED-REST", "#/docs/01-GUIDED-REST"],
    ];
    for (const [oldHash, newHash] of cases) {
      const { location, replacements } = runRedirect(base + oldHash);
      assert.equal(location.href, base + newHash);
      assert.equal(replacements.length, 1);
    }

    for (const hash of ["#/NOT-A-REAL-PAGE", "#/../UNKNOWN", "#/docs/02-GRAPHQL", "#/02-GRAPHQL/extra", "#/lessons/02-GRAPHQL"]) {
      assert.equal(runRedirect(base + hash).replacements.length, 0, hash);
    }
    const navigation = runRedirect(base + "#/");
    navigation.location.href = base + "#/01-GUIDED-REST?stage=2";
    navigation.listeners.hashchange();
    assert.equal(navigation.location.href, base + "#/docs/01-GUIDED-REST?stage=2");
    navigation.listeners.hashchange();
    assert.equal(navigation.replacements.length, 1);
  }
});

test("the deployed Docsify version matches the verified resolver", () => {
  assert.ok(html.includes("docsify@4.13.1/lib/docsify.min.js"));
  assert.ok(html.includes("docsify@4.13.1/lib/plugins/search.min.js"));
});

test("the configured Docsify link renderer resolves local files against their source document", () => {
  const defaultResourceRoute = compileLink("../exrta.txt", "/docs/COURSE-CONTENT-MAP");
  assert.equal(defaultResourceRoute, "#/exrta.txt");
  assert.equal(getFile(defaultResourceRoute.slice(1), "/"), "/exrta.txt.md");
  assert.equal(compileLink("../../assets/graphql-lesson-fixtures.mjs", "/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING"),
    "#/assets/graphql-lesson-fixtures.mjs");
  assert.equal(getFile("/assets/graphql-lesson-fixtures.mjs", "/"), "/assets/graphql-lesson-fixtures.mjs.md");
  assert.equal(getFile("/assets/example.json", "/"), "/assets/example.json.md");
  const renderer = config.markdown.renderer.link;
  assert.equal(typeof renderer, "function");
  const originCalls = [];
  const receiver = {
    origin: {
      link(href, title, text) {
        originCalls.push({ href, title, text });
        return href;
      },
    },
  };
  for (const base of ["http://127.0.0.1:8000/", "https://example.github.io/API-Communication/", "https://example.github.io/API-Communication/index.html"]) {
    const rootUrl = new URL(".", base);
    const cases = [
      ["/", "exrta.txt", "exrta.txt"],
      ["/docs/COURSE-CONTENT-MAP", "../exrta.txt", "exrta.txt"],
      ["/docs/COURSE-CONTENT-MAP", "../assets/course-coverage.mjs", "assets/course-coverage.mjs"],
      ["/docs/lessons/GRAPHQL-EXECUTION-AND-BATCHING", "../../assets/graphql-lesson-fixtures.mjs?view=source#schema", "assets/graphql-lesson-fixtures.mjs?view=source#schema"],
      ["/docs/lessons/REST-HTTP-CONTRACTS", "../../assets/example.json?stage=2#example", "assets/example.json?stage=2#example"],
      ["/docs/lessons/REST-HTTP-CONTRACTS", "../../assets/course.pdf", "assets/course.pdf"],
      ["/docs/COURSE-CONTENT-MAP", "/assets/course-coverage.mjs", "assets/course-coverage.mjs"],
      ["/docs/lessons/GRPC-PROTOBUF-AND-EVOLUTION", "../contracts/course_api.proto", "docs/contracts/course_api.proto"],
    ];
    for (const [route, href, expected] of cases) {
      context.window.location = { href: base + "#" + route + "?stage=1" };
      const actual = renderer.call(receiver, href, "Source", "open");
      assert.equal(actual, new URL(expected, rootUrl).href, `${route} + ${href}`);
      assert.equal(new URL(actual).hash, expected.includes("#") ? "#" + expected.split("#")[1] : "");
      assert.deepEqual(originCalls.at(-1), { href: actual, title: "Source", text: "open" });
    }

    for (const href of ["02-GRAPHQL.md?view=reference", "#heading", "https://example.org/example.json", "//example.org/example.txt", "mailto:person@example.org"]) {
      assert.equal(renderer.call(receiver, href, null, "link"), href, href);
    }
    // Raw HTML in README is not passed through the Markdown link renderer.
    const raw = read("README.md").match(/href="(docs\/00-GUIDED-FUNDAMENTALS\.md)"/)?.[1];
    assert.ok(raw);
    assert.equal(new URL(raw, base + "#/docs/02-GRAPHQL").href, new URL(raw, rootUrl).href);
  }
  context.window.location = { href: "https://example.github.io/API-Communication#/docs/COURSE-CONTENT-MAP" };
  assert.equal(renderer.call(receiver, "../exrta.txt", null, "notes"), "https://example.github.io/API-Communication/exrta.txt");
  assert.ok(existsSync(new URL("exrta.txt", root)));
  assert.ok(existsSync(new URL("assets/course-coverage.mjs", root)));
  assert.ok(existsSync(new URL("assets/graphql-lesson-fixtures.mjs", root)));
});

test("all retained and new Markdown pages resolve reading links to actual served files", () => {
  function pagesIn(directory) {
    return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? pagesIn(`${directory}${entry.name}/`) :
        entry.name.endsWith(".md") ? [`${directory}${entry.name}`] : []);
  }
  const pages = ["README.md", "_sidebar.md", ...pagesIn("docs/")];
  let checked = 0;
  for (const base of ["http://127.0.0.1:8000/", "https://example.github.io/API-Communication/"]) {
    const deployment = new URL(base);
    for (const page of pages) {
      const route = page === "README.md" || page === "_sidebar.md" ? "/" : `/${page.replace(/\.md$/, "")}`;
      context.window.location = { href: `${base}#${route}` };
      const receiver = {
        origin: {
          link(href) {
            return isAbsolutePath(href) ? href : compileLink(href, route);
          },
        },
      };
      for (const { href, kind } of readingLinks(read(page))) {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
        const resolved = kind === "markdown"
          ? config.markdown.renderer.link.call(receiver, href, null, "")
          : href;
        const url = new URL(resolved, `${base}#${route}`);
        const path = url.hash.startsWith("#/")
          ? getFile(parse(url.hash).path, deployment.pathname)
          : url.pathname;
        assert.ok(path.startsWith(deployment.pathname), `${page}: escaped deployment ${href}`);
        const filename = decodeURIComponent(path.slice(deployment.pathname.length));
        if (!filename) continue;
        assert.ok(existsSync(new URL(filename, root)), `${page}: ${href} -> ${resolved} -> ${filename}`);
        assert.doesNotMatch(filename, /(?:^|\/)docs\/docs\//);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, "The test must cover the real course links, not only a small fixture list");
});
