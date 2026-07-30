/**
 * The Goflag rule runner.
 *
 * Pure function: `Page` → ordered `Issue[]`. No I/O, no caching, no
 * mutation. Every consumer of the engine — the Issues panel, the CLI
 * `goflag lint` command, snapshot diffs (Phase 9), the future hosted
 * audit log — calls this single entry point so behaviour stays
 * identical across surfaces.
 *
 * Ordering is part of the public contract:
 *
 *   1. Severity, descending: `error` > `warning` > `info`. The Issues
 *      panel groups by severity but also relies on this so "the worst
 *      thing first" lines up with the CLI's stdout order.
 *   2. Within a severity, by `ruleId` ascending. Stable, alphabetical,
 *      and category-grouped (since ids are dotted).
 *   3. Within a single rule's emissions, the order the rule returned
 *      them (rules can produce one issue per offending tag).
 *
 * Errors thrown inside a rule's `check()` are caught and converted into
 * a synthetic `info`-severity issue with id `engine.rule-crashed`. We
 * never let one buggy rule take the whole lint run down — the CLI exit
 * code and the UI both depend on a successful walk over every rule.
 */

import type { Issue, Page, Severity } from "./types";
import { RULES, type Rule } from "../rules";

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * Run the rule registry against a `Page`. The optional `rules` override
 * is used by the per-rule contract test harness so it can isolate one
 * rule against a fixture without the noise of the other 24.
 */
export function lint(page: Page, rules: ReadonlyArray<Rule> = RULES): Issue[] {
  const issues: Issue[] = [];

  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(page)) continue;

    let result: Issue[] | Issue | undefined | void;
    try {
      result = rule.check({
        page,
        issue: (input) => ({
          ruleId: rule.id,
          severity: input.severity ?? rule.severity,
          message: input.message,
          origin: input.origin,
          fix: input.fix,
          suggestion: input.suggestion,
        }),
      });
    } catch (err) {
      issues.push({
        ruleId: "engine.rule-crashed",
        severity: "info",
        message: `Rule \`${rule.id}\` threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (!result) continue;
    if (Array.isArray(result)) issues.push(...result);
    else issues.push(result);
  }

  return sortIssues(issues);
}

/**
 * Stable ordering used by every consumer. Exported for tests.
 *
 * Generic over the issue type so `lint-site.ts` can reuse the exact same
 * severity/ruleId contract on `Issue & { pageUrl }` without a cast — and so
 * that any extra field a caller carries survives the sort.
 */
export function sortIssues<T extends Issue>(issues: T[]): T[] {
  return [...issues].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

/** Convenience: count issues per severity for the UI summary chip. */
export function summariseIssues(issues: Issue[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) out[issue.severity] += 1;
  return out;
}
