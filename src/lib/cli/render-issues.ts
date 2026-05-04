import type { Issue, Severity } from "../core/types";
import { summariseIssues } from "../core/lint";

/**
 * Render a list of `Issue`s as a compact, ASCII-only report suitable
 * for `headlint lint` (without `--json`). The output is intentionally
 * grep-friendly: every issue starts with a fixed-width severity tag
 * (`[error]`, `[warn ]`, `[info ]`) so consumers can pipe through
 * `grep '\\[error\\]'` to find blockers.
 *
 * No colour codes today — that's deferred until we know how heavily
 * users will pipe Headlint output through CI logs and PR-bot summaries
 * where ANSI escapes either get stripped (good) or rendered as gibberish
 * (bad). When colour ships it'll be opt-out via `--no-color` and gated
 * on `process.stdout.isTTY`.
 */

const SEVERITY_TAG: Record<Severity, string> = {
  error: "[error]",
  warning: "[warn ]",
  info: "[info ]",
};

export function renderIssuesReport(issues: Issue[]): string {
  if (issues.length === 0) {
    return "Headlint lint\n  No issues. Page is clean.\n";
  }

  const counts = summariseIssues(issues);
  const lines: string[] = [];
  lines.push("Headlint lint");
  lines.push(
    `  ${issues.length} issue(s) — ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info`,
  );
  lines.push("");
  for (const issue of issues) {
    lines.push(`  ${SEVERITY_TAG[issue.severity]} ${issue.ruleId}`);
    for (const line of wrap(issue.message, 76, "          ")) {
      lines.push(line);
    }
    if (issue.fix?.snippet) {
      lines.push(`          fix: ${issue.fix.title}`);
      for (const line of issue.fix.snippet.split("\n")) {
        lines.push(`            > ${line}`);
      }
    }
    if (issue.docs) {
      lines.push(`          docs: ${issue.docs}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Wrap a long string at `width` characters using the given continuation prefix. */
function wrap(text: string, width: number, prefix: string): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = prefix;
  for (const word of words) {
    if (line.length + word.length + 1 > prefix.length + width && line.length > prefix.length) {
      out.push(line);
      line = prefix;
    }
    line = line.length === prefix.length ? `${prefix}${word}` : `${line} ${word}`;
  }
  if (line.length > prefix.length) out.push(line);
  return out;
}
