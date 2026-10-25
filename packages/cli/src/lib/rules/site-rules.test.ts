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
import { parseRobots } from "../core/robots/parse";
import type { SiteDiscovery, SitemapAlternate, SitemapUrlEntry } from "../core/sitemap/types";
import type { RobotsProbe } from "../core/types";
import { getSiteRule, SITE_RULES } from "./site-rules";
import { getSource } from "./sources";
import type { SourceRigor } from "./sources/types";
import type { SiteContext } from "./site-types";
import type { Rigor } from "./types";
import { pageFromHtml } from "./test-utils";

const INCOMPLETE = getSiteRule("hreflang.cluster-incomplete");
if (!INCOMPLETE) throw new Error("hreflang.cluster-incomplete is not registered");

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

/**
 * The sourced half of what was one rule until 2026-08-15.
 *
 * The other direction — a `<head>` naming a locale the sitemap omits — is no
 * longer a rule at all: nothing supports it, so it asks its question through
 * `./site-prose.ts` and is tested there. What is left here renders verdicts,
 * and every one of them cites a document.
 */
function incomplete(ctx: SiteContext) {
  return lintSite(ctx, [INCOMPLETE!]);
}

// The pair at the centre of the defect: same page, translated slug, reciprocal
// `hreflang` on both sides, both URLs in the sitemap.
const TRANSLATED_SLUGS: SitemapAlternate[] = [
  { hreflang: "en", href: `${O}/en/pricing` },
  { hreflang: "fr", href: `${O}/fr/tarifs` },
  { hreflang: "x-default", href: `${O}/en/pricing` },
];

describe("hreflang.cluster-incomplete on translated slugs", () => {
  it("fires when the disagreement is real inside a declared cluster", () => {
    // The guard that matters more than the fix: following the declaration must
    // not amount to trusting it. Here the cluster is declared over three
    // locales, the sitemap lists all three, and the `<head>`s advertise two —
    // an under-declaration, so this is `cluster-incomplete`'s finding, not the
    // other half's.
    const declared: SitemapAlternate[] = [
      ...TRANSLATED_SLUGS,
      { hreflang: "es", href: `${O}/es/precios` },
    ];
    const heads = TRANSLATED_SLUGS;
    const found = incomplete({
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

describe("hreflang.cluster-incomplete on shared slugs", () => {
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
    const undeclared = incomplete(
      context(pages, [{ loc: `${O}/en/about` }, { loc: `${O}/fr/about` }]),
    );
    const declared = incomplete(
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

    const undeclared = incomplete({
      ...context(
        subject,
        locs.map((loc) => ({ loc })),
      ),
      localeAxis: axis,
    });
    const declared = incomplete({
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

describe("a path segment that only looks like a locale", () => {
  // The defect the rigor review went looking for and nearly missed by aiming at
  // the wrong place. `splitRoute` reads a leading segment by shape alone —
  // `bcp47.ts` says `/de/` and `/api/` are indistinguishable to it — and
  // `sitemapLocalesByRoute` was not consulting the locale axis. `api`, `doc`
  // and `www` all pass its two-or-three-letter test.
  //
  // So a bilingual site with a `/doc/` section was told, at `vendor-spec`
  // rigor, to publish an `hreflang="doc"` alternate for a documentation page.
  const HEADS: SitemapAlternate[] = [
    { hreflang: "en", href: `${O}/en/guide` },
    { hreflang: "fr", href: `${O}/fr/guide` },
  ];

  const withDocSection = () =>
    context(
      [page(`${O}/en/guide`, HEADS)],
      [{ loc: `${O}/en/guide` }, { loc: `${O}/fr/guide` }, { loc: `${O}/doc/guide` }],
    );

  it("is not counted as a missing cluster member", () => {
    expect(incomplete(withDocSection())).toEqual([]);
  });

  it("still sees the locales the site does serve", () => {
    // The guard must not be a mute button: with `fr` genuinely absent from the
    // `<head>`, the finding is real and must survive.
    const enOnly: SitemapAlternate[] = [{ hreflang: "en", href: `${O}/en/guide` }];
    const found = incomplete(
      context(
        [page(`${O}/en/guide`, enOnly)],
        [{ loc: `${O}/en/guide` }, { loc: `${O}/fr/guide` }, { loc: `${O}/doc/guide` }],
      ),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("the sitemap lists fr but");
    expect(found[0]!.message).not.toContain("doc");
  });
});

describe("the two halves, on a route that disagrees in both directions", () => {
  // The case that proves the split is a split and not a rename. One route, one
  // page, both gaps at once: the sitemap publishes `es` the `<head>` never
  // names, and the `<head>` names `de` the sitemap never lists. Before
  // 2026-08-15 that was one finding carrying two claims of different authority
  // under one `rigor`; it is now one finding each, and only one of them cites
  // a specification.
  const HEADS: SitemapAlternate[] = [
    { hreflang: "en", href: `${O}/en/about` },
    { hreflang: "fr", href: `${O}/fr/about` },
    { hreflang: "de", href: `${O}/de/about` },
  ];
  const ctx = (): SiteContext => ({
    ...context(
      [page(`${O}/en/about`, HEADS)],
      [`${O}/en/about`, `${O}/fr/about`, `${O}/es/about`].map((loc) => ({ loc })),
    ),
    localeAxis: {
      locales: ["de", "en", "es", "fr"],
      source: "sitemap",
      multilingual: true,
      candidates: [],
    },
  });

  // Matched on the clause that enumerates locales, not on the bare tag: `de`
  // and `es` both occur inside ordinary words in these messages — "outside",
  // "competes" — and a substring assertion would pass for the wrong reason.
  it("blames the missing cluster member on the sourced rule", () => {
    const found = incomplete(ctx());

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("the sitemap lists es but");
    expect(found[0]!.message).not.toContain("advertises de");
  });

  it("cites the document it claims", () => {
    expect(INCOMPLETE!.rigor).toBe("vendor-spec");
    expect(INCOMPLETE!.sources).toEqual(["google-hreflang"]);
  });

  it("leaves nothing in this registry without a rigor", () => {
    // The state reached on 2026-08-15: the last cross-page rule that could not
    // cite a document stopped being a rule. A regression here is a rule
    // shipping a verdict on no authority, which is the thing the whole axis
    // exists to prevent.
    for (const rule of SITE_RULES) {
      expect(rule.rigor, rule.id).toBeDefined();
      expect(rule.sources?.length, rule.id).toBeGreaterThan(0);
    }
  });
});

/**
 * `robots.blocks-site` read the way a crawler reads the file.
 *
 * It judged `User-agent: *` alone, so a Googlebot allowlist — Googlebot's own
 * group allowing `/`, `*` disallowing it — was told that "no search engine
 * will crawl any page on this origin" while Google crawled every one. The
 * plain whole-site disallow has to come out exactly as it did before; the rest
 * is what the file actually does to Googlebot and to the agents it names.
 */
describe("robots.blocks-site", () => {
  const BLOCKS_SITE = getSiteRule("robots.blocks-site");
  if (!BLOCKS_SITE) throw new Error("robots.blocks-site is not registered");

  function served(body: string): RobotsProbe {
    return {
      url: `${O}/robots.txt`,
      status: 200,
      found: true,
      byteLength: Buffer.byteLength(body),
      redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
      ...parseRobots(body),
    };
  }

  /** A page that asks to be indexed in so many words. */
  function asking(path: string) {
    return pageFromHtml(
      '<html><head><title>t</title><meta name="robots" content="index, follow"></head><body>b</body></html>',
      { url: `${O}${path}` },
    );
  }

  function check(body: string, pages: ReturnType<typeof asking>[] = []) {
    return lintSite(
      {
        origin: O,
        pages,
        matrix: { locales: [], routes: [], cells: {} },
        localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
        robots: served(body),
      },
      [BLOCKS_SITE!],
    );
  }

  const ALLOWLIST = "User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /\n";

  it("warns on a plain whole-site disallow, in the words it always used", () => {
    const [finding, ...rest] = check("User-agent: *\nDisallow: /\n");

    expect(rest).toEqual([]);
    expect(finding?.pageUrl).toBe(`${O}/robots.txt`);
    expect(finding?.severity).toBe("warning");
    expect(finding?.message).toBe(
      "`robots.txt` disallows the whole site for `User-agent: *`, so no search engine will " +
        "crawl any page on this origin. If this is a staging or preview environment, that is " +
        "correct — otherwise the site is invisible.",
    );
  });

  it("errs when pages ask to be indexed, in the words it always used", () => {
    const [finding] = check("User-agent: *\nDisallow: /\n", [asking("/"), asking("/about")]);

    expect(finding?.severity).toBe("error");
    expect(finding?.message).toBe(
      "`robots.txt` disallows the whole site for `User-agent: *`, but 2 crawled pages declare " +
        '`<meta name="robots" content="index">`. Both cannot be true: robots.txt wins, so the ' +
        "pages are never fetched and the meta tag is never read.",
    );
  });

  it("keeps the plain message when the agents the file names are kept out too", () => {
    // GPTBot is named, and its own group disallows `/`: nothing is let in, so
    // "no search engine will crawl" is still what the file does.
    const [finding] = check("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /\n");

    expect(finding?.message).toContain("so no search engine will crawl any page");
  });

  it("is silent when Googlebot's own group lets it in", () => {
    // The file the rule used to misreport. Google crawls it and reads the
    // `index` on its pages; the AI answer engines it keeps out are
    // `robots.blocks-ai-answers`'s finding, and for the rest of the crawlers
    // no source the rule cites says what being kept out costs.
    expect(check(ALLOWLIST)).toEqual([]);
    expect(check(ALLOWLIST, [asking("/"), asking("/about")])).toEqual([]);
  });

  it("is silent whichever way Googlebot's group spells the allow", () => {
    // An empty `Disallow:` allows everything (RFC 9309 §2.2.2), an `Allow: /`
    // that ties a `Disallow: /` wins it, and the token folds case.
    expect(check("User-agent: googlebot\nDisallow:\n\nUser-agent: *\nDisallow: /\n")).toEqual([]);
    expect(
      check("User-agent: Googlebot\nDisallow: /\nAllow: /\n\nUser-agent: *\nDisallow: /\n"),
    ).toEqual([]);
  });

  it("fires when Googlebot shares the `*` group", () => {
    const [finding] = check("User-agent: Googlebot\nUser-agent: *\nDisallow: /\n");

    expect(finding?.severity).toBe("warning");
    expect(finding?.message).toContain("so no search engine will crawl any page");
  });

  it("names the agents let in, and that Googlebot is not one of them", () => {
    const [finding] = check(
      "User-agent: Bingbot\nAllow: /\n\nUser-agent: *\nDisallow: /\n\n" +
        "User-agent: Applebot\nDisallow:\n",
    );

    expect(finding?.severity).toBe("warning");
    expect(finding?.message).toBe(
      "`robots.txt` disallows the whole site for `User-agent: *`. Of the agents it names it " +
        "lets in `bingbot` (line 1), `applebot` (line 7), not Googlebot, so Googlebot will not " +
        "crawl any page on this origin. If this is a staging or preview environment, that is " +
        "correct — otherwise the site is invisible to Google.",
    );
    // The sentence the bug was about: goflag cannot say no search engine
    // crawls a site that lets agents in it does not classify.
    expect(finding?.message).not.toContain("no search engine");
  });

  it("errs, naming the agents let in, when pages ask to be indexed", () => {
    const [finding] = check(
      "User-agent: Bingbot\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /\n\n" +
        "User-agent: *\nDisallow: /\n",
      [asking("/")],
    );

    expect(finding?.severity).toBe("error");
    expect(finding?.message).toBe(
      "`robots.txt` disallows the whole site for `User-agent: *`. Of the agents it names it " +
        "lets in `bingbot` (line 1), not Googlebot — but 1 crawled page declares " +
        '`<meta name="robots" content="index">`. robots.txt wins, so Googlebot never fetches ' +
        "the page and never reads the meta tag.",
    );
  });

  it("lists every line naming an agent whose groups were merged", () => {
    const [finding] = check(
      "User-agent: Bingbot\nDisallow: /admin\n\nUser-agent: *\nDisallow: /\n\n" +
        "User-agent: Bingbot\nAllow: /\n",
    );

    expect(finding?.message).toContain("lets in `bingbot` (lines 1, 7), not Googlebot");
  });

  it("does not take a Googlebot-specific token for Googlebot", () => {
    // `Googlebot-Image` is a longer token, not a prefix of `Googlebot`, so the
    // web crawler still falls under `*`.
    const [finding] = check(
      "User-agent: Googlebot-Image\nAllow: /\n\nUser-agent: *\nDisallow: /\n",
    );

    expect(finding?.message).toContain("lets in `googlebot-image` (line 1), not Googlebot");
  });

  it("is silent when `*` lets the site in, whatever Googlebot's group says", () => {
    // Unchanged scope: the rule is about the fallback group keeping the
    // origin out, not about one crawler's group.
    expect(check("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\n")).toEqual([]);
  });

  it("cites the documents it judges by", () => {
    expect(BLOCKS_SITE!.rigor).toBe("vendor-spec");
    expect(BLOCKS_SITE!.sources).toEqual(["ietf-rfc9309", "google-robots-intro"]);
  });
});

describe("the cross-page registry", () => {
  it("cites real sources wherever it claims a rigor", () => {
    // The provenance contract `rules.test.ts` enforces for page rules, applied
    // to the cross-page ones that have opted in. A rule may still carry no
    // rigor — `hreflang.sitemap-mismatch` does, on purpose, and the catalogue
    // emits the gap as `rigor: null` — but claiming one and citing nothing would
    // be the dishonesty the rigor axis exists to prevent.
    for (const rule of SITE_RULES) {
      if (rule.rigor === undefined) {
        expect(rule.sources ?? [], `${rule.id} cites sources but declares no rigor`).toHaveLength(
          0,
        );
        continue;
      }
      expect(
        rule.sources?.length,
        `${rule.id} claims ${rule.rigor} and cites nothing`,
      ).toBeGreaterThan(0);
      for (const id of rule.sources ?? []) {
        expect(getSource(id), `${rule.id} cites unknown source ${id}`).toBeDefined();
      }
    }
  });

  it("never claims more authority than its sources actually carry", () => {
    // The other half of the contract, and the half that was missing here: until
    // now a cross-page rule could claim `spec-required` while citing a blog
    // post, and only page rules were held to the mapping. Citing *a* source is
    // cheap; citing one that supports the claimed rigor is the part worth
    // enforcing, because rigor is what an agent reads to decide how hard to
    // push a fix.
    //
    // `spec-required` and `spec-recommended` differ in what the spec says (MUST
    // vs SHOULD), not in who published it, so both need a `normative` source;
    // the rest map onto the source scale directly. Same table as
    // `rules.test.ts` — deliberately duplicated rather than exported, so that
    // changing one registry's contract cannot silently change the other's.
    const NEEDS: Record<Rigor, SourceRigor> = {
      "spec-required": "normative",
      "spec-recommended": "normative",
      "vendor-spec": "vendor-spec",
      guideline: "guideline",
      heuristic: "heuristic",
    };
    const AUTHORITY: Record<SourceRigor, number> = {
      normative: 4,
      "vendor-spec": 3,
      guideline: 2,
      heuristic: 1,
    };

    for (const rule of SITE_RULES) {
      if (rule.rigor === undefined) continue;
      const best = Math.max(...(rule.sources ?? []).map((id) => AUTHORITY[getSource(id)!.rigor]));
      expect(
        best,
        `${rule.id} claims ${rule.rigor} but its strongest source is weaker than ${NEEDS[rule.rigor]}`,
      ).toBeGreaterThanOrEqual(AUTHORITY[NEEDS[rule.rigor]]);
    }
  });
});
