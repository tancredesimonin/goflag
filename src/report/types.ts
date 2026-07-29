/**
 * The Goflag report — the single source of truth.
 *
 * Everything the CLI prints is a pure function of this object. It is fully
 * JSON-serializable so `goflag <url> --json` and `--report out.json` emit it
 * verbatim, and CI can diff / gate on it.
 */

import type { Severity } from "../lib/core/types";
import type { LinkVerdict } from "../lib/core/links/types";
import type { ReciprocityIssue } from "../lib/core/i18n";

export type Verdict = "green" | "yellow" | "red";

/** A page that was crawled, with just what the report needs. */
export interface ReportPage {
  url: string;
  status: number;
  /** Locale inferred from the leading path segment, or null when unprefixed. */
  locale: string | null;
}

/** One problematic link, mapped back to the page that references it. */
export interface BrokenLink {
  /** Stable fingerprint of this finding (see `./fingerprint.ts`). */
  id: string;
  /** The page the link was found on. */
  pageUrl: string;
  /** The link target (canonical URL that was probed). */
  href: string;
  /** Final HTTP status (`0` = network error). */
  status: number;
  verdict: LinkVerdict;
  /** Human-readable reason (network reason, "soft-404", "429 rate-limited", ...). */
  reason?: string;
}

/** A route present in some locales but missing in others. */
export interface TranslationHole {
  /** Stable fingerprint of this finding (see `./fingerprint.ts`). */
  id: string;
  /** Canonical route (locale segment stripped), e.g. `/about`. */
  route: string;
  /** Locales that serve this route. */
  presentLocales: string[];
  /** Locales that are missing a translation for this route. */
  missingLocales: string[];
}

/** A reciprocity / hreflang finding, carrying a stable fingerprint. */
export type ReportReciprocityIssue = ReciprocityIssue & {
  /** Stable fingerprint of this finding (see `./fingerprint.ts`). */
  id: string;
};

/** A crawled page that returned a non-2xx status (errored / unreachable). */
export interface UnreachablePage {
  /** Stable fingerprint of this finding (see `./fingerprint.ts`). */
  id: string;
  url: string;
  /** HTTP status (`0` = network error). */
  status: number;
}

/**
 * One cross-page finding — a policy that needed the whole site to evaluate
 * (hreflang coverage, `<head>` vs sitemap agreement). Same shape as `SeoIssue`
 * so consumers render them identically; `ruleId` says which registry it came
 * from.
 */
export interface SiteIssue {
  /** Stable fingerprint of this finding (see `./fingerprint.ts`). */
  id: string;
  /** Page the finding is attributed to. */
  pageUrl: string;
  ruleId: string;
  severity: Severity;
  message: string;
  /** Why this rule exists (the rule's one-line summary). */
  why?: string;
  /** A copy-pasteable fix snippet, when the rule offers one. */
  fix?: string;
}

/** How the audit established which locales the site serves. */
export interface LocaleAxisReport {
  locales: string[];
  source: "explicit" | "sitemap" | "crawl";
  multilingual: boolean;
}

/** One SEO metadata finding on a specific page. */
export interface SeoIssue {
  /** Stable fingerprint of this finding (see `./fingerprint.ts`). */
  id: string;
  pageUrl: string;
  ruleId: string;
  severity: Severity;
  message: string;
  /** Why this rule exists (the rule's one-line summary). */
  why?: string;
  /** A copy-pasteable fix snippet, when the rule offers one. */
  fix?: string;
}

export interface GoflagReport {
  /** The base URL the audit started from (normalized). */
  url: string;
  /** ISO timestamp when the audit finished. */
  finishedAt: string;
  summary: {
    brokenLinks: number;
    missingTranslations: number;
    seoIssues: number;
    /** Cross-page findings (hreflang coverage, head↔sitemap agreement). */
    siteIssues: number;
    unreachablePages: number;
    verdict: Verdict;
  };
  /** Which locales the site serves, and how the audit found out. */
  localeAxis: LocaleAxisReport;
  pages: ReportPage[];
  /** Crawled pages that returned a non-2xx status. */
  unreachablePages: UnreachablePage[];
  brokenLinks: BrokenLink[];
  missingTranslations: {
    /** Routes present in one locale but absent in another. */
    holes: TranslationHole[];
    /** hreflang reciprocity / x-default / invalid-locale findings. */
    reciprocity: ReportReciprocityIssue[];
  };
  seoIssues: SeoIssue[];
  /** Findings from the cross-page rule registry (`SITE_RULES`). */
  siteIssues: SiteIssue[];
  diagnostics: {
    pagesCrawled: number;
    pagesScanned: number;
    pagesFailed: number;
    truncated: boolean;
    warnings: string[];
    /** Sitemap discovery outcome, when discovery ran. */
    sitemap?: {
      found: boolean;
      sitemapUrl?: string;
      urlCount: number;
      /** URLs the sitemap declared that the crawl never reached. */
      uncrawled: number;
    };
  };
}
