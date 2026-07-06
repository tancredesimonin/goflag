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
  /** Canonical route (locale segment stripped), e.g. `/about`. */
  route: string;
  /** Locales that serve this route. */
  presentLocales: string[];
  /** Locales that are missing a translation for this route. */
  missingLocales: string[];
}

/** One SEO metadata finding on a specific page. */
export interface SeoIssue {
  pageUrl: string;
  ruleId: string;
  severity: Severity;
  message: string;
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
    verdict: Verdict;
  };
  pages: ReportPage[];
  brokenLinks: BrokenLink[];
  missingTranslations: {
    /** Routes present in one locale but absent in another. */
    holes: TranslationHole[];
    /** hreflang reciprocity / x-default / invalid-locale findings. */
    reciprocity: ReciprocityIssue[];
  };
  seoIssues: SeoIssue[];
  diagnostics: {
    pagesCrawled: number;
    pagesScanned: number;
    pagesFailed: number;
    truncated: boolean;
    warnings: string[];
  };
}
