/**
 * Profile contract tests.
 *
 * Two things are being defended here. The mechanical one: the overlay
 * resolves in the documented order, does not mutate the shared registry,
 * and reaches `lint()` intact. The honest one: a profile may change how
 * loudly a rule fires and whether it fires at all, but never what it
 * observes and never its `rigor` or cited `sources` — those are facts about
 * the world, not policy.
 *
 * The "every override names a real rule" test is the CI half of that
 * contract, mirroring the source-provenance test in `../rules.test.ts`: a
 * typo'd rule id in a profile would silently do nothing, which is the one
 * failure mode a policy layer must not have.
 */

import { describe, expect, it } from "vitest";

import { lint } from "../../core/lint";
import { RULES } from "../index";
import { pageFromHtml } from "../test-utils";
import { applyProfile, PROFILE_NAMES, PROFILES, resolveProfile, rulesForProfile } from "./index";

/** A page with nothing on it: every "missing" rule fires. */
const BARE = `<html><head></head><body></body></html>`;

/** Severity a given rule carries in an effective rule set. */
function severityOf(rules: ReadonlyArray<(typeof RULES)[number]>, id: string) {
  const rule = rules.find((r) => r.id === id);
  if (!rule) return undefined;
  return rule.kind === "boolean" ? rule.severity : rule.severityByBand.poor;
}

describe("profile registry", () => {
  it("every profile is keyed by its own name and explains itself", () => {
    for (const name of PROFILE_NAMES) {
      const profile = PROFILES[name]!;
      expect(profile.name, `${name} is keyed under a different name`).toBe(name);
      expect(profile.description.trim(), name).toBeTruthy();
    }
  });

  it("every per-rule override names a rule that exists", () => {
    const known = new Set(RULES.map((r) => r.id));
    for (const name of PROFILE_NAMES) {
      for (const ruleId of Object.keys(PROFILES[name]!.rules ?? {})) {
        expect(known.has(ruleId), `profile ${name} overrides unknown rule ${ruleId}`).toBe(true);
      }
    }
  });

  it("resolves by name, defaults to `default`, and throws on an unknown one", () => {
    expect(resolveProfile("strict").name).toBe("strict");
    expect(resolveProfile().name).toBe("default");
    expect(() => resolveProfile("stcirt")).toThrow(/unknown profile "stcirt"/);
    // The message has to list the alternatives — that is what makes it fixable.
    expect(() => resolveProfile("stcirt")).toThrow(/spec-only/);
  });
});

describe("default", () => {
  it("is a true identity: same rules, same severities", () => {
    const effective = rulesForProfile("default");
    expect(effective.map((r) => r.id)).toEqual(RULES.map((r) => r.id));
    for (const rule of RULES) {
      expect(severityOf(effective, rule.id), rule.id).toBe(severityOf(RULES, rule.id));
    }
  });
});

describe("strict", () => {
  it("promotes spec-backed rules to error", () => {
    const effective = rulesForProfile("strict");
    // vendor-spec by default a warning…
    expect(severityOf(RULES, "canonical.missing")).toBe("warning");
    expect(severityOf(effective, "canonical.missing")).toBe("error");
    // …and an info-severity one is promoted the whole way too.
    expect(severityOf(RULES, "og.description.missing")).toBe("info");
    expect(severityOf(effective, "og.description.missing")).toBe("error");
  });

  it("leaves heuristics as warnings — folklore never fails a build", () => {
    const effective = rulesForProfile("strict");
    expect(severityOf(effective, "title.length")).toBe("warning");
    expect(severityOf(effective, "description.length")).toBe("warning");
  });

  it("does not touch rigor or sources", () => {
    const effective = rulesForProfile("strict");
    for (const rule of RULES) {
      const overlaid = effective.find((r) => r.id === rule.id)!;
      expect(overlaid.rigor, rule.id).toBe(rule.rigor);
      expect(overlaid.sources, rule.id).toEqual(rule.sources);
    }
  });
});

describe("spec-only", () => {
  it("drops every heuristic rule from the run", () => {
    const effective = rulesForProfile("spec-only");
    const ids = effective.map((r) => r.id);
    expect(ids).not.toContain("title.length");
    expect(ids).not.toContain("description.length");
    for (const rule of effective) expect(rule.rigor, rule.id).not.toBe("heuristic");
  });

  it("keeps every non-heuristic rule untouched", () => {
    const effective = rulesForProfile("spec-only");
    const kept = RULES.filter((r) => r.rigor !== "heuristic");
    expect(effective.map((r) => r.id)).toEqual(kept.map((r) => r.id));
    for (const rule of kept) {
      expect(severityOf(effective, rule.id), rule.id).toBe(severityOf(RULES, rule.id));
    }
  });

  it("silences the dropped rule end-to-end, through lint()", () => {
    const short = `<html><head><title>Short</title></head></html>`;
    expect(lint(pageFromHtml(short), RULES).map((i) => i.ruleId)).toContain("title.length");
    expect(
      lint(pageFromHtml(short), rulesForProfile("spec-only")).map((i) => i.ruleId),
    ).not.toContain("title.length");
  });
});

describe("marketing", () => {
  it("raises the metadata rules it names, and nothing else", () => {
    const effective = rulesForProfile("marketing");
    expect(severityOf(effective, "description.missing")).toBe("error");
    expect(severityOf(effective, "og.image.missing")).toBe("error");
    expect(severityOf(effective, "og.description.missing")).toBe("warning");
    // Untouched by this profile.
    expect(severityOf(effective, "viewport.missing")).toBe(severityOf(RULES, "viewport.missing"));
    expect(severityOf(effective, "robots.conflict")).toBe(severityOf(RULES, "robots.conflict"));
  });

  it("reaches the issues lint() emits", () => {
    const issues = lint(pageFromHtml(BARE), rulesForProfile("marketing"));
    const description = issues.find((i) => i.ruleId === "description.missing");
    expect(description?.severity).toBe("error");
  });
});

describe("applyProfile", () => {
  it("applies byRigor first and lets a per-rule override win", () => {
    const [effective] = applyProfile(RULES, {
      name: "test",
      description: "test",
      byRigor: { heuristic: { enabled: false }, "spec-required": { severity: "info" } },
      // Re-enables a rule its rigor band switched off…
      rules: { "title.length": { enabled: true, severity: "error" } },
    }).filter((r) => r.id === "title.length");
    expect(effective).toBeDefined();
    // …and a scored rule's severity override replaces both bands.
    expect(effective!.kind === "scored" && effective!.severityByBand).toEqual({
      acceptable: "error",
      poor: "error",
    });
    expect(severityOf(applyProfile(RULES, PROFILES["strict"]!), "title.missing")).toBe("error");
  });

  it("never mutates the shared registry", () => {
    const before = RULES.map((r) => ({ id: r.id, severity: severityOf(RULES, r.id) }));
    applyProfile(RULES, PROFILES["strict"]!);
    applyProfile(RULES, PROFILES["marketing"]!);
    applyProfile(RULES, PROFILES["spec-only"]!);
    expect(RULES.map((r) => ({ id: r.id, severity: severityOf(RULES, r.id) }))).toEqual(before);
  });

  it("keeps registry order, so report ordering stays stable", () => {
    const effective = applyProfile(RULES, PROFILES["marketing"]!);
    expect(effective.map((r) => r.id)).toEqual(RULES.map((r) => r.id));
  });
});
