import { describe, expect, it } from "vitest";

import { parseConfig } from "./schema";

describe("parseConfig (zod)", () => {
  it("accepts an empty object", () => {
    const result = parseConfig({});
    expect(result.ok).toBe(true);
  });

  it("accepts a fully-specified config", () => {
    const result = parseConfig({
      baseUrl: "https://example.com",
      framework: "next",
      i18n: { locales: ["en", "fr"], defaultLocale: "en", strictReciprocity: true },
      crawl: { enabled: true, depth: 2, include: ["/blog/**"], concurrency: 4, maxPages: 100 },
      rules: { "title.length": "off", "meta.description.present": { severity: "warn" } },
      normalize: [{ path: "$.fetch.requestedUrl", strategy: "redact" }],
      snapshot: { dir: ".headlint/snapshots" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects baseUrl that isn't an absolute http(s) URL", () => {
    const result = parseConfig({ baseUrl: "not-a-url" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("baseUrl"))).toBe(true);
      expect(result.errors.some((e) => e.includes("absolute http(s)"))).toBe(true);
    }
  });

  it("rejects unknown framework slugs", () => {
    const result = parseConfig({ framework: "polymer" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("framework"))).toBe(true);
    }
  });

  it("rejects malformed BCP 47 locale tags with a helpful pointer", () => {
    const result = parseConfig({ i18n: { locales: ["english"] } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("i18n.locales.0"))).toBe(true);
      expect(result.errors.some((e) => e.includes("BCP 47"))).toBe(true);
    }
  });

  it("rejects empty locales arrays", () => {
    const result = parseConfig({ i18n: { locales: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("locales"))).toBe(true);
    }
  });

  it.each([-1, 11, 1.5])("rejects crawl.depth = %s", (depth) => {
    const result = parseConfig({ crawl: { depth } });
    expect(result.ok).toBe(false);
  });

  it.each(["off", "warn", "error", "info"] as const)("accepts rule shorthand `%s`", (sev) => {
    const result = parseConfig({ rules: { "title.length": sev } });
    expect(result.ok).toBe(true);
  });

  it("accepts the object form for rule settings (with options)", () => {
    const result = parseConfig({
      rules: {
        "title.length": { severity: "warn", options: { max: 80, min: 20 } },
      },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown severity values for the rule shorthand", () => {
    const result = parseConfig({ rules: { "title.length": "loud" } });
    expect(result.ok).toBe(false);
  });

  it("rejects normalize entries missing a strategy", () => {
    const result = parseConfig({ normalize: [{ path: "$.foo" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("normalize.0.strategy"))).toBe(true);
    }
  });
});
