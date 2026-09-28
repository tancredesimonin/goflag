/**
 * `sitemap.orphans`, and the pages it has no business counting.
 *
 * The rule's claim is narrow: a page that asks to be indexed, measured against
 * a sitemap goflag read in full, is missing from it. Each case below is a way
 * that claim used to be made about something else — a page that names another
 * URL as the one to index, a page the sitemap does reach through a redirect, an
 * inventory goflag only read part of. `test/integration/sitemap-orphans.test.ts`
 * runs the same cases against a real server; the cut at the 5,000-entry cap is
 * only here, because a fixture built to cross it is a fixture nobody runs.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import type { SiteDiscovery } from "../core/sitemap/types";
import type { SitemapEntryProbe } from "../core/types";
import { getSiteRule } from "./site-rules";
import type { SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const ORPHANS = getSiteRule("sitemap.orphans");
if (!ORPHANS) throw new Error("sitemap.orphans is not registered");

const O = "https://x.com";

function page(path: string, head = "", headers: Record<string, string> = {}) {
  return pageFromHtml(`<html><head><title>t</title>${head}</head><body>b</body></html>`, {
    url: `${O}${path}`,
    headers,
  });
}

function discovery(paths: string[], overrides: Partial<SiteDiscovery> = {}): SiteDiscovery {
  return {
    origin: O,
    baseUrl: O,
    source: "well-known",
    urls: paths.map((p) => ({ loc: `${O}${p}` })),
    documents: [],
    truncated: false,
    diagnostics: {
      found: true,
      status: 200,
      declaredInRobots: false,
      robotsFound: false,
      atWellKnownPath: true,
      wellFormed: true,
      isIndex: false,
      childSitemapCount: 0,
      childSitemapErrors: 0,
      urlCount: paths.length,
      warnings: [],
    },
    ...overrides,
  };
}

function context(
  pages: ReturnType<typeof page>[],
  sitemap: SiteDiscovery,
  probes: SitemapEntryProbe[] = [],
): SiteContext {
  return {
    origin: O,
    pages,
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: ["en"], source: "sitemap", multilingual: false, candidates: [] },
    discovery: sitemap,
    sitemapEntries: { byUrl: new Map(probes.map((p) => [p.url, p])), unprobed: 0 },
  };
}

function orphans(ctx: SiteContext) {
  return lintSite(ctx, [ORPHANS!]);
}

const home = page("/");

describe("sitemap.orphans", () => {
  it("counts a page that asks to be indexed and that no sitemap lists", () => {
    const found = orphans(context([home, page("/forgotten")], discovery(["/"])));

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1 crawled page asks to be indexed");
    expect(found[0]!.message).toContain(`${O}/forgotten`);
  });

  it("leaves out a page that asks not to be, by meta tag or by header", () => {
    const found = orphans(
      context(
        [
          home,
          page("/meta", `<meta name="robots" content="noindex">`),
          page("/header", "", { "x-robots-tag": "noindex, nofollow" }),
        ],
        discovery(["/"]),
      ),
    );

    expect(found).toEqual([]);
  });

  it("leaves out a page whose canonical names another URL", () => {
    // Listing it is what `sitemap.entry.non-canonical` warns about. Counting it
    // here too left a site no answer that satisfied both rules.
    const found = orphans(
      context(
        [home, page("/syndicated", `<link rel="canonical" href="https://publisher.example/a">`)],
        discovery(["/"]),
      ),
    );

    expect(found).toEqual([]);
  });

  it("still counts a page whose canonical names itself, trailing slash and all", () => {
    // The exclusion is for a page that disclaims itself. A self-canonical that
    // differs only by the slash is the same page, and dropping it would trade a
    // false positive for a missed one.
    const found = orphans(
      context(
        [home, page("/forgotten", `<link rel="canonical" href="${O}/forgotten/">`)],
        discovery(["/"]),
      ),
    );

    expect(found).toHaveLength(1);
  });

  it("counts the page a redirecting entry lands on as listed", () => {
    // The redirect is `sitemap.entry.redirects`'s finding. The page behind it is
    // named by the sitemap, just through one hop too many.
    const found = orphans(
      context([home, page("/landed")], discovery(["/", "/moved"]), [
        {
          url: `${O}/moved`,
          status: 200,
          via: "probe",
          finalUrl: `${O}/landed`,
          redirected: true,
        },
      ]),
    );

    expect(found).toEqual([]);
  });

  it("renders no verdict on a sitemap cut at a cap", () => {
    // Past the cut, a listed page and an unlisted one look the same.
    const found = orphans(
      context([home, page("/forgotten")], discovery(["/"], { truncated: true })),
    );

    expect(found).toEqual([]);
  });

  it("renders no verdict when a child sitemap yielded no urlset", () => {
    const cut = discovery(["/"]);
    const found = orphans(
      context([home, page("/forgotten")], {
        ...cut,
        diagnostics: {
          ...cut.diagnostics,
          isIndex: true,
          childSitemapCount: 2,
          childSitemapErrors: 1,
        },
      }),
    );

    expect(found).toEqual([]);
  });
});
