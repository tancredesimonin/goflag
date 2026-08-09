/**
 * Render a `GoflagReport` as a human-readable terminal report.
 *
 * Pure function of the report — no I/O. Colour is disabled automatically
 * when stdout is not a TTY or `NO_COLOR` is set.
 */

import type { Severity } from "../lib/core/types";
import { DEFAULT_PROFILE } from "../lib/rules/profiles";
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
        `${report.diagnostics.pagesCrawled} pages crawled, ${report.diagnostics.pagesScanned} scanned` +
          // Named only when it is not the default. A run under `spec-only`
          // that prints "0 SEO issues" without saying so reads as a clean
          // site rather than a narrowed one.
          (report.profile === DEFAULT_PROFILE ? "" : `, profile ${report.profile}`),
      ),
  );
  // --- Coverage ----------------------------------------------------------
  //
  // Printed whenever the run sampled, and only then. A sampled audit that says
  // nothing is a partial audit wearing the face of a complete one: the summary
  // below counts findings on 760 pages of 4451 and reads exactly like a
  // summary of the whole site.
  const coverage = report.diagnostics.coverage;
  if (coverage?.families?.length && coverage.considered && coverage.selected) {
    const biggest = coverage.families[0]!;

    // Counted from what the run actually crawled, not from what it selected.
    // `--max-pages` can still cut the selection short, and a line that reported
    // the intent would be the exact untruth it exists to prevent.
    const audited = report.diagnostics.pagesCrawled;
    const capped = audited < coverage.selected ? `, capped by --max-pages` : "";

    lines.push(
      c(
        ANSI.dim,
        `COVERAGE  ${audited} of ${coverage.considered} pages audited${capped} · ` +
          `${coverage.families.length} families sampled, largest ` +
          `${biggest.sampled}/${biggest.size} ${biggest.pattern}`,
      ),
    );
    lines.push(
      c(
        ANSI.dim,
        `          Template rules are conclusive. Copy rules — title.length, ` +
          `description.length — are sampled.`,
      ),
    );
  }

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

  // --- Conformance -------------------------------------------------------
  // Opt-in, and rendered as per-rule totals rather than the full matrix: a
  // 200-row grid is unreadable in a terminal, and the column that actually
  // answers "where do we stand" is the tally. The matrix itself is in --json.
  if (report.conformance) {
    lines.push(c(ANSI.bold, "Conformance"));
    const judged = report.conformance.pages.length;
    lines.push(c(ANSI.dim, `  ${judged} page${judged === 1 ? "" : "s"} judged × every rule`));
    for (const rule of report.conformance.rules) {
      const { pass, fail, warn, na, crashed } = rule.totals;
      const tally = [
        fail > 0 ? c(ANSI.red, `${fail} fail`) : null,
        warn > 0 ? c(ANSI.yellow, `${warn} warn`) : null,
        pass > 0 ? c(ANSI.green, `${pass} pass`) : null,
        na > 0 ? c(ANSI.dim, `${na} n/a`) : null,
        crashed > 0 ? c(ANSI.red, `${crashed} crashed`) : null,
      ].filter(Boolean);
      lines.push(
        `  ${c(ANSI.cyan, rule.ruleId.padEnd(24))} ${tally.join(c(ANSI.dim, " · "))}` +
          c(ANSI.dim, `  [${rule.rigor}]`),
      );
    }
    lines.push("");
  }

  // --- Advisories --------------------------------------------------------
  // Questions, not findings: listed once per rule with the pages they apply
  // to, and never counted in the summary line above. The evidence bundle an
  // agent needs is in --json; printing it here would bury the findings that
  // a human can actually act on.
  if (report.advisories && report.advisories.length > 0) {
    lines.push(c(ANSI.bold, "Needs judgment"));
    lines.push(c(ANSI.dim, "  goflag states these; it will not guess the answer."));
    for (const [ruleId, group] of groupBy([...report.advisories], (a) => a.ruleId)) {
      lines.push(
        `  ${c(ANSI.cyan, ruleId)} ${c(ANSI.dim, `(${group.length} page${group.length === 1 ? "" : "s"})`)}`,
      );
      lines.push(`    ${group[0]!.prose}`);
    }
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
