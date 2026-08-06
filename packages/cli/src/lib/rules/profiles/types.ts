/**
 * The profile contract (rules-catalog plan §9).
 *
 * A profile is a named **policy overlay**, not a second rule engine. It
 * never changes what a rule observes or how it decides — only how loudly a
 * violation lands, and whether the rule runs at all. The effective rule set
 * is `descriptor ⊕ active profile`, resolved once per run in
 * `../../../report/build.ts` and handed to `lint()`.
 *
 * That boundary is what keeps profiles honest: a rule's `rigor` and its
 * cited `sources` are facts about the world and are **never** overlaid. A
 * `marketing` profile may decide a missing `og:image` should fail the
 * build, but it cannot promote `vendor-spec` to `spec-required` — an agent
 * reading the finding still sees the true authority behind it.
 *
 * Two levers, deliberately no more:
 *
 * - `enabled: false` — the rule does not run, so it produces no finding at
 *   all (not a silent `pass`, which would misreport the conformance view).
 * - `severity` — the severity a violation carries, which is what the
 *   `--fail-on` gate reads.
 *
 * Overlays apply in one order, least to most specific: `byRigor`, then
 * `rules` (per-id). A per-rule entry always wins, including re-enabling a
 * rule its rigor band switched off.
 *
 * Scope: this overlays the **page**-rule registry (`Rule`). Cross-page
 * `SiteRule`s still use the pre-catalog contract in `../site-types.ts`; they
 * move onto the descriptor in Phase G and pick up profiles with it.
 */

import type { Rigor, Severity } from "../types";

/** What a profile may say about one rule. Both levers are optional. */
export interface RuleOverride {
  /**
   * `false` drops the rule from the run entirely. `true` re-enables a rule
   * that this profile's `byRigor` band switched off.
   */
  enabled?: boolean;
  /**
   * Severity a violation of this rule carries. On a `scored` rule it
   * replaces **both** bands (`acceptable` and `poor`) — a profile states a
   * policy about the rule, not about the shape of its bands.
   */
  severity?: Severity;
}

/** A named, data-shaped overlay over the rule registry. */
export interface Profile {
  /** The name `--profile` takes. Kebab-case, stable. */
  name: string;
  /**
   * Half a line naming the policy, listed under `--profile` in `--help`.
   * Kept short on purpose — it has to fit the help column; the reasoning
   * belongs in this file's comments and the README.
   */
  description: string;
  /**
   * Overlay every rule of a given rigor. Applied before `rules`, so a
   * per-rule entry can carve out an exception.
   */
  byRigor?: Partial<Record<Rigor, RuleOverride>>;
  /**
   * Per-rule overlay, keyed by rule id. Highest precedence. Every id must
   * name a rule in the registry (CI-enforced in `profiles.test.ts`) — a
   * typo here would silently do nothing, which is the one failure mode a
   * policy layer must not have.
   */
  rules?: Record<string, RuleOverride>;
}

export type { Rigor, Severity };
