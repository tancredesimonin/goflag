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

describe("sitemap scope", () => {
  it("lists everything by default — the omission is what gets declared", () => {
    const routes = site.routes({ home: { path: "" }, search: { path: "/search" } });

    expect(routes.sitemap()).toHaveLength(site.locales.length * 2);
  });

  it("drops a hand-declared route from the sitemap, in every locale", () => {
    const routes = site.routes({ home: { path: "" }, search: { path: "/search", sitemap: false } });

    const urls = routes.sitemap().map((row) => row.url);

    expect(urls).toHaveLength(site.locales.length);
    expect(urls.some((url) => url.includes("/search"))).toBe(false);
  });

  it("drops a monolingual route", () => {
    const routes = site.routes({
      home: { path: "" },
      raw: { path: "/raw", locale: "en-US", sitemap: false },
    });

    expect(routes.sitemap().some((row) => row.url.endsWith("/raw"))).toBe(false);
  });

  it("keeps serving the metadata of a route it does not list", () => {
    const routes = site.routes({ search: { path: "/search", sitemap: false } });

    // The whole point of S3: not an entry point is not the same as not a page.
    const meta = routes.metadata({
      path: "/search",
      locale: "en-US",
      title: "Search",
      description: "Search",
    });

    expect(String(meta.alternates?.canonical)).toBe("https://goflag.tech/en-US/search");
    expect(Object.keys(meta.alternates?.languages ?? {})).toContain("fr-FR");
  });

  it("takes the verdict per entry, which is the case that needed it", () => {
    const versions = [
      { v: "1.6.3", locale: "en-US" },
      { v: "1.6.3", locale: "fr-FR" },
      { v: "1.5.0", locale: "en-US" },
      { v: "1.5.0", locale: "fr-FR" },
    ];

    const routes = site.routes({
      versions: collection(versions, {
        path: (entry) => `/stet/${entry.v}`,
        locale: (entry) => entry.locale,
        sitemap: (entry) => entry.v === "1.6.3",
      }),
    });

    const urls = routes.sitemap().map((row) => row.url);

    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.includes("1.6.3"))).toBe(true);
  });

  it("excludes one translation without taking its siblings out", () => {
    const routes = site.routes({
      legal: collection(legals, {
        path: (entry) => `/${entry.slug}`,
        locale: (entry) => entry.locale,
        sitemap: (entry) => entry.locale !== "fr-FR",
      }),
    });

    const urls = routes.sitemap().map((row) => row.url);

    expect(urls.some((url) => url === "https://goflag.tech/en-US/cookies")).toBe(true);
    expect(urls.some((url) => url.includes("/fr-FR/"))).toBe(false);
  });

  it("leaves an unlisted translation in its siblings' cluster", () => {
    // Reciprocity is a property of the pages, not of the sitemap. Dropping the
    // excluded locale from `alternates` would be `hreflang.missing-reciprocal`
    // manufactured by the exclusion itself.
    const routes = site.routes({
      legal: collection(legals, {
        path: (entry) => `/${entry.slug}`,
        locale: (entry) => entry.locale,
        sitemap: (entry) => entry.locale !== "fr-FR",
      }),
    });

    const row = routes.sitemap().find((entry) => entry.url.endsWith("/en-US/cookies"));
    const meta = routes.metadata({
      path: "/cookies",
      locale: "en-US",
      title: "Cookies",
      description: "Cookies",
    });

    expect(Object.keys(row?.alternates?.languages ?? {})).toContain("fr-FR");
    expect(Object.keys(meta.alternates?.languages ?? {})).toContain("fr-FR");
  });

  it("still refuses two routes on one path when one of them is unlisted", () => {
    expect(() =>
      site.routes({
        a: { path: "/x" },
        b: { path: "/x", sitemap: false },
      }),
    ).toThrow(/Duplicate route path/);
  });
});

/**
 * A cluster whose locales do not share a slug (`docs/next-plan.md` N6).
 *
 * The library groups a collection's entries by path, so two documents whose
 * slugs are translated used to become two routes, each advertising a cluster of
 * itself — the exact defect goflag's cluster index exists to repair, emitted by
 * the library meant to prevent it. Measured before this existed: one sitemap
 * entry per locale, each with a one-language `alternates.languages`, and the
 * auditor forming two rows out of one page.
 */
describe("a collection keyed by translation", () => {
  interface Offer {
    slug: string;
    locale: string;
    tid: string;
  }

  const offers: Offer[] = [
    { slug: "pricing", locale: "en-US", tid: "offer" },
    { slug: "tarifs", locale: "fr-FR", tid: "offer" },
  ];

  const keyed = () =>
    site.routes({
      offer: collection(offers, {
        path: (o) => `/${o.slug}`,
        locale: (o) => o.locale,
        key: (o) => o.tid,
      }),
    });

  it("leaves a collection without a key exactly as it was", () => {
    // The acceptance criterion, and the reason `key` is optional: every
    // collection already in the wild groups by path, and its sitemap must not
    // move by a byte because this feature exists.
    const plain = site.routes({
      offer: collection(offers, { path: (o) => `/${o.slug}`, locale: (o) => o.locale }),
    });

    expect(plain.all).toHaveLength(2);
    expect(plain.all.every((route) => route.policy === "localized")).toBe(true);
    expect(plain.all.map((route) => route.path).sort()).toEqual(["/pricing", "/tarifs"]);
    for (const route of plain.all) {
      expect(route.policy === "localized" && route.paths).toBeUndefined();
    }
  });

  it("makes one route out of the two, each locale keeping its own path", () => {
    const routes = keyed();

    expect(routes.all).toHaveLength(1);
    const [route] = routes.all;
    expect(route!.policy).toBe("localized");
    expect(route!.policy === "localized" && route!.locales).toEqual(["en-US", "fr-FR"]);
    expect(route!.path).toBe("/pricing");
    expect(route!.policy === "localized" && route!.paths).toEqual({ "fr-FR": "/tarifs" });
  });

  it("advertises the whole cluster from either half", () => {
    // What the auditor reads. Before the key, `/en-US/pricing` declared only
    // itself, so nothing on the page or in the sitemap said the two were one.
    const routes = keyed();

    for (const [path, locale] of [
      ["/pricing", "en-US"],
      ["/tarifs", "fr-FR"],
    ] as const) {
      const meta = routes.metadata({ path, locale, title: "T", description: "D" });
      expect(meta.alternates?.languages).toEqual({
        "en-US": "https://goflag.tech/en-US/pricing",
        "fr-FR": "https://goflag.tech/fr-FR/tarifs",
        "x-default": "https://goflag.tech/en-US/pricing",
      });
    }
  });

  it("resolves from the slug the page actually knows", () => {
    // A French page knows `/tarifs` and nothing else. Indexing only the anchor
    // would make the feature unusable from the page that needs it.
    const routes = keyed();

    expect(routes.find("/tarifs")).toBe(routes.find("/pricing"));
    expect(
      routes.metadata({ path: "/tarifs", locale: "fr-FR", title: "T", description: "D" }).alternates
        ?.canonical,
    ).toBe("https://goflag.tech/fr-FR/tarifs");
  });

  it("lists both slugs in the sitemap, under one cluster", () => {
    const rows = keyed().sitemap();

    expect(rows.map((row) => row.url).sort()).toEqual([
      "https://goflag.tech/en-US/pricing",
      "https://goflag.tech/fr-FR/tarifs",
    ]);
    for (const row of rows) {
      expect(Object.keys(row.alternates?.languages ?? {}).sort()).toEqual([
        "en-US",
        "fr-FR",
        "x-default",
      ]);
    }
  });

  it("anchors on the site default, and falls back when the route excludes it", () => {
    // The identity has to be stable when a locale joins, which is why it is the
    // same rule `x-default` follows rather than a second one.
    const withoutDefault = site.routes({
      offer: collection(
        [
          { slug: "tarifs", locale: "fr-FR", tid: "offer" },
          { slug: "precios", locale: "es-ES", tid: "offer" },
        ],
        {
          path: (o: Offer) => `/${o.slug}`,
          locale: (o: Offer) => o.locale,
          key: (o: Offer) => o.tid,
        },
      ),
    });

    expect(withoutDefault.all[0]!.path).toBe("/tarifs");
    expect(
      withoutDefault.metadata({ path: "/tarifs", locale: "fr-FR", title: "T", description: "D" })
        .alternates?.languages,
    ).toMatchObject({ "x-default": "https://goflag.tech/fr-FR/tarifs" });
  });

  it("keeps the anchor when a locale joins the cluster", () => {
    const grown = site.routes({
      offer: collection([...offers, { slug: "precios", locale: "es-ES", tid: "offer" }], {
        path: (o: Offer) => `/${o.slug}`,
        locale: (o: Offer) => o.locale,
        key: (o: Offer) => o.tid,
      }),
    });

    expect(grown.all[0]!.path).toBe(keyed().all[0]!.path);
  });

  it("refuses two paths for one locale of one page", () => {
    // Picking either would make the canonical and the cluster describe
    // different URLs under one page, which is the class of defect this library
    // fails the build over rather than shipping.
    expect(() =>
      site.routes({
        offer: collection(
          [
            { slug: "pricing", locale: "en-US", tid: "offer" },
            { slug: "prices", locale: "en-US", tid: "offer" },
          ],
          {
            path: (o: Offer) => `/${o.slug}`,
            locale: (o: Offer) => o.locale,
            key: (o: Offer) => o.tid,
          },
        ),
      }),
    ).toThrow(/two paths for locale/);
  });

  it("still keeps one locale out of the sitemap without dropping it from the cluster", () => {
    // A page left out of the sitemap is still a translation of its siblings.
    const routes = site.routes({
      offer: collection(offers, {
        path: (o) => `/${o.slug}`,
        locale: (o) => o.locale,
        key: (o) => o.tid,
        sitemap: (o) => o.locale !== "fr-FR",
      }),
    });

    const rows = routes.sitemap();
    expect(rows.map((row) => row.url)).toEqual(["https://goflag.tech/en-US/pricing"]);
    expect(Object.keys(rows[0]!.alternates?.languages ?? {})).toContain("fr-FR");
  });
});
