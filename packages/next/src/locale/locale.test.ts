import { describe, expect, it } from "vitest";

import { isLanguage, isRegion, localeIdentity, lookup, toBcp47, toOpenGraphLocale } from "./index";

describe("existence, answered by ICU", () => {
  it("knows a real language from an invented one", () => {
    expect(isLanguage("fr")).toBe(true);
    expect(isLanguage("pt")).toBe(true);
    expect(isLanguage("qq")).toBe(false);
    expect(isLanguage("xx")).toBe(false);
  });

  it("knows a real region from an invented one", () => {
    expect(isRegion("BR")).toBe(true);
    expect(isRegion("US")).toBe(true);
    expect(isRegion("YZ")).toBe(false);
  });

  it('refuses "ZZ", which ICU answers for but means "unknown"', () => {
    // Found by probing, not by reasoning: `DisplayNames.of("ZZ")` returns
    // "Unknown Region" rather than undefined, so trusting ICU alone would have
    // accepted `pt-ZZ` — the exact tag this library exists to refuse.
    expect(isRegion("ZZ")).toBe(false);
    expect(() => toBcp47("pt-ZZ")).toThrow(/no region ICU knows/);
  });

  it("refuses the codes that mean 'not a language'", () => {
    expect(isLanguage("mul")).toBe(false);
    expect(isLanguage("zxx")).toBe(false);
    expect(isLanguage("und")).toBe(false);
  });

  it("keeps the macro-regions that are real", () => {
    // Google documents `es-419`, and the EU is an exceptionally reserved code.
    expect(isRegion("419")).toBe(true);
    expect(isRegion("EU")).toBe(true);
  });
});

describe("toBcp47", () => {
  it("canonicalises the case, so one document answers once", () => {
    expect(toBcp47("pt-br")).toBe("pt-BR");
    expect(toBcp47("EN-us")).toBe("en-US");
    expect(toBcp47("FR")).toBe("fr");
  });

  it("leaves a language-only tag alone", () => {
    expect(toBcp47("pt")).toBe("pt");
    expect(toBcp47("en")).toBe("en");
  });

  it("refuses a tag naming no language, however well-formed", () => {
    expect(() => toBcp47("qq")).toThrow(/names no language/);
    expect(() => toBcp47("xx-YZ")).toThrow(/names no language/);
  });

  it("refuses what is not a language tag at all", () => {
    for (const tag of ["", "english", "en_US", "fr/FR"]) {
      expect(() => toBcp47(tag), `${JSON.stringify(tag)} should be refused`).toThrow();
    }
  });

  it("refuses a script subtag, and says so rather than dropping it", () => {
    // Out of scope in v1 because no site here serves such a locale. Silently
    // discarding the subtag would emit a tag the site did not ask for.
    expect(() => toBcp47("zh-Hant")).toThrow(/script subtag/);
  });
});

describe("toOpenGraphLocale", () => {
  it("completes a language with the region CLDR calls likely", () => {
    // These four are exactly the tables both sites had written by hand.
    expect(toOpenGraphLocale("en")).toBe("en_US");
    expect(toOpenGraphLocale("fr")).toBe("fr_FR");
    expect(toOpenGraphLocale("es")).toBe("es_ES");
    expect(toOpenGraphLocale("pt")).toBe("pt_BR");
  });

  it("keeps a region the tag already carries", () => {
    expect(toOpenGraphLocale("pt-br")).toBe("pt_BR");
    expect(toOpenGraphLocale("en-GB")).toBe("en_GB");
  });
});

describe("localeIdentity", () => {
  it("folds case, because BCP 47 says the case carries no meaning", () => {
    expect(localeIdentity("pt-BR")).toBe("pt-br");
    expect(localeIdentity(" FR ")).toBe("fr");
  });
});

describe("lookup — RFC 4647 §3.4", () => {
  const served = ["en", "fr", "es", "pt"];

  it("truncates subtags from the right until something matches", () => {
    expect(lookup("pt-BR", served)).toBe("pt");
    expect(lookup("en-US", served)).toBe("en");
    expect(lookup("fr-CA", served)).toBe("fr");
  });

  it("folds case on the way", () => {
    expect(lookup("PT", served)).toBe("pt");
    expect(lookup("pt-br", served)).toBe("pt");
  });

  it("returns an exact match unchanged", () => {
    expect(lookup("pt", served)).toBe("pt");
  });

  it("never falls back to a default", () => {
    // The failure this guards: resolving an unserved language to the default
    // turns every two-letter segment into a soft 404 — `/de/`, `/it/`, `/ru/`
    // all answering 200 with English.
    expect(lookup("de", served)).toBeUndefined();
    expect(lookup("it", served)).toBeUndefined();
    expect(lookup("de-DE", served)).toBeUndefined();
  });

  it("finds the one regional variant a site serves, from a bare language", () => {
    // Strict Lookup only truncates; this is the other direction, and it is why
    // a site serving `pt-BR` alone still answers for `/pt/`.
    expect(lookup("pt", ["en", "pt-BR"])).toBe("pt-BR");
  });

  it("refuses to choose when a site serves two variants of one language", () => {
    // `/pt/` against both pt-BR and pt-PT is a guess about which audience the
    // visitor belongs to. The site must answer that, not this.
    expect(lookup("pt", ["pt-BR", "pt-PT"])).toBeUndefined();
  });
});
