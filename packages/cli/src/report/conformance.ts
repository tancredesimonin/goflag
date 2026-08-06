/**
 * The conformance view (plan §10) — every rule's status on every page, not
 * just the violations.
 *
 * `seoIssues` answers "what is wrong here". That is the right default for a
 * human fixing a site, and the wrong shape for the question the plan calls
 * point #2: *where do we stand against the catalog?* A list of violations
 * cannot distinguish "this rule passes everywhere" from "this rule never
 * applied to a single page" — and an agent deciding what to work on needs
 * exactly that distinction.
 *
 * So this is the same evaluation, unfiltered: a rule × page matrix of
 * `pass` / `fail` / `warn` / `na`, plus per-rule totals. Opt-in, because on
 * a 200-page crawl it is the largest thing in the report and nobody reading
 * a terminal asked for it.
 *
 * Shape note: rule metadata (rigor, sources, expected) is carried once in
 * `rules`, not repeated per cell. A 200-page × 11-rule matrix with inline
 * metadata is ~2,200 copies of the same eight fields; the legend + status
 * grid says the same thing at a fraction of the size, which matters when
 * the consumer is a context window.
 */

import type { RuleFinding } from "../lib/rules";
import type { Rigor, Rule } from "../lib/rules/types";

/** A rule's verdict on one page. Mirrors `RuleFinding["status"]`. */
export type ConformanceStatus = RuleFinding["status"];

/** Per-rule legend entry and tally across every scanned page. */
export interface ConformanceRule {
  ruleId: string;
  kind: Rule["kind"];
  title: string;
  rigor: Rigor;
  sources: string[];
  /** One sentence stating what a passing page looks like. */
  expected: string;
  /**
   * How the rule landed across the run. `crashed` counts pages where the
   * evaluator threw, so the five buckets always sum to the number of pages
   * — a matrix whose arithmetic does not close is worse than no matrix.
   */
  totals: { pass: number; fail: number; warn: number; na: number; crashed: number };
}

/** One page's row of the matrix. Rules that crashed on it are absent. */
export interface ConformancePage {
  url: string;
  /** Rule id → status. Keyed, not positional, so it survives rule reordering. */
  statuses: Record<string, ConformanceStatus>;
}

export interface ConformanceView {
  /** Legend + totals, in registry order. */
  rules: ConformanceRule[];
  /**
   * One row per **linted** page, in crawl order — which is a smaller set than
   * `report.pages`: unreachable pages, non-HTML resources, and pages the site
   * itself declared duplicate via canonical never reach the rule layer. Read
   * `pages.length` for the denominator; every rule's totals sum to it.
   */
  pages: ConformancePage[];
}

/** What `runAudit` collects per page to build the view. */
export interface ConformanceRow {
  pageUrl: string;
  findings: ReadonlyArray<RuleFinding>;
}

/**
 * Fold per-page evaluations into the matrix. `rules` must be the effective
 * (profile-applied) rule set the findings came from — a rule the profile
 * switched off is absent from the view entirely rather than sitting there
 * with five zeroes, because "not run" and "never applied" are different
 * claims and only one of them is `na`.
 */
export function buildConformance(
  rules: ReadonlyArray<Rule>,
  rows: ReadonlyArray<ConformanceRow>,
): ConformanceView {
  const totals = new Map<string, ConformanceRule["totals"]>(
    rules.map((rule) => [rule.id, { pass: 0, fail: 0, warn: 0, na: 0, crashed: 0 }]),
  );

  const pages: ConformancePage[] = rows.map((row) => {
    const statuses: Record<string, ConformanceStatus> = {};
    const seen = new Set<string>();
    for (const finding of row.findings) {
      const tally = totals.get(finding.ruleId);
      if (!tally) continue; // A finding from a rule outside this set: not ours.
      statuses[finding.ruleId] = finding.status;
      tally[finding.status] += 1;
      seen.add(finding.ruleId);
    }
    // No finding for a rule on this page means its evaluator threw; the
    // crash itself is already reported as an `engine.rule-crashed` issue.
    for (const rule of rules) if (!seen.has(rule.id)) totals.get(rule.id)!.crashed += 1;
    return { url: row.pageUrl, statuses };
  });

  return {
    rules: rules.map((rule) => ({
      ruleId: rule.id,
      kind: rule.kind,
      title: rule.title,
      rigor: rule.rigor,
      sources: rule.sources,
      expected: rule.expected,
      totals: totals.get(rule.id)!,
    })),
    pages,
  };
}
