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
    ).toThrow(/not a language tag/);
  });

  it("derives both tag forms from the locale itself", () => {
    const site = defineSite(base);

    expect(site.bcp47("pt-BR")).toBe("pt-BR");
    expect(site.openGraphLocale("pt-BR")).toBe("pt_BR");
  });

  it("emits hreflang exactly as declared, validated but not re-cased", () => {
    // Found by migrating a site whose URLs are `/pt-br/`. Re-casing the tag to
    // `pt-BR` made goflag see two locales where there is one and report a
    // translation hole for a language already served. BCP 47 is
    // case-insensitive; the site's own spelling is the one that matches its
    // URLs, so it is the one that ships.
    const site = defineSite({
      baseUrl: "https://stereo.house",
      name: "Stereo House",
      locales: ["en", "pt-br"],
      defaultLocale: "en",
      indexable: true,
      localeTags: { en: { openGraph: "en_US" } },
    });

    expect(site.bcp47("pt-br")).toBe("pt-br");
    // og:locale has no such freedom: ogp.me defines one shape, so it is derived.
    expect(site.openGraphLocale("pt-br")).toBe("pt_BR");
  });

  it("takes overrides where deriving would be guessing", () => {
    // A site whose routing calls the locale `pt-br` still owes hreflang the
    // canonical case and og:locale an underscore. The overrides are for the
    // other direction: a bare `en` that means en-US on this site and nothing in
    // particular anywhere else.
    const site = defineSite({
      baseUrl: "https://goflag.tech",
      name: "goflag",
      locales: ["en", "pt-br"],
      defaultLocale: "en",
      indexable: true,
      localeTags: { en: { bcp47: "en-US", openGraph: "en_US" } },
    });

    expect(site.bcp47("en")).toBe("en-US");
    expect(site.openGraphLocale("en")).toBe("en_US");
    expect(site.bcp47("pt-br")).toBe("pt-br");
    expect(site.openGraphLocale("pt-br")).toBe("pt_BR");
  });

  it("refuses a territoryless locale rather than inventing one for og:locale", () => {
    expect(() =>
      defineSite({
        baseUrl: "https://goflag.tech",
        name: "goflag",
        locales: ["en"],
        defaultLocale: "en",
        indexable: true,
      }),
    ).toThrow(/no territory/);
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
