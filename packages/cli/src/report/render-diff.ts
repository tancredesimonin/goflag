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
  /** Injected clock, so the rendered age is testable. */
  now?: number;
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

/** Whole days between the baseline timestamp and now, or null if unparseable. */
function baselineAgeDays(finishedAt: string, now: number): number | null {
  const taken = Date.parse(finishedAt);
  if (Number.isNaN(taken)) return null;
  return Math.max(0, Math.floor((now - taken) / 86_400_000));
}

export function renderDiffTerminal(diff: ReportDiff, options: RenderOptions = {}): string {
  const c = paint(options.color ?? false);
  const lines: string[] = [];
  const debt = diff.unchanged;

  // Never green, and never the word "clean". This mode passes builds on sites
  // with known defects; a green flag would say the opposite of what happened,
  // and a reader who learns to see green here stops reading the number beside
  // it. The debt is the headline, not a footnote.
  const verdict =
    diff.added.length > 0
      ? c(ANSI.red, "REGRESSION")
      : debt > 0
        ? c(ANSI.yellow, "REGRESSION GATE")
        : c(ANSI.green, "CLEAN");

  const age = baselineAgeDays(diff.baseline.finishedAt, options.now ?? Date.now());

  lines.push("");
  lines.push(`${c(ANSI.bold, "goflag")} ${c(ANSI.dim, "--regressions-only")}`);
  lines.push(
    `${verdict}  ${diff.added.length} new · ` +
      (debt > 0
        ? c(ANSI.bold, `${debt} known findings NOT gating this build`)
        : c(ANSI.dim, "no known findings")) +
      (diff.resolved.length > 0 ? c(ANSI.dim, ` · ${diff.resolved.length} resolved`) : ""),
  );
  lines.push(
    c(
      ANSI.dim,
      `baseline ${diff.baseline.url} — taken ${diff.baseline.finishedAt}` +
        (age === null ? "" : age === 0 ? " (today)" : ` (${age} day${age === 1 ? "" : "s"} ago)`),
    ),
  );
  // Loud, not dim: a cross-profile diff still prints "0 new", and that number
  // means something different from what the reader assumes.
  if (diff.profileMismatch) {
    lines.push(
      c(
        ANSI.yellow,
        `note: baseline was captured under profile \`${diff.profileMismatch.baseline}\`, ` +
          `this run used \`${diff.profileMismatch.current}\` — the two are not like-for-like.`,
      ),
    );
  }
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
    lines.push(
      c(
        ANSI.dim,
        debt > 0
          ? `Nothing moved since the baseline — ${debt} findings still open. Run without --regressions-only to see them.`
          : "Nothing moved since the baseline.",
      ),
    );
    lines.push("");
  }

  return lines.join("\n");
}
