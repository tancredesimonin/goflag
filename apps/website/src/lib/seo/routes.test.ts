import { describe, expect, it } from "vitest";

import {
  defineRegistry,
  findRoute,
  localizedRoute,
  locate,
  monolingualRoute,
  requireRoute,
  sitemapUrls,
  type Route,
} from "./routes";
import type { SiteConfig } from "./site";

const config: SiteConfig = {
  baseUrl: "https://goflag.tech",
  name: "goflag",
  locales: ["en", "fr", "es", "pt-br"],
  defaultLocale: "en",
  indexable: true,
};

describe("localizedRoute", () => {
  it("orders locales by the site's order, whatever order they arrive in", () => {
    const route = localizedRoute({ path: "/legal", locales: ["pt-br", "en", "fr"] });

    expect(route.locales).toEqual(["en", "fr", "pt-br"]);
  });

  it("dedupes, so a collection with two entries per locale still declares one", () => {
    const route = localizedRoute({ path: "/legal", locales: ["fr", "fr", "en"] });

    expect(route.locales).toEqual(["en", "fr"]);
  });

  it("drops tags the site does not serve rather than inventing a locale", () => {
    // The first false positive phase 1 found: a path read as a language tag,
    // producing 31 translation holes for locales nobody had ever served.
    const route = localizedRoute({ path: "/cv", locales: ["en", "cv", "xx-YZ"] });

    expect(route.locales).toEqual(["en"]);
  });

  it("refuses a route that survives with no locale at all", () => {
    expect(() => localizedRoute({ path: "/ghost", locales: ["cv"] })).toThrow(/no known locale/);
  });

  it("defaults to a website, and takes an override", () => {
    expect(localizedRoute({ path: "", locales: ["en"] }).ogType).toBe("website");
    expect(localizedRoute({ path: "", locales: ["en"], ogType: "article" }).ogType).toBe("article");
  });

  it("accepts the empty path for the home page but rejects malformed ones", () => {
    expect(() => localizedRoute({ path: "", locales: ["en"] })).not.toThrow();
    expect(() => localizedRoute({ path: "changelog", locales: ["en"] })).toThrow(/must start/);
    expect(() => localizedRoute({ path: "/changelog/", locales: ["en"] })).toThrow(/must not end/);
  });
});

describe("monolingualRoute", () => {
  it("requires a rooted path — there is no locale segment to be relative to", () => {
    expect(() => monolingualRoute({ path: "", locale: "en" })).toThrow(/must start/);
    expect(() => monolingualRoute({ path: "docs", locale: "en" })).toThrow(/must start/);
    expect(() => monolingualRoute({ path: "/docs/", locale: "en" })).toThrow(/must not end/);
    expect(monolingualRoute({ path: "/docs", locale: "en" }).path).toBe("/docs");
  });
});

describe("locate — localized routes", () => {
  const route = localizedRoute({ path: "/changelog", locales: ["en", "fr", "es", "pt-br"] });

  it("returns the canonical for the requested locale", () => {
    expect(locate(config, route, "fr").url).toBe("https://goflag.tech/fr/changelog");
  });

  it("declares one alternate per served locale, plus x-default", () => {
    expect(locate(config, route, "en").languages).toEqual({
      en: "https://goflag.tech/en/changelog",
      fr: "https://goflag.tech/fr/changelog",
      es: "https://goflag.tech/es/changelog",
      "pt-br": "https://goflag.tech/pt-br/changelog",
      "x-default": "https://goflag.tech/en/changelog",
    });
  });

  it("builds the home page without a double slash", () => {
    const home = localizedRoute({ path: "", locales: ["en"] });

    expect(locate(config, home, "en").url).toBe("https://goflag.tech/en");
  });

  it("points x-default at a locale the route actually serves", () => {
    // The bug this replaced: x-default went to the default locale unconditionally,
    // so a page translated into two languages that exclude it aimed x-default at
    // a URL that 404s — an hreflang pointing at nothing, which is the headline
    // example in goflag's own README.
    const partial = localizedRoute({ path: "/cookies", locales: ["fr", "es"] });

    expect(locate(config, partial, "fr").languages).toEqual({
      fr: "https://goflag.tech/fr/cookies",
      es: "https://goflag.tech/es/cookies",
      "x-default": "https://goflag.tech/fr/cookies",
    });
  });

  it("never names a locale the route is not served in", () => {
    const partial = localizedRoute({ path: "/cookies", locales: ["fr", "es"] });
    const { languages } = locate(config, partial, "es");

    expect(Object.keys(languages)).not.toContain("en");
    expect(Object.keys(languages)).not.toContain("pt-br");
  });

  it("refuses to invent a URL for a locale the route does not serve", () => {
    const partial = localizedRoute({ path: "/cookies", locales: ["fr"] });

    expect(() => locate(config, partial, "es")).toThrow(/not served in "es"/);
  });

  it("refuses to guess when no locale is given", () => {
    expect(() => locate(config, route)).toThrow(/needs a locale/);
  });
});

describe("locate — monolingual routes", () => {
  const route = monolingualRoute({ path: "/docs/install", locale: "en", ogType: "article" });

  it("declares a self-referential cluster rather than silence", () => {
    // Silence would leave the language of the page undeclared on a site that
    // serves four, which is what `hreflang.missing` reports.
    expect(locate(config, route)).toEqual({
      url: "https://goflag.tech/docs/install",
      languages: {
        en: "https://goflag.tech/docs/install",
        "x-default": "https://goflag.tech/docs/install",
      },
    });
  });

  it("ignores a locale it is handed — the route has only one", () => {
    expect(locate(config, route, "fr")).toEqual(locate(config, route));
  });
});

describe("defineRegistry", () => {
  it("refuses two routes on one path", () => {
    // Reachable by accident: a documentation page slugged `cli` collides with
    // the hand-declared `/docs/cli`.
    const routes = [
      monolingualRoute({ path: "/docs/cli", locale: "en" }),
      monolingualRoute({ path: "/docs/cli", locale: "en" }),
    ];

    expect(() => defineRegistry(routes)).toThrow(/Duplicate route paths.*\/docs\/cli/);
  });

  it("accepts a localized and a monolingual route that merely look alike", () => {
    // `/changelog` under a locale segment and `/docs` outside it are different
    // URL spaces; only a literal path collision is an error.
    expect(() =>
      defineRegistry([
        localizedRoute({ path: "/changelog", locales: ["en"] }),
        monolingualRoute({ path: "/docs", locale: "en" }),
      ]),
    ).not.toThrow();
  });
});

describe("requireRoute", () => {
  const routes = defineRegistry([localizedRoute({ path: "/changelog", locales: ["en"] })]);

  it("finds a registered path", () => {
    expect(requireRoute(routes, "/changelog").path).toBe("/changelog");
    expect(findRoute(routes, "/changelog")).toBeDefined();
  });

  it("fails the build on an unregistered one, naming the fix", () => {
    // Returning undefined would let a page ship with a canonical and no sitemap
    // entry. The whole point of the registry is that this cannot pass quietly.
    expect(findRoute(routes, "/ghost")).toBeUndefined();
    expect(() => requireRoute(routes, "/ghost")).toThrow(/No route registered for "\/ghost"/);
    expect(() => requireRoute(routes, "/ghost")).toThrow(/site-routes\.ts/);
  });
});

describe("sitemapUrls", () => {
  const registry = defineRegistry([
    localizedRoute({ path: "", locales: ["en", "fr"] }),
    localizedRoute({ path: "/cookies", locales: ["fr", "es"] }),
    monolingualRoute({ path: "/docs", locale: "en", ogType: "article" }),
  ]);

  it("emits one row per locale a route is served in, and no more", () => {
    expect(sitemapUrls(config, registry).map((entry) => entry.url)).toEqual([
      "https://goflag.tech/en",
      "https://goflag.tech/fr",
      "https://goflag.tech/fr/cookies",
      "https://goflag.tech/es/cookies",
      "https://goflag.tech/docs",
    ]);
  });

  it("leaves monolingual rows without alternates", () => {
    const docs = sitemapUrls(config, registry).find((entry) => entry.url.endsWith("/docs"));

    expect(docs?.languages).toBeUndefined();
  });

  it("declares in the sitemap exactly what the page declares in its head", () => {
    // This is the invariant the registry exists for. A sitemap that disagrees
    // with the head is `hreflang.sitemap-mismatch`, and the old code carried it
    // latently: it gave every legal page all four locales while the page derived
    // its own set.
    for (const route of registry) {
      if (route.policy !== "localized") continue;

      for (const locale of route.locales) {
        const head = locate(config, route, locale);
        const row = sitemapUrls(config, registry).find((entry) => entry.url === head.url);

        expect(row, `no sitemap row for ${head.url}`).toBeDefined();
        expect(row?.languages).toEqual(head.languages);
      }
    }
  });

  it("puts every page the registry knows about in the sitemap", () => {
    const rows = sitemapUrls(config, registry).map((entry) => entry.url);
    const expected = registry.flatMap((route: Route) =>
      route.policy === "localized"
        ? route.locales.map((locale) => locate(config, route, locale).url)
        : [locate(config, route).url],
    );

    expect(rows).toEqual(expected);
  });
});
