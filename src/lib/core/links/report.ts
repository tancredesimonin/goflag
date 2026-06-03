/**
 * Report-shaping helpers for the link checker.
 *
 * Pure, JSON-serializable transforms over a `LinkAuditReport` that the UI
 * (and any future report renderer) consumes. Kept in the engine so the
 * join logic is testable independently of React.
 */

import type { LinkAuditReport, LinkCheck, LinkKind, LinkSource, LinkVerdict } from "./types";

/** One row of the broken-links table: a checked URL plus where it appears. */
export interface LinkRow {
  check: LinkCheck;
  kind: LinkKind;
  host: string;
  sources: Array<{ pageUrl: string; anchorText?: string; source: LinkSource; rel: string[] }>;
}

/** Sort order: worst verdicts first so the table leads with what matters. */
const VERDICT_RANK: Record<LinkVerdict, number> = {
  broken: 0,
  blocked: 1,
  warning: 2,
  redirect: 3,
  ok: 4,
  skipped: 5,
};

/**
 * Join every check back to the pages (and anchors) that reference it,
 * producing the rows the link table renders. Sorted worst-first, then by
 * how many pages reference the link (more references = more impactful).
 */
export function buildLinkRows(report: LinkAuditReport): LinkRow[] {
  const sourcesByUrl = new Map<string, LinkRow["sources"]>();
  const kindByUrl = new Map<string, LinkKind>();
  for (const occ of report.occurrences) {
    const url = occ.ref.url;
    if (!report.checks[url]) continue;
    kindByUrl.set(url, occ.ref.kind);
    let list = sourcesByUrl.get(url);
    if (!list) {
      list = [];
      sourcesByUrl.set(url, list);
    }
    if (!list.some((s) => s.pageUrl === occ.pageUrl)) {
      list.push({
        pageUrl: occ.pageUrl,
        anchorText: occ.ref.anchorText,
        source: occ.ref.source,
        rel: occ.ref.rel,
      });
    }
  }

  const rows: LinkRow[] = Object.values(report.checks).map((check) => ({
    check,
    kind: kindByUrl.get(check.url) ?? "external",
    host: hostOf(check.url),
    sources: sourcesByUrl.get(check.url) ?? [],
  }));

  rows.sort((a, b) => {
    const rank = VERDICT_RANK[a.check.verdict] - VERDICT_RANK[b.check.verdict];
    if (rank !== 0) return rank;
    const refs = b.sources.length - a.sources.length;
    if (refs !== 0) return refs;
    return a.check.url.localeCompare(b.check.url);
  });

  return rows;
}

/** Distinct hosts present across the report's checks, sorted. */
export function listHosts(report: LinkAuditReport): string[] {
  const hosts = new Set<string>();
  for (const check of Object.values(report.checks)) hosts.add(hostOf(check.url));
  return Array.from(hosts).sort();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
