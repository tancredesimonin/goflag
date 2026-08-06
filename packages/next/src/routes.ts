import type { Metadata, MetadataRoute } from "next";

import { clusterOf, locate } from "./locate";
import { buildMetadata, type RouteContent } from "./metadata";
import type { Site } from "./site";
import type { OgType, Route } from "./types";

/**
 * The route registry.
 *
 * One declaration per URL the site serves, projected into the `<head>`, the
 * sitemap and robots.txt. The point of the indirection is that there is only
 * one of it: a sitemap derived separately from the metadata is two derivations
 * of one truth held in agreement by vigilance, and their disagreement is
 * exactly what goflag reports as `hreflang.sitemap-mismatch`.
 *
 * **A fixed `locale` means the route stands alone; a derived or absent one
 * means it clusters.** That single rule replaces a `policy` field: the
 * documentation says `locale: "en"` because it is English and only English,
 * while a legal notice says `locale: (doc) => doc.locale` because its cluster
 * is whatever has been translated.
 */

/** A route declared on its own, by path. */
export type RouteInput<L extends string> =
  | {
      path: string;
      /** Restrict the cluster. Defaults to every locale the site serves. */
      locales?: readonly L[];
      locale?: never;
      ogType?: OgType;
    }
  | {
      path: string;
      /** Fixed: this route exists in one language, outside the locale segment. */
      locale: L;
      locales?: never;
      ogType?: OgType;
    };

/** What `collection()` returns. Opaque on purpose — build it with the helper. */
export interface CollectionFamily {
  readonly kind: "collection";
  /** Whether the rows group into hreflang clusters by path. */
  readonly clustered: boolean;
  readonly rows: readonly { readonly path: string; readonly locale: string }[];
  readonly ogType?: OgType;
}

export type FamilyInput<L extends string> = RouteInput<L> | CollectionFamily;

/**
 * Derive a family of routes from a content collection.
 *
 * Availability per locale is **derived**, never declared twice. Adding a
 * translation updates the hreflang cluster, the sitemap and the alternates
 * together, because they all read this. That is the case the hand-written
 * version got wrong: the sitemap assumed every locale while the page derived
 * its own set.
 */
export function collection<E>(
  entries: readonly E[],
  input: { path: (entry: E) => string; locale: (entry: E) => string; ogType?: OgType },
): CollectionFamily;
export function collection<E>(
  entries: readonly E[],
  input: { path: (entry: E) => string; locale: string; ogType?: OgType },
): CollectionFamily;
export function collection<E>(
  entries: readonly E[],
  input: {
    path: (entry: E) => string;
    locale: string | ((entry: E) => string);
    ogType?: OgType;
  },
): CollectionFamily {
  const clustered = typeof input.locale === "function";

  return {
    kind: "collection",
    clustered,
    rows: entries.map((entry) => ({
      path: input.path(entry),
      locale: typeof input.locale === "function" ? input.locale(entry) : input.locale,
    })),
    ...(input.ogType ? { ogType: input.ogType } : {}),
  };
}

function assertPath(path: string, clustered: boolean): void {
  if (clustered && path === "") return;

  if (!path.startsWith("/")) {
    throw new Error(`Route path must start with "/": received ${JSON.stringify(path)}`);
  }
  if (path.endsWith("/")) {
    throw new Error(`Route path must not end with "/": received ${JSON.stringify(path)}`);
  }
}

function assertServed<L extends string>(site: Site<L>, locale: string, path: string): L {
  if (!site.servesLocale(locale)) {
    // Not dropped. A collection entry in a locale the site does not declare is
    // a contradiction between the content and the declaration, and picking a
    // side silently means either a page nobody links to or a locale nobody
    // asked for. Both are the kind of quiet subtraction this library exists to
    // refuse.
    throw new Error(
      `Route ${JSON.stringify(path)} declares locale ${JSON.stringify(locale)}, which the ` +
        `site does not serve (${site.locales.join(", ")})`,
    );
  }

  return locale;
}

function resolveFamily<L extends string>(
  site: Site<L>,
  family: string,
  input: FamilyInput<L>,
): Route<L>[] {
  const ogType = input.ogType ?? "website";

  if ("kind" in input) {
    if (!input.clustered) {
      return input.rows.map((row) => {
        assertPath(row.path, false);
        return {
          policy: "monolingual" as const,
          family,
          path: row.path,
          locale: assertServed(site, row.locale, row.path),
          ogType,
        };
      });
    }

    // One route per path, carrying every locale that declared that path.
    const byPath = new Map<string, Set<string>>();
    for (const row of input.rows) {
      assertPath(row.path, true);
      assertServed(site, row.locale, row.path);
      byPath.set(row.path, (byPath.get(row.path) ?? new Set()).add(row.locale));
    }

    return [...byPath].map(([path, declared]) => ({
      policy: "localized" as const,
      family,
      path,
      // Ordered by the site's own locale order, so a collection returning its
      // entries in a different sequence cannot reorder `alternates.languages`
      // and make every sitemap diff unreadable.
      locales: site.locales.filter((locale) => declared.has(locale)),
      ogType,
    }));
  }

  if (input.locale !== undefined) {
    assertPath(input.path, false);
    return [
      {
        policy: "monolingual",
        family,
        path: input.path,
        locale: assertServed(site, input.locale, input.path),
        ogType,
      },
    ];
  }

  assertPath(input.path, true);
  const declared = new Set<string>(input.locales ?? site.locales);
  for (const locale of declared) assertServed(site, locale, input.path);

  const locales = site.locales.filter((locale) => declared.has(locale));
  if (locales.length === 0) {
    throw new Error(`Route ${JSON.stringify(input.path)} resolves to no locale`);
  }

  return [{ policy: "localized", family, path: input.path, locales, ogType }];
}

export interface SitemapOptions {
  /** Applied to every entry. Omitted entirely when not given. */
  lastModified?: Date;
}

export interface Routes<L extends string, K extends string> {
  /** Every route, in declaration order. */
  readonly all: readonly Route<L>[];
  /** The routes one family declared — enough to derive `generateStaticParams`. */
  family(name: K): readonly Route<L>[];
  find(path: string): Route<L> | undefined;
  /** Look a route up, or fail the build. */
  require(path: string): Route<L>;
  /** One page's `<head>`. */
  metadata(input: { path: string; locale?: L } & RouteContent): Metadata;
  sitemap(options?: SitemapOptions): MetadataRoute.Sitemap;
  robots(): MetadataRoute.Robots;
}

/**
 * Resolve a set of families into a registry.
 *
 * Two routes on one path is refused rather than tolerated: the lookup would
 * answer with the first while the sitemap listed the page twice, so the head
 * and the sitemap would describe different routes under one URL. It is
 * reachable by accident — a collection whose slug collides with a
 * hand-declared path — which is why it is checked.
 */
export function defineRoutes<L extends string, F extends Record<string, FamilyInput<L>>>(
  site: Site<L>,
  families: F,
): Routes<L, Extract<keyof F, string>> {
  const all: Route<L>[] = [];
  const byPath = new Map<string, Route<L>>();

  for (const [name, input] of Object.entries(families) as [string, FamilyInput<L>][]) {
    for (const route of resolveFamily(site, name, input)) {
      const existing = byPath.get(route.path);
      if (existing) {
        throw new Error(
          `Duplicate route path ${JSON.stringify(route.path)}, declared by both ` +
            `${JSON.stringify(existing.family)} and ${JSON.stringify(route.family)}`,
        );
      }

      byPath.set(route.path, route);
      all.push(route);
    }
  }

  const require_ = (path: string): Route<L> => {
    const route = byPath.get(path);
    if (route === undefined) {
      throw new Error(
        `No route registered for ${JSON.stringify(path)}. Declare it in site.routes() — ` +
          `a page absent from the registry is absent from the sitemap.`,
      );
    }
    return route;
  };

  return {
    all,

    family(name) {
      return all.filter((route) => route.family === name);
    },

    find(path) {
      return byPath.get(path);
    },

    require: require_,

    metadata({ path, locale, ...content }) {
      return buildMetadata(site, require_(path), content, locale);
    },

    sitemap(options) {
      const lastModified = options?.lastModified;

      return all.flatMap((route) => {
        if (route.policy === "monolingual") {
          // No `alternates` on a single-page cluster: the sitemap lists the
          // page, and the page's own head declares the self-reference. A
          // one-entry cluster repeated here tells a consumer nothing it does
          // not already have from the document.
          return [
            {
              url: `${site.baseUrl}${route.path}`,
              ...(lastModified ? { lastModified } : {}),
            },
          ];
        }

        const languages = clusterOf(site, route);

        return route.locales.map((locale) => ({
          url: locate(site, route, locale).url,
          ...(lastModified ? { lastModified } : {}),
          alternates: { languages },
        }));
      });
    },

    robots() {
      if (!site.indexable) {
        return { rules: { userAgent: "*", disallow: "/" } };
      }

      return {
        rules: { userAgent: "*", allow: "/" },
        sitemap: `${site.baseUrl}/sitemap.xml`,
        host: site.baseUrl,
      };
    },
  };
}
