import type { Metadata, MetadataRoute } from "next";

import { clusterOf, locate } from "./locate";
import { buildMetadata, type RouteContent } from "./metadata";
import type { Site } from "./site";
import type { ChangeFrequency, OgType, Route } from "./types";

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

/**
 * The sitemap fields beyond the URL.
 *
 * `changeFrequency` and `priority` are in the sitemaps.org protocol and ignored
 * by Google. They are supported because they are valid, not because they are
 * useful: dropping a field the protocol defines is the site's decision to make,
 * not this library's. `priority` outside 0.0–1.0 is refused, which is the one
 * thing about them a consumer really does act on.
 */
export interface SitemapFacts {
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

/** A route declared on its own, by path. */
export type RouteInput<L extends string> =
  | (SitemapFacts & {
      path: string;
      /** Restrict the cluster. Defaults to every locale the site serves. */
      locales?: readonly L[];
      locale?: never;
      ogType?: OgType;
      lastModified?: Date | string | number;
    })
  | (SitemapFacts & {
      path: string;
      /** Fixed: this route exists in one language, outside the locale segment. */
      locale: L;
      locales?: never;
      ogType?: OgType;
      lastModified?: Date | string | number;
    });

/** What `collection()` returns. Opaque on purpose — build it with the helper. */
export interface CollectionFamily {
  readonly kind: "collection";
  /** Whether the rows group into hreflang clusters by path. */
  readonly clustered: boolean;
  readonly rows: readonly {
    readonly path: string;
    readonly locale: string;
    readonly lastModified?: Date;
  }[];
  readonly ogType?: OgType;
  readonly changeFrequency?: ChangeFrequency;
  readonly priority?: number;
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
  input: SitemapFacts & {
    path: (entry: E) => string;
    locale: (entry: E) => string;
    ogType?: OgType;
    lastModified?: (entry: E) => Date | string | number | undefined;
  },
): CollectionFamily;
export function collection<E>(
  entries: readonly E[],
  input: SitemapFacts & {
    path: (entry: E) => string;
    locale: string;
    ogType?: OgType;
    lastModified?: (entry: E) => Date | string | number | undefined;
  },
): CollectionFamily;
export function collection<E>(
  entries: readonly E[],
  input: SitemapFacts & {
    path: (entry: E) => string;
    locale: string | ((entry: E) => string);
    ogType?: OgType;
    lastModified?: (entry: E) => Date | string | number | undefined;
  },
): CollectionFamily {
  const clustered = typeof input.locale === "function";
  assertPriority(input.priority);

  return {
    kind: "collection",
    clustered,
    rows: entries.map((entry) => {
      const path = input.path(entry);
      const stamp = input.lastModified?.(entry);

      return {
        path,
        locale: typeof input.locale === "function" ? input.locale(entry) : input.locale,
        ...(stamp === undefined ? {} : { lastModified: toDate(stamp, path) }),
      };
    }),
    ...(input.ogType ? { ogType: input.ogType } : {}),
    ...(input.changeFrequency ? { changeFrequency: input.changeFrequency } : {}),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  };
}

/**
 * `lastmod` must be a W3C datetime, which is what `sitemap.lastmod.invalid`
 * reports on. An unparseable date reaching the XML would be an invalid field in
 * the one document that tells a crawler what to fetch, so it fails here.
 */
function toDate(value: Date | string | number, path: string): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Route ${JSON.stringify(path)} has an unparseable lastModified: ${JSON.stringify(value)}`,
    );
  }

  return date;
}

/** sitemaps.org bounds `<priority>` to 0.0–1.0; outside it the field is invalid. */
function assertPriority(priority: number | undefined): void {
  if (priority === undefined) return;

  if (!Number.isFinite(priority) || priority < 0 || priority > 1) {
    throw new Error(`Sitemap priority must be between 0.0 and 1.0, received ${priority}`);
  }
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
  const facts = {
    ...(input.changeFrequency ? { changeFrequency: input.changeFrequency } : {}),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  };

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
          ...facts,
          ...(row.lastModified ? { lastModified: row.lastModified } : {}),
        };
      });
    }

    // One route per path, carrying every locale that declared that path — and
    // that locale's own last-modified, since a translation is edited on its own
    // day and a single date per route would misreport three rows in four.
    const byPath = new Map<string, Map<string, Date | undefined>>();
    for (const row of input.rows) {
      assertPath(row.path, true);
      assertServed(site, row.locale, row.path);
      const group = byPath.get(row.path) ?? new Map<string, Date | undefined>();
      group.set(row.locale, row.lastModified);
      byPath.set(row.path, group);
    }

    return [...byPath].map(([path, group]) => {
      const stamps = Object.fromEntries(
        [...group].filter((pair): pair is [string, Date] => pair[1] !== undefined),
      ) as Partial<Record<L, Date>>;

      return {
        policy: "localized" as const,
        family,
        path,
        // Ordered by the site's own locale order, so a collection returning its
        // entries in a different sequence cannot reorder `alternates.languages`
        // and make every sitemap diff unreadable.
        locales: site.locales.filter((locale) => group.has(locale)),
        ogType,
        ...facts,
        ...(Object.keys(stamps).length > 0 ? { lastModified: stamps } : {}),
      };
    });
  }

  const lastModified =
    input.lastModified === undefined ? undefined : toDate(input.lastModified, input.path);

  if (input.locale !== undefined) {
    assertPath(input.path, false);
    assertPriority(input.priority);
    return [
      {
        policy: "monolingual",
        family,
        path: input.path,
        locale: assertServed(site, input.locale, input.path),
        ogType,
        ...facts,
        ...(lastModified ? { lastModified } : {}),
      },
    ];
  }

  assertPath(input.path, true);
  assertPriority(input.priority);
  const declared = new Set<string>(input.locales ?? site.locales);
  for (const locale of declared) assertServed(site, locale, input.path);

  const locales = site.locales.filter((locale) => declared.has(locale));
  if (locales.length === 0) {
    throw new Error(`Route ${JSON.stringify(input.path)} resolves to no locale`);
  }

  const stamps = lastModified
    ? (Object.fromEntries(locales.map((locale) => [locale, lastModified])) as Partial<
        Record<L, Date>
      >)
    : undefined;

  return [
    {
      policy: "localized",
      family,
      path: input.path,
      locales,
      ogType,
      ...facts,
      ...(stamps ? { lastModified: stamps } : {}),
    },
  ];
}

export interface SitemapOptions {
  /** Fallback for rows whose route supplied no date of its own. */
  lastModified?: Date;
}

export interface RobotsOptions {
  /**
   * Extra paths to disallow while the site is indexable. Ignored when it is
   * not: a site that forbids everything has nothing to add to that.
   */
  disallow?: string | string[];
  /**
   * Emit the non-standard `Host:` directive.
   *
   * Off by default. Only Yandex ever read it, Google ignores it, and goflag
   * reports an unrecognised directive as `robotstxt.unknown-directive` — this
   * library has no business producing output its own auditor warns about.
   */
  host?: boolean;
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
  robots(options?: RobotsOptions): MetadataRoute.Robots;
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
      const fallback = options?.lastModified;

      return all.flatMap((route) => {
        const facts = {
          ...(route.changeFrequency ? { changeFrequency: route.changeFrequency } : {}),
          ...(route.priority === undefined ? {} : { priority: route.priority }),
        };

        if (route.policy === "monolingual") {
          const lastModified = route.lastModified ?? fallback;

          // No `alternates` on a single-page cluster: the sitemap lists the
          // page, and the page's own head declares the self-reference. A
          // one-entry cluster repeated here tells a consumer nothing it does
          // not already have from the document.
          return [
            {
              url: `${site.baseUrl}${route.path}`,
              ...(lastModified ? { lastModified } : {}),
              ...facts,
            },
          ];
        }

        const languages = clusterOf(site, route);

        return route.locales.map((locale) => {
          const lastModified = route.lastModified?.[locale] ?? fallback;

          return {
            url: locate(site, route, locale).url,
            ...(lastModified ? { lastModified } : {}),
            ...facts,
            alternates: { languages },
          };
        });
      });
    },

    robots(options) {
      if (!site.indexable) {
        return { rules: { userAgent: "*", disallow: "/" } };
      }

      const disallow = options?.disallow;

      return {
        rules: {
          userAgent: "*",
          allow: "/",
          ...(disallow === undefined ? {} : { disallow }),
        },
        sitemap: `${site.baseUrl}/sitemap.xml`,
        ...(options?.host ? { host: site.baseUrl } : {}),
      };
    },
  };
}
