import { describe, expect, it } from "vitest";

import { lint, sortIssues, summariseIssues } from "@/lib/core/lint";
import type { Issue } from "@/lib/core/types";
import type { Rule } from "@/lib/rules";
import { pageFromHtml } from "@/lib/rules/test-utils";

const noopRule = (overrides: Partial<Rule> & { id: string }): Rule => ({
  severity: "warning",
  summary: "noop",
  check: () => undefined,
  ...overrides,
});

describe("lint runner", () => {
  it("flattens single-issue and multi-issue rules", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules: Rule[] = [
      noopRule({
        id: "test.single",
        severity: "error",
        check: ({ issue }) => issue({ message: "boom" }),
      }),
      noopRule({
        id: "test.many",
        severity: "info",
        check: ({ issue }) => [issue({ message: "a" }), issue({ message: "b" })],
      }),
      noopRule({ id: "test.silent" }),
    ];
    const issues = lint(page, rules);
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.ruleId)).toEqual(["test.single", "test.many", "test.many"]);
  });

  it("sorts by severity then ruleId", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules: Rule[] = [
      noopRule({
        id: "z.warn",
        severity: "warning",
        check: ({ issue }) => issue({ message: "warn" }),
      }),
      noopRule({
        id: "a.info",
        severity: "info",
        check: ({ issue }) => issue({ message: "info" }),
      }),
      noopRule({
        id: "m.error",
        severity: "error",
        check: ({ issue }) => issue({ message: "err" }),
      }),
    ];
    const ids = lint(page, rules).map((i) => i.ruleId);
    expect(ids).toEqual(["m.error", "z.warn", "a.info"]);
  });

  it("respects appliesTo gates", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules: Rule[] = [
      noopRule({
        id: "skipped",
        appliesTo: () => false,
        check: ({ issue }) => issue({ message: "should not fire" }),
      }),
    ];
    expect(lint(page, rules)).toEqual([]);
  });

  it("captures rule crashes as engine.rule-crashed", () => {
    const page = pageFromHtml("<html><head></head><body></body></html>");
    const rules: Rule[] = [
      noopRule({
        id: "boom",
        check: () => {
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
