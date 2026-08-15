/**
 * The rule runner — evaluates descriptors against one `Extraction`.
 *
 * Pure: `Extraction` → `RuleFinding[]`, one finding per rule, passing and
 * `na` verdicts included. This unfiltered list *is* the conformance view
 * (plan §10); `findingsToIssues` narrows it to violations and converts to
 * the legacy `Issue` shape at the report boundary.
 *
 * Crash isolation is preserved from the old engine: a rule that throws is
 * reported as a crash, never as a verdict, and never takes the run down —
 * the CLI exit code depends on a successful walk over every rule.
 */

import type { Issue } from "../core/types";
import type { Band, Extraction, Rule, RuleFinding, ScoredRule } from "./types";

/** A rule whose evaluator threw. Not a verdict — a bug in the rule. */
export interface RuleCrash {
  ruleId: string;
  message: string;
}

export interface EvaluationResult {
  /** One finding per rule that evaluated cleanly, in registry order. */
  findings: RuleFinding[];
  crashes: RuleCrash[];
}

/**
 * Place a measurement in a scored rule's bands. Inside `ideal` passes;
 * inside `acceptable` (but not `ideal`) warns gently; outside both is
 * `poor`. Exported for rule evaluators so every scored rule bands the
 * same way.
 */
export function bandFor(
  value: number,
  bands: ScoredRule["bands"],
): { status: "pass" | "warn"; band: Band } {
  const inside = ([min, max]: [number, number]) => value >= min && value <= max;
  if (inside(bands.ideal)) return { status: "pass", band: "ideal" };
  if (inside(bands.acceptable)) return { status: "warn", band: "acceptable" };
  return { status: "warn", band: "poor" };
}

/** Evaluate every rule against one page's extraction. */
export function evaluateRules(
  extraction: Extraction,
  rules: ReadonlyArray<Rule>,
): EvaluationResult {
  const findings: RuleFinding[] = [];
  const crashes: RuleCrash[] = [];

  for (const rule of rules) {
    try {
      if (rule.kind === "boolean") {
        const verdict = rule.evaluate(extraction);
        findings.push({
          ruleId: rule.id,
          kind: rule.kind,
          status: verdict.status,
          severity: verdict.status === "fail" ? rule.severity : undefined,
          observed: verdict.observed,
          expected: rule.expected,
          message: verdict.message,
          origin: verdict.origin,
          rigor: rule.rigor,
          sources: rule.sources,
        });
      } else {
        const verdict = rule.evaluate(extraction);
        findings.push({
          ruleId: rule.id,
          kind: rule.kind,
          status: verdict.status,
          band: verdict.band,
          severity:
            verdict.status === "warn" && verdict.band && verdict.band !== "ideal"
              ? rule.severityByBand[verdict.band]
              : undefined,
          observed: verdict.observed,
          expected: rule.expected,
          message: verdict.message,
          origin: verdict.origin,
          rigor: rule.rigor,
          sources: rule.sources,
        });
      }
    } catch (err) {
      crashes.push({
        ruleId: rule.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { findings, crashes };
}

/**
 * Narrow findings to violations and convert to the `Issue` shape the
 * report/CLI boundary consumes. Passing and `na` findings drop out;
 * crashes become the synthetic `engine.rule-crashed` info issue. `rules`
 * must be the same list the findings were evaluated with — it resolves
 * each finding's remediation snippet.
 */
export function findingsToIssues(result: EvaluationResult, rules: ReadonlyArray<Rule>): Issue[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const issues: Issue[] = [];

  for (const finding of result.findings) {
    if (finding.status !== "fail" && finding.status !== "warn") continue;
    issues.push({
      ruleId: finding.ruleId,
      severity: finding.severity ?? "info",
      message: finding.message ?? `Expected ${finding.expected}.`,
      origin: finding.origin,
      fix: byId.get(finding.ruleId)?.fix,
      // The finding has known all four since it was evaluated; this is where
      // they used to stop. A report that drops the rigor asks every consumer
      // to re-derive it from a registry it does not have.
      rigor: finding.rigor,
      sources: finding.sources,
      observed: finding.observed,
      expected: finding.expected,
    });
  }

  for (const crash of result.crashes) {
    issues.push({
      ruleId: "engine.rule-crashed",
      severity: "info",
      message: `Rule \`${crash.ruleId}\` threw: ${crash.message}`,
    });
  }

  return issues;
}
