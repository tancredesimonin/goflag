/**
 * The cross-page question, and the containment that makes it one.
 *
 * `hreflang.sitemap-mismatch` was a `SiteRule` carrying `rigor: null` and
 * `severity: warning` at once — a refusal to say how authoritative a claim is,
 * followed by the claim. These cases hold the two things that fixed:
 *
 *   1. it still notices exactly what it noticed before, and
 *   2. it can no longer redden anything.
 *
 * The second matters more. A question that reached `siteIssues`, the summary
 * counts or the exit code would be a verdict again under a quieter name.
 */

import { describe, expect, it } from "vitest";

import { buildClusterIndex } from "../core/clusters";
import type { SiteDiscovery, SitemapAlternate, SitemapUrlEntry } from "../core/sitemap/types";
import { collectSiteAdvisories, getSiteProseRule, SITE_PROSE_RULES } from "./site-prose";
import type { SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const MISMATCH = getSiteProseRule("hreflang.sitemap-mismatch");
if (!MISMATCH) throw new Error("hreflang.sitemap-mismatch is not registered");

const O = "https://x.com";

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
      urlCount: urls.length,
      warnings: [],
    },
  };
}

function context(
  pages: ReturnType<typeof page>[],
  urls: SitemapUrlEntry[],
  locales = ["en", "fr"],
): SiteContext {
  const clusters = buildClusterIndex(urls);
  return {
    origin: O,
    pages,
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales, source: "sitemap", multilingual: true, candidates: [] },
    discovery: discovery(urls),
    clusterRouteOf: clusters.routeOf,
  };
}

function ask(ctx: SiteContext) {
  return collectSiteAdvisories(ctx, [MISMATCH!]);
}

const TRANSLATED_SLUGS: SitemapAlternate[] = [
  { hreflang: "en", href: `${O}/en/pricing` },
  { hreflang: "fr", href: `${O}/fr/tarifs` },
  { hreflang: "x-default", href: `${O}/en/pricing` },
];

const translatedPages = [
  page(`${O}/en/pricing`, TRANSLATED_SLUGS),
  page(`${O}/fr/tarifs`, TRANSLATED_SLUGS),
];

describe("hreflang.sitemap-mismatch, as a question", () => {
  it("asks about both pages when nothing declares the cluster", () => {
    // The behaviour it had as a rule, unchanged: the sitemap lists both URLs
    // and declares no `xhtml:link`, so each URL keeps its own pathname row and
    // each `<head>` names a locale its own row does not carry.
    const found = ask(
      context(translatedPages, [{ loc: `${O}/en/pricing` }, { loc: `${O}/fr/tarifs` }]),
    );

    expect(found).toHaveLength(2);
    expect(found.map((a) => a.pageUrl).sort()).toEqual([`${O}/en/pricing`, `${O}/fr/tarifs`]);
  });

  it("stays quiet once the sitemap declares the pair as one cluster", () => {
    const found = ask(
      context(translatedPages, [
        { loc: `${O}/en/pricing`, alternates: TRANSLATED_SLUGS },
        { loc: `${O}/fr/tarifs`, alternates: TRANSLATED_SLUGS },
      ]),
    );

    expect(found).toEqual([]);
  });

  it("hands over both sides of the disagreement, not a conclusion about it", () => {
    // The contract this registry rests on: evidence is observations. An agent
    // has to be able to disagree with goflag's reading, which it cannot do if
    // goflag only ships its reading.
    const [advisory] = ask(
      context(
        [
          page(`${O}/en/about`, [
            { hreflang: "en", href: `${O}/en/about` },
            { hreflang: "fr", href: `${O}/fr/about` },
          ]),
        ],
        [{ loc: `${O}/en/about` }],
      ),
    );

    expect(advisory?.evidence).toEqual({
      route: "/about",
      headAdvertises: ["en", "fr"],
      sitemapLists: ["en"],
      advertisedButUnlisted: ["fr"],
    });
  });

  it("ignores a path segment that only looks like a locale", () => {
    // Same guard as the sourced half: `api`, `doc` and `www` all pass
    // `looksLikeLocaleSegment`, and a question about an `hreflang="doc"` would
    // waste an agent's turn as surely as a finding wasted a human's.
    const found = ask(
      context(
        [page(`${O}/en/guide`, [{ hreflang: "en", href: `${O}/en/guide` }])],
        [{ loc: `${O}/en/guide` }, { loc: `${O}/doc/guide` }],
      ),
    );

    expect(found).toEqual([]);
  });

  it("says nothing on a monolingual site", () => {
    const found = ask(
      context(
        [page(`${O}/about`, [{ hreflang: "en", href: `${O}/about` }])],
        [{ loc: `${O}/about` }],
        ["en"],
      ),
    );

    expect(found).toEqual([]);
  });
});

describe("what a question is not allowed to be", () => {
  it("carries no severity anywhere in its shape", () => {
    const [advisory] = ask(
      context(translatedPages, [{ loc: `${O}/en/pricing` }, { loc: `${O}/fr/tarifs` }]),
    );

    expect(advisory).toBeDefined();
    expect(advisory).not.toHaveProperty("severity");
    expect(advisory!.verdict).toBe("needs-judgment");
  });

  it("declares no rigor, because no document supports it", () => {
    // Checked at the source on 2026-08-15: Google calls its three declaration
    // methods equivalent and requires no hreflang-declared page to appear in a
    // sitemap. `null` here is the honest reading, and it is now attached to
    // something that renders no verdict — which is what makes it coherent.
    expect(MISMATCH!.rigor).toBeUndefined();
    expect(MISMATCH!.sources).toBeUndefined();

    const [advisory] = ask(
      context(translatedPages, [{ loc: `${O}/en/pricing` }, { loc: `${O}/fr/tarifs` }]),
    );
    expect(advisory!.rigor).toBeNull();
    expect(advisory!.sources).toEqual([]);
  });

  it("asks something with a truth value, in the second person", () => {
    for (const rule of SITE_PROSE_RULES) {
      expect(rule.prose, rule.id).toMatch(/\?$/);
      expect(rule.prose.length, rule.id).toBeGreaterThan(40);
    }
  });
});
