/**
 * Profile registry and the overlay that applies one (plan §9).
 *
 * The shipped profiles answer a question the rule registry deliberately
 * cannot: *how much does this matter to you?* A rule's `rigor` says how
 * authoritative the requirement is; a profile says what your build should
 * do about it. Those are different questions, and conflating them is how
 * linters end up either shouting about folklore or shrugging at spec
 * violations.
 *
 * Applying a profile is pure and total: `Rule[] → Rule[]`, no mutation of
 * the input descriptors, resolved once per run.
 */

import { RULES } from "../index";
import type { Rule, Severity } from "../types";
import type { Profile, RuleOverride } from "./types";

/** The profile in force when `--profile` is not given. */
export const DEFAULT_PROFILE = "default";

/**
 * The shipped profiles.
 *
 * Order matters only for the `--help` listing: default first, then
 * increasingly opinionated.
 */
export const PROFILES: Readonly<Record<string, Profile>> = {
  default: {
    name: "default",
    description: "rule severities exactly as authored",
  },

  strict: {
    name: "strict",
    description: "every spec-backed rule fails the build",
    // The line is drawn at "is there a document that says so", not at "does
    // it feel important". Heuristics stay warnings even here — promoting
    // SERP-length folklore to an error would be exactly the dishonesty the
    // rigor axis exists to prevent.
    byRigor: {
      "spec-required": { severity: "error" },
      "spec-recommended": { severity: "error" },
      "vendor-spec": { severity: "error" },
      guideline: { severity: "warning" },
      heuristic: { severity: "warning" },
    },
  },

  "spec-only": {
    name: "spec-only",
    description: "heuristic rules switched off entirely",
    // Not a severity change: a heuristic finding is switched off, so it is
    // absent from the conformance view rather than sitting there as a
    // suspiciously quiet `pass`.
    byRigor: {
      heuristic: { enabled: false },
    },
  },

  marketing: {
    name: "marketing",
    description: "snippet and unfurl metadata gaps are errors",
    // The recommended/optional distinction inverts for a page whose job is
    // to be shared: a missing description or preview image costs a click,
    // whatever the spec calls it.
    rules: {
      "description.missing": { severity: "error" },
      "description.length": { severity: "warning" },
      "og.title.missing": { severity: "error" },
      "og.image.missing": { severity: "error" },
      "og.description.missing": { severity: "warning" },
    },
  },
};

/** Profile names, in listing order. */
export const PROFILE_NAMES: readonly string[] = Object.keys(PROFILES);

/**
 * Look up a profile by name. `undefined` resolves to `default`, so callers
 * can pass an optional flag straight through. Throws with the full list on
 * an unknown name — a typo must never silently audit under a different
 * policy than the one asked for.
 */
export function resolveProfile(name: string = DEFAULT_PROFILE): Profile {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(`unknown profile "${name}" — expected one of: ${PROFILE_NAMES.join(", ")}`);
  }
  return profile;
}

/** The effective override for one rule: rigor band first, per-rule id last. */
function overrideFor(rule: Rule, profile: Profile): RuleOverride {
  return { ...profile.byRigor?.[rule.rigor], ...profile.rules?.[rule.id] };
}

/** Re-stamp a rule's severity, respecting the shape of its `kind`. */
function withSeverity(rule: Rule, severity: Severity): Rule {
  if (rule.kind === "boolean") return { ...rule, severity };
  return { ...rule, severityByBand: { acceptable: severity, poor: severity } };
}

/**
 * Overlay a profile onto a rule set. Disabled rules drop out; the rest are
 * returned in registry order, as fresh objects — the shared `RULES`
 * descriptors are never mutated, so two audits under different profiles in
 * one process cannot contaminate each other.
 */
export function applyProfile(rules: ReadonlyArray<Rule>, profile: Profile): ReadonlyArray<Rule> {
  const effective: Rule[] = [];
  for (const rule of rules) {
    const override = overrideFor(rule, profile);
    if (override.enabled === false) continue;
    effective.push(override.severity ? withSeverity(rule, override.severity) : rule);
  }
  return effective;
}

/**
 * Resolve a profile name and apply it in one step — what `runAudit` calls.
 * The `rules` parameter exists for tests; production always overlays the
 * full registry.
 */
export function rulesForProfile(
  name?: string,
  rules: ReadonlyArray<Rule> = RULES,
): ReadonlyArray<Rule> {
  return applyProfile(rules, resolveProfile(name));
}

export type { Profile, RuleOverride } from "./types";
