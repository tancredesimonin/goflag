import { describe, expect, it } from "vitest";

import { deriveTranslationHoles, exitCode } from "./build";
import type { I18nMatrix } from "@/lib/core/i18n";
import type { GoflagReport } from "./types";

/** Build a matrix from a compact `{ route: { locale: hasPage } }` spec. */
function matrixFrom(spec: Record<string, Record<string, boolean>>): I18nMatrix {
  const routes = Object.keys(spec);
  const locales = [...new Set(routes.flatMap((r) => Object.keys(spec[r]!)))];
  const cells: I18nMatrix["cells"] = {};
  for (const route of routes) {
    cells[route] = {};
    for (const locale of locales) {
      const has = spec[route]?.[locale] ?? false;
      cells[route][locale] = {
        url: has ? `https://x.com/${locale}${route}` : null,
        inspected: has,
      };
    }
  }
  return { routes, locales, cells };
}

describe("deriveTranslationHoles", () => {
  it("flags a route present in one locale but missing in another", () => {
    const matrix = matrixFrom({
      "/about": { en: true, fr: false },
      "/": { en: true, fr: true },
    });
    const holes = deriveTranslationHoles(matrix);
    expect(holes).toEqual([
      expect.objectContaining({
        route: "/about",
        presentLocales: ["en"],
        missingLocales: ["fr"],
      }),
    ]);
    expect(holes[0]?.id).toMatch(/^i18n-[0-9a-f]{10}$/);
  });

  it("returns nothing when every route is fully translated", () => {
    const matrix = matrixFrom({
      "/": { en: true, fr: true },
      "/about": { en: true, fr: true },
    });
    expect(deriveTranslationHoles(matrix)).toEqual([]);
  });

  it("ignores x-default when computing holes", () => {
    const matrix = matrixFrom({
      "/about": { "x-default": true, en: true, fr: true },
    });
    // x-default present, all real locales present -> no hole even though
    // x-default is a pseudo-locale.
    expect(deriveTranslationHoles(matrix)).toEqual([]);
  });

  it("returns nothing for a single-locale site (no translations expected)", () => {
    const matrix = matrixFrom({
      "/": { en: true },
      "/about": { en: true },
    });
    expect(deriveTranslationHoles(matrix)).toEqual([]);
  });

  it("reports multiple missing locales for one route", () => {
    const matrix = matrixFrom({
      "/pricing": { en: true, fr: false, de: false },
    });
    const [hole] = deriveTranslationHoles(matrix);
    expect(hole?.missingLocales.sort()).toEqual(["de", "fr"]);
    expect(hole?.presentLocales).toEqual(["en"]);
  });
});

describe("exitCode", () => {
  const base: GoflagReport["summary"] = {
    brokenLinks: 0,
    missingTranslations: 0,
    seoIssues: 0,
    verdict: "green",
  };
  const report = (verdict: GoflagReport["summary"]["verdict"]): GoflagReport => ({
    url: "https://x.com",
    finishedAt: "2026-01-01T00:00:00.000Z",
    summary: { ...base, verdict },
    pages: [],
    brokenLinks: [],
    missingTranslations: { holes: [], reciprocity: [] },
    seoIssues: [],
    diagnostics: {
      pagesCrawled: 0,
      pagesScanned: 0,
      pagesFailed: 0,
      truncated: false,
      warnings: [],
    },
  });

  it("returns 0 for a green flag", () => {
    expect(exitCode(report("green"))).toBe(0);
  });

  it("returns 1 for yellow and red flags", () => {
    expect(exitCode(report("yellow"))).toBe(1);
    expect(exitCode(report("red"))).toBe(1);
  });
});
