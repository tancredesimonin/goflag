/**
 * Baseline comparison.
 *
 * Every finding already carries a `fingerprint` id derived from the *identity*
 * of the problem rather than its transient details, and page URLs are
 * normalised to origin-independent routes — so the same defect fingerprints
 * identically on localhost, staging and production. That machinery was built
 * for exactly this and had no consumer.
 *
 * What it changes is what the tool *is*. Without a baseline the CI gate is
 * binary: any finding fails, which is unusable on a site that is not clean
 * yet, so teams either never turn it on or learn to ignore it. With one, the
 * gate becomes "no *new* findings" — a promise a real codebase can keep while
 * the backlog is worked down.
 *
 * Pure function of two reports. No I/O; the CLI reads the baseline file.
 */

import type { Severity } from "../lib/core/types";
import type { GoflagReport } from "./types";

/** Which part of the report a finding came from. */
export type FindingKind =
  "brokenLink" | "unreachablePage" | "translationHole" | "reciprocity" | "seo" | "site";

/** One finding, flattened out of its report section for comparison. */
export interface DiffEntry {
  id: string;
  kind: FindingKind;
  /**
   * Severity used for the exit-code decision. Rule findings carry their own;
   * the rest are mapped to match the verdict logic in `build.ts` — a broken
   * link or an unreachable page is an error, a translation gap is a warning.
   */
  severity: Severity;
  /** One-line description, for the rendered diff. */
  summary: string;
  /** Page the finding sits on, when it has one. */
  pageUrl?: string;
}

export interface ReportDiff {
  /** Where and when the baseline was taken, echoed for the report header. */
  baseline: { url: string; finishedAt: string };
  /** Findings present now and absent from the baseline — what should fail CI. */
  added: DiffEntry[];
  /** Findings in the baseline that are gone. Worth showing: progress is data too. */
  resolved: DiffEntry[];
  /** Findings present in both. */
  unchanged: number;
}

/** Flatten every finding collection into one comparable list. */
export function collectFindings(report: GoflagReport): DiffEntry[] {
  const out: DiffEntry[] = [];

  for (const link of report.brokenLinks) {
    out.push({
      id: link.id,
      kind: "brokenLink",
      severity: "error",
      summary: `${link.verdict} link → ${link.href}`,
      pageUrl: link.pageUrl,
    });
  }

  for (const page of report.unreachablePages) {
    out.push({
      id: page.id,
      kind: "unreachablePage",
      severity: "error",
      summary: `${page.status || "network error"} on ${page.url}`,
      pageUrl: page.url,
    });
  }

  for (const hole of report.missingTranslations.holes) {
    out.push({
      id: hole.id,
      kind: "translationHole",
      severity: "warning",
      summary: `${hole.route} missing ${hole.missingLocales.join(", ")}`,
    });
  }

  for (const issue of report.missingTranslations.reciprocity) {
    out.push({
      id: issue.id,
      kind: "reciprocity",
      severity: "warning",
      summary: `${issue.code} on ${issue.url}`,
      pageUrl: issue.url,
    });
  }

  for (const issue of report.seoIssues) {
    out.push({
      id: issue.id,
      kind: "seo",
      severity: issue.severity,
      summary: `${issue.ruleId} on ${issue.pageUrl}`,
      pageUrl: issue.pageUrl,
    });
  }

  for (const issue of report.siteIssues) {
    out.push({
      id: issue.id,
      kind: "site",
      severity: issue.severity,
      summary: `${issue.ruleId} on ${issue.pageUrl}`,
      pageUrl: issue.pageUrl,
    });
  }

  return out;
}

/** Deterministic ordering so a rendered diff is stable and reviewable. */
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function sortEntries(entries: DiffEntry[]): DiffEntry[] {
  return [...entries].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.kind.localeCompare(b.kind) ||
      a.summary.localeCompare(b.summary),
  );
}

/** Total findings the site currently carries, new and known alike. */
export function totalFindings(report: GoflagReport): number {
  return collectFindings(report).length;
}

/** Compare a fresh report against a stored baseline. */
export function diffReports(baseline: GoflagReport, current: GoflagReport): ReportDiff {
  const before = new Map(collectFindings(baseline).map((e) => [e.id, e]));
  const now = new Map(collectFindings(current).map((e) => [e.id, e]));

  const added: DiffEntry[] = [];
  let unchanged = 0;
  for (const [id, entry] of now) {
    if (before.has(id)) unchanged += 1;
    else added.push(entry);
  }

  const resolved: DiffEntry[] = [];
  for (const [id, entry] of before) {
    if (!now.has(id)) resolved.push(entry);
  }

  return {
    baseline: { url: baseline.url, finishedAt: baseline.finishedAt },
    added: sortEntries(added),
    resolved: sortEntries(resolved),
    unchanged,
  };
}

/**
 * Exit code under `--regressions-only`: fail on findings that are *new* at or
 * above the threshold, or on a debt budget being exceeded.
 *
 * Deliberately blind to the overall verdict, unlike `exitCode`. A site with a
 * hundred known problems and no new ones passes — that is what the mode is
 * for, and why it has to be asked for by name.
 *
 * `maxDebt` is the counterweight. Gating on regressions alone lets a backlog
 * sit untouched forever behind a passing build; a ceiling you lower as you fix
 * is the only part of this design that makes the debt actually go down.
 */
export function diffExitCode(
  diff: ReportDiff,
  failOn: "warning" | "error" | "never",
  debt?: { total: number; max?: number },
): number {
  if (debt?.max !== undefined && debt.total > debt.max) return 1;
  if (failOn === "never") return 0;
  const threshold = failOn === "error" ? 0 : 1;
  const blocking = diff.added.filter((e) => SEVERITY_RANK[e.severity] <= threshold);
  return blocking.length > 0 ? 1 : 0;
}
