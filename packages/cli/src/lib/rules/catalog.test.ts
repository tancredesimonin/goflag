import { describe, expect, it } from "vitest";

import { buildRuleCatalog, renderCatalogMarkdown } from "./catalog";
import { RULES } from "./index";
import { PROSE_RULES } from "./prose";
import { SITE_RULES } from "./site-rules";
import { getSource } from "./sources";

const catalog = buildRuleCatalog("9.9.9");

describe("buildRuleCatalog", () => {
  it("carries every shipped rule, once, and nothing else", () => {
    // The whole point: a consumer reading this cannot be missing a rule the
    // engine runs, which is what a hand-written mirror cannot promise.
    const ids = catalog.rules.map((r) => r.id);
    const shipped = [...RULES, ...SITE_RULES, ...PROSE_RULES].map((r) => r.id);

    expect(ids.length).toBe(shipped.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...shipped].sort());
  });

  it("is ordered by id, so two versions of it diff cleanly", () => {
    const ids = catalog.rules.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it("labels every rule with the scope that decides what it may claim", () => {
    const byScope = (scope: string) => catalog.rules.filter((r) => r.scope === scope).length;
    expect(byScope("page")).toBe(RULES.length);
    expect(byScope("site")).toBe(SITE_RULES.length);
    expect(byScope("prose")).toBe(PROSE_RULES.length);
    expect(catalog.counts).toEqual({
      page: RULES.length,
      site: SITE_RULES.length,
      prose: PROSE_RULES.length,
    });
  });

  it("gives a prose rule no severity, and its question instead", () => {
    // A question that carried a severity would read as a finding, which is
    // the one thing the prose design refuses to do.
    for (const rule of catalog.rules.filter((r) => r.scope === "prose")) {
      expect(rule.severity).toBeNull();
      expect(rule.kind).toBe("prose");
      expect(rule.prose).toBeTruthy();
    }
  });

  it("gives a scored rule the severity it actually fires with", () => {
    const scored = catalog.rules.find((r) => r.kind === "scored");
    expect(scored).toBeDefined();
    expect(scored!.bands?.ideal).toBeDefined();
    expect(scored!.severity).toBe(scored!.severityByBand?.acceptable);
  });

  it("shows the cross-page gap rather than hiding it", () => {
    // `SiteRule` has no rigor field yet. Emitting null is how that stays
    // visible to whoever renders the catalogue.
    for (const rule of catalog.rules.filter((r) => r.scope === "site")) {
      expect(rule.rigor).toBeNull();
      expect(rule.sources).toEqual([]);
    }
  });

  it("exports every cited source and no uncited one", () => {
    const cited = new Set(catalog.rules.flatMap((r) => r.sources));
    expect(Object.keys(catalog.sources).sort()).toEqual([...cited].sort());
    for (const [id, doc] of Object.entries(catalog.sources)) {
      expect(doc).toEqual({
        id,
        publisher: getSource(id)!.publisher,
        title: getSource(id)!.title,
        rigor: getSource(id)!.rigor,
        url: getSource(id)!.url,
      });
    }
  });

  it("cites at least one source for every rule that carries a rigor", () => {
    for (const rule of catalog.rules) {
      if (rule.rigor === null) continue;
      expect(rule.sources.length).toBeGreaterThan(0);
    }
  });

  it("stamps the version it came out of", () => {
    expect(catalog.version).toBe("9.9.9");
  });

  it("is JSON-serialisable, since that is the whole delivery", () => {
    expect(() => JSON.parse(JSON.stringify(catalog))).not.toThrow();
  });
});

describe("renderCatalogMarkdown", () => {
  it("names every rule and links every source", () => {
    const md = renderCatalogMarkdown(catalog);
    for (const rule of catalog.rules) expect(md).toContain(`\`${rule.id}\``);
    for (const doc of Object.values(catalog.sources)) expect(md).toContain(doc.url);
  });

  it("escapes a pipe so one summary cannot break the table", () => {
    const md = renderCatalogMarkdown({
      ...catalog,
      rules: [{ ...catalog.rules[0]!, summary: "a | b" }],
    });
    expect(md).toContain("a \\| b");
  });
});
