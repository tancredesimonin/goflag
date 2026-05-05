/**
 * Human-readable rendering for `headlint snapshot`.
 *
 * Same wire-format philosophy as `render-issues.ts`: ASCII-only, grep-
 * friendly, fixed-width prefixes per class so a `grep '^  ! '` finds
 * regressions directly. No ANSI escapes for the same reasons documented
 * over there (CI log compatibility).
 */

import type { SnapshotDiff, SnapshotDiffEntry } from "@/lib/snapshots/diff";

const PREFIX = {
  regression: "  ! ",
  addition: "  + ",
  "content-drift": "  ~ ",
} as const;

const KIND_LABEL = {
  tag: "tag",
  "jsonld-type": "json-ld type",
  "jsonld-field": "json-ld field",
  "rule-outcome": "rule",
} as const;

export function renderSnapshotDiff(diff: SnapshotDiff, opts: { written?: string } = {}): string {
  const lines: string[] = [];
  lines.push("Headlint snapshot");
  lines.push(`  route: ${diff.route}`);
  if (opts.written) {
    lines.push(`  wrote: ${opts.written}`);
    return `${lines.join("\n")}\n`;
  }
  if (diff.identical) {
    lines.push("  no changes since the committed snapshot.");
    return `${lines.join("\n")}\n`;
  }
  const buckets = bucket(diff.entries);
  lines.push(
    `  ${buckets.regression.length} regression(s), ${buckets.addition.length} addition(s), ${buckets["content-drift"].length} content drift`,
  );
  lines.push("");
  for (const klass of ["regression", "addition", "content-drift"] as const) {
    const entries = buckets[klass];
    if (entries.length === 0) continue;
    lines.push(`  ${labelFor(klass)} (${entries.length})`);
    for (const entry of entries) {
      lines.push(`${PREFIX[klass]}${KIND_LABEL[entry.kind]}: ${entry.key}${valueSuffix(entry)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function bucket(
  entries: SnapshotDiffEntry[],
): Record<SnapshotDiffEntry["class"], SnapshotDiffEntry[]> {
  const out: Record<SnapshotDiffEntry["class"], SnapshotDiffEntry[]> = {
    regression: [],
    addition: [],
    "content-drift": [],
  };
  for (const e of entries) out[e.class].push(e);
  return out;
}

function labelFor(klass: SnapshotDiffEntry["class"]): string {
  if (klass === "regression") return "Regressions";
  if (klass === "addition") return "Additions";
  return "Content drift";
}

function valueSuffix(entry: SnapshotDiffEntry): string {
  if (entry.before === undefined && entry.after === undefined) return "";
  if (entry.before !== undefined && entry.after !== undefined) {
    return `  (${truncate(entry.before)} → ${truncate(entry.after)})`;
  }
  if (entry.after !== undefined) return `  (+${truncate(entry.after)})`;
  return `  (-${truncate(entry.before ?? "")})`;
}

function truncate(s: string, max = 60): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
