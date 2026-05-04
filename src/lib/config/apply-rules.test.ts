import { describe, expect, it } from "vitest";

import { applyRuleConfig } from "./apply-rules";
import type { Issue } from "@/lib/core/types";

const ISSUES: Issue[] = [
  { ruleId: "title.length", severity: "warning", message: "too long", docs: "/x" },
  { ruleId: "meta.description.present", severity: "error", message: "missing", docs: "/y" },
  { ruleId: "og.image.present", severity: "info", message: "absent", docs: "/z" },
];

describe("applyRuleConfig", () => {
  it("returns the issue list as-is when no overrides are configured", () => {
    expect(applyRuleConfig(ISSUES, undefined)).toEqual(ISSUES);
    expect(applyRuleConfig(ISSUES, { rules: {} })).toEqual(ISSUES);
  });

  it("drops issues whose rule is set to `off`", () => {
    const out = applyRuleConfig(ISSUES, { rules: { "title.length": "off" } });
    expect(out.find((i) => i.ruleId === "title.length")).toBeUndefined();
    expect(out).toHaveLength(2);
  });

  it("rewrites severity when shorthand is `warn` (mapping to `warning`)", () => {
    const out = applyRuleConfig(ISSUES, {
      rules: { "meta.description.present": "warn" },
    });
    const issue = out.find((i) => i.ruleId === "meta.description.present");
    expect(issue?.severity).toBe("warning");
  });

  it("respects the object-form severity", () => {
    const out = applyRuleConfig(ISSUES, {
      rules: { "og.image.present": { severity: "error", options: { foo: "bar" } } },
    });
    const issue = out.find((i) => i.ruleId === "og.image.present");
    expect(issue?.severity).toBe("error");
  });

  it("leaves overridden issues with the same severity untouched (no clone)", () => {
    const out = applyRuleConfig(ISSUES, {
      rules: { "title.length": { severity: "warn" } },
    });
    const issue = out.find((i) => i.ruleId === "title.length");
    expect(issue?.severity).toBe("warning");
    // The input was already "warning"; output should be reference-equal.
    expect(issue).toBe(ISSUES[0]);
  });
});
