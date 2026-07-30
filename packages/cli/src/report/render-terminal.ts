/**
 * Render a `GoflagReport` as a human-readable terminal report.
 *
 * Pure function of the report — no I/O. Colour is disabled automatically
 * when stdout is not a TTY or `NO_COLOR` is set.
 */

import type { Severity } from "../lib/core/types";
import type { GoflagReport, Verdict } from "./types";

interface RenderOptions {
  color?: boolean;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function paint(enabled: boolean) {
  return (code: string, text: string) => (enabled ? `${code}${text}${ANSI.reset}` : text);
}

const VERDICT_FLAG: Record<Verdict, string> = {
  green: "green flag",
  yellow: "yellow flag",
  red: "red flag",
};

function verdictColor(verdict: Verdict): string {
  return verdict === "green" ? ANSI.green : verdict === "yellow" ? ANSI.yellow : ANSI.red;
}

export function renderTerminal(report: GoflagReport, options: RenderOptions = {}): string {
  const color = options.color ?? false;
  const c = paint(color);
  const lines: string[] = [];

  lines.push("");
  lines.push(`${c(ANSI.bold, "goflag")} ${c(ANSI.dim, report.url)}`);
  lines.push(
    `${c(verdictColor(report.summary.verdict), VERDICT_FLAG[report.summary.verdict].toUpperCase())}  ` +
      c(
        ANSI.dim,
        `${report.diagnostics.pagesCrawled} pages crawled, ${report.diagnostics.pagesScanned} scanned`,
      ),
  );
  lines.push("");

  // --- Summary line ------------------------------------------------------
  lines.push(
    [
      count(c, report.summary.brokenLinks, "broken link", report.summary.brokenLinks > 0),
      count(
        c,
        report.summary.missingTranslations,
        "missing translation",
        report.summary.missingTranslations > 0,
      ),
      count(c, report.summary.seoIssues, "SEO issue", report.summary.seoIssues > 0),
      count(c, report.summary.siteIssues, "site issue", report.summary.siteIssues > 0),
      count(
        c,
        report.summary.unreachablePages,
        "unreachable page",
        report.summary.unreachablePages > 0,
      ),
    ].join("   "),
  );
  lines.push("");

  // --- Unreachable pages -------------------------------------------------
  if (report.unreachablePages.length > 0) {
    lines.push(c(ANSI.bold, "Unreachable pages"));
    for (const page of report.unreachablePages) {
      lines.push(`  ${c(ANSI.red, `[${page.status || "network error"}]`)} ${page.url}`);
    }
    lines.push("");
  }

  // --- Broken links ------------------------------------------------------
  if (report.brokenLinks.length > 0) {
    lines.push(c(ANSI.bold, "Broken links"));
    const byPage = groupBy(report.brokenLinks, (b) => b.pageUrl);
    for (const [pageUrl, links] of byPage) {
      lines.push(`  ${c(ANSI.cyan, pageUrl)}`);
      for (const link of links) {
        const tag =
          link.verdict === "broken"
            ? c(ANSI.red, `[${link.status || link.reason || "broken"}]`)
            : c(ANSI.yellow, `[${link.verdict}${link.reason ? ` ${link.reason}` : ""}]`);
        lines.push(`    ${tag} ${link.href}`);
      }
    }
    lines.push("");
  }

  // --- Missing translations ---------------------------------------------
  const { holes, reciprocity } = report.missingTranslations;
  if (holes.length > 0 || reciprocity.length > 0) {
    lines.push(c(ANSI.bold, "Missing translations"));
    for (const hole of holes) {
      lines.push(
        `  ${c(ANSI.cyan, hole.route)} — missing ${c(ANSI.yellow, hole.missingLocales.join(", "))}` +
          c(ANSI.dim, ` (have ${hole.presentLocales.join(", ")})`),
      );
    }
    for (const issue of reciprocity) {
      lines.push(`  ${c(ANSI.yellow, issue.code)} ${c(ANSI.dim, issue.url)}`);
      lines.push(`    ${issue.message}`);
    }
    lines.push("");
  }

  // --- SEO issues --------------------------------------------------------
  if (report.seoIssues.length > 0) {
    lines.push(c(ANSI.bold, "SEO issues"));
    lines.push(...renderIssuesByPage(report.seoIssues, c));
    lines.push("");
  }

  // --- Cross-page issues -------------------------------------------------
  // Rendered separately from `seoIssues` because the distinction is
  // actionable, not cosmetic: these findings are statements about the site as
  // a whole, so fixing one usually fixes the whole column at once.
  if (report.siteIssues.length > 0) {
    lines.push(c(ANSI.bold, "Site-wide issues"));
    lines.push(
      `  ${c(ANSI.dim, `locales: ${report.localeAxis.locales.join(", ") || "none"} (via ${report.localeAxis.source})`)}`,
    );
    lines.push(...renderIssuesByPage(report.siteIssues, c));
    lines.push("");
  }

  if (report.summary.verdict === "green") {
    lines.push(c(ANSI.green, "No problems found."));
    lines.push("");
  }

  for (const warning of report.diagnostics.warnings) {
    lines.push(c(ANSI.dim, `note: ${warning}`));
  }
  if (report.diagnostics.truncated) {
    lines.push(c(ANSI.dim, "note: results truncated by a page/link cap."));
  }

  return lines.join("\n");
}

function count(
  c: (code: string, t: string) => string,
  n: number,
  noun: string,
  bad: boolean,
): string {
  const label = `${n} ${noun}${n === 1 ? "" : "s"}`;
  return bad ? c(ANSI.bold, c(ANSI.yellow, label)) : c(ANSI.dim, label);
}

/**
 * Group findings under the page they belong to. Shared by the per-page and
 * cross-page sections: both emit the same `{ pageUrl, ruleId, severity,
 * message }` shape, and a reader scanning the terminal wants them to look
 * alike so the eye can skim one column of severities.
 */
function renderIssuesByPage(
  issues: ReadonlyArray<{
    pageUrl: string;
    ruleId: string;
    severity: Severity;
    message: string;
  }>,
  c: (code: string, t: string) => string,
): string[] {
  const lines: string[] = [];
  for (const [pageUrl, group] of groupBy([...issues], (i) => i.pageUrl)) {
    lines.push(`  ${c(ANSI.cyan, pageUrl)}`);
    for (const issue of group) {
      const sev =
        issue.severity === "error"
          ? c(ANSI.red, "error")
          : issue.severity === "warning"
            ? c(ANSI.yellow, "warn ")
            : c(ANSI.dim, "info ");
      lines.push(`    ${sev} ${c(ANSI.dim, issue.ruleId)}  ${stripBackticks(issue.message)}`);
    }
  }
  return lines;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function stripBackticks(s: string): string {
  return s.replace(/`/g, "");
}
