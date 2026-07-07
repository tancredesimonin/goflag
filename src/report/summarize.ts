/**
 * Roll a full `GoflagReport` up into a compact `GoflagSummary`.
 *
 * The full report lists every finding on every page — great for a baseline
 * file or a diff, but noisy for a human skim and expensive for an LLM agent
 * to read. The summary deduplicates:
 *
 *   - broken links by target (one entry per broken URL, with the pages that
 *     link to it),
 *   - SEO issues by rule (one entry per rule, carrying its `why`/`fix` once,
 *     with a sample of affected pages),
 *   - reciprocity findings by code.
 *
 * It is a pure function of the report — `goflag <url> --summary` and
 * `--summary --json` both derive their output from this, so the rollup logic
 * lives in exactly one place.
 */

import type { ReciprocityCode } from "../lib/core/i18n";
import type { LinkVerdict } from "../lib/core/links/types";
import type { Severity } from "../lib/core/types";
import type { GoflagReport, TranslationHole, UnreachablePage, Verdict } from "./types";

/** How many example pages/URLs a rolled-up entry keeps before it says "+N more". */
export const SAMPLE_LIMIT = 5;

/** One broken target, with every page that links to it collapsed together. */
export interface RollupLink {
  href: string;
  verdict: LinkVerdict;
  status: number;
  reason?: string;
  /** How many (page → link) references share this target + verdict. */
  count: number;
  /** Up to {@link SAMPLE_LIMIT} pages that reference it. */
  pages: string[];
  /** References beyond the sample. */
  morePages: number;
}

/** One SEO rule, collapsed across every page it fired on. */
export interface RollupSeo {
  ruleId: string;
  severity: Severity;
  why?: string;
  fix?: string;
  /** A representative message (from the first occurrence). */
  sample: string;
  count: number;
  pages: string[];
  morePages: number;
}

/** One reciprocity code, collapsed across every page it fired on. */
export interface RollupReciprocity {
  code: ReciprocityCode;
  count: number;
  sample: string;
  pages: string[];
  morePages: number;
}

export interface GoflagSummary {
  url: string;
  finishedAt: string;
  verdict: Verdict;
  totals: {
    brokenLinks: number;
    missingTranslations: number;
    seoIssues: number;
    unreachablePages: number;
    pagesCrawled: number;
    pagesScanned: number;
    pagesFailed: number;
  };
  unreachablePages: UnreachablePage[];
  brokenLinks: RollupLink[];
  translations: {
    holes: TranslationHole[];
    reciprocity: RollupReciprocity[];
  };
  seoIssues: RollupSeo[];
  truncated: boolean;
  warnings: string[];
}

export function summarize(report: GoflagReport): GoflagSummary {
  return {
    url: report.url,
    finishedAt: report.finishedAt,
    verdict: report.summary.verdict,
    totals: {
      brokenLinks: report.summary.brokenLinks,
      missingTranslations: report.summary.missingTranslations,
      seoIssues: report.summary.seoIssues,
      unreachablePages: report.summary.unreachablePages,
      pagesCrawled: report.diagnostics.pagesCrawled,
      pagesScanned: report.diagnostics.pagesScanned,
      pagesFailed: report.diagnostics.pagesFailed,
    },
    unreachablePages: report.unreachablePages,
    brokenLinks: rollupLinks(report),
    translations: {
      holes: report.missingTranslations.holes,
      reciprocity: rollupReciprocity(report),
    },
    seoIssues: rollupSeo(report),
    truncated: report.diagnostics.truncated,
    warnings: report.diagnostics.warnings,
  };
}

function rollupLinks(report: GoflagReport): RollupLink[] {
  const groups = new Map<string, RollupLink>();
  for (const link of report.brokenLinks) {
    const key = `${link.href}\u0000${link.verdict}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.pages.length < SAMPLE_LIMIT) existing.pages.push(link.pageUrl);
      else existing.morePages += 1;
    } else {
      groups.set(key, {
        href: link.href,
        verdict: link.verdict,
        status: link.status,
        reason: link.reason,
        count: 1,
        pages: [link.pageUrl],
        morePages: 0,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.href.localeCompare(b.href));
}

function rollupSeo(report: GoflagReport): RollupSeo[] {
  const groups = new Map<string, RollupSeo>();
  for (const issue of report.seoIssues) {
    const existing = groups.get(issue.ruleId);
    if (existing) {
      existing.count += 1;
      if (existing.pages.length < SAMPLE_LIMIT) existing.pages.push(issue.pageUrl);
      else existing.morePages += 1;
    } else {
      groups.set(issue.ruleId, {
        ruleId: issue.ruleId,
        severity: issue.severity,
        why: issue.why,
        fix: issue.fix,
        sample: issue.message,
        count: 1,
        pages: [issue.pageUrl],
        morePages: 0,
      });
    }
  }
  const sevRank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return [...groups.values()].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || a.ruleId.localeCompare(b.ruleId),
  );
}

function rollupReciprocity(report: GoflagReport): RollupReciprocity[] {
  const groups = new Map<ReciprocityCode, RollupReciprocity>();
  for (const issue of report.missingTranslations.reciprocity) {
    const existing = groups.get(issue.code);
    if (existing) {
      existing.count += 1;
      if (existing.pages.length < SAMPLE_LIMIT) existing.pages.push(issue.url);
      else existing.morePages += 1;
    } else {
      groups.set(issue.code, {
        code: issue.code,
        count: 1,
        sample: issue.message,
        pages: [issue.url],
        morePages: 0,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}
