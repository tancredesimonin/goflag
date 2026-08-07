import { describe, expect, it } from "vitest";

import { defineSite, type SiteInput } from "./site";

const base: SiteInput<"en-US" | "fr-FR" | "pt-BR"> = {
  baseUrl: "https://goflag.tech",
  name: "goflag",
  locales: ["en-US", "fr-FR", "pt-BR"],
  defaultLocale: "en-US",
  indexable: true,
};

describe("defineSite — the origin", () => {
  it("drops a trailing slash so no canonical can carry a double one", () => {
    expect(defineSite({ ...base, baseUrl: "https://goflag.tech/" }).baseUrl).toBe(
      "https://goflag.tech",
    );
  });

  it("keeps a port, which is how a site is audited locally", () => {
    expect(defineSite({ ...base, baseUrl: "http://localhost:3004" }).baseUrl).toBe(
      "http://localhost:3004",
    );
  });

  it("refuses anything that is not a bare http(s) origin", () => {
    // A base URL with a path doubles into every canonical the site emits, and a
    // wrong canonical is invisible until pages drop out of an index.
    expect(() => defineSite({ ...base, baseUrl: "goflag.tech" })).toThrow(/absolute URL/);
    expect(() => defineSite({ ...base, baseUrl: "ftp://goflag.tech" })).toThrow(/http or https/);
    expect(() => defineSite({ ...base, baseUrl: "https://goflag.tech/docs" })).toThrow(/no path/);
    expect(() => defineSite({ ...base, baseUrl: "https://goflag.tech/?a=1" })).toThrow(/no path/);
  });
});

describe("defineSite — the locale axis", () => {
  it("refuses a default locale it does not serve", () => {
    expect(() => defineSite({ ...base, defaultLocale: "de-DE" as "en-US" })).toThrow(
      /not in locales/,
    );
  });

  it("refuses duplicates and an empty set", () => {
    expect(() => defineSite({ ...base, locales: ["en-US", "en-US"] })).toThrow(/Duplicate/);
    expect(() => defineSite({ ...base, locales: [] as unknown as ["en-US"] })).toThrow(
      /at least one locale/,
    );
  });

  it("resolves every locale at declaration time, not on the page that renders it", () => {
    // A malformed locale should fail the build once. Deferring it means the
    // site is fine in three languages and throws in the fourth, on whichever
    // page someone happens to open.
    expect(() =>
      defineSite({ ...base, locales: ["en-US", "english" as "fr-FR"], defaultLocale: "en-US" }),
    ).toThrow(/names no language/);
  });

  it("refuses a language ICU has never heard of", () => {
    // The defect this closes: the shape was checked, the existence was not, so
    // `qq` and `xx-YZ` reached every hreflang on the site.
    expect(() =>
      defineSite({ ...base, locales: ["en-US", "qq" as "fr-FR"], defaultLocale: "en-US" }),
    ).toThrow(/names no language/);
    expect(() =>
      defineSite({ ...base, locales: ["pt-ZZ" as "en-US"], defaultLocale: "pt-ZZ" as "en-US" }),
    ).toThrow(/no region ICU knows/);
  });

  it("derives both tag forms from the locale itself", () => {
    const site = defineSite(base);

    expect(site.bcp47("pt-BR")).toBe("pt-BR");
    expect(site.openGraphLocale("pt-BR")).toBe("pt_BR");
  });

  it("canonicalises the case, so a document answers the question once", () => {
    // The site routes on `/pt-br/` and declares `hreflang="pt-BR"`. Those are
    // one tag — BCP 47 says the case carries no meaning — and the CLI folds
    // them to one identity, which is what makes emitting the canonical form
    // safe. Before that fix it manufactured a phantom locale.
    const site = defineSite({
      baseUrl: "https://stereo.house",
      name: "Stereo House",
      locales: ["en", "pt-br"],
      defaultLocale: "en",
      indexable: true,
    });

    expect(site.bcp47("pt-br")).toBe("pt-BR");
    expect(site.lang("pt-br")).toBe("pt-BR");
  });

  it("derives og:locale rather than asking for a table", () => {
    // A language with no territory used to be refused until the site supplied
    // an override, which is why both sites carried four hand-copied lines.
    // ICU's likely subtags answer it, and answer it the same way.
    const site = defineSite({
      baseUrl: "https://goflag.tech",
      name: "goflag",
      locales: ["en", "fr", "es", "pt"],
      defaultLocale: "en",
      indexable: true,
    });

    expect(site.openGraphLocale("en")).toBe("en_US");
    expect(site.openGraphLocale("fr")).toBe("fr_FR");
    expect(site.openGraphLocale("es")).toBe("es_ES");
    expect(site.openGraphLocale("pt")).toBe("pt_BR");
  });

  it("lets lang be more precise than hreflang, which is a real case", () => {
    // Brazilian Portuguese written for every Portuguese speaker: `lang`
    // describes the content, `hreflang` targets an audience, and here they
    // legitimately differ.
    const site = defineSite({
      baseUrl: "https://goflag.tech",
      name: "goflag",
      locales: ["en", "pt"],
      defaultLocale: "en",
      indexable: true,
      localeTags: { pt: { lang: "pt-BR" } },
    });

    expect(site.bcp47("pt")).toBe("pt");
    expect(site.lang("pt")).toBe("pt-BR");
    expect(site.openGraphLocale("pt")).toBe("pt_BR");
  });

  it("resolves a URL segment to the locale it means, or to nothing", () => {
    const site = defineSite({
      baseUrl: "https://goflag.tech",
      name: "goflag",
      locales: ["en", "fr", "es", "pt"],
      defaultLocale: "en",
      indexable: true,
    });

    expect(site.resolveLocale("pt-BR")).toBe("pt");
    expect(site.resolveLocale("PT")).toBe("pt");
    expect(site.resolveLocale("de")).toBeUndefined();
  });

  it("narrows an unknown string to a served locale", () => {
    const site = defineSite(base);

    expect(site.servesLocale("fr-FR")).toBe(true);
    expect(site.servesLocale("de-DE")).toBe(false);
  });
});

describe("rootMetadata", () => {
  it("carries the origin, the title template and the robots directives", () => {
    const meta = defineSite(base).rootMetadata({ description: "Flags what humans miss." });

    expect(meta.metadataBase?.toString()).toBe("https://goflag.tech/");
    expect(meta.title).toEqual({ default: "goflag", template: "%s · goflag" });
    expect(meta.robots).toEqual({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
  });

  it("asks not to be indexed wherever the deployment says so", () => {
    const meta = defineSite({ ...base, indexable: false }).rootMetadata({ description: "x" });

    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it("takes a template that does not append the product name", () => {
    const meta = defineSite(base).rootMetadata({ description: "x", titleTemplate: "%s | docs" });

    expect(meta.title).toMatchObject({ template: "%s | docs" });
  });
});
