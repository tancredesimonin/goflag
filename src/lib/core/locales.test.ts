import { describe, expect, it } from "vitest";

import { deriveLocaleAxis, localePrefixOf } from "./locales";

describe("localePrefixOf", () => {
  it("reads the leading path segment when it looks like a locale", () => {
    expect(localePrefixOf("https://x.test/fr/about")).toBe("fr");
    expect(localePrefixOf("https://x.test/pt-br")).toBe("pt-br");
    expect(localePrefixOf("https://x.test/en-US/blog")).toBe("en-us");
  });

  it("returns null for unprefixed and non-locale segments", () => {
    expect(localePrefixOf("https://x.test/")).toBeNull();
    expect(localePrefixOf("https://x.test/about")).toBeNull();
    // `blog` is 4 letters — outside BCP 47's 2–3 letter primary subtag, so it
    // must not be mistaken for a locale. This is what keeps `/blog/post` from
    // inventing a "blog" column in the matrix.
    expect(localePrefixOf("https://x.test/blog/post")).toBeNull();
  });

  it("returns null rather than throwing on a malformed URL", () => {
    expect(localePrefixOf("not a url")).toBeNull();
  });
});

describe("deriveLocaleAxis", () => {
  it("is monolingual when nothing suggests a second locale", () => {
    const axis = deriveLocaleAxis({ crawledUrls: ["https://x.test/", "https://x.test/about"] });
    expect(axis.locales).toEqual([]);
    expect(axis.multilingual).toBe(false);
  });

  it("finds locales the crawl never reached, from the sitemap alone", () => {
    // The core fix: the crawl only ever saw `/en`, but the sitemap names the
    // rest. Deriving the axis from the sitemap is what stops a site with no
    // hreflang from looking monolingual.
    const axis = deriveLocaleAxis({
      crawledUrls: ["https://x.test/en", "https://x.test/en/about"],
      sitemapUrls: ["https://x.test/en", "https://x.test/fr", "https://x.test/pt-br"],
    });
    expect(axis.locales).toEqual(["en", "fr", "pt-br"]);
    expect(axis.source).toBe("sitemap");
    expect(axis.multilingual).toBe(true);
  });

  it("unions the sources rather than taking only the strongest", () => {
    const axis = deriveLocaleAxis({
      sitemapUrls: ["https://x.test/en"],
      crawledUrls: ["https://x.test/de/impressum"],
    });
    expect(axis.locales).toEqual(["de", "en"]);
  });

  it("reports `explicit` as the source whenever the operator supplied locales", () => {
    const axis = deriveLocaleAxis({
      explicit: ["fr", "en"],
      sitemapUrls: ["https://x.test/es"],
    });
    expect(axis.source).toBe("explicit");
    // Still a union: an explicit list narrows intent, it does not hide what
    // the site demonstrably serves.
    expect(axis.locales).toEqual(["en", "es", "fr"]);
  });

  it("normalises case and whitespace in explicit locales", () => {
    const axis = deriveLocaleAxis({ explicit: [" FR ", "pt-BR"] });
    expect(axis.locales).toEqual(["fr", "pt-br"]);
  });

  it("never lets x-default onto the axis", () => {
    // `x-default` is a fallback pointer, not a locale a page can be missing a
    // translation in; on the axis it would make every unprefixed route a hole.
    const axis = deriveLocaleAxis({ explicit: ["x-default", "fr", "en"] });
    expect(axis.locales).toEqual(["en", "fr"]);
  });

  it("needs two distinct locales before calling a site multilingual", () => {
    const axis = deriveLocaleAxis({ sitemapUrls: ["https://x.test/en", "https://x.test/en/a"] });
    expect(axis.locales).toEqual(["en"]);
    expect(axis.multilingual).toBe(false);
  });

  it("ignores unparseable URLs instead of failing the audit", () => {
    const axis = deriveLocaleAxis({ sitemapUrls: ["://broken", "https://x.test/fr"] });
    expect(axis.locales).toEqual(["fr"]);
  });
});
