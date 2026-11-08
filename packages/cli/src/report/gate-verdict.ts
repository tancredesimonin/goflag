/**
 * What the gate decided, and why, in words — for every rendering that prints it.
 *
 * The exit code is the CLI's (`gateExitCode` in `cli.ts`): `--fail-on`,
 * `--max-debt` and the baseline all weigh in. A rendering is handed that
 * decision as a `GateDecision` and states it; it never recomputes it. The HTML
 * report and the JUnit file read the reason from here, so a page and a test
 * widget fed by the same run cannot give two different reasons for it.
 */
import type { Severity } from "../lib/core/types";
import type { FailOn } from "./build";
import { totalFindings, type DiffEntry } from "./diff";
import type { GoflagReport } from "./types";

/**
 * The gate as the CLI decided it. `capturedBaseline` is the `--update-baseline`
 * run, which accepts every finding it saw and exits 0 whatever they are.
 */
export interface GateDecision {
  exitCode: number;
  failOn: FailOn;
  maxDebt?: number;
  capturedBaseline?: boolean;
}

export interface GateVerdict {
  passed: boolean;
  headline: string;
  reason: string;
}

export const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whether a finding of this severity fails a run under `failOn`. */
export function blocksAt(severity: Severity, failOn: FailOn): boolean {
  if (failOn === "never") return false;
  return SEVERITY_RANK[severity] <= (failOn === "error" ? 0 : 1);
}

export function blockingEntries(entries: DiffEntry[], failOn: FailOn): DiffEntry[] {
  return entries.filter((entry) => blocksAt(entry.severity, failOn));
}

/**
 * The reason in words, from the same inputs the CLI weighed — in the order it
 * weighs them: the debt budget first, then the baseline, then the findings.
 */
export function gateVerdict(report: GoflagReport, gate: GateDecision | undefined): GateVerdict {
  const total = totalFindings(report);
  if (!gate) {
    const verdict = report.summary.verdict;
    return {
      passed: verdict === "green",
      headline: `${verdict} flag`,
      reason: `${plural(total, "finding")}. The gate's decision depends on --fail-on, --max-debt and the baseline, which this render was not given.`,
    };
  }

  const passed = gate.exitCode === 0;
  const headline = `${passed ? "Passed" : "Failed"} · exit code ${gate.exitCode}`;
  if (gate.capturedBaseline) {
    return {
      passed,
      headline: `Baseline captured · exit code ${gate.exitCode}`,
      reason: `${plural(total, "finding")} accepted as known. Later runs against this baseline fail only on what is new.`,
    };
  }
  if (gate.maxDebt !== undefined && total > gate.maxDebt) {
    return {
      passed,
      headline,
      reason: `${plural(total, "finding")} exceed the --max-debt budget of ${gate.maxDebt}.`,
    };
  }
  if (gate.failOn === "never") {
    return {
      passed,
      headline,
      reason: `--fail-on never: ${plural(total, "finding")} reported, none blocking.`,
    };
  }
  const threshold = gate.failOn === "error" ? "error" : "warning or error";
  if (report.diff) {
    const blockers = blockingEntries(report.diff.added, gate.failOn).length;
    return {
      passed,
      headline,
      reason:
        blockers > 0
          ? `${plural(blockers, "new finding")} at ${threshold} since the baseline.`
          : `Nothing new at ${threshold} since the baseline; ${plural(report.diff.unchanged, "known finding")} carried.`,
    };
  }
  return {
    passed,
    headline,
    reason: passed
      ? total === 0
        ? "No findings."
        : `No finding at ${threshold}; ${plural(total, "finding")} below it.`
      : `${plural(total, "finding")}, at least one at ${threshold}.`,
  };
}
