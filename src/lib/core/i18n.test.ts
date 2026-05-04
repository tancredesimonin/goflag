import { describe, expect, it } from "vitest";

import { buildI18nMatrix, isValidLocale, reciprocityIssues } from "./i18n";
import { pageFromHtml } from "@/lib/rules/test-utils";

function localePage(
  url: string,
  alternates: Array<{ hreflang: string; href: string }>,
): ReturnType<typeof pageFromHtml> {
  const links = alternates
    .map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`)
    .join("\n        ");
  return pageFromHtml(`<html><head>${links}</head><body></body></html>`, { url });
}

describe("isValidLocale", () => {
  it("accepts BCP 47 basics + x-default", () => {
    expect(isValidLocale("fr")).toBe(true);
    expect(isValidLocale("en-US")).toBe(true);
    expect(isValidLocale("zh-Hant")).toBe(false); // we deliberately reject script subtags in v1
    expect(isValidLocale("x-default")).toBe(true);
    expect(isValidLocale("FR")).toBe(false);
    expect(isValidLocale("english")).toBe(false);
  });
});

describe("buildI18nMatrix", () => {
  it("derives routes by stripping the leading locale segment", () => {
    const pages = [
      localePage("https://x.com/fr/about", [
        { hreflang: "fr", href: "https://x.com/fr/about" },
        { hreflang: "en", href: "https://x.com/en/about" },
        { hreflang: "x-default", href: "https://x.com/about" },
      ]),
      localePage("https://x.com/en/about", [
        { hreflang: "fr", href: "https://x.com/fr/about" },
        { hreflang: "en", href: "https://x.com/en/about" },
        { hreflang: "x-default", href: "https://x.com/about" },
      ]),
    ];
    const matrix = buildI18nMatrix(pages);
    expect(matrix.routes).toEqual(["/about"]);
    expect(matrix.locales[0]).toBe("x-default");
    expect(matrix.locales).toContain("fr");
    expect(matrix.locales).toContain("en");
    expect(matrix.cells["/about"]!.fr!.url).toBe("https://x.com/fr/about");
    expect(matrix.cells["/about"]!.fr!.inspected).toBe(true);
    expect(matrix.cells["/about"]!["x-default"]!.url).toBe("https://x.com/about");
    expect(matrix.cells["/about"]!["x-default"]!.inspected).toBe(false);
  });

  it("treats unprefixed pages as x-default and missing alternates as null cells", () => {
    const pages = [localePage("https://x.com/about", [])];
    const matrix = buildI18nMatrix(pages);
    expect(matrix.locales).toEqual(["x-default"]);
    expect(matrix.routes).toEqual(["/about"]);
    expect(matrix.cells["/about"]!["x-default"]!.url).toBe("https://x.com/about");
  });
});

describe("reciprocityIssues", () => {
  it("flags missing back links when the peer was crawled but doesn't link back", () => {
    const pages = [
      localePage("https://x.com/fr/about", [
        { hreflang: "fr", href: "https://x.com/fr/about" },
        { hreflang: "en", href: "https://x.com/en/about" },
        { hreflang: "x-default", href: "https://x.com/about" },
      ]),
      // /en/about does NOT link back to /fr/about — broken cluster.
      localePage("https://x.com/en/about", [
        { hreflang: "en", href: "https://x.com/en/about" },
        { hreflang: "x-default", href: "https://x.com/about" },
      ]),
    ];
    const issues = reciprocityIssues(pages);
    const missing = issues.filter((i) => i.code === "missing-back-link");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.url).toBe("https://x.com/fr/about");
    expect(missing[0]!.peerUrl).toBe("https://x.com/en/about");
  });

  it("does not fire reciprocity when the peer was not crawled (silent on partial crawls)", () => {
    const pages = [
      localePage("https://x.com/fr/about", [
        { hreflang: "fr", href: "https://x.com/fr/about" },
        { hreflang: "en", href: "https://x.com/en/about" },
      ]),
    ];
    expect(reciprocityIssues(pages).filter((i) => i.code === "missing-back-link")).toEqual([]);
  });

  it("emits x-default-missing once per page when 2+ locales are present without it", () => {
    const pages = [
      localePage("https://x.com/fr/about", [
        { hreflang: "fr", href: "https://x.com/fr/about" },
        { hreflang: "en", href: "https://x.com/en/about" },
      ]),
    ];
    const issues = reciprocityIssues(pages).filter((i) => i.code === "x-default-missing");
    expect(issues).toHaveLength(1);
  });

  it("flags malformed locale codes as locale.invalid", () => {
    const pages = [
      localePage("https://x.com/fr/about", [
        { hreflang: "ENGLISH", href: "https://x.com/en/about" },
      ]),
    ];
    const issues = reciprocityIssues(pages).filter((i) => i.code === "locale.invalid");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.locale).toBe("ENGLISH");
  });
});
