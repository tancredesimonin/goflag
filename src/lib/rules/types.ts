/**
 * Goflag rule contract.
 *
 * A rule is a pure function from a `Page` (Goflag's deterministic snapshot
 * of one URL) to zero or more `Issue`s. Rules never fetch, never mutate,
 * never throw — they describe a policy and return findings. The `Issue`
 * shape itself lives in `@/lib/core/types` because it crosses the
 * UI ↔ engine ↔ snapshot diff ↔ CLI `--json` boundary; this file only
 * defines what it takes to author one of these rules.
 *
 * Authoring requirements (enforced by the Phase 5.11 fixture-existence
 * gate):
 *
 *   1. Every rule MUST live at `src/lib/rules/<rule-id>.ts` with a default
 *      export of type `Rule`. The filename's basename (sans extension) MUST
 *      equal the rule's `id`.
 *   2. Every rule MUST ship two fixtures under
 *      `fixtures/rules/<rule-id>/`: `pass.html` (zero issues from this rule)
 *      and `fail.html` (at least one issue from this rule, exact payload
 *      asserted by the harness in `src/lib/rules/__tests__/contract.test.ts`).
 *   3. `Rule.docs.rationale` is rendered as the body of `/rules/[id]`. It
 *      MUST explain *why* the rule exists (consumers, real-world impact).
 *      Don't restate the message; explain the cost of getting it wrong.
 */

import type { Issue, Page, Severity, TagOrigin } from "@/lib/core/types";

/**
 * The category bucket the UI groups rules into. Inferred from the rule id
 * prefix (`title.*` → `core`, `og.*` → `open-graph`, ...). Pure derived
 * data; we expose it as a function rather than a field so contributors
 * never have to remember to set it.
 */
export type RuleCategory =
  | "core"
  | "open-graph"
  | "twitter"
  | "i18n"
  | "icons"
  | "manifest"
  | "robots";

/**
 * Static documentation that powers `/rules/[id]` and the in-app issue
 * "Learn more" link.
 */
export interface RuleDocs {
  /**
   * One-sentence summary shown in tooltips, the rule list, and every issue
   * row in the Issues panel. Imperative voice ("Set a `<title>` on every
   * page"), no trailing period.
   */
  summary: string;
  /**
   * Multi-paragraph markdown explaining *why* the rule matters: who reads
   * the metadata, what breaks when it's missing, what the upper-bound
   * impact is. Rendered as the body of `/rules/[id]`.
   */
  rationale: string;
  /**
   * Optional canonical fix snippet rendered in the docs page and offered
   * by `goflag lint --json` consumers. Keep it copy-pasteable.
   */
  exampleFix?: {
    title: string;
    /** Language tag for syntax highlighting. */
    language: "html" | "json" | "txt";
    snippet: string;
  };
  /** External references / specs. Shown as a footnote on the docs page. */
  references?: Array<{ label: string; href: string }>;
}

/**
 * Helpers passed to a rule's `check()`. Wrapping the raw `Page` in a
 * context lets us:
 *
 *   - default `ruleId` and `severity` so rules don't have to repeat them,
 *   - default `docs` to `/rules/<id>` (the Issues panel relies on it),
 *   - keep room for future helpers (locale, fetched probes, etc.) without
 *     breaking existing rule signatures.
 */
export interface RuleContext {
  page: Page;
  /**
   * Build an `Issue` carrying this rule's id, default severity, and the
   * canonical docs href. Override `severity` (rare) when the same rule
   * fires at multiple severities depending on the input.
   */
  issue: (
    input: Omit<Issue, "ruleId" | "severity" | "docs"> & {
      severity?: Severity;
      docs?: string;
    },
  ) => Issue;
}

/**
 * A rule is the smallest enforceable Goflag policy. Each one is a pure
 * function over a `Page`; the runner (`src/lib/core/lint.ts`) handles
 * iteration, ordering, and aggregation.
 */
export interface Rule {
  /**
   * Stable identifier in `category.short-name` form (e.g. `title.missing`,
   * `og.image.dimensions`). Doubles as the route under `/rules/[id]` and
   * the directory under `fixtures/rules/`. Lowercase, dot- and hyphen-
   * separated, never renamed (snapshots and external dashboards reference
   * it).
   */
  id: string;
  /** Default severity for issues this rule emits. */
  severity: Severity;
  /** Human metadata; rendered into `/rules/[id]` and tooltips. */
  docs: RuleDocs;
  /**
   * Optional gate: when defined and returning false, the rule is skipped
   * entirely for this page. Keep it cheap (pure, sync, no allocations).
   * Default: always run.
   */
  appliesTo?: (page: Page) => boolean;
  /**
   * The check itself. Return `[]` / `undefined` when nothing is wrong.
   * Multiple issues are allowed (one rule can flag several missing tags).
   */
  check: (ctx: RuleContext) => Issue[] | Issue | undefined | void;
}

/** Re-exported here so rule files only need one import. */
export type { Issue, Page, Severity, TagOrigin };
