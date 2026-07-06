/**
 * Goflag rule contract.
 *
 * A rule is a pure function from a `Page` (Goflag's deterministic snapshot
 * of one URL) to zero or more `Issue`s. Rules never fetch, never mutate,
 * never throw — they describe a policy and return findings. The `Issue`
 * shape lives in `../core/types` because it crosses the engine -> report
 * -> CLI `--json` boundary; this file only defines what it takes to author
 * one of these rules.
 */

import type { Issue, Page, Severity, TagOrigin } from "../core/types";

/**
 * Helpers passed to a rule's `check()`. Wrapping the raw `Page` in a
 * context lets us default `ruleId` and `severity` so rules don't repeat
 * them.
 */
export interface RuleContext {
  page: Page;
  /**
   * Build an `Issue` carrying this rule's id and default severity.
   * Override `severity` when the same rule fires at multiple severities.
   */
  issue: (input: Omit<Issue, "ruleId" | "severity"> & { severity?: Severity }) => Issue;
}

/**
 * A rule is the smallest enforceable Goflag policy. Each one is a pure
 * function over a `Page`; the runner (`../core/lint.ts`) handles
 * iteration, ordering, and aggregation.
 */
export interface Rule {
  /** Stable identifier in `category.short-name` form (e.g. `title.missing`). */
  id: string;
  /** Default severity for issues this rule emits. */
  severity: Severity;
  /** One-line summary of what the rule enforces (shown in `--help`/docs). */
  summary: string;
  /** Optional gate: when it returns false, the rule is skipped for this page. */
  appliesTo?: (page: Page) => boolean;
  /** The check itself. Return `[]`/`undefined` when nothing is wrong. */
  check: (ctx: RuleContext) => Issue[] | Issue | undefined | void;
}

/** Re-exported here so rule files only need one import. */
export type { Issue, Page, Severity, TagOrigin };
