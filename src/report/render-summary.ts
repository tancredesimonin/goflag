/**
 * Render a `GoflagSummary` as a compact, deduplicated terminal report.
 *
 * Where `renderTerminal` lists every finding grouped by page, this lists each
 * distinct problem once with a count and a small sample of affected pages —
 * the view you want for a large crawl or a quick "is it green?" check. Pure
 * function of the summary; no I/O.
 */

import type { GoflagSummary } from "./summarize";
import type { Verdict } from "./types";

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
  green: "GREEN FLAG",
  yellow: "YELLOW FLAG",
  red: "RED FLAG",
};

function verdictColor(verdict: Verdict): string {
  return verdict === "green" ? ANSI.green : verdict === "yellow" ? ANSI.yellow : ANSI.red;
}

export function renderSummaryTerminal(summary: GoflagSummary, options: RenderOptions = {}): string {
  const c = paint(options.color ?? false);
  const lines: string[] = [];

  lines.push("");
  lines.push(`${c(ANSI.bold, "goflag")} ${c(ANSI.dim, summary.url)} ${c(ANSI.dim, "(summary)")}`);
  lines.push(
    `${c(verdictColor(summary.verdict), VERDICT_FLAG[summary.verdict])}  ` +
      c(
        ANSI.dim,
        `${summary.totals.pagesCrawled} pages crawled, ${summary.totals.pagesScanned} scanned`,
      ),
  );
  lines.push("");
  lines.push(
    [
      metric(c, summary.totals.brokenLinks, "broken link"),
      metric(c, summary.totals.missingTranslations, "missing translation"),
      metric(c, summary.totals.seoIssues, "SEO issue"),
    ].join("   "),
  );
  lines.push("");

  // --- Broken links (one row per target) --------------------------------
  if (summary.brokenLinks.length > 0) {
    lines.push(c(ANSI.bold, "Broken links"));
    for (const link of summary.brokenLinks) {
      const tag =
        link.verdict === "broken"
          ? c(ANSI.red, `[${link.status || link.reason || "broken"}]`)
          : c(ANSI.yellow, `[${link.verdict}${link.reason ? ` ${link.reason}` : ""}]`);
      lines.push(`  ${tag} ${link.href} ${c(ANSI.dim, `×${link.count}`)}`);
      lines.push(`    ${c(ANSI.dim, `on ${samplePages(link.pages, link.morePages)}`)}`);
    }
    lines.push("");
  }

  // --- Missing translations ---------------------------------------------
  const { holes, reciprocity } = summary.translations;
  if (holes.length > 0 || reciprocity.length > 0) {
    lines.push(c(ANSI.bold, "Missing translations"));
    for (const hole of holes) {
      lines.push(
        `  ${c(ANSI.cyan, hole.route)} — missing ${c(ANSI.yellow, hole.missingLocales.join(", "))}` +
          c(ANSI.dim, ` (have ${hole.presentLocales.join(", ")})`),
      );
    }
    for (const issue of reciprocity) {
      lines.push(`  ${c(ANSI.yellow, issue.code)} ${c(ANSI.dim, `×${issue.count}`)}`);
      lines.push(`    ${stripBackticks(issue.sample)}`);
      lines.push(`    ${c(ANSI.dim, `on ${samplePages(issue.pages, issue.morePages)}`)}`);
    }
    lines.push("");
  }

  // --- SEO issues (one row per rule, with why/fix) ----------------------
  if (summary.seoIssues.length > 0) {
    lines.push(c(ANSI.bold, "SEO issues"));
    for (const issue of summary.seoIssues) {
      const sev =
        issue.severity === "error"
          ? c(ANSI.red, "error")
          : issue.severity === "warning"
            ? c(ANSI.yellow, "warn ")
            : c(ANSI.dim, "info ");
      lines.push(`  ${sev} ${c(ANSI.cyan, issue.ruleId)} ${c(ANSI.dim, `×${issue.count}`)}`);
      if (issue.why) lines.push(`    ${c(ANSI.dim, stripBackticks(issue.why))}`);
      if (issue.fix) lines.push(`    ${c(ANSI.dim, "fix:")} ${issue.fix}`);
      lines.push(`    ${c(ANSI.dim, `on ${samplePages(issue.pages, issue.morePages)}`)}`);
    }
    lines.push("");
  }

  if (summary.verdict === "green") {
    lines.push(c(ANSI.green, "No problems found."));
    lines.push("");
  }

  for (const warning of summary.warnings) {
    lines.push(c(ANSI.dim, `note: ${warning}`));
  }
  if (summary.truncated) {
    lines.push(c(ANSI.dim, "note: results truncated by a page/link cap."));
  }

  return lines.join("\n");
}

function metric(c: (code: string, t: string) => string, n: number, noun: string): string {
  const label = `${n} ${noun}${n === 1 ? "" : "s"}`;
  return n > 0 ? c(ANSI.bold, c(ANSI.yellow, label)) : c(ANSI.dim, label);
}

function samplePages(pages: string[], more: number): string {
  const shown = pages.join(", ");
  return more > 0 ? `${shown} (+${more} more)` : shown;
}

function stripBackticks(s: string): string {
  return s.replace(/`/g, "");
}
