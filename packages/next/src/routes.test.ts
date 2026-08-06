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
      host: "https://goflag.tech",
    });
  });

  it("forbids everything, and names no sitemap, where it is not", () => {
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

    expect(staging.routes({ home: { path: "" } }).robots()).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });
});
