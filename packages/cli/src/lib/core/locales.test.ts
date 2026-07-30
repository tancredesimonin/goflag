import { describe, expect, it } from "vitest";

import { deriveLocaleAxis, isKnownLanguageTag, localePrefixOf, suggestedLocales } from "./locales";
import { pageFromHtml } from "../rules/test-utils";

/** A page at `url` declaring `<html lang>`, the cross-check the axis relies on. */
function page(url: string, lang?: string) {
  const attr = lang ? ` lang="${lang}"` : "";
  return pageFromHtml(`<html${attr}><head><title>t</title></head><body>b</body></html>`, { url });
}

describe("localePrefixOf", () => {
  it("reads a locale-shaped leading segment", () => {
    expect(localePrefixOf("https://x.test/fr/about")).toBe("fr");
    expect(localePrefixOf("https://x.test/pt-br")).toBe("pt-br");
    expect(localePrefixOf("https://x.test/en-US/blog")).toBe("en-us");
  });

  it("returns null for unprefixed paths and longer segments", () => {
    expect(localePrefixOf("https://x.test/")).toBeNull();
    expect(localePrefixOf("https://x.test/about")).toBeNull();
    expect(localePrefixOf("https://x.test/blog/post")).toBeNull();
  });

  it("returns null rather than throwing on a malformed URL", () => {
    expect(localePrefixOf("not a url")).toBeNull();
  });
});

describe("isKnownLanguageTag", () => {
  it("accepts registered ISO 639-1 languages, including their region form", () => {
    expect(isKnownLanguageTag("fr")).toBe(true);
    expect(isKnownLanguageTag("pt-br")).toBe(true);
    // Chuvash. Real language, and exactly why shape alone is not enough:
    // `/cv` on a CV page looks identical to a Chuvash edition.
    expect(isKnownLanguageTag("cv")).toBe(true);
  });

  it("rejects locale-shaped route segments", () => {
    for (const tag of ["api", "faq", "doc", "cms", "app"]) {
      expect(isKnownLanguageTag(tag)).toBe(false);
    }
  });
});

describe("deriveLocaleAxis — declared sources", () => {
  it("takes an explicit --locales list as authoritative", () => {
    const axis = deriveLocaleAxis({ explicit: ["fr", "en"] });
    expect(axis.source).toBe("explicit");
    expect(axis.locales).toEqual(["en", "fr"]);
    expect(axis.multilingual).toBe(true);
    expect(axis.candidates).toEqual([]);
  });

  it("finds locales the crawl never reached, from the sitemap alone", () => {
    // The phase 1 fix: the crawl only saw `/en`, the sitemap names the rest.
    const axis = deriveLocaleAxis({
      sitemapUrls: ["https://x.test/en", "https://x.test/fr", "https://x.test/pt-br"],
      pages: [page("https://x.test/en", "en")],
    });
    expect(axis.source).toBe("sitemap");
    expect(axis.locales).toEqual(["en", "fr", "pt-br"]);
    expect(axis.multilingual).toBe(true);
  });

  it("unions explicit and sitemap rather than letting one hide the other", () => {
    const axis = deriveLocaleAxis({
      explicit: ["fr", "en"],
      sitemapUrls: ["https://x.test/es"],
    });
    expect(axis.source).toBe("explicit");
    expect(axis.locales).toEqual(["en", "es", "fr"]);
  });

  it("normalises case and whitespace, and never admits x-default", () => {
    const axis = deriveLocaleAxis({ explicit: [" FR ", "pt-BR", "x-default"] });
    expect(axis.locales).toEqual(["fr", "pt-br"]);
  });

  it("needs two locales before calling a site multilingual", () => {
    const axis = deriveLocaleAxis({ sitemapUrls: ["https://x.test/en", "https://x.test/en/a"] });
    expect(axis.locales).toEqual(["en"]);
    expect(axis.multilingual).toBe(false);
  });
});

describe("deriveLocaleAxis — nothing declared", () => {
  it("refuses to invent an axis, and gates the hreflang rules off", () => {
    const axis = deriveLocaleAxis({
      pages: [page("https://x.test/fr", "fr"), page("https://x.test/en", "en")],
    });
    expect(axis.source).toBe("none");
    expect(axis.locales).toEqual([]);
    expect(axis.multilingual).toBe(false);
  });

  it("reports what it saw so the operator can decide", () => {
    const axis = deriveLocaleAxis({
      pages: [page("https://x.test/fr", "fr"), page("https://x.test/en", "en")],
    });
    expect(axis.candidates.map((c) => c.tag).sort()).toEqual(["en", "fr"]);
    expect(axis.candidates.every((c) => c.isKnownLanguage)).toBe(true);
    expect(axis.candidates.every((c) => c.htmlLangAgrees)).toBe(true);
  });

  it("marks a route segment whose pages declare a different language", () => {
    // tancrede.eu: `/cv` is a CV page served in French. `cv` is a valid ISO
    // 639-1 code (Chuvash), so only the `<html lang>` cross-check can tell
    // them apart — and getting this wrong produced 31 phantom holes.
    const axis = deriveLocaleAxis({
      pages: [
        page("https://x.test/fr", "fr"),
        page("https://x.test/en", "en"),
        page("https://x.test/cv", "fr"),
      ],
    });

    const cv = axis.candidates.find((c) => c.tag === "cv");
    expect(cv?.isKnownLanguage).toBe(true);
    expect(cv?.htmlLangAgrees).toBe(false);
    expect(cv?.observedLangs).toEqual(["fr"]);
  });

  it("leaves htmlLangAgrees undefined when no page declares a lang", () => {
    const axis = deriveLocaleAxis({ pages: [page("https://x.test/fr")] });
    expect(axis.candidates[0]?.htmlLangAgrees).toBeUndefined();
    expect(axis.candidates[0]?.observedLangs).toEqual([]);
  });

  it("ranks the most plausible candidates first", () => {
    const axis = deriveLocaleAxis({
      pages: [
        page("https://x.test/api/v1", "en"),
        page("https://x.test/cv", "fr"),
        page("https://x.test/fr", "fr"),
      ],
    });
    expect(axis.candidates.map((c) => c.tag)).toEqual(["fr", "cv", "api"]);
  });
});

describe("suggestedLocales", () => {
  it("proposes only tags that are languages and whose lang agrees", () => {
    const axis = deriveLocaleAxis({
      pages: [
        page("https://x.test/fr", "fr"),
        page("https://x.test/en", "en"),
        page("https://x.test/cv", "fr"),
        page("https://x.test/api", "en"),
      ],
    });
    expect(suggestedLocales(axis)).toBe("en,fr");
  });

  it("suggests nothing when fewer than two candidates hold up", () => {
    const axis = deriveLocaleAxis({
      pages: [page("https://x.test/fr", "fr"), page("https://x.test/cv", "fr")],
    });
    expect(suggestedLocales(axis)).toBeNull();
  });

  it("suggests nothing once an axis is already declared", () => {
    expect(suggestedLocales(deriveLocaleAxis({ explicit: ["fr", "en"] }))).toBeNull();
  });
});
