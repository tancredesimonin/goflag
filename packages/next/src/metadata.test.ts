import { describe, expect, it } from "vitest";

import { collection } from "./routes";
import { defineSite } from "./site";

const site = defineSite({
  baseUrl: "https://goflag.tech",
  name: "goflag",
  locales: ["en-US", "fr-FR", "pt-BR"],
  defaultLocale: "en-US",
  indexable: true,
  twitter: { card: "summary_large_image", site: "@goflag" },
});

const routes = site.routes({
  home: { path: "" },
  legal: collection(
    [
      { slug: "cookies", locale: "fr-FR" },
      { slug: "cookies", locale: "pt-BR" },
    ],
    {
      path: (d) => `/${d.slug}`,
      locale: (d) => d.locale,
    },
  ),
  docs: { path: "/docs/install", locale: "en-US", ogType: "article" },
});

const content = { title: "Install goflag", description: "Two ways in, and when to pick each." };

describe("metadata — localized pages", () => {
  const meta = routes.metadata({ path: "", locale: "fr-FR", ...content });

  it("canonicalises to the page's own URL", () => {
    expect(meta.alternates?.canonical).toBe("https://goflag.tech/fr-FR");
  });

  it("declares the cluster under hreflang tags, not routing segments", () => {
    expect(meta.alternates?.languages).toEqual({
      "en-US": "https://goflag.tech/en-US",
      "fr-FR": "https://goflag.tech/fr-FR",
      "pt-BR": "https://goflag.tech/pt-BR",
      "x-default": "https://goflag.tech/en-US",
    });
  });

  it("uses the territory-qualified locale Open Graph defines", () => {
    expect(meta.openGraph).toMatchObject({
      locale: "fr_FR",
      url: "https://goflag.tech/fr-FR",
      siteName: "goflag",
      type: "website",
    });
  });

  it("names the rest of the cluster as og:locale:alternate, and not itself", () => {
    expect((meta.openGraph as { alternateLocale?: string[] }).alternateLocale).toEqual([
      "en_US",
      "pt_BR",
    ]);
  });

  it("names only the locales the route serves", () => {
    // `/cookies` is translated into two of the three, so Open Graph must say
    // two — the same restraint x-default shows just above.
    const partial = routes.metadata({ path: "/cookies", locale: "fr-FR", ...content });

    expect((partial.openGraph as { alternateLocale?: string[] }).alternateLocale).toEqual([
      "pt_BR",
    ]);
  });

  it("leaves og:image alone — the file convention already emitted one", () => {
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(meta.twitter).not.toHaveProperty("images");
  });

  it("carries the site's twitter handle without repeating it per page", () => {
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", site: "@goflag" });
  });

  it("refuses a locale the route does not serve", () => {
    expect(() => routes.metadata({ path: "/cookies", locale: "en-US", ...content })).toThrow(
      /not served in/,
    );
  });

  it("refuses to guess when a localized route is given no locale", () => {
    expect(() => routes.metadata({ path: "", ...content })).toThrow(/needs a locale/);
  });
});

describe("metadata — a partly translated route", () => {
  it("points x-default at a locale the route actually serves", () => {
    // Pointing it at the default locale unconditionally aims x-default at a URL
    // that 404s — an hreflang pointing at nothing.
    const meta = routes.metadata({ path: "/cookies", locale: "fr-FR", ...content });

    expect(meta.alternates?.languages).toEqual({
      "fr-FR": "https://goflag.tech/fr-FR/cookies",
      "pt-BR": "https://goflag.tech/pt-BR/cookies",
      "x-default": "https://goflag.tech/fr-FR/cookies",
    });
  });
});

describe("metadata — monolingual pages", () => {
  const meta = routes.metadata({ path: "/docs/install", image: "/og/docs/install", ...content });

  it("takes its language from the route, with no locale to be handed", () => {
    expect(meta.openGraph).toMatchObject({ locale: "en_US", type: "article" });
  });

  it("alternates with nothing, rather than with an empty list", () => {
    // One language: naming others would advertise translations that do not
    // exist, and an empty `alternateLocale` would still be a claim.
    expect(meta.openGraph).not.toHaveProperty("alternateLocale");
  });

  it("declares a self-referential cluster rather than silence", () => {
    expect(meta.alternates?.languages).toEqual({
      "en-US": "https://goflag.tech/docs/install",
      "x-default": "https://goflag.tech/docs/install",
    });
  });

  it("resolves a named card against the origin", () => {
    const expected = [
      {
        url: "https://goflag.tech/og/docs/install",
        width: 1200,
        height: 630,
        alt: "Install goflag",
      },
    ];

    expect(meta.openGraph).toMatchObject({ images: expected });
    expect(meta.twitter).toMatchObject({ images: expected });
  });

  it("ignores a locale it is handed — the route has only one", () => {
    expect(routes.metadata({ path: "/docs/install", locale: "fr-FR", ...content })).toEqual(
      routes.metadata({ path: "/docs/install", ...content }),
    );
  });
});

describe("metadata — titles and copy", () => {
  it("lets the root template append the product name, or opts out", () => {
    expect(routes.metadata({ path: "", locale: "en-US", ...content }).title).toBe("Install goflag");
    expect(
      routes.metadata({ path: "", locale: "en-US", ...content, absoluteTitle: true }).title,
    ).toEqual({ absolute: "Install goflag" });
  });

  it("falls back to the page's own words for the unfurl", () => {
    const meta = routes.metadata({ path: "", locale: "en-US", ...content });

    expect(meta.openGraph).toMatchObject(content);
    expect(meta.twitter).toMatchObject(content);
  });

  it("takes an unfurl override without touching the page title", () => {
    const meta = routes.metadata({
      path: "",
      locale: "en-US",
      ...content,
      og: { title: "Shorter, for a card" },
    });

    expect(meta.title).toBe(content.title);
    expect(meta.openGraph).toMatchObject({ title: "Shorter, for a card" });
  });

  it("omits keywords rather than emitting an empty attribute", () => {
    expect(routes.metadata({ path: "", locale: "en-US", ...content })).not.toHaveProperty(
      "keywords",
    );
  });
});

describe("metadata — article times", () => {
  it("carries them on an article", () => {
    const meta = routes.metadata({
      path: "/docs/install",
      ...content,
      og: { modifiedTime: "2026-08-01" },
    });

    expect(meta.openGraph).toMatchObject({ modifiedTime: "2026-08-01" });
  });

  it("drops them on a website, which has no vocabulary for them", () => {
    const meta = routes.metadata({
      path: "",
      locale: "en-US",
      ...content,
      og: { modifiedTime: "2026-08-01" },
    });

    expect(meta.openGraph).not.toHaveProperty("modifiedTime");
  });

  it("lets the page override the route's type, times included", () => {
    const meta = routes.metadata({
      path: "",
      locale: "en-US",
      ...content,
      og: { type: "article", publishedTime: "2026-07-01" },
    });

    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-07-01" });
  });
});
