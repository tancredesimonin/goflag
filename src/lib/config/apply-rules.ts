/**
 * Rule-level config application.
 *
 * Given a resolved `HeadlintConfig` and a list of `Issue`s emitted by
 * the rule runner, produces the filtered/severity-overridden list
 * the UI actually displays. Pure: no engine reach-in, no
 * mutation of the input array.
 *
 * Rules can be configured in three ways via `config.rules[<id>]`:
 *
 *   - "off"   → drop every issue with that ruleId
 *   - "warn"  → coerce the severity to `warning`
 *   - "error" → coerce the severity to `error`
 *   - { severity, options } → object form (options ignored here —
 *     they're owned by the rule itself; this layer only handles
 *     severity/disable).
 *
 * When the same ruleId is overridden but the user picks `"info"`,
 * we coerce to `info`.
 */

import type { Issue, Severity } from "@/lib/core/types";
import type { HeadlintConfig, RuleSetting } from "./types";

export function applyRuleConfig(issues: Issue[], config: HeadlintConfig | undefined): Issue[] {
  const overrides = config?.rules;
  if (!overrides || Object.keys(overrides).length === 0) return issues;

  const out: Issue[] = [];
  for (const issue of issues) {
    const setting = overrides[issue.ruleId];
    if (setting === undefined) {
      out.push(issue);
      continue;
    }
    const severity = readSeverity(setting);
    if (severity === "off") continue;
    if (severity === issue.severity) {
      out.push(issue);
      continue;
    }
    out.push({ ...issue, severity });
  }
  return out;
}

function readSeverity(setting: RuleSetting): "off" | Severity {
  const raw = typeof setting === "string" ? setting : setting.severity;
  if (raw === "warn") return "warning";
  return raw;
}
