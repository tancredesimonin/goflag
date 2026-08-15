/**
 * The goflag rule descriptor contract (rules-catalog plan §6).
 *
 * A rule is a declarative descriptor — id, rigor, cited sources, which
 * extraction paths it reads — plus a thin pure evaluator over the
 * `Extraction` observation model. Rules never touch raw HTML and never see
 * the engine's `Page`; the adapter in `../extraction/from-page.ts` is the
 * only bridge. Every verdict is uniform and self-explaining: **observed vs
 * expected vs source**.
 *
 * Two axes matter and are deliberately separate:
 *
 * - **kind** (how we evaluate): `boolean` rules pass or fail mechanically;
 *   `scored` rules place a measurement in a band (`ideal` / `acceptable` /
 *   `poor`). Both may answer `na` when the rule does not apply to this page
 *   — absence of an optional subject is not a failure. `prose` rules
 *   (`ProseRule`, below) evaluate to nothing at all: they carry evidence to
 *   an agent instead of guessing, and are kept out of the deterministic
 *   `Rule` union so no consumer can mistake one for a verdict.
 * - **rigor** (how authoritative the requirement is): `spec-required` ›
 *   `spec-recommended` › `vendor-spec` › `guideline` › `heuristic`. This is
 *   the honest expression of "source of truth" — an agent must never fix a
 *   `heuristic` as if it were `spec-required`. Every rule cites ≥1 `Source`
 *   from `./sources` (CI-enforced in `rules.test.ts`).
 *
 * The `Issue` shape still lives in `../core/types` because it crosses the
 * engine → report → CLI `--json` boundary; `./evaluate.ts` converts
 * findings into issues at that boundary.
 */

import type { Issue, Rigor, Severity, TagOrigin } from "../core/types";
import type { Extraction } from "./extraction/types";

/**
 * How authoritative the requirement behind a rule is.
 *
 * Defined in `../core/types` and re-exported here: it travels with a finding
 * all the way to the JSON report, so it belongs beside `Severity` rather than
 * behind the rule registry.
 */
export type { Rigor };

/** A band a scored measurement can land in. */
export type Band = "ideal" | "acceptable" | "poor";

/** Everything a rule declares about itself, before any evaluation. */
export interface RuleBase {
  /** Stable identifier in `category.short-name` form (e.g. `title.missing`). */
  id: string;
  /** Grouping key: `document`, `meta`, `opengraph`, `robots`, … */
  category: string;
  /** One-line statement of the policy (shown in docs and `why`). */
  title: string;
  /** Rationale: why honoring this rule matters. */
  why: string;
  rigor: Rigor;
  /** Ids into the source catalog (`./sources`). ≥1, CI-enforced. */
  sources: string[];
  /** Dotted paths into `Extraction` this rule reads (e.g. `meta.canonical`). */
  reads: string[];
  /** Related rule ids, when useful. */
  relates?: string[];
  /**
   * Copy-pasteable remediation snippet, attached to failing findings.
   * Deliberately minimal — real fix generation is the M2 work.
   */
  fix?: { title: string; snippet: string; language: string };
}

/** What a boolean rule's evaluator returns. */
export interface BooleanVerdict {
  /** `na` means the rule does not apply to this page (not a pass). */
  status: "pass" | "fail" | "na";
  /** The relevant observed value, JSON-serializable. */
  observed: unknown;
  /** Human sentence describing failure (only read when `status === "fail"`). */
  message?: string;
  /** Pointer back into the page for highlighting. */
  origin?: TagOrigin;
}

/** A rule that passes or fails mechanically. */
export interface BooleanRule extends RuleBase {
  kind: "boolean";
  /** Severity of a failing finding. */
  severity: Severity;
  /** One sentence stating what a passing page looks like. */
  expected: string;
  evaluate: (extraction: Extraction) => BooleanVerdict;
}

/** What a scored rule's evaluator returns. */
export interface ScoredVerdict {
  /** `na` when the measured subject is absent; `warn` outside the ideal band. */
  status: "pass" | "warn" | "na";
  band?: Band;
  observed: number | string;
  message?: string;
  origin?: TagOrigin;
}

/** A rule that places a measurement in a band instead of pass/fail. */
export interface ScoredRule extends RuleBase {
  kind: "scored";
  /** Inclusive `[min, max]` windows; `acceptable` should contain `ideal`. */
  bands: { ideal: [number, number]; acceptable: [number, number] };
  /** Severity of a finding landing in each non-ideal band. */
  severityByBand: Record<"acceptable" | "poor", Severity>;
  /** One sentence stating the ideal window. */
  expected: string;
  evaluate: (extraction: Extraction) => ScoredVerdict;
}

/**
 * A rule no deterministic check can settle (plan §8) — "does this title
 * actually describe the page?" goflag refuses to fabricate a verdict on
 * these. It states the policy, attaches the observed facts the question
 * turns on, and stops; an AI agent (the future MCP layer) judges the prose
 * against that evidence.
 *
 * The plan names the evidence list `evidence`; here it is the inherited
 * `reads`. For a prose rule the two collapse — everything it hands over is
 * exactly what it reads — and one field for one concept beats two that must
 * be kept in sync. The consumer-facing name survives on `AdvisoryFinding`.
 */
export interface ProseRule extends RuleBase {
  kind: "prose";
  /**
   * The policy as the sentence an agent has to judge, in the second person
   * about the page. Not a hint and not a fix — a question with a truth
   * value.
   */
  prose: string;
  /**
   * Gate on the subject existing, mirroring `SiteRule.appliesTo`. "Does the
   * description summarize the page?" is unanswerable on a page with no
   * description — and a deterministic rule already fails that page, so
   * asking would be noise on top of a finding. Returning false skips the
   * rule for this page entirely.
   *
   * This gates on *presence*, never on quality: a prose rule that skipped a
   * page because the description "looked fine" would be goflag making
   * exactly the judgment it declined to make.
   */
  appliesTo?: (extraction: Extraction) => boolean;
}

/**
 * One prose rule's evidence bundle for one page. Deliberately *not* a
 * verdict: `needs-judgment` is the only value `verdict` ever takes here.
 * Nothing downstream may read an advisory as a finding — it never affects
 * severity counts, the verdict, or the exit code, because no one has judged
 * it yet.
 */
export interface AdvisoryFinding {
  ruleId: string;
  kind: "prose";
  prose: string;
  rigor: Rigor;
  sources: string[];
  /**
   * Extraction path → the observed value there, one entry per declared
   * path. An absent observation is present as `null` rather than missing:
   * "the page has no `og:image`" is evidence, and a missing key could not be
   * told apart from a path that resolved to nothing.
   */
  evidence: Record<string, unknown>;
  verdict: "needs-judgment";
}

export type Rule = BooleanRule | ScoredRule;

/**
 * One rule's verdict on one page — the uniform result every consumer
 * (report, conformance view, agents) reads. Produced by `./evaluate.ts`
 * for **every** rule, passing ones included, so the conformance matrix
 * (plan §10) is just this list unfiltered.
 */
export interface RuleFinding {
  ruleId: string;
  kind: Rule["kind"];
  status: "pass" | "fail" | "warn" | "na";
  band?: Band;
  /** Set when `status` is `fail` or `warn`. */
  severity?: Severity;
  observed: unknown;
  expected: string;
  /** Human sentence; present on failing/warning findings. */
  message?: string;
  origin?: TagOrigin;
  rigor: Rigor;
  sources: string[];
}

/** Re-exported so rule files and the runner only need one import. */
export type { Extraction, Issue, Severity, TagOrigin };
