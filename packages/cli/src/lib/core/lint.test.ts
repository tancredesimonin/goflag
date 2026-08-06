import { describe, expect, it } from "vitest";

import { lint, sortIssues, summariseIssues } from "@/lib/core/lint";
import type { Issue } from "@/lib/core/types";
import type { BooleanRule } from "@/lib/rules";
import { pageFromHtml } from "@/lib/rules/test-utils";

/** A minimal synthetic boolean rule the runner tests can bend per case. */
const syntheticRule = (overrides: Partial<BooleanRule> & { id: string }): BooleanRule => ({
  kind: "boolean",
  category: "test",
  severity: "warning",
  title: "synthetic",
  why: "synthetic",
  rigor: "heuristic",
  sources: ["moz-title-tag"],
  reads: ["document.title"],
  expected: "nothing in particular",
  evaluate: () => ({ status: "pass", observed: null }),
  ...overrides,
});

describe("lint runner", () => {
  it("keeps only violations: pass and na findings emit no issue", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules = [
      syntheticRule({
        id: "test.fails",
        severity: "error",
        evaluate: () => ({ status: "fail", observed: null, message: "boom" }),
      }),
      syntheticRule({ id: "test.passes" }),
      syntheticRule({
        id: "test.na",
        evaluate: () => ({ status: "na", observed: null }),
      }),
    ];
    const issues = lint(page, rules);
    expect(issues.map((i) => i.ruleId)).toEqual(["test.fails"]);
    expect(issues[0]).toMatchObject({ severity: "error", message: "boom" });
  });

  it("sorts by severity then ruleId", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const fail = (message: string) => ({ status: "fail" as const, observed: null, message });
    const rules = [
      syntheticRule({ id: "z.warn", severity: "warning", evaluate: () => fail("warn") }),
      syntheticRule({ id: "a.info", severity: "info", evaluate: () => fail("info") }),
      syntheticRule({ id: "m.error", severity: "error", evaluate: () => fail("err") }),
    ];
    const ids = lint(page, rules).map((i) => i.ruleId);
    expect(ids).toEqual(["m.error", "z.warn", "a.info"]);
  });

  it("falls back to the rule's expected sentence when a failure has no message", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules = [
      syntheticRule({
        id: "test.terse",
        expected: "a well-formed thing",
        evaluate: () => ({ status: "fail", observed: null }),
      }),
    ];
    expect(lint(page, rules)[0]?.message).toBe("Expected a well-formed thing.");
  });

  it("captures rule crashes as engine.rule-crashed", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules = [
      syntheticRule({
        id: "boom",
        evaluate: () => {
          throw new Error("nope");
        },
      }),
    ];
    const issues = lint(page, rules);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe("engine.rule-crashed");
    expect(issues[0]!.message).toContain("`boom`");
    expect(issues[0]!.message).toContain("nope");
  });
});

describe("summariseIssues", () => {
  it("counts by severity", () => {
    const issues: Issue[] = [
      { ruleId: "a", severity: "error", message: "" },
      { ruleId: "b", severity: "error", message: "" },
      { ruleId: "c", severity: "warning", message: "" },
      { ruleId: "d", severity: "info", message: "" },
      { ruleId: "e", severity: "info", message: "" },
    ];
    expect(summariseIssues(issues)).toEqual({ error: 2, warning: 1, info: 2 });
  });
});

describe("sortIssues", () => {
  it("is stable and idempotent", () => {
    const issues: Issue[] = [
      { ruleId: "b", severity: "warning", message: "" },
      { ruleId: "a", severity: "warning", message: "" },
    ];
    const once = sortIssues(issues);
    const twice = sortIssues(once);
    expect(once.map((i) => i.ruleId)).toEqual(["a", "b"]);
    expect(twice).toEqual(once);
  });
});
