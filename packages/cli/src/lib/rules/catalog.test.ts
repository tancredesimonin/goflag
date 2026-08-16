import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildRuleCatalog, serialiseCatalog } from "./catalog";
import { RULES } from "./index";
import { PROSE_RULES } from "./prose";
import { SITE_PROSE_RULES } from "./site-prose";
import { SITE_RULES } from "./site-rules";
import { getSource } from "./sources";

const catalog = buildRuleCatalog("9.9.9");

describe("buildRuleCatalog", () => {
  it("carries every shipped rule, once, and nothing else", () => {
    // The whole point: a consumer reading this cannot be missing a rule the
    // engine runs, which is what a hand-written mirror cannot promise.
    const ids = catalog.rules.map((r) => r.id);
    const shipped = [...RULES, ...SITE_RULES, ...PROSE_RULES, ...SITE_PROSE_RULES].map((r) => r.id);

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
    // Both prose registries share the bucket: what the scope tells a reader
    // is that no verdict is rendered, and a fourth value would leave the
    // cross-page questions out of all three lists the site renders off it.
    expect(byScope("prose")).toBe(PROSE_RULES.length + SITE_PROSE_RULES.length);
    expect(catalog.counts).toEqual({
      page: RULES.length,
      site: SITE_RULES.length,
      prose: PROSE_RULES.length + SITE_PROSE_RULES.length,
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
    // `SiteRule` can now carry a rigor, and one rule does. The three that
    // predate the field still need their sources chosen rather than guessed,
    // and emitting null for them is how that stays visible to whoever renders
    // the catalogue — the alternative being a plausible citation nobody
    // checked.
    const site = catalog.rules.filter((r) => r.scope === "site");
    expect(site.length).toBeGreaterThan(0);

    for (const rule of site) {
      if (rule.rigor === null) {
        expect(rule.sources, `${rule.id} cites sources but declares no rigor`).toEqual([]);
      } else {
        expect(rule.sources.length, `${rule.id} claims a rigor and cites nothing`).toBeGreaterThan(
          0,
        );
      }
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

describe("rules.json", () => {
  it("matches the registry, byte for byte", () => {
    // This is the guarantee. The pre-commit hook regenerates the file when a
    // rule file is staged, but a hook can be skipped with --no-verify and this
    // cannot: a rule added without regenerating fails here, in the suite CI
    // already runs, instead of reaching a documentation site that says
    // something false for four versions.
    const here = dirname(fileURLToPath(import.meta.url));
    const committed = readFileSync(join(here, "..", "..", "..", "rules.json"), "utf8");

    expect(committed).toBe(serialiseCatalog(buildRuleCatalog()));
  });

  it("carries no version, so a release cannot make it stale", () => {
    const committed = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "rules.json"),
        "utf8",
      ),
    );
    expect(committed.version).toBeUndefined();
  });
});
