import { describe, expect, it } from "vitest";

import { categoryOf, getRule, RULES, rulesByCategory } from "@/lib/rules";

describe("rule registry", () => {
  it("exposes the expected number of rules", () => {
    expect(RULES.length).toBe(25);
  });

  it("is alphabetical by id", () => {
    const ids = RULES.map((r) => r.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("has unique rule ids", () => {
    const seen = new Set<string>();
    for (const r of RULES) {
      expect(seen.has(r.id), `Duplicate rule id: ${r.id}`).toBe(false);
      seen.add(r.id);
    }
  });

  it("getRule returns the right rule", () => {
    expect(getRule("title.missing")?.id).toBe("title.missing");
    expect(getRule("does.not.exist")).toBeUndefined();
  });

  it("buckets rule ids into the right category", () => {
    expect(categoryOf("title.missing")).toBe("core");
    expect(categoryOf("description.length")).toBe("core");
    expect(categoryOf("og.image.missing")).toBe("open-graph");
    expect(categoryOf("twitter.card.missing")).toBe("twitter");
    expect(categoryOf("hreflang.x-default")).toBe("i18n");
    expect(categoryOf("lang.missing")).toBe("i18n");
    expect(categoryOf("favicon.sizes")).toBe("icons");
    expect(categoryOf("manifest.missing")).toBe("manifest");
    expect(categoryOf("robots.conflict")).toBe("robots");
  });

  it("rulesByCategory partitions all rules into a category", () => {
    const grouped = rulesByCategory();
    const total = Object.values(grouped).reduce((sum, b) => sum + b.length, 0);
    expect(total).toBe(RULES.length);
    expect(grouped.core.length).toBeGreaterThan(0);
    expect(grouped["open-graph"].length).toBeGreaterThan(0);
    expect(grouped.twitter.length).toBeGreaterThan(0);
  });

  it("every rule has non-empty docs.summary and docs.rationale", () => {
    for (const r of RULES) {
      expect(r.docs.summary.length).toBeGreaterThan(0);
      expect(r.docs.rationale.length).toBeGreaterThan(20);
    }
  });
});
