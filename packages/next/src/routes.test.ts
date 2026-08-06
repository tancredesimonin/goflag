import { describe, expect, it } from "vitest";

import { collection } from "./routes";
import { defineSite } from "./site";

const site = defineSite({
  baseUrl: "https://goflag.tech",
  name: "goflag",
  locales: ["en-US", "fr-FR", "es-ES", "pt-BR"],
  defaultLocale: "en-US",
  indexable: true,
});

interface Legal {
  slug: string;
  locale: string;
}

const legals: Legal[] = [
  { slug: "cookies", locale: "en-US" },
  { slug: "cookies", locale: "fr-FR" },
  { slug: "privacy", locale: "fr-FR" },
  { slug: "privacy", locale: "es-ES" },
];

const docs = [{ slug: "install" }, { slug: "ci/baseline" }];

describe("single routes", () => {
  it("clusters across every locale by default", () => {
    const routes = site.routes({ home: { path: "" } });

    expect(routes.all).toEqual([
      {
        policy: "localized",
        family: "home",
        path: "",
        locales: ["en-US", "fr-FR", "es-ES", "pt-BR"],
        ogType: "website",
      },
    ]);
  });

  it("takes a restricted cluster, ordered by the site's own order", () => {
    const routes = site.routes({ beta: { path: "/beta", locales: ["pt-BR", "en-US"] } });

    expect(routes.require("/beta")).toMatchObject({ locales: ["en-US", "pt-BR"] });
  });

  it("stands alone when given a fixed locale", () => {
    // The rule that replaces a `policy` field: a fixed locale means the route
    // exists in one language, outside the locale segment.
    const routes = site.routes({ docs: { path: "/docs", locale: "en-US" } });

    expect(routes.require("/docs")).toMatchObject({ policy: "monolingual", locale: "en-US" });
  });

  it("validates the shape of a path", () => {
    expect(() => site.routes({ x: { path: "changelog" } })).toThrow(/must start/);
    expect(() => site.routes({ x: { path: "/changelog/" } })).toThrow(/must not end/);
    expect(() => site.routes({ x: { path: "", locale: "en-US" } })).toThrow(/must start/);
  });

  it("refuses a locale the site does not serve", () => {
    expect(() => site.routes({ x: { path: "/x", locales: ["de-DE" as "en-US"] } })).toThrow(
      /does not serve/,
    );
  });
});

describe("collection families", () => {
  it("derives each cluster from the entries that exist", () => {
    // The case the hand-written version got wrong: the sitemap assumed all four
    // locales while the page derived its own set, so a notice translated into
    // three would have been listed in four and clustered in three.
    const routes = site.routes({
      legal: collection(legals, { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
    });

    expect(routes.require("/cookies")).toMatchObject({ locales: ["en-US", "fr-FR"] });
    expect(routes.require("/privacy")).toMatchObject({ locales: ["fr-FR", "es-ES"] });
  });

  it("produces one route per entry when the locale is fixed", () => {
    const routes = site.routes({
      docs: collection(docs, {
        path: (d) => `/docs/${d.slug}`,
        locale: "en-US",
        ogType: "article",
      }),
    });

    expect(routes.family("docs").map((route) => route.path)).toEqual([
      "/docs/install",
      "/docs/ci/baseline",
    ]);
    expect(routes.require("/docs/install")).toMatchObject({
      policy: "monolingual",
      ogType: "article",
    });
  });

  it("refuses an entry in a locale the site does not serve", () => {
    // Not dropped: a document in an undeclared language is a contradiction
    // between the content and the site, and picking a side silently leaves
    // either a page nobody links to or a locale nobody asked for.
    const stray = [...legals, { slug: "cookies", locale: "de-DE" }];

    expect(() =>
      site.routes({
        legal: collection(stray, { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
      }),
    ).toThrow(/does not serve/);
  });

  it("handles an empty collection without inventing a route", () => {
    const routes = site.routes({
      legal: collection([] as Legal[], { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
    });

    expect(routes.all).toEqual([]);
  });
});

describe("the registry", () => {
  const routes = site.routes({
    home: { path: "" },
    legal: collection(legals, { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
    docs: collection(docs, { path: (d) => `/docs/${d.slug}`, locale: "en-US", ogType: "article" }),
  });

  it("refuses two families claiming one path, naming both", () => {
    expect(() =>
      site.routes({
        generated: collection(docs, { path: (d) => `/docs/${d.slug}`, locale: "en-US" }),
        handwritten: { path: "/docs/install", locale: "en-US" },
      }),
    ).toThrow(/Duplicate route path "\/docs\/install".*"generated".*"handwritten"/);
  });

  it("groups routes by the family that declared them", () => {
    expect(routes.family("legal").map((route) => route.path)).toEqual(["/cookies", "/privacy"]);
    expect(routes.family("home")).toHaveLength(1);
  });

  it("fails the build on an unregistered path, naming the fix", () => {
    // Answering `undefined` would let a page ship with a canonical and no
    // sitemap entry — the disagreement the registry exists to prevent.
    expect(routes.find("/ghost")).toBeUndefined();
    expect(() => routes.require("/ghost")).toThrow(/No route registered for "\/ghost"/);
    expect(() => routes.require("/ghost")).toThrow(/site\.routes\(\)/);
  });
});

describe("sitemap", () => {
  const routes = site.routes({
    home: { path: "" },
    legal: collection(legals, { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
    docs: collection(docs, { path: (d) => `/docs/${d.slug}`, locale: "en-US" }),
  });

  it("emits one row per locale a route serves, and no more", () => {
    expect(routes.sitemap().map((row) => row.url)).toEqual([
      "https://goflag.tech/en-US",
      "https://goflag.tech/fr-FR",
      "https://goflag.tech/es-ES",
      "https://goflag.tech/pt-BR",
      "https://goflag.tech/en-US/cookies",
      "https://goflag.tech/fr-FR/cookies",
      "https://goflag.tech/fr-FR/privacy",
      "https://goflag.tech/es-ES/privacy",
      "https://goflag.tech/docs/install",
      "https://goflag.tech/docs/ci/baseline",
    ]);
  });

  it("leaves monolingual rows without alternates", () => {
    const row = routes.sitemap().find((entry) => entry.url.endsWith("/docs/install"));

    expect(row?.alternates).toBeUndefined();
  });

  it("omits lastModified entirely unless asked for one", () => {
    // A date nobody supplied would be this library asserting when the content
    // changed, which it has no way to know.
    expect(routes.sitemap()[0]).not.toHaveProperty("lastModified");

    const stamped = new Date("2026-08-06T00:00:00.000Z");
    expect(routes.sitemap({ lastModified: stamped })[0]).toMatchObject({ lastModified: stamped });
  });
});

describe("robots", () => {
  it("points at the sitemap and allows crawling where the site is indexable", () => {
    expect(site.routes({ home: { path: "" } }).robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://goflag.tech/sitemap.xml",
    });
  });

  it("takes extra paths to keep crawlers out of", () => {
    expect(site.routes({ home: { path: "" } }).robots({ disallow: ["/api/"] }).rules).toMatchObject(
      { allow: "/", disallow: ["/api/"] },
    );
  });

  it("emits Host only when asked, because goflag warns about it", () => {
    // `Host:` is non-standard, read by Yandex alone, and reported as
    // `robotstxt.unknown-directive`. A library that produces output its own
    // auditor warns about has picked a side against itself.
    expect(site.routes({ home: { path: "" } }).robots()).not.toHaveProperty("host");
    expect(site.routes({ home: { path: "" } }).robots({ host: true })).toMatchObject({
      host: "https://goflag.tech",
    });
  });

  it("forbids everything, and names no sitemap, where it is not indexable", () => {
    // `robots.blocks-site` is a rule because a production container shipping
    // the staging value serves this while every page asks to be indexed. The
    // same flag drives both, so the two cannot contradict each other.
    const staging = defineSite({
      baseUrl: "https://develop.goflag.tech",
      name: "goflag",
      locales: ["en-US"],
      defaultLocale: "en-US",
      indexable: false,
    });

    expect(staging.routes({ home: { path: "" } }).robots({ disallow: ["/api/"] })).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });
});

describe("sitemap facts", () => {
  interface Capsule {
    slug: string;
    locale: string;
    updated: string;
  }

  const capsules: Capsule[] = [
    { slug: "tr-808", locale: "en-US", updated: "2026-01-02" },
    { slug: "tr-808", locale: "fr-FR", updated: "2026-05-06" },
  ];

  const routes = site.routes({
    home: { path: "", changeFrequency: "weekly", priority: 1 },
    capsules: collection(capsules, {
      path: (c) => `/library/${c.slug}`,
      locale: (c) => c.locale,
      lastModified: (c) => c.updated,
      changeFrequency: "monthly",
      priority: 0.8,
    }),
  });

  it("stamps each locale with its own date, not the route's", () => {
    // A translation is edited on its own day. Collapsing the cluster to one
    // date makes every other row claim a change that did not happen to it.
    const rows = routes.sitemap();
    const en = rows.find((row) => row.url.endsWith("/en-US/library/tr-808"));
    const fr = rows.find((row) => row.url.endsWith("/fr-FR/library/tr-808"));

    expect(en?.lastModified).toEqual(new Date("2026-01-02"));
    expect(fr?.lastModified).toEqual(new Date("2026-05-06"));
  });

  it("carries changefreq and priority through to every row of a route", () => {
    const rows = routes.sitemap();

    expect(rows.find((row) => row.url.endsWith("/en-US"))).toMatchObject({
      changeFrequency: "weekly",
      priority: 1,
    });
    expect(rows.find((row) => row.url.includes("/library/"))).toMatchObject({
      changeFrequency: "monthly",
      priority: 0.8,
    });
  });

  it("falls back to the option only where a route supplied nothing", () => {
    const stamped = new Date("2026-08-06T00:00:00.000Z");
    const rows = routes.sitemap({ lastModified: stamped });

    expect(rows.find((row) => row.url.endsWith("/en-US"))?.lastModified).toEqual(stamped);
    expect(rows.find((row) => row.url.endsWith("/en-US/library/tr-808"))?.lastModified).toEqual(
      new Date("2026-01-02"),
    );
  });

  it("refuses a date it cannot parse rather than writing it into the XML", () => {
    // `sitemap.lastmod.invalid` reports exactly this, in the one document that
    // tells a crawler what to fetch.
    expect(() =>
      site.routes({
        x: collection([{ slug: "a", locale: "en-US", updated: "last tuesday" }], {
          path: (c) => `/library/${c.slug}`,
          locale: (c) => c.locale,
          lastModified: (c) => c.updated,
        }),
      }),
    ).toThrow(/unparseable lastModified/);
  });

  it("refuses a priority outside the range the protocol defines", () => {
    expect(() => site.routes({ x: { path: "/x", priority: 1.5 } })).toThrow(
      /between 0\.0 and 1\.0/,
    );
    expect(() => site.routes({ x: { path: "/x", priority: -1 } })).toThrow(/between 0\.0 and 1\.0/);
  });
});
