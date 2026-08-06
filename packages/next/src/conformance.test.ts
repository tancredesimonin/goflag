import type { Metadata } from "next";
import { describe, expect, it } from "vitest";

import { collection } from "./routes";
import { defineSite } from "./site";
import type { Route } from "./types";

/**
 * The library's output, judged by the rules goflag reports.
 *
 * `docs/next-plan.md` §4 wants these assertions to come from the CLI's own rule
 * catalogue, so that adding a rule breaks the library until it satisfies it.
 * That is not possible yet: `@goflag/cli` exports `runAudit` and the report
 * types, not the registry or the extraction model, and invariant I3 forbids
 * reaching past its public entry point. When `goflag rules --json` lands and
 * the catalogue becomes importable, this file should be replaced by a harness
 * that evaluates the real rules against rendered output.
 *
 * Until then these are hand-written stand-ins, each named after the rule it
 * covers, over a site shaped like the awkward cases: a partly translated
 * cluster, a family outside the locale segment, and a locale whose routing tag
 * is not its hreflang tag.
 */

const site = defineSite({
  baseUrl: "https://goflag.tech",
  name: "goflag",
  locales: ["en", "fr", "es", "pt-br"],
  defaultLocale: "en",
  indexable: true,
  localeTags: {
    en: { bcp47: "en-US", openGraph: "en_US" },
    fr: { bcp47: "fr-FR", openGraph: "fr_FR" },
    es: { bcp47: "es-ES", openGraph: "es_ES" },
  },
});

const legals = [
  { slug: "cookies", locale: "en" },
  { slug: "cookies", locale: "fr" },
  { slug: "cookies", locale: "es" },
  { slug: "cookies", locale: "pt-br" },
  // Deliberately partial: the case where x-default has no default locale to
  // point at, and where the sitemap must not list what the cluster omits.
  { slug: "imprint", locale: "fr" },
  { slug: "imprint", locale: "es" },
];

const routes = site.routes({
  home: { path: "" },
  changelog: { path: "/changelog" },
  legal: collection(legals, { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
  docs: collection([{ slug: "install" }, { slug: "ci" }], {
    path: (d) => `/docs/${d.slug}`,
    locale: "en",
    ogType: "article",
  }),
});

type Locale = "en" | "fr" | "es" | "pt-br";

interface Page {
  route: Route<Locale>;
  url: string;
  meta: Metadata;
}

/** Every page the site serves, with the metadata it would render. */
function everyPage(): Page[] {
  return routes.all.flatMap((route): Page[] => {
    const content = { title: `Title for ${route.path || "/"}`, description: "A description." };

    if (route.policy === "monolingual") {
      const meta = routes.metadata({ path: route.path, ...content });
      return [{ route, url: String(meta.alternates?.canonical), meta }];
    }

    return route.locales.map((locale) => {
      const meta = routes.metadata({ path: route.path, locale, ...content });
      return { route, url: String(meta.alternates?.canonical), meta };
    });
  });
}

const pages = everyPage();

describe("every page the registry can render", () => {
  it("renders more than a handful, or the rest of this file proves nothing", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it("declares a canonical, and an absolute one — canonical.missing, canonical.absolute", () => {
    for (const { url } of pages) {
      expect(url).toMatch(/^https:\/\/goflag\.tech(\/|$)/);
      expect(() => new URL(url)).not.toThrow();
      // An empty path segment is a different URL to a crawler, so a canonical
      // carrying one does not match the page it sits on.
      expect(new URL(url).pathname).not.toMatch(/\/\//);
      expect(new URL(url).pathname).not.toMatch(/.\/$/);
    }
  });

  it("canonicalises to itself, never to another page — canonical drift", () => {
    const canonicals = pages.map((page) => page.url);

    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it("declares a title and a description — title.missing, description.missing", () => {
    for (const { meta } of pages) {
      expect(meta.title).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it("declares og:title, og:description and og:locale — og.*.missing, og.locale.missing", () => {
    for (const { meta } of pages) {
      expect(meta.openGraph).toMatchObject({
        title: expect.any(String),
        description: expect.any(String),
      });
      // ogp.me defines og:locale as language_TERRITORY.
      expect((meta.openGraph as { locale?: string }).locale).toMatch(/^[a-z]{2,3}_[A-Z0-9]{2,3}$/);
    }
  });

  it("names every alternate with a valid BCP 47 tag — locale.invalid", () => {
    for (const { meta } of pages) {
      for (const tag of Object.keys(meta.alternates?.languages ?? {})) {
        if (tag === "x-default") continue;
        expect(tag).toMatch(/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/);
      }
    }
  });
});

describe("the hreflang cluster", () => {
  it("is reciprocal: if A names B, the page at B names A — hreflang reciprocity", () => {
    const byUrl = new Map(pages.map((page) => [page.url, page]));

    for (const page of pages) {
      const languages = page.meta.alternates?.languages ?? {};

      for (const [tag, target] of Object.entries(languages)) {
        if (tag === "x-default" || typeof target !== "string") continue;

        const other = byUrl.get(target);
        expect(other, `${page.url} names ${target}, which no page renders`).toBeDefined();
        expect(
          other?.meta.alternates?.languages,
          `${target} does not name ${page.url} back`,
        ).toMatchObject({ [tag]: target });
      }
    }
  });

  it("names only pages that exist — the hreflang that 404s", () => {
    const rendered = new Set(pages.map((page) => page.url));

    for (const page of pages) {
      for (const target of Object.values(page.meta.alternates?.languages ?? {})) {
        expect(rendered, `${page.url} points at ${String(target)}`).toContain(String(target));
      }
    }
  });

  it("always carries an x-default, and points it inside its own cluster", () => {
    for (const page of pages) {
      const languages = page.meta.alternates?.languages ?? {};
      const xDefault = languages["x-default"];

      expect(xDefault, `${page.url} has no x-default`).toBeDefined();
      expect(Object.entries(languages).filter(([tag]) => tag !== "x-default")).toContainEqual([
        expect.any(String),
        xDefault,
      ]);
    }
  });

  it("does not name a locale the route is not served in — the phantom translation", () => {
    const imprint = pages.filter((page) => page.url.includes("/imprint"));

    expect(imprint).toHaveLength(2);
    for (const page of imprint) {
      expect(Object.keys(page.meta.alternates?.languages ?? {}).sort()).toEqual([
        "es-ES",
        "fr-FR",
        "x-default",
      ]);
    }
  });
});

describe("the sitemap against the heads", () => {
  const rows = routes.sitemap();

  it("lists exactly the pages the registry renders — sitemap.orphans, and its inverse", () => {
    expect(rows.map((row) => row.url).sort()).toEqual(pages.map((page) => page.url).sort());
  });

  it("declares the same alternates the page does — hreflang.sitemap-mismatch", () => {
    // The disagreement this whole registry exists to make unrepresentable.
    for (const page of pages) {
      const row = rows.find((entry) => entry.url === page.url);
      expect(row, `no sitemap row for ${page.url}`).toBeDefined();

      if (page.route.policy === "monolingual") {
        expect(row?.alternates).toBeUndefined();
        continue;
      }

      expect(row?.alternates?.languages).toEqual(page.meta.alternates?.languages);
    }
  });
});

describe("robots.txt against the pages", () => {
  it("cannot contradict the robots meta tag — robots.conflict", () => {
    for (const indexable of [true, false]) {
      const deployment = defineSite({
        baseUrl: "https://goflag.tech",
        name: "goflag",
        locales: ["en-US"],
        defaultLocale: "en-US",
        indexable,
      });

      const robots = deployment.routes({ home: { path: "" } }).robots();
      const meta = deployment.rootMetadata({ description: "x" });

      const crawlable = !("disallow" in robots.rules && robots.rules.disallow === "/");
      expect(crawlable, `robots.txt and the meta tag disagree at indexable=${indexable}`).toBe(
        (meta.robots as { index: boolean }).index,
      );
    }
  });

  it("declares the sitemap it actually serves — robotstxt.sitemap.unreachable", () => {
    const robots = routes.robots();

    expect(robots.sitemap).toBe(`${site.baseUrl}/sitemap.xml`);
  });
});
