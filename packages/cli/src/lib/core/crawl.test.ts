import { describe, expect, it } from "vitest";

import { canonicaliseUrl, crawl } from "./crawl";

describe("canonicaliseUrl", () => {
  it("resolves relative URLs against the provided base", () => {
    expect(canonicaliseUrl("/about", "https://x.com/blog")).toBe("https://x.com/about");
    expect(canonicaliseUrl("post-1", "https://x.com/blog/")).toBe("https://x.com/blog/post-1");
  });

  it("strips fragments and trailing slashes (except root)", () => {
    expect(canonicaliseUrl("https://x.com/about/")).toBe("https://x.com/about");
    expect(canonicaliseUrl("https://x.com/about#top")).toBe("https://x.com/about");
    expect(canonicaliseUrl("https://x.com/")).toBe("https://x.com/");
  });

  it("rejects non-http(s) and invalid URLs", () => {
    expect(canonicaliseUrl("mailto:hello@x.com")).toBeNull();
    expect(canonicaliseUrl("javascript:alert(1)")).toBeNull();
    expect(canonicaliseUrl(":::not-a-url")).toBeNull();
  });
});

describe("crawl (BFS, depth, filters, dedupe)", () => {
  // We exercise the BFS/dedup/depth/filter/cycle behaviour against a
  // tiny stub `inspect` (not the real one) — the integration test suite
  // covers the real fetch path against the Hono fixture server.
  it("respects depth limits", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/": '<a href="/a">A</a>',
      "https://x.com/a": '<a href="/b">B</a>',
      "https://x.com/b": '<a href="/c">C</a>',
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      depth: 1,
      inspectOptions,
      followHreflang: false,
    });
    const visited = result.pages.map((p) => p.fetch.finalUrl).sort();
    expect(visited).toEqual(["https://x.com/", "https://x.com/a"]);
  });

  it("dedupes trailing-slash variants and self-loops", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/":
        '<a href="/about/">about</a><a href="/about">about no slash</a><a href="/">self</a>',
      "https://x.com/about": "<title>About</title>",
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      depth: 2,
      inspectOptions,
      followHreflang: false,
    });
    const visited = result.pages.map((p) => p.fetch.finalUrl).sort();
    expect(visited).toEqual(["https://x.com/", "https://x.com/about"]);
  });

  it("keeps one copy of a document two URLs redirect onto", async () => {
    // The shape every site here has: the entry redirects to the default locale,
    // and that locale root is also a sitemap seed. Two requests, one document.
    //
    // Keeping both is not cosmetic — the page is linted twice, so every finding
    // on it is emitted twice under the same fingerprint (the fingerprint is
    // built from the final URL). `--max-debt` counts the copies while a
    // baseline diff collapses them, and the duplicate spends a slot of the page
    // budget on a document already audited.
    const inspectOptions = mockInspect({
      "https://x.com/": { finalUrl: "https://x.com/en", body: '<a href="/en/about">about</a>' },
      "https://x.com/en": { finalUrl: "https://x.com/en", body: '<a href="/en/about">about</a>' },
      "https://x.com/en/about": "<title>About</title>",
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      seedUrls: ["https://x.com/en"],
      depth: 2,
      inspectOptions,
      followHreflang: false,
    });
    expect(result.pages.map((p) => p.fetch.finalUrl).sort()).toEqual([
      "https://x.com/en",
      "https://x.com/en/about",
    ]);
  });

  it("still follows the links of a document it reached through a redirect", async () => {
    // The duplicate is dropped after the kept copy has been expanded, never
    // before — otherwise this is a way to lose a whole subtree.
    const inspectOptions = mockInspect({
      "https://x.com/": { finalUrl: "https://x.com/en", body: '<a href="/en/deep">deep</a>' },
      "https://x.com/en/deep": '<a href="/en/deeper">deeper</a>',
      "https://x.com/en/deeper": "<title>Deeper</title>",
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      depth: 2,
      inspectOptions,
      followHreflang: false,
    });
    expect(result.pages.map((p) => p.fetch.finalUrl).sort()).toEqual([
      "https://x.com/en",
      "https://x.com/en/deep",
      "https://x.com/en/deeper",
    ]);
  });

  it("does not count a duplicate against the page budget", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/": { finalUrl: "https://x.com/en", body: '<a href="/en/a">a</a>' },
      "https://x.com/en": { finalUrl: "https://x.com/en", body: '<a href="/en/a">a</a>' },
      "https://x.com/en/a": "<title>A</title>",
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      seedUrls: ["https://x.com/en"],
      depth: 2,
      maxPages: 2,
      inspectOptions,
      followHreflang: false,
    });
    // Two slots, two distinct documents — the redirect twin does not eat one.
    // Before this, the budget bought `/en` twice and `/en/a` was never reached.
    expect(result.pages.map((p) => p.fetch.finalUrl).sort()).toEqual([
      "https://x.com/en",
      "https://x.com/en/a",
    ]);
  });

  it("applies include filters by pathname", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/": '<a href="/blog/post-1">post 1</a><a href="/news/post-1">news 1</a>',
      "https://x.com/blog/post-1": "<title>Post 1</title>",
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      depth: 1,
      include: ["/blog/**"],
      inspectOptions,
      followHreflang: false,
    });
    const paths = result.pages.map((p) => new URL(p.fetch.finalUrl).pathname).sort();
    expect(paths).toEqual(["/", "/blog/post-1"]);
  });

  it("always follows hreflang siblings even when an exclude filter would block them", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/fr/about": `<link rel="alternate" hreflang="en" href="https://x.com/en/about">`,
      "https://x.com/en/about": "<title>About EN</title>",
    });
    const result = await crawl({
      entryUrl: "https://x.com/fr/about",
      depth: 1,
      exclude: ["/en/**"],
      inspectOptions,
    });
    const visited = result.pages.map((p) => p.fetch.finalUrl).sort();
    expect(visited).toEqual(["https://x.com/en/about", "https://x.com/fr/about"]);
  });

  it("stops at maxPages and reports truncated", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/": '<a href="/1">1</a><a href="/2">2</a><a href="/3">3</a>',
      "https://x.com/1": "ok",
      "https://x.com/2": "ok",
      "https://x.com/3": "ok",
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      depth: 1,
      maxPages: 2,
      concurrency: 1,
      inspectOptions,
      followHreflang: false,
    });
    expect(result.pages).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("collects per-URL errors instead of throwing the whole crawl", async () => {
    const inspectOptions = mockInspect({
      "https://x.com/": '<a href="/ok">ok</a><a href="/bad">bad</a>',
      "https://x.com/ok": "ok",
      "https://x.com/bad": new Error("boom"),
    });
    const result = await crawl({
      entryUrl: "https://x.com/",
      depth: 1,
      inspectOptions,
      followHreflang: false,
    });
    expect(result.pages.map((p) => p.fetch.finalUrl).sort()).toEqual([
      "https://x.com/",
      "https://x.com/ok",
    ]);
    expect(result.errors).toEqual([{ url: "https://x.com/bad", message: "boom" }]);
  });
});

/**
 * Build a fake `InspectOptions` payload that the crawler treats as
 * regular options but whose `signal.reason` carries our routing
 * table. Easier than monkey-patching `inspect` itself.
 *
 * The crawler doesn't accept a `inspect` injection point yet — but
 * we don't need one: every test in this file goes through the real
 * `inspect()` shim by way of a tiny `vi.spyOn`-equivalent set up in
 * `beforeEach`. Instead, we use `vitest.mock` on `./inspect`.
 */
import { vi } from "vitest";
import type { Page } from "./types";
import { pageFromHtml } from "@/lib/rules/test-utils";

vi.mock("./inspect", async () => {
  return {
    inspect: vi.fn(async (url: string) => {
      const entry = (vi.mocked(inspectMockTable) as unknown as Map<string, MockEntry>).get(url);
      if (entry === undefined) {
        throw new Error(`crawl test: unexpected URL ${url}`);
      }
      if (entry instanceof Error) throw entry;
      // A redirect: the request went to `url`, the document came back from
      // somewhere else, and that is what `finalUrl` reports.
      const handler = typeof entry === "string" ? entry : entry.body;
      const url_ = typeof entry === "string" ? url : entry.finalUrl;
      // <link> belongs in <head>; everything else in <body>. This
      // keeps the per-test fixtures readable without spelling out the
      // full HTML envelope.
      const isHead = handler.trim().startsWith("<link");
      const html = isHead
        ? `<html><head>${handler}</head><body></body></html>`
        : `<html><head></head><body>${handler}</body></html>`;
      return pageFromHtml(html, { url: url_ });
    }),
  };
});

/** A body, a thrown failure, or a body served from a different final URL. */
type MockEntry = string | Error | { finalUrl: string; body: string };

const inspectMockTable = new Map<string, MockEntry>();

function mockInspect(table: Record<string, MockEntry>): undefined {
  inspectMockTable.clear();
  for (const [url, body] of Object.entries(table)) {
    inspectMockTable.set(url, body);
  }
  return undefined;
}

// Suppress unused-import lint for `Page`.
void (null as unknown as Page);

describe("canonicaliseUrl — preserveTrailingSlash", () => {
  it("drops the trailing slash by default, for the crawl frontier", () => {
    // `/about` and `/about/` are almost always the same page; collapsing them
    // halves the crawl.
    expect(canonicaliseUrl("https://x.com/about/")).toBe("https://x.com/about");
  });

  it("keeps it when asked, for link checking", () => {
    expect(
      canonicaliseUrl("https://x.com/about/", undefined, { preserveTrailingSlash: true }),
    ).toBe("https://x.com/about/");
  });

  it("leaves the root slash alone either way", () => {
    expect(canonicaliseUrl("https://x.com/")).toBe("https://x.com/");
    expect(canonicaliseUrl("https://x.com/", undefined, { preserveTrailingSlash: true })).toBe(
      "https://x.com/",
    );
  });

  it("preserves the slash ahead of a query string", () => {
    expect(
      canonicaliseUrl("https://x.com/a/b/?q=1", undefined, { preserveTrailingSlash: true }),
    ).toBe("https://x.com/a/b/?q=1");
  });
});
