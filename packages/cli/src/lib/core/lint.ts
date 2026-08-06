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
 * Errors thrown inside a rule's `evaluate()` are caught and converted
 * into a synthetic `info`-severity issue with id `engine.rule-crashed`.
 * We never let one buggy rule take the whole lint run down — the CLI
 * exit code and the UI both depend on a successful walk over every rule.
 */

import type { Issue, Page, Severity } from "./types";
import { RULES, type Rule } from "../rules";
import { evaluateRules, findingsToIssues } from "../rules/evaluate";
import { extractionFromPage } from "../rules/extraction/from-page";

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * Run the rule registry against a `Page`: project the page onto the
 * extraction contract, evaluate every descriptor, and narrow the findings
 * to violations. The optional `rules` override is used by the per-rule
 * contract test harness so it can isolate one rule against a fixture
 * without the noise of the others.
 *
 * Consumers that want the full conformance view (every rule's status,
 * passing ones included) call `evaluateRules` directly.
 */
export function lint(page: Page, rules: ReadonlyArray<Rule> = RULES): Issue[] {
  const extraction = extractionFromPage(page);
  const result = evaluateRules(extraction, rules);
  return sortIssues(findingsToIssues(result, rules));
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
