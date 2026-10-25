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
import { parseRobots } from "../core/robots/parse";
import type { SiteDiscovery, SitemapAlternate, SitemapUrlEntry } from "../core/sitemap/types";
import type { RobotsProbe } from "../core/types";
import { collectSiteAdvisories, getSiteProseRule, SITE_PROSE_RULES } from "./site-prose";
import { getSource } from "./sources";
import type { SourceRigor } from "./sources/types";
import type { SiteContext } from "./site-types";
import type { Rigor } from "./types";
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

describe("hreflang.sitemap-mismatch, on a sitemap goflag did not read in full", () => {
  // The question is about what the sitemap omits, so it has the same blind spot
  // `sitemap.orphans` has: a translation listed where goflag could not read
  // would be asked about as missing. Each case would ask twice on a whole read.
  const urls: SitemapUrlEntry[] = [{ loc: `${O}/en/pricing` }, { loc: `${O}/fr/tarifs` }];

  function robotsDeclaring(...paths: string[]): RobotsProbe {
    return {
      url: `${O}/robots.txt`,
      status: 200,
      found: true,
      byteLength: 100,
      redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
      groups: [],
      sitemaps: paths.map((path, i) => ({ value: `${O}${path}`, line: i + 1 })),
      invalidLines: [],
      unknownDirectives: [],
    };
  }

  function read(...paths: string[]): SiteDiscovery["documents"] {
    return paths.map((path) => ({
      url: `${O}${path}`,
      status: 200,
      byteLength: 400,
      gzipped: false,
      kind: "urlset" as const,
      childLocs: [],
      urlCount: urls.length,
      declaredInRobots: true,
    }));
  }

  it("asks twice when the read is whole — the baseline the cases below depart from", () => {
    const ctx = context(translatedPages, urls);
    expect(
      ask({
        ...ctx,
        discovery: { ...ctx.discovery!, documents: read("/sitemap.xml") },
        robots: robotsDeclaring("/sitemap.xml"),
      }),
    ).toHaveLength(2);
  });

  it("asks nothing when a cap cut the sitemap short", () => {
    const ctx = context(translatedPages, urls);
    expect(ask({ ...ctx, discovery: { ...ctx.discovery!, truncated: true } })).toEqual([]);
  });

  it("asks nothing when an index named a child that yielded no urlset", () => {
    const ctx = context(translatedPages, urls);
    const cut = ctx.discovery!;
    expect(
      ask({
        ...ctx,
        discovery: {
          ...cut,
          diagnostics: {
            ...cut.diagnostics,
            isIndex: true,
            childSitemapCount: 2,
            childSitemapErrors: 1,
          },
        },
      }),
    ).toEqual([]);
  });

  it("asks nothing when robots.txt declares a sitemap discovery never read", () => {
    const ctx = context(translatedPages, urls);
    expect(
      ask({
        ...ctx,
        discovery: { ...ctx.discovery!, documents: read("/sitemap.xml") },
        robots: robotsDeclaring("/sitemap.xml", "/fr.xml"),
      }),
    ).toEqual([]);
  });
});

describe("robotstxt.blocks-ai-search", () => {
  const AI_SEARCH = getSiteProseRule("robotstxt.blocks-ai-search");
  if (!AI_SEARCH) throw new Error("robotstxt.blocks-ai-search is not registered");

  function served(body: string, found = true): RobotsProbe {
    return {
      url: `${O}/robots.txt`,
      status: found ? 200 : 404,
      found,
      byteLength: Buffer.byteLength(body),
      redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
      ...parseRobots(found ? body : ""),
    };
  }

  function askAbout(body: string, found = true) {
    return collectSiteAdvisories(
      {
        origin: O,
        pages: [],
        matrix: { locales: [], routes: [], cells: {} },
        localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
        robots: served(body, found),
      },
      [AI_SEARCH!],
    );
  }

  it("asks about a crawler its own group keeps out", () => {
    const [advisory, ...rest] = askAbout(
      "User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n",
    );

    expect(rest).toEqual([]);
    expect(advisory?.pageUrl).toBe(`${O}/robots.txt`);
    expect(advisory?.verdict).toBe("needs-judgment");
    // Which crawler, which group, which line — and the Googlebot half the
    // premise rests on, so an agent can check it instead of trusting it.
    expect(advisory?.evidence).toEqual({
      path: "/",
      googlebot: { group: "*", groupLines: [4], rule: { kind: "allow", pattern: "/", line: 5 } },
      disallowed: [
        {
          userAgent: "OAI-SearchBot",
          operator: "OpenAI",
          engine: "ChatGPT search",
          source: "openai-crawlers",
          group: "oai-searchbot",
          groupLines: [1],
          rule: { kind: "disallow", pattern: "/", line: 2 },
        },
      ],
      allowed: ["Claude-SearchBot", "PerplexityBot"],
    });
  });

  it("asks about every crawler `User-agent: *` catches while Googlebot is let in", () => {
    // The accident the question exists for: a fallback group written for
    // scrapers, a Googlebot exception, and the AI search crawlers caught
    // along with everything else.
    const [advisory] = askAbout("User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /\n");

    const evidence = advisory?.evidence as {
      googlebot: { group: string | null };
      disallowed: Array<{ userAgent: string; group: string; groupLines: number[]; rule: unknown }>;
      allowed: string[];
    };
    expect(evidence.googlebot.group).toBe("googlebot");
    expect(evidence.disallowed.map((c) => c.userAgent)).toEqual([
      "OAI-SearchBot",
      "Claude-SearchBot",
      "PerplexityBot",
    ]);
    for (const crawler of evidence.disallowed) {
      expect(crawler, crawler.userAgent).toMatchObject({
        group: "*",
        groupLines: [4],
        rule: { kind: "disallow", pattern: "/", line: 5 },
      });
    }
    expect(evidence.allowed).toEqual([]);
  });

  it("names the agent a shared group was chosen for, not the group's first line", () => {
    const [advisory] = askAbout("User-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: /\n");

    expect(advisory?.evidence).toMatchObject({
      disallowed: [{ userAgent: "PerplexityBot", group: "perplexitybot", groupLines: [2] }],
      allowed: ["OAI-SearchBot", "Claude-SearchBot"],
    });
  });

  it("says nothing when the file lets every crawler in", () => {
    expect(askAbout("User-agent: *\nDisallow:\n")).toEqual([]);
    expect(askAbout("User-agent: *\nAllow: /\n")).toEqual([]);
    expect(askAbout("")).toEqual([]);
  });

  it("says nothing when the site has no robots.txt", () => {
    // A 404 allows everything (RFC 9309 §2.3.1.3).
    expect(askAbout("User-agent: *\nDisallow: /\n", false)).toEqual([]);
  });

  it("says nothing when Googlebot is kept out too", () => {
    // Nothing singles an AI engine out, and a whole-site disallow is
    // `robots.blocks-site`'s finding.
    expect(askAbout("User-agent: *\nDisallow: /\n")).toEqual([]);
  });

  it("leaves training crawlers and fetchers acting for a person alone", () => {
    // GPTBot and ClaudeBot decide what a model is trained on, not what an
    // engine cites; the `-User` agents fetch for a person, and robots.txt may
    // not apply to them. Refusing all of them is the common, deliberate case.
    expect(
      askAbout(
        "User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: ChatGPT-User\n" +
          "User-agent: Claude-User\nUser-agent: Perplexity-User\nDisallow: /\n",
      ),
    ).toEqual([]);
  });

  it("says nothing about a disallow narrower than the root", () => {
    // A section kept out of one engine, not the site — decided at `/`, as
    // `robots.blocks-site` decides.
    expect(askAbout("User-agent: OAI-SearchBot\nDisallow: /members/\n")).toEqual([]);
  });

  it("cites each operator's own page, at the rigor those pages carry", () => {
    expect(AI_SEARCH!.rigor).toBe("vendor-spec");
    expect(AI_SEARCH!.sources).toEqual([
      "openai-crawlers",
      "anthropic-crawlers",
      "perplexity-crawlers",
    ]);
  });
});

describe("the cross-page questions' provenance", () => {
  // The contract `site-rules.test.ts` holds the cross-page rules to, applied
  // to the questions now that one of them cites documents. A question with no
  // rigor is honest; one that claims a rigor its sources do not carry is not.
  it("cites real sources wherever it claims a rigor, and none where it claims none", () => {
    for (const rule of SITE_PROSE_RULES) {
      if (rule.rigor === undefined) {
        expect(rule.sources ?? [], rule.id).toHaveLength(0);
        continue;
      }
      expect(rule.sources?.length, rule.id).toBeGreaterThan(0);
      for (const id of rule.sources ?? []) {
        expect(getSource(id), `${rule.id} cites unknown source ${id}`).toBeDefined();
      }
    }
  });

  it("never claims more authority than its strongest source carries", () => {
    // Same table as `site-rules.test.ts`, duplicated for the reason given
    // there: one registry's contract must not silently change another's.
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

    for (const rule of SITE_PROSE_RULES) {
      if (rule.rigor === undefined) continue;
      const best = Math.max(...(rule.sources ?? []).map((id) => AUTHORITY[getSource(id)!.rigor]));
      expect(best, rule.id).toBeGreaterThanOrEqual(AUTHORITY[NEEDS[rule.rigor]]);
    }
  });
});
