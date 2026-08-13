/**
 * `hreflang.sitemap-mismatch` against a site that translates its slugs.
 *
 * The rule compares the locales a page advertises in its `<head>` to the ones
 * the sitemap lists for "the same route", and until now both sides answered
 * that question with `splitRoute` alone. On `/en/pricing` + `/fr/tarifs` that
 * is wrong twice: each URL forms its own route, each route is listed in one
 * locale, and a perfectly declared pair earns two warnings — the second half
 * of the defect `docs/i18n-cluster-plan.md` §1 measured, left open by §7 when
 * `buildI18nMatrix` got the cluster index and this rule did not.
 *
 * The cases below run the real chain — `buildClusterIndex` over real sitemap
 * entries, real `Page`s parsed from real HTML — because a hand-written
 * `clusterRouteOf` would prove the rule reads a callback, not that the
 * declaration a site actually emits reaches it.
 */

import { describe, expect, it } from "vitest";

import { buildClusterIndex } from "../core/clusters";
import { lintSite } from "../core/lint-site";
import type { SiteDiscovery, SitemapAlternate, SitemapUrlEntry } from "../core/sitemap/types";
import { getSiteRule } from "./site-rules";
import type { SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const MISMATCH = getSiteRule("hreflang.sitemap-mismatch");
if (!MISMATCH) throw new Error("hreflang.sitemap-mismatch is not registered");

const O = "https://x.com";

/** A `<head>` advertising exactly the alternates given. */
function page(url: string, alternates: SitemapAlternate[]) {
  const links = alternates
    .map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}" />`)
    .join("\n");
  return pageFromHtml(`<html><head><title>t</title>${links}</head><body>b</body></html>`, { url });
}

function discovery(urls: SitemapUrlEntry[]): SiteDiscovery {
  return {
    origin: O,
    baseUrl: O,
    source: "well-known",
    urls,
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
      urlCount: urls.length,
      warnings: [],
    },
  };
}

/**
 * A `SiteContext` wired the way `report/build.ts` wires it: the cluster index
 * is built from the whole sitemap and handed to the rules, so the test fails
 * if that wiring is dropped.
 */
function context(pages: ReturnType<typeof page>[], urls: SitemapUrlEntry[]): SiteContext {
  const clusters = buildClusterIndex(urls);
  return {
    origin: O,
    pages,
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: ["en", "fr"], source: "sitemap", multilingual: true, candidates: [] },
    discovery: discovery(urls),
    clusterRouteOf: clusters.routeOf,
  };
}

function warnings(ctx: SiteContext) {
  return lintSite(ctx, [MISMATCH!]);
}

// The pair at the centre of the defect: same page, translated slug, reciprocal
// `hreflang` on both sides, both URLs in the sitemap.
const TRANSLATED_SLUGS: SitemapAlternate[] = [
  { hreflang: "en", href: `${O}/en/pricing` },
  { hreflang: "fr", href: `${O}/fr/tarifs` },
  { hreflang: "x-default", href: `${O}/en/pricing` },
];

const translatedPages = [
  page(`${O}/en/pricing`, TRANSLATED_SLUGS),
  page(`${O}/fr/tarifs`, TRANSLATED_SLUGS),
];

describe("hreflang.sitemap-mismatch on translated slugs", () => {
  it("warns twice when nothing declares the cluster", () => {
    // The behaviour being fixed, pinned first — so the next test is a
    // difference and not a tautology. The sitemap lists both URLs but declares
    // no `xhtml:link`, so there is no cluster to follow and each URL keeps its
    // own route.
    const found = warnings(
      context(translatedPages, [{ loc: `${O}/en/pricing` }, { loc: `${O}/fr/tarifs` }]),
    );

    expect(found).toHaveLength(2);
    expect(found.map((i) => i.pageUrl).sort()).toEqual([`${O}/en/pricing`, `${O}/fr/tarifs`]);
  });

  it("stays silent once the sitemap declares the pair as one cluster", () => {
    const found = warnings(
      context(translatedPages, [
        { loc: `${O}/en/pricing`, alternates: TRANSLATED_SLUGS },
        { loc: `${O}/fr/tarifs`, alternates: TRANSLATED_SLUGS },
      ]),
    );

    expect(found).toEqual([]);
  });

  it("still fires when the disagreement is real inside a declared cluster", () => {
    // The guard that matters more than the fix: following the declaration must
    // not amount to trusting it. Here the cluster is declared over three
    // locales, the sitemap lists all three, and the `<head>`s advertise two —
    // an under-declaration the rule exists to catch.
    const declared: SitemapAlternate[] = [
      ...TRANSLATED_SLUGS,
      { hreflang: "es", href: `${O}/es/precios` },
    ];
    const heads = TRANSLATED_SLUGS;
    const found = warnings({
      ...context(
        [page(`${O}/en/pricing`, heads), page(`${O}/fr/tarifs`, heads)],
        [
          { loc: `${O}/en/pricing`, alternates: declared },
          { loc: `${O}/fr/tarifs`, alternates: declared },
          { loc: `${O}/es/precios`, alternates: declared },
        ],
      ),
      localeAxis: {
        locales: ["en", "es", "fr"],
        source: "sitemap",
        multilingual: true,
        candidates: [],
      },
    });

    expect(found).toHaveLength(2);
    for (const issue of found) {
      expect(issue.message).toContain("the sitemap lists es");
      // The row is named by the cluster anchor, not by the page it fired on:
      // that is what makes one route out of two slugs.
      expect(issue.message).toContain("Route `/pricing`");
    }
  });
});

describe("hreflang.sitemap-mismatch on shared slugs", () => {
  // The witness for "changes nothing where nothing was broken". A site whose
  // locales share a slug already grouped correctly by pathname, and must keep
  // producing byte-identical findings whether or not it declares clusters.
  const SHARED: SitemapAlternate[] = [
    { hreflang: "en", href: `${O}/en/about` },
    { hreflang: "fr", href: `${O}/fr/about` },
    { hreflang: "x-default", href: `${O}/en/about` },
  ];
  const pages = [page(`${O}/en/about`, SHARED), page(`${O}/fr/about`, SHARED)];

  it("is silent with or without a declaration when the two agree", () => {
    const undeclared = warnings(
      context(pages, [{ loc: `${O}/en/about` }, { loc: `${O}/fr/about` }]),
    );
    const declared = warnings(
      context(pages, [
        { loc: `${O}/en/about`, alternates: SHARED },
        { loc: `${O}/fr/about`, alternates: SHARED },
      ]),
    );

    expect(undeclared).toEqual([]);
    expect(declared).toEqual([]);
  });

  it("reports the same findings with or without a declaration when they disagree", () => {
    // Sitemap has three locales, the `<head>`s advertise two. Same defect,
    // same message, same page — declaring the cluster must not move it.
    const heads = SHARED;
    const withEs = [
      ...SHARED,
      { hreflang: "es", href: `${O}/es/about` },
    ] satisfies SitemapAlternate[];
    const locs = [`${O}/en/about`, `${O}/fr/about`, `${O}/es/about`];
    const axis = {
      locales: ["en", "es", "fr"],
      source: "sitemap" as const,
      multilingual: true,
      candidates: [],
    };
    const subject = [page(`${O}/en/about`, heads), page(`${O}/fr/about`, heads)];

    const undeclared = warnings({
      ...context(
        subject,
        locs.map((loc) => ({ loc })),
      ),
      localeAxis: axis,
    });
    const declared = warnings({
      ...context(
        subject,
        locs.map((loc) => ({ loc, alternates: withEs })),
      ),
      localeAxis: axis,
    });

    expect(undeclared).toHaveLength(2);
    expect(declared).toEqual(undeclared);
  });
});
