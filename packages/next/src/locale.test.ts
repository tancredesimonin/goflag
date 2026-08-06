import { describe, expect, it } from "vitest";

import { regionOf, toBcp47, toOpenGraphLocale } from "./locale";

describe("toBcp47", () => {
  it("canonicalises case: language lower, script title, region upper", () => {
    expect(toBcp47("pt-br")).toBe("pt-BR");
    expect(toBcp47("EN-us")).toBe("en-US");
    expect(toBcp47("zh-hant-tw")).toBe("zh-Hant-TW");
  });

  it("leaves an already-canonical tag alone", () => {
    for (const tag of ["en", "fr-FR", "pt-BR", "zh-Hant-TW", "es-419"]) {
      expect(toBcp47(tag)).toBe(tag);
    }
  });

  it("accepts a numeric region", () => {
    expect(toBcp47("es-419")).toBe("es-419");
  });

  it("refuses what it cannot normalise rather than passing it through", () => {
    // `locale.invalid` is a rule because these reach production: a directory
    // name, a filename, a display label. Emitting them as hreflang would be
    // this library laundering a bad value into a tag that looks official.
    for (const tag of ["", "e", "english", "en_US", "en-", "-en", "fr/FR", "en US"]) {
      expect(() => toBcp47(tag), `${JSON.stringify(tag)} should be refused`).toThrow(
        /not a language tag/,
      );
    }
  });
});

describe("regionOf", () => {
  it("finds the region subtag, with or without a script", () => {
    expect(regionOf("pt-br")).toBe("BR");
    expect(regionOf("zh-Hant-TW")).toBe("TW");
    expect(regionOf("es-419")).toBe("419");
  });

  it("returns nothing for a bare language", () => {
    expect(regionOf("en")).toBeUndefined();
    expect(regionOf("zh-Hant")).toBeUndefined();
  });
});

describe("toOpenGraphLocale", () => {
  it("joins language and territory with an underscore", () => {
    expect(toOpenGraphLocale("pt-br")).toBe("pt_BR");
    expect(toOpenGraphLocale("zh-Hant-TW")).toBe("zh_TW");
  });

  it("refuses a bare language instead of guessing a territory", () => {
    // og:locale is defined as language_TERRITORY. Emitting `en` invents a value
    // ogp.me does not describe; picking `en_US` decides the site serves
    // Americans. The error names the one-line fix instead.
    expect(() => toOpenGraphLocale("en")).toThrow(/no territory/);
    expect(() => toOpenGraphLocale("en")).toThrow(/localeTags/);
  });
});
