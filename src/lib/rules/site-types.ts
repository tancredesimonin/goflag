/**
 * Goflag site-rule contract.
 *
 * A `Rule` (see `./types.ts`) is a pure function of a single `Page`. That
 * purity is worth protecting — it is what makes per-page rules trivially
 * testable and independently runnable — but it cannot express the checks that
 * matter most for a multilingual site, because those are statements *about a
 * set of pages*:
 *
 *   - "this page declares no alternates, and the site serves four locales"
 *     needs to know the site's locale axis;
 *   - "the `<head>` and the sitemap disagree about which locales exist for
 *     this route" needs two artefacts at once.
 *
 * So instead of smuggling site knowledge into `RuleContext` — which would make
 * `Rule` ambiguous, with some rules silently useless in isolation — cross-page
 * policies get their own contract. Same `Issue` shape, same severity ladder,
 * same fingerprinting downstream; only the input differs.
 *
 * Both registries are catalog entries: phase 3 attaches `rigor` and `Source`
 * records to `Rule` and `SiteRule` alike, and phase 5 hangs the route-manifest
 * comparison off a `SiteRule` that reads `ctx.site.manifest`.
 */

import type { I18nMatrix } from "../core/i18n";
import type { LocaleAxis } from "../core/locales";
import type { SiteDiscovery } from "../core/sitemap/types";
import type { Issue, Page, RobotsProbe, Severity } from "../core/types";

/**
 * Everything a cross-page rule is allowed to see. Deliberately a plain,
 * JSON-shaped snapshot: no fetching, no lazy loading, nothing a rule could
 * use to reach the network.
 */
export interface SiteContext {
  /** Origin under audit, e.g. `https://example.com`. */
  origin: string;
  /** Healthy (2xx) pages the crawl inspected. */
  pages: readonly Page[];
  /** The (route × locale) grid, including declared-but-uncrawled cells. */
  matrix: I18nMatrix;
  /** Locales the site is believed to serve, and how we know. */
  localeAxis: LocaleAxis;
  /**
   * The site's `robots.txt`, when it could be fetched. Site-level by nature:
   * one file governs every page, so no per-page rule can judge it.
   */
  robots?: RobotsProbe;
  /**
   * The discovered sitemap, when one was found. `undefined` when discovery
   * was skipped (`--no-sitemap`) or the site has none — rules must degrade
   * gracefully rather than assume it is present.
   */
  discovery?: SiteDiscovery;
}

/** Helpers handed to a site rule's `check()`, mirroring `RuleContext`. */
export interface SiteRuleContext {
  site: SiteContext;
  /**
   * Build an `Issue` carrying this rule's id and default severity. `pageUrl`
   * is required: a site-level finding still has to point somewhere actionable,
   * and the report groups by page.
   */
  issue: (
    input: Omit<Issue, "ruleId" | "severity"> & {
      severity?: Severity;
      pageUrl: string;
    },
  ) => SiteIssueDraft;
}

/** An `Issue` plus the page it should be attributed to. */
export type SiteIssueDraft = Issue & { pageUrl: string };

/**
 * The smallest enforceable cross-page policy. Pure function over a
 * `SiteContext`; the runner (`../core/lint-site.ts`) handles iteration,
 * ordering and crash isolation exactly as `lint()` does for `Rule`.
 */
export interface SiteRule {
  /** Stable identifier in `category.short-name` form (e.g. `hreflang.missing`). */
  id: string;
  /** Default severity for issues this rule emits. */
  severity: Severity;
  /** One-line summary of what the rule enforces. */
  summary: string;
  /**
   * Optional gate. Returning false skips the rule entirely — used to keep
   * hreflang rules silent on monolingual sites, where they would be noise
   * rather than findings.
   */
  appliesTo?: (site: SiteContext) => boolean;
  /** The check itself. Return `[]`/`undefined` when nothing is wrong. */
  check: (ctx: SiteRuleContext) => SiteIssueDraft[] | SiteIssueDraft | undefined | void;
}

export type { Issue, Page, Severity };
