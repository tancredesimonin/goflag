import { describe, expect, it } from "vitest";

import { buildI18nMatrix, isValidLocale, localeIdentity, reciprocityIssues } from "./i18n";
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
    expect(isValidLocale("x-default")).toBe(true);
    expect(isValidLocale("english")).toBe(false);
  });

  it("is case-insensitive (hreflang/lang are per the HTML spec)", () => {
    // Real-world tags that were false positives before the fix.
    expect(isValidLocale("pt-br")).toBe(true);
    expect(isValidLocale("pt-BR")).toBe(true);
    expect(isValidLocale("en-us")).toBe(true);
    expect(isValidLocale("FR")).toBe(true);
  });

  it("accepts a script subtag, which the shape check used to reject", () => {
    // The rule fired on every Chinese and Serbian site it audited. Rejecting
    // a valid tag is the failure mode an auditor can least afford, and it is
    // why the check asks ICU rather than a regex (plan §B.5).
    expect(isValidLocale("zh-Hant")).toBe(true);
    expect(isValidLocale("zh-Hant-TW")).toBe(true);
    expect(isValidLocale("sr-Latn-RS")).toBe(true);
  });

  it("rejects a tag whose language, region or script does not exist", () => {
    // The other half of §B.5: the shape check passed all of these, so a rule
    // named `locale.invalid` was silent on the tags it exists to catch.
    expect(isValidLocale("qq")).toBe(false);
    expect(isValidLocale("xx-YZ")).toBe(false);
    expect(isValidLocale("pt-ZZ")).toBe(false); // ZZ is CLDR's *unknown* region
    expect(isValidLocale("pt-XA")).toBe(false); // ICU pseudo-locale
    expect(isValidLocale("fr-Zzzz")).toBe(false);
  });

  it("rejects a tag that names no audience", () => {
    expect(isValidLocale("und")).toBe(false);
    expect(isValidLocale("zxx")).toBe(false);
    expect(isValidLocale("mul")).toBe(false);
    expect(isValidLocale("")).toBe(false);
  });

  it("rejects malformed structure, underscore included", () => {
    // `pt_BR` is the malformation that actually shows up in the wild.
    expect(isValidLocale("pt_BR")).toBe(false);
    expect(isValidLocale("en--US")).toBe(false);
  });

  it("keeps the macro-regions Google documents", () => {
    expect(isValidLocale("es-419")).toBe(true);
  });
});

describe("buildI18nMatrix — a site that translates its slugs", () => {
  const CLUSTER = [
    { hreflang: "en", href: "https://x.com/en/pricing" },
    { hreflang: "fr", href: "https://x.com/fr/tarifs" },
    { hreflang: "x-default", href: "https://x.com/en/pricing" },
  ];
  const pages = [
    localePage("https://x.com/en/pricing", CLUSTER),
    localePage("https://x.com/fr/tarifs", CLUSTER),
  ];
  const declaredUrls = ["https://x.com/en/pricing", "https://x.com/fr/tarifs"];

  it("splits the pair into two rows when nothing declares the cluster", () => {
    // The defect, pinned: two rows for one page, each filled in one locale,
    // on a pair whose hreflang is fully reciprocal.
    const matrix = buildI18nMatrix(pages, { declaredUrls, locales: ["en", "fr"] });

    expect(matrix.routes).toContain("/pricing");
    expect(matrix.routes).toContain("/tarifs");
    expect(matrix.cells["/pricing"]?.fr?.url).toBeNull();
    expect(matrix.cells["/tarifs"]?.en?.url).toBeNull();
  });

  it("puts the pair in one row when the sitemap declared the cluster", () => {
    const matrix = buildI18nMatrix(pages, {
      declaredUrls,
      locales: ["en", "fr"],
      clusterRouteOf: (url) =>
        url.startsWith("https://x.com/en/pricing") || url.startsWith("https://x.com/fr/tarifs")
          ? "/pricing"
          : undefined,
    });

    expect(matrix.routes).not.toContain("/tarifs");
    expect(matrix.cells["/pricing"]?.en?.url).toBe("https://x.com/en/pricing");
    expect(matrix.cells["/pricing"]?.fr?.url).toBe("https://x.com/fr/tarifs");
  });

  it("leaves a route alone when the declaration does not cover it", () => {
    // A cluster index answers `undefined` for everything the site did not
    // declare, and those rows keep the pathname behaviour exactly.
    const matrix = buildI18nMatrix(pages, {
      declaredUrls,
      locales: ["en", "fr"],
      clusterRouteOf: () => undefined,
    });

    expect(matrix.routes).toContain("/pricing");
    expect(matrix.routes).toContain("/tarifs");
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

  it("does not flag lowercase-region tags like pt-br as invalid", () => {
    const pages = [
      localePage("https://x.com/pt-br/about", [
        { hreflang: "pt-br", href: "https://x.com/pt-br/about" },
        { hreflang: "en", href: "https://x.com/en/about" },
      ]),
    ];
    expect(reciprocityIssues(pages).filter((i) => i.code === "locale.invalid")).toEqual([]);
  });

  it("collapses duplicate findings from repeated hreflang tags", () => {
    const pages = [
      localePage("https://x.com/fr/about", [
        { hreflang: "ENGLISH", href: "https://x.com/en/about" },
        { hreflang: "ENGLISH", href: "https://x.com/en/about" },
      ]),
    ];
    const issues = reciprocityIssues(pages).filter((i) => i.code === "locale.invalid");
    expect(issues).toHaveLength(1);
  });
});

describe("locale identity is case-folded", () => {
  it("folds a tag to one key whatever case it was written in", () => {
    expect(localeIdentity("pt-BR")).toBe("pt-br");
    expect(localeIdentity("PT-br")).toBe("pt-br");
    expect(localeIdentity(" FR ")).toBe("fr");
  });

  it("gives one column to a site whose URLs and tags differ only in case", () => {
    // The defect this covers, and it is the default output of Next plus
    // next-intl: lowercase URL segments, canonically-cased hreflang. The
    // matrix used to key on the raw string, so `/pt-br/` and `hreflang="pt-BR"`
    // became two columns for one language — and every route in the second one
    // reported a translation hole in a language the site already served.
    const pages = [
      localePage("https://s.test/en/about", [
        { hreflang: "en", href: "https://s.test/en/about" },
        { hreflang: "pt-BR", href: "https://s.test/pt-br/about" },
      ]),
      localePage("https://s.test/pt-br/about", [
        { hreflang: "en", href: "https://s.test/en/about" },
        { hreflang: "pt-BR", href: "https://s.test/pt-br/about" },
      ]),
    ];

    const matrix = buildI18nMatrix(pages);

    expect(matrix.locales).toEqual(["en", "pt-br"]);
    expect(matrix.cells["/about"]?.["pt-br"]?.url).toBe("https://s.test/pt-br/about");
    expect(matrix.cells["/about"]?.["pt-BR"]).toBeUndefined();
  });

  it("does not invent a hole when only the case differs", () => {
    // The symptom as it reached a report: "missing es, fr, pt-br, pt-BR".
    const pages = [
      localePage("https://s.test/pt-br/", [{ hreflang: "pt-BR", href: "https://s.test/pt-br/" }]),
    ];

    const matrix = buildI18nMatrix(pages, { locales: ["en", "pt-br"] });
    const row = matrix.cells["/"] ?? {};

    expect(Object.keys(row).sort()).toEqual(["en", "pt-br"]);
    expect(row["pt-br"]?.url).toBe("https://s.test/pt-br/");
  });

  it("folds an explicit --locales list the same way", () => {
    const matrix = buildI18nMatrix([], { locales: ["EN", "pt-BR"] });

    expect(matrix.locales).toEqual(["en", "pt-br"]);
  });

  it("reports a rejected tag as the page wrote it, not as we folded it", () => {
    // Folding is for identity. A finding about an invalid tag must quote the
    // site, or it judges what we altered rather than what was declared.
    const [issue] = reciprocityIssues([
      localePage("https://s.test/en/", [{ hreflang: "ENGLISH", href: "https://s.test/en/" }]),
    ]);

    expect(issue?.code).toBe("locale.invalid");
    expect(issue?.message).toContain('hreflang="ENGLISH"');
    expect(issue?.locale).toBe("ENGLISH");
  });
});
