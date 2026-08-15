/**
 * The two rules the document tree exists for.
 *
 * Both are stated **per document** by sitemaps.org, and neither could be
 * evaluated while discovery flattened every document into one URL list and a
 * handful of counters. They are the reason `SiteDiscovery.documents` was added,
 * so they are tested against the tree directly rather than through a fixture
 * server: the arithmetic is on numbers a real site would need 50,000 entries or
 * 50 MB to produce, and a test that has to build that to run is a test nobody
 * runs.
 *
 * The discovery side — that those numbers arrive at all, and that entries carry
 * the document that declared them — is `test/unit/sitemap-discover.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import type { SitemapDocument, SitemapUrlEntry } from "../core/sitemap/types";
import { getSiteRule } from "./site-rules";
import type { SiteContext } from "./site-types";

const LIMITS = getSiteRule("sitemap.limits.exceeded");
if (!LIMITS) throw new Error("sitemap.limits.exceeded is not registered");

const SCOPE = getSiteRule("sitemap.entry.out-of-scope");
if (!SCOPE) throw new Error("sitemap.entry.out-of-scope is not registered");

const O = "https://x.com";

/** A `SitemapDocument` with the boring fields filled in. */
function doc(over: Partial<SitemapDocument> & { url: string }): SitemapDocument {
  return {
    status: 200,
    byteLength: 1_024,
    gzipped: false,
    kind: "urlset",
    childLocs: [],
    urlCount: 1,
    declaredInRobots: false,
    ...over,
  };
}

function context(documents: SitemapDocument[], urls: SitemapUrlEntry[] = []): SiteContext {
  return {
    origin: O,
    pages: [],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: ["en"], source: "sitemap", multilingual: false, candidates: [] },
    discovery: {
      origin: O,
      baseUrl: O,
      source: "well-known",
      urls,
      documents,
      truncated: false,
      diagnostics: {
        found: true,
        sitemapUrl: documents[0]?.url,
        status: 200,
        declaredInRobots: false,
        robotsFound: false,
        atWellKnownPath: true,
        wellFormed: true,
        isIndex: documents[0]?.kind === "index",
        childSitemapCount: documents[0]?.childLocs.length ?? 0,
        childSitemapErrors: 0,
        urlCount: urls.length,
        warnings: [],
      },
    },
  };
}

describe("sitemap.limits.exceeded", () => {
  it("says nothing about a document inside both ceilings", () => {
    const found = lintSite(
      context([doc({ url: `${O}/sitemap.xml`, urlCount: 50_000, byteLength: 52_428_800 })]),
      [LIMITS!],
    );

    // Exactly at the limit is inside it: "no more than 50,000" and "no larger
    // than 50MB" are both inclusive, and an off-by-one here would fire on the
    // largest legal sitemap there is.
    expect(found).toEqual([]);
  });

  it("fires on one URL past the count ceiling", () => {
    const found = lintSite(context([doc({ url: `${O}/sitemap.xml`, urlCount: 50_001 })]), [
      LIMITS!,
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]!.pageUrl).toBe(`${O}/sitemap.xml`);
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.message).toContain("50,001 URLs");
  });

  it("fires on one byte past the size ceiling", () => {
    const found = lintSite(context([doc({ url: `${O}/sitemap.xml`, byteLength: 52_428_801 })]), [
      LIMITS!,
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("50.0 MB uncompressed");
  });

  it("names both ceilings when a document is over both", () => {
    const found = lintSite(
      context([doc({ url: `${O}/sitemap.xml`, urlCount: 60_000, byteLength: 60_000_000 })]),
      [LIMITS!],
    );

    expect(found[0]!.message).toContain("60,000 URLs");
    expect(found[0]!.message).toContain("and");
    expect(found[0]!.message).toContain("MB uncompressed");
  });

  it("counts an index by its children, not by its URLs", () => {
    // The index ceiling is on `<sitemap>` entries; `urlCount` is 0 on an index
    // by construction, so reading the wrong field makes this rule permanently
    // silent on exactly the documents most likely to be too big.
    const children = Array.from({ length: 50_001 }, (_, i) => `${O}/sm-${i}.xml`);
    const found = lintSite(
      context([doc({ url: `${O}/sitemap.xml`, kind: "index", childLocs: children, urlCount: 0 })]),
      [LIMITS!],
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("50,001 child sitemaps");
  });

  it("reports each oversized document separately", () => {
    const found = lintSite(
      context([
        doc({ url: `${O}/sitemap.xml`, kind: "index", childLocs: [`${O}/a.xml`, `${O}/b.xml`] }),
        doc({ url: `${O}/a.xml`, urlCount: 50_001, parentUrl: `${O}/sitemap.xml` }),
        doc({ url: `${O}/b.xml`, urlCount: 90_000, parentUrl: `${O}/sitemap.xml` }),
      ]),
      [LIMITS!],
    );

    // One finding per document, each naming its own: the fix is to split that
    // file, and a single aggregated finding would not say which.
    expect(found.map((i) => i.pageUrl)).toEqual([`${O}/a.xml`, `${O}/b.xml`]);
  });

  it("ignores a document that could not be parsed", () => {
    // `byteLength` is real — something was served — but a document that is not
    // a sitemap has no sitemap ceiling to break. `sitemap.unparsable` and
    // `sitemap.index.child-error` are the findings for those.
    const found = lintSite(
      context([doc({ url: `${O}/sitemap.xml`, kind: "unparsable", byteLength: 90_000_000 })]),
      [LIMITS!],
    );

    expect(found).toEqual([]);
  });
});

describe("sitemap.entry.out-of-scope", () => {
  const nested = `${O}/catalog/sitemap.xml`;

  it("is silent for a root-level sitemap, whatever it lists", () => {
    // Its directory is `/`, so every path on the host is under it. This is most
    // sitemaps, and the rule must cost them nothing.
    const found = lintSite(
      context(
        [doc({ url: `${O}/sitemap.xml` })],
        [
          { loc: `${O}/images/a`, documentUrl: `${O}/sitemap.xml` },
          { loc: `${O}/anything/else`, documentUrl: `${O}/sitemap.xml` },
        ],
      ),
      [SCOPE!],
    );

    expect(found).toEqual([]);
  });

  it("is silent when a nested sitemap stays under its own directory", () => {
    const found = lintSite(
      context(
        [doc({ url: nested })],
        [
          { loc: `${O}/catalog/a`, documentUrl: nested },
          { loc: `${O}/catalog/deeper/b`, documentUrl: nested },
        ],
      ),
      [SCOPE!],
    );

    expect(found).toEqual([]);
  });

  it("fires on the entries outside it, and names the directory", () => {
    const found = lintSite(
      context(
        [doc({ url: nested })],
        [
          { loc: `${O}/catalog/a`, documentUrl: nested },
          { loc: `${O}/images/b`, documentUrl: nested },
        ],
      ),
      [SCOPE!],
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.pageUrl).toBe(nested);
    expect(found[0]!.message).toContain("`/catalog/`");
    expect(found[0]!.message).toContain(`${O}/images/b`);
    expect(found[0]!.message).not.toContain(`${O}/catalog/a`);
  });

  it("groups by the document that overreached, not by entry", () => {
    const other = `${O}/blog/sitemap.xml`;
    const found = lintSite(
      context(
        [doc({ url: nested }), doc({ url: other })],
        [
          { loc: `${O}/images/a`, documentUrl: nested },
          { loc: `${O}/images/b`, documentUrl: nested },
          { loc: `${O}/images/c`, documentUrl: other },
        ],
      ),
      [SCOPE!],
    );

    expect(found).toHaveLength(2);
    expect(found.map((i) => i.pageUrl).sort()).toEqual([other, nested].sort());
  });

  it("leaves a cross-host entry to the rule that owns it", () => {
    // Reporting one URL under two rules teaches a reader to discount both, and
    // `sitemap.entry.cross-host` says the more useful of the two things.
    const found = lintSite(
      context([doc({ url: nested })], [{ loc: "https://other.com/images/a", documentUrl: nested }]),
      [SCOPE!],
    );

    expect(found).toEqual([]);
  });

  it("ignores an entry no document claimed", () => {
    // The crawl fallback produces entries with no `documentUrl`. There is no
    // document to judge them against, and inventing one would invent the
    // finding too.
    const found = lintSite(context([doc({ url: nested })], [{ loc: `${O}/images/a` }]), [SCOPE!]);

    expect(found).toEqual([]);
  });
});
