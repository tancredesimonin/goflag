/**
 * Cross-page questions — the site-wide half of the prose family.
 *
 * `./prose.ts` asks a page a question and hands an agent the evidence. This
 * asks the *site* one. The mechanism exists because a rule was rendering a
 * verdict without saying by what authority: `hreflang.sitemap-mismatch` carried
 * `rigor: null` **and** `severity: warning`, which is a refusal to say how
 * authoritative a claim is, followed by the claim. A warning *is* a verdict.
 *
 * ## Why the evidence is computed here and resolved there
 *
 * A `ProseRule` declares dotted paths and the runner resolves them out of the
 * `Extraction`. That is deliberate: a rule cannot smuggle a judgment into
 * evidence it did not compute. A site question cannot work that way — what an
 * agent needs is *which locales the two artefacts disagree about*, and no path
 * into a `SiteContext` holds that; only a comparison produces it.
 *
 * So the guarantee moves from mechanism to contract: **an evidence bundle holds
 * observations, never conclusions.** Two sorted lists of locale tags are
 * evidence. A field called `isWrong` would not be, and neither would a sentence.
 * The `prose` string is where the question goes, and it is the only place a
 * judgment is invited.
 *
 * ## Why these are `scope: "prose"` in the catalogue and not a fourth scope
 *
 * `catalog.ts` splits rules by scope, and `apps/website` renders exactly three
 * lists off that split. A fourth value would leave these rules in none of them
 * — visible in `rules.json`, absent from the documentation, which is the silent
 * gap this repository keeps finding and closing. What matters about a prose
 * rule is that it renders **no verdict**; where it looked is a detail its own
 * summary carries.
 */

import { splitRoute } from "../core/i18n";
import type { SiteContext } from "./site-types";
import type { AdvisoryFinding, Rigor } from "./types";

/** One question, asked about one URL, with the observations behind it. */
export interface SiteAdvisoryDraft {
  /** The page a human would open to answer it. */
  pageUrl: string;
  /**
   * Observations only. See the contract above: this bundle is what an agent
   * reasons over, so a conclusion placed here would be goflag making the
   * judgment it declined to make.
   */
  evidence: Record<string, unknown>;
}

/**
 * A cross-page question. The shape mirrors `SiteRule` minus everything that
 * expresses a verdict — no `severity`, no `check` returning issues.
 */
export interface SiteProseRule {
  id: string;
  /** One-line statement of what is being asked, for the catalogue. */
  summary: string;
  /** The question itself, in the second person, with a truth value. */
  prose: string;
  /** Why it is worth asking, in the registry's own words. */
  why?: string;
  /**
   * Left unset where no document supports the question — which is the case
   * this mechanism was built for, and the honest reading rather than a gap.
   */
  rigor?: Rigor;
  sources?: string[];
  /** Gate on the subject existing, exactly as `SiteRule.appliesTo` does. */
  appliesTo?: (site: SiteContext) => boolean;
  ask: (site: SiteContext) => SiteAdvisoryDraft[];
}

/**
 * The `<head>` advertises a locale the sitemap does not list.
 *
 * This was a `SiteRule` until 2026-08-15, and it is the reason this file
 * exists. Splitting `hreflang.sitemap-mismatch` sourced one half —
 * `hreflang.cluster-incomplete`, which Google's reciprocity requirement backs —
 * and left this one with nothing behind it. Checked at the source rather than
 * assumed: Google calls its three declaration methods *"equivalent from
 * Google's perspective"*, discourages combining them (*"there's no benefit in
 * Search"*), and nowhere requires an hreflang-declared page to appear in a
 * sitemap at all.
 *
 * A page correctly cross-linked and deliberately kept out of the sitemap is
 * doing nothing wrong. But two generators deriving one intent and disagreeing
 * is a defect somewhere — and goflag cannot say which of the two is right.
 * That is precisely a question, so it is asked as one.
 */
const hreflangSitemapMismatch: SiteProseRule = {
  id: "hreflang.sitemap-mismatch",
  summary: "`<head>` alternates advertise a locale the sitemap does not list",
  prose:
    "Your `<head>` advertises a translation your sitemap does not list. Is the sitemap " +
    "missing an entry, or is the alternate pointing at a page you did not mean to publish?",
  why:
    "The two are derived from one intent by different code paths, so a disagreement means " +
    "one of them is wrong. No specification says which: the declaration methods are " +
    "equivalent, and a page can legitimately be cross-linked and kept out of the sitemap.",
  appliesTo: (site) => site.localeAxis.multilingual && (site.discovery?.urls.length ?? 0) > 0,
  ask: (site) => {
    const axis = new Set(site.localeAxis.locales.map((l) => l.toLowerCase()));
    const bySitemap = new Map<string, Set<string>>();

    for (const entry of site.discovery?.urls ?? []) {
      let pathname: string;
      try {
        pathname = new URL(entry.loc).pathname;
      } catch {
        continue;
      }
      const { locale } = splitRoute(pathname);
      if (locale === "x-default") continue;
      // Same guard as the sourced half, for the same reason: `splitRoute` reads
      // a segment by shape alone, and `api`, `doc` and `www` all pass it.
      if (!axis.has(locale.toLowerCase())) continue;
      const route = site.clusterRouteOf?.(entry.loc) ?? splitRoute(pathname).route;
      const set = bySitemap.get(route) ?? new Set<string>();
      set.add(locale.toLowerCase());
      bySitemap.set(route, set);
    }

    const drafts: SiteAdvisoryDraft[] = [];

    for (const page of site.pages) {
      const head = new Set<string>();
      for (const alt of page.links.alternates) {
        if (alt.isXDefault) continue;
        const tag = alt.hreflang?.trim().toLowerCase();
        if (tag) head.add(tag);
      }
      if (head.size === 0) continue;

      let pathname: string;
      try {
        pathname = new URL(page.fetch.finalUrl).pathname;
      } catch {
        continue;
      }
      const route = site.clusterRouteOf?.(page.fetch.finalUrl) ?? splitRoute(pathname).route;
      const inSitemap = bySitemap.get(route);
      if (!inSitemap || inSitemap.size === 0) continue;

      const unlisted = [...head].filter((l) => !inSitemap.has(l)).sort();
      if (unlisted.length === 0) continue;

      drafts.push({
        pageUrl: page.fetch.finalUrl,
        evidence: {
          route,
          // Both sides, verbatim and sorted, so an agent can see the shape of
          // the disagreement rather than take our word for its size.
          headAdvertises: [...head].sort(),
          sitemapLists: [...inSitemap].sort(),
          advertisedButUnlisted: unlisted,
        },
      });
    }

    return drafts;
  },
};

export const SITE_PROSE_RULES: readonly SiteProseRule[] = [hreflangSitemapMismatch];

export function getSiteProseRule(id: string): SiteProseRule | undefined {
  return SITE_PROSE_RULES.find((rule) => rule.id === id);
}

/**
 * Run the site questions and bundle their evidence.
 *
 * Mirrors `collectAdvisories` in `./advisory.ts`, including its verdict: every
 * entry is `needs-judgment`, always. A site advisory never reaches
 * `siteIssues`, never moves the summary counts, and never touches the exit
 * code — the same containment the page advisories have, and the whole point of
 * moving a rule here.
 */
export function collectSiteAdvisories(
  site: SiteContext,
  rules: readonly SiteProseRule[] = SITE_PROSE_RULES,
): (AdvisoryFinding & { pageUrl: string })[] {
  const out: (AdvisoryFinding & { pageUrl: string })[] = [];

  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(site)) continue;
    for (const draft of rule.ask(site)) {
      out.push({
        ruleId: rule.id,
        kind: "prose",
        prose: rule.prose,
        // `null` where nothing supports the question, which is exactly the
        // state this rule is in and the reason it stopped being a verdict.
        rigor: rule.rigor ?? null,
        sources: rule.sources ?? [],
        evidence: draft.evidence,
        verdict: "needs-judgment",
        pageUrl: draft.pageUrl,
      });
    }
  }

  return out;
}
