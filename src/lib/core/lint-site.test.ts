import { describe, expect, it } from "vitest";

import { lintSite, sortSiteIssues } from "./lint-site";
import type { SiteContext, SiteIssueDraft, SiteRule } from "../rules/site-types";

function context(overrides: Partial<SiteContext> = {}): SiteContext {
  return {
    origin: "https://x.test",
    pages: [],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: ["en", "fr"], source: "sitemap", multilingual: true },
    ...overrides,
  };
}

function rule(overrides: Partial<SiteRule> & Pick<SiteRule, "id">): SiteRule {
  return {
    severity: "warning",
    summary: "test rule",
    check: () => [],
    ...overrides,
  };
}

describe("lintSite", () => {
  it("passes the site context and stamps the rule's id and severity", () => {
    const issues = lintSite(context(), [
      rule({
        id: "a.one",
        severity: "error",
        check: ({ site, issue }) => issue({ pageUrl: site.origin, message: "boom" }),
      }),
    ]);

    expect(issues).toEqual([
      expect.objectContaining({ ruleId: "a.one", severity: "error", message: "boom" }),
    ]);
  });

  it("lets a rule override severity per emission", () => {
    const issues = lintSite(context(), [
      rule({
        id: "a.one",
        severity: "warning",
        check: ({ issue }) =>
          issue({ pageUrl: "https://x.test/p", message: "m", severity: "info" }),
      }),
    ]);
    expect(issues[0]?.severity).toBe("info");
  });

  it("skips a rule whose appliesTo gate returns false", () => {
    const issues = lintSite(
      context({ localeAxis: { locales: [], source: "crawl", multilingual: false } }),
      [
        rule({
          id: "a.gated",
          appliesTo: (site) => site.localeAxis.multilingual,
          check: ({ issue }) => issue({ pageUrl: "https://x.test/p", message: "should not fire" }),
        }),
      ],
    );
    expect(issues).toEqual([]);
  });

  it("accepts a bare issue, an array, or nothing at all", () => {
    const issues = lintSite(context(), [
      rule({ id: "a.none", check: () => undefined }),
      rule({
        id: "b.one",
        check: ({ issue }) => issue({ pageUrl: "https://x.test/1", message: "1" }),
      }),
      rule({
        id: "c.many",
        check: ({ issue }) => [
          issue({ pageUrl: "https://x.test/2", message: "2" }),
          issue({ pageUrl: "https://x.test/3", message: "3" }),
        ],
      }),
    ]);
    expect(issues.map((i) => i.ruleId)).toEqual(["b.one", "c.many", "c.many"]);
  });

  it("converts a thrown rule into an info finding instead of failing the audit", () => {
    // One buggy policy must never take the whole run down: the exit code and
    // every downstream consumer depend on a complete walk over the registry.
    const issues = lintSite(context(), [
      rule({
        id: "a.crashy",
        check: () => {
          throw new Error("kaboom");
        },
      }),
      rule({
        id: "b.fine",
        check: ({ issue }) => issue({ pageUrl: "https://x.test/p", message: "ok" }),
      }),
    ]);

    expect(issues.map((i) => i.ruleId)).toEqual(["b.fine", "engine.site-rule-crashed"]);
    const crash = issues.find((i) => i.ruleId === "engine.site-rule-crashed");
    expect(crash?.severity).toBe("info");
    expect(crash?.message).toContain("kaboom");
    expect(crash?.pageUrl).toBe("https://x.test");
  });
});

describe("sortSiteIssues", () => {
  const draft = (
    ruleId: string,
    severity: SiteIssueDraft["severity"],
    pageUrl: string,
  ): SiteIssueDraft => ({ ruleId, severity, message: "m", pageUrl });

  it("orders by severity, then rule id, then page url", () => {
    const sorted = sortSiteIssues([
      draft("z.rule", "warning", "https://x.test/b"),
      draft("a.rule", "error", "https://x.test/b"),
      draft("a.rule", "error", "https://x.test/a"),
      draft("m.rule", "info", "https://x.test/a"),
      draft("b.rule", "warning", "https://x.test/a"),
    ]);

    expect(sorted.map((i) => `${i.severity} ${i.ruleId} ${i.pageUrl}`)).toEqual([
      "error a.rule https://x.test/a",
      "error a.rule https://x.test/b",
      "warning b.rule https://x.test/a",
      "warning z.rule https://x.test/b",
      "info m.rule https://x.test/a",
    ]);
  });

  it("is stable across repeated runs — baselines depend on it", () => {
    const input = [
      draft("a.rule", "error", "https://x.test/2"),
      draft("a.rule", "error", "https://x.test/1"),
    ];
    expect(sortSiteIssues(input)).toEqual(sortSiteIssues([...input].reverse()));
  });
});
