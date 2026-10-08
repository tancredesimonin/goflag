/**
 * `sitemapReadInFull`, the gate every absence judgment stands behind.
 *
 * Each case is one way goflag can hold part of a site's sitemaps and believe it
 * holds all of them — or, in the other direction, a way of holding all of them
 * that must not be mistaken for a partial read. A gate that closes too often
 * silences the rules behind it on every site that trips it, which is its own
 * failure, so both directions are pinned.
 */

import { describe, expect, it } from "vitest";

import type { SiteDiscovery, SitemapDocument } from "../core/sitemap/types";
import type { RobotsProbe } from "../core/types";
import type { SiteContext } from "./site-types";
import { sitemapReadInFull } from "./sitemap-inventory";

const O = "https://x.com";

function doc(path: string, overrides: Partial<SitemapDocument> = {}): SitemapDocument {
  return {
    url: path.startsWith("http") ? path : `${O}${path}`,
    status: 200,
    byteLength: 400,
    gzipped: false,
    kind: "urlset",
    childLocs: [],
    urlCount: 2,
    declaredInRobots: false,
    ...overrides,
  };
}

function discovery(
  documents: SitemapDocument[],
  overrides: { truncated?: boolean; childSitemapErrors?: number; found?: boolean } = {},
): SiteDiscovery {
  return {
    origin: O,
    baseUrl: O,
    source: "robots",
    urls: [{ loc: `${O}/` }, { loc: `${O}/a` }],
    documents,
    truncated: overrides.truncated ?? false,
    diagnostics: {
      found: overrides.found ?? true,
      status: 200,
      declaredInRobots: true,
      robotsFound: true,
      atWellKnownPath: false,
      wellFormed: true,
      isIndex: documents[0]?.kind === "index",
      childSitemapCount: documents.filter((d) => d.parentUrl).length,
      childSitemapErrors: overrides.childSitemapErrors ?? 0,
      urlCount: 2,
      warnings: [],
      sitemapUrl: documents[0]?.url,
    },
  };
}

function robots(...declared: string[]): RobotsProbe {
  return {
    url: `${O}/robots.txt`,
    status: 200,
    found: true,
    byteLength: 100,
    redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
    groups: [],
    sitemaps: declared.map((value, i) => ({ value, line: i + 3 })),
    invalidLines: [],
    unknownDirectives: [],
  };
}

function site(sitemap: SiteDiscovery | undefined, robotsTxt?: RobotsProbe): SiteContext {
  return {
    origin: O,
    pages: [],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: ["en"], source: "sitemap", multilingual: false, candidates: [] },
    discovery: sitemap,
    robots: robotsTxt,
  };
}

describe("sitemapReadInFull — what counts as the whole inventory", () => {
  it("holds for the one sitemap robots.txt declares, once it was read", () => {
    expect(
      sitemapReadInFull(site(discovery([doc("/sitemap.xml")]), robots(`${O}/sitemap.xml`))),
    ).toBe(true);
  });

  it("holds when robots.txt declares none and the well-known path was read", () => {
    expect(sitemapReadInFull(site(discovery([doc("/sitemap.xml")]), robots()))).toBe(true);
  });

  it("holds when there is no robots.txt to declare anything", () => {
    expect(sitemapReadInFull(site(discovery([doc("/sitemap.xml")])))).toBe(true);
  });

  it("holds when a declared sitemap was read as the child of another declared one", () => {
    // Declaring both an index and one of its children is redundant, not
    // partial: discovery reads the child while following the index.
    const index = doc("/sitemap_index.xml", { kind: "index", childLocs: [`${O}/pages.xml`] });
    const child = doc("/pages.xml", { parentUrl: `${O}/sitemap_index.xml` });

    expect(
      sitemapReadInFull(
        site(discovery([index, child]), robots(`${O}/sitemap_index.xml`, `${O}/pages.xml`)),
      ),
    ).toBe(true);
  });

  it("holds when the same sitemap is declared twice", () => {
    expect(
      sitemapReadInFull(
        site(discovery([doc("/sitemap.xml")]), robots(`${O}/sitemap.xml`, `${O}/sitemap.xml`)),
      ),
    ).toBe(true);
  });

  it("reads a relative declaration as the file it names", () => {
    // RFC 9309 wants a full URL, and `robotstxt.sitemap.relative` says so. But
    // `Sitemap: /sitemap.xml` names the file discovery then read at the
    // well-known path, and treating it as unread would silence every rule
    // behind this gate on a site whose only fault is that line.
    expect(sitemapReadInFull(site(discovery([doc("/sitemap.xml")]), robots("/sitemap.xml")))).toBe(
      true,
    );
  });

  it("compares URLs, not spellings", () => {
    // Host case and a default port are the same URL to every crawler.
    expect(
      sitemapReadInFull(
        site(discovery([doc("/sitemap.xml")]), robots("https://X.COM:443/sitemap.xml")),
      ),
    ).toBe(true);
  });

  it("ignores a declaration that names no URL at all", () => {
    // Nothing a crawler could fetch, so nothing it could have listed.
    expect(
      sitemapReadInFull(site(discovery([doc("/sitemap.xml")]), robots("http://[not a url"))),
    ).toBe(true);
  });
});

describe("sitemapReadInFull — what makes the read partial", () => {
  it("fails when robots.txt declares a second sitemap discovery never read", () => {
    // Discovery stops at the first declared sitemap that parses. A search
    // engine reads every `Sitemap:` line.
    expect(
      sitemapReadInFull(
        site(discovery([doc("/pages.xml")]), robots(`${O}/pages.xml`, `${O}/posts.xml`)),
      ),
    ).toBe(false);
  });

  it("fails when the declared sitemap could not be read and the well-known one was", () => {
    // The declared file may be the one listing the page. Discovery fell back
    // to `/sitemap.xml`, which says nothing about what the other one holds.
    expect(sitemapReadInFull(site(discovery([doc("/sitemap.xml")]), robots(`${O}/gone.xml`)))).toBe(
      false,
    );
  });

  it("fails when a cap cut the read short", () => {
    expect(
      sitemapReadInFull(
        site(discovery([doc("/sitemap.xml")], { truncated: true }), robots(`${O}/sitemap.xml`)),
      ),
    ).toBe(false);
  });

  it("fails when an index named a child that yielded no urlset", () => {
    const index = doc("/sitemap.xml", { kind: "index" });
    const broken = doc("/more.xml", {
      kind: "unparsable",
      status: 404,
      parentUrl: `${O}/sitemap.xml`,
    });

    expect(
      sitemapReadInFull(
        site(discovery([index, broken], { childSitemapErrors: 1 }), robots(`${O}/sitemap.xml`)),
      ),
    ).toBe(false);
  });

  it("fails when no sitemap was found", () => {
    expect(sitemapReadInFull(site(discovery([], { found: false })))).toBe(false);
  });

  it("fails when discovery did not run", () => {
    expect(sitemapReadInFull(site(undefined))).toBe(false);
  });
});
