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
import type { Rigor, Severity } from "../lib/core/types";
import type { ConformanceRule } from "./conformance";
import type {
  GoflagReport,
  ReportAdvisory,
  SeoIssue,
  SiteIssue,
  TranslationHole,
  UnreachablePage,
  Verdict,
} from "./types";

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
  /**
   * How authoritative the rule is. Constant within a group — a rollup is one
   * rule — which is what makes the summary the right place to show it: one tag
   * per line instead of one per finding.
   */
  rigor?: Rigor;
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
  /** The rule profile the run was judged under. See `GoflagReport.profile`. */
  profile: string;
  verdict: Verdict;
  totals: {
    brokenLinks: number;
    missingTranslations: number;
    seoIssues: number;
    siteIssues: number;
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
  /** Cross-page findings, rolled up by rule exactly like `seoIssues`. */
  siteIssues: RollupSeo[];
  /**
   * Per-rule conformance totals, when `--conformance` was asked for. The
   * per-page matrix is dropped here on purpose — it is precisely the
   * page-by-page repetition summary mode exists to collapse, and the totals
   * answer the same question. Use the full report for the grid.
   */
  conformance?: { rules: ConformanceRule[] };
  /**
   * Prose rules needing judgment, when `--advisories` was asked for, carried
   * verbatim. Not rolled up: each page's evidence bundle is different, and
   * collapsing them would throw away the only thing that makes an advisory
   * answerable.
   */
  advisories?: ReportAdvisory[];
  truncated: boolean;
  warnings: string[];
}

export function summarize(report: GoflagReport): GoflagSummary {
  return {
    url: report.url,
    finishedAt: report.finishedAt,
    profile: report.profile,
    verdict: report.summary.verdict,
    totals: {
      brokenLinks: report.summary.brokenLinks,
      missingTranslations: report.summary.missingTranslations,
      seoIssues: report.summary.seoIssues,
      siteIssues: report.summary.siteIssues,
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
    seoIssues: rollupByRule(report.seoIssues),
    siteIssues: rollupByRule(report.siteIssues),
    ...(report.conformance ? { conformance: { rules: report.conformance.rules } } : {}),
    ...(report.advisories ? { advisories: report.advisories } : {}),
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

/**
 * Collapse per-page findings by rule id. Shared by `seoIssues` and
 * `siteIssues`: both registries emit the same finding shape, and a reader
 * skimming a summary cares about "which policy fired, how often" regardless
 * of which registry evaluated it.
 */
function rollupByRule(issues: ReadonlyArray<SeoIssue | SiteIssue>): RollupSeo[] {
  const groups = new Map<string, RollupSeo>();
  for (const issue of issues) {
    const existing = groups.get(issue.ruleId);
    if (existing) {
      existing.count += 1;
      if (existing.pages.length < SAMPLE_LIMIT) existing.pages.push(issue.pageUrl);
      else existing.morePages += 1;
    } else {
      groups.set(issue.ruleId, {
        ruleId: issue.ruleId,
        severity: issue.severity,
        rigor: issue.rigor,
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
