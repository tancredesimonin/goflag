import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_RULES, PAGE_RULES, PROSE_RULES, SITE_RULES, SOURCES } from "./rules-catalog";
import { RULE_EDITORIAL } from "./rules-editorial";

/**
 * The catalogue is read from `packages/cli/rules.json`, so these do not check
 * the rules themselves — the CLI's own suite does that, against the registry.
 * What they check is the seam: that the generated data and the prose written
 * beside it still describe the same set of rules.
 */
describe("the rule catalogue the site renders", () => {
  it("comes from the engine, not from a copy in this repo", () => {
    // If this file ever grows literals again, this is the test that should
    // have stopped it: every field below exists only because the CLI emitted it.
    expect(ALL_RULES.length).toBeGreaterThan(0);
    const rule = ALL_RULES.find((r) => r.id === "title.missing");
    expect(rule).toMatchObject({ scope: "page", severity: "error", rigor: "spec-required" });
    expect(rule!.sources.length).toBeGreaterThan(0);
  });

  it("splits into the three scopes without losing or duplicating a rule", () => {
    expect(PAGE_RULES.length + SITE_RULES.length + PROSE_RULES.length).toBe(ALL_RULES.length);
    expect(new Set(ALL_RULES.map((r) => r.id)).size).toBe(ALL_RULES.length);
  });

  it("has editorial prose for every rule, and no prose for a rule that is gone", () => {
    // The seam, in one assertion. A rule added to the engine without a `why`
    // ships an unexplained entry; a rule deleted from the engine leaves an
    // orphan paragraph nobody notices. Both are failures here instead.
    const shipped = ALL_RULES.map((r) => r.id).sort();
    const written = Object.keys(RULE_EDITORIAL).sort();
    expect(written).toEqual(shipped);
  });

  it("cites only documents the exported source catalogue carries", () => {
    for (const rule of ALL_RULES) {
      for (const id of rule.sources) {
        expect(SOURCES[id], `rule ${rule.id} cites unknown source ${id}`).toBeDefined();
      }
    }
  });

  it("gives a prose rule the engine's own question", () => {
    // A prose rule's message IS its question, and the engine carries it — so
    // the site renders that and nothing is written beside it to drift from.
    const generated: Record<string, string | undefined> = Object.fromEntries(
      (
        JSON.parse(
          readFileSync(join(process.cwd(), "..", "..", "packages", "cli", "rules.json"), "utf8"),
        ) as { rules: Array<{ id: string; prose?: string }> }
      ).rules.map((r) => [r.id, r.prose]),
    );

    for (const rule of PROSE_RULES) {
      expect(rule.severity).toBeNull();
      expect(rule.message).toBe(generated[rule.id]);
      expect(RULE_EDITORIAL[rule.id]?.message).toBeUndefined();
    }
  });
});
