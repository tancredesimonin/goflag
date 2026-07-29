/**
 * Render a `ReportDiff` for a terminal.
 *
 * Deliberately leads with what is new, because that is what fails the build
 * and what the reader has to act on. Resolved findings come second and are
 * kept — a run that only ever shows problems gives no signal that the backlog
 * is moving, which is how a gate stops being read.
 *
 * Pure function of the diff; no I/O.
 */

import type { Severity } from "../lib/core/types";
import type { DiffEntry, ReportDiff } from "./diff";

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

function severityTag(c: (code: string, t: string) => string, severity: Severity): string {
  if (severity === "error") return c(ANSI.red, "error");
  if (severity === "warning") return c(ANSI.yellow, "warn ");
  return c(ANSI.dim, "info ");
}

/** How many entries to list before collapsing into a "+N more" line. */
const LIST_LIMIT = 20;

function listEntries(
  entries: DiffEntry[],
  marker: string,
  markerColor: string,
  c: (code: string, t: string) => string,
): string[] {
  const lines: string[] = [];
  for (const entry of entries.slice(0, LIST_LIMIT)) {
    // A broken link's identity is (page, target): the same dead URL referenced
    // from four pages is four findings, and without the page they render as
    // four identical lines that look like a rendering bug.
    const where =
      entry.pageUrl && !entry.summary.includes(entry.pageUrl)
        ? c(ANSI.dim, `  on ${entry.pageUrl}`)
        : "";
    lines.push(
      `  ${c(markerColor, marker)} ${severityTag(c, entry.severity)} ${c(ANSI.dim, entry.kind)}  ${entry.summary}${where}`,
    );
  }
  if (entries.length > LIST_LIMIT) {
    lines.push(`  ${c(ANSI.dim, `… +${entries.length - LIST_LIMIT} more`)}`);
  }
  return lines;
}

export function renderDiffTerminal(diff: ReportDiff, options: RenderOptions = {}): string {
  const c = paint(options.color ?? false);
  const lines: string[] = [];

  const headline =
    diff.added.length > 0
      ? c(ANSI.red, `${diff.added.length} new`)
      : c(ANSI.green, "no new findings");

  lines.push("");
  lines.push(
    `${c(ANSI.bold, "goflag diff")} ${c(ANSI.dim, `vs baseline ${diff.baseline.url} (${diff.baseline.finishedAt})`)}`,
  );
  lines.push(
    `${headline}   ` + c(ANSI.dim, `${diff.resolved.length} resolved, ${diff.unchanged} unchanged`),
  );
  lines.push("");

  if (diff.added.length > 0) {
    lines.push(c(ANSI.bold, "New findings"));
    lines.push(...listEntries(diff.added, "+", ANSI.red, c));
    lines.push("");
  }

  if (diff.resolved.length > 0) {
    lines.push(c(ANSI.bold, "Resolved"));
    lines.push(...listEntries(diff.resolved, "-", ANSI.green, c));
    lines.push("");
  }

  if (diff.added.length === 0 && diff.resolved.length === 0) {
    lines.push(c(ANSI.dim, "Nothing moved since the baseline."));
    lines.push("");
  }

  return lines.join("\n");
}
