import { locales as ALL_LOCALES, type Locale } from "@/i18n/config";

import type { SiteConfig } from "./site";

/**
 * The route registry: one declaration per URL the site serves, read by both the
 * `<head>` and the sitemap.
 *
 * The point of the indirection is that there is only one of it. `sitemap.ts`
 * used to rebuild the same `route × locale` map the metadata builder derived,
 * from the same collections, by hand — two parallel derivations of one truth,
 * held in agreement by vigilance. Disagreement between them is exactly what
 * goflag reports as `hreflang.sitemap-mismatch`, a rule that exists because
 * this happens. Projecting both from one object makes it unrepresentable.
 *
 * Nothing here imports generated content: the algebra is pure so it can be
 * tested without a Next build. The real tables live in `site-routes.ts`.
 * See `docs/next-plan.md` §2.3.
 */

export type OgType = "website" | "article";

/**
 * A route served under `/[locale]`, belonging to an hreflang cluster.
 */
export interface LocalizedRoute {
  readonly policy: "localized";
  /** Path after the locale segment. Empty string for the home page. */
  readonly path: string;
  /**
   * The locales this route is *actually* served in — derived from the content,
   * never assumed to be every locale the site declares. A route that exists in
   * two of four locales must advertise two, or its hreflang cluster points at
   * pages that 404.
   */
  readonly locales: readonly Locale[];
  readonly ogType: OgType;
}

/**
 * A route served at one fixed path, in one language, outside the locale
 * segment. The documentation: a half-translated reference that silently falls
 * back to English is worse than one that says which language it is in.
 */
export interface MonolingualRoute {
  readonly policy: "monolingual";
  /** Full path, from the origin. */
  readonly path: string;
  readonly locale: Locale;
  readonly ogType: OgType;
}

export type Route = LocalizedRoute | MonolingualRoute;

/** Where a single page sits, and the cluster it declares. */
export interface PageLocation {
  /** Absolute URL of this page — the canonical. */
  readonly url: string;
  /** `alternates.languages`, `x-default` included. */
  readonly languages: Readonly<Record<string, string>>;
}

/** One sitemap row, before a framework shape is put on it. */
export interface SitemapUrl {
  readonly url: string;
  readonly languages?: Readonly<Record<string, string>>;
}

function assertPath(path: string, policy: Route["policy"]): void {
  if (policy === "localized" && path === "") return;

  if (!path.startsWith("/")) {
    throw new Error(`Route path must start with "/": received ${JSON.stringify(path)}`);
  }
  if (path.endsWith("/")) {
    throw new Error(`Route path must not end with "/": received ${JSON.stringify(path)}`);
  }
}

/**
 * Declare a localized route, normalising the locale set.
 *
 * Two things happen here that a caller building the list inline would forget.
 *
 * Unknown tags are **dropped**, not trusted: a collection is a directory
 * listing, and a stray folder is not a language. Inferring locales from the
 * shape of a path is the first false positive phase 1 found — `/cv` read as
 * Chuvash — and it produced 31 phantom translation holes.
 *
 * The survivors are ordered by the site's own locale order, so a build cannot
 * reorder `alternates.languages` just because a collection came back in a
 * different sequence. An unstable sitemap makes every diff unreadable.
 */
export function localizedRoute(input: {
  path: string;
  locales: Iterable<string>;
  ogType?: OgType;
  order?: readonly Locale[];
}): LocalizedRoute {
  assertPath(input.path, "localized");

  const order = input.order ?? ALL_LOCALES;
  const declared = new Set(input.locales);
  const resolved = order.filter((locale) => declared.has(locale));

  if (resolved.length === 0) {
    throw new Error(
      `Localized route ${JSON.stringify(input.path)} resolves to no known locale ` +
        `(declared: ${JSON.stringify([...declared])})`,
    );
  }

  return {
    policy: "localized",
    path: input.path,
    locales: resolved,
    ogType: input.ogType ?? "website",
  };
}

/** Declare a route that exists at one path, in one language. */
export function monolingualRoute(input: {
  path: string;
  locale: Locale;
  ogType?: OgType;
}): MonolingualRoute {
  assertPath(input.path, "monolingual");

  return {
    policy: "monolingual",
    path: input.path,
    locale: input.locale,
    ogType: input.ogType ?? "website",
  };
}

/**
 * The `x-default` target: the default locale when this route has it, otherwise
 * the first one it does have.
 *
 * The fallback is the whole reason this is a function. Pointing `x-default` at
 * the default locale unconditionally means a route translated into two
 * languages that do not include the default aims its `x-default` at a URL that
 * does not exist — an hreflang pointing at a 404, which is the headline example
 * in goflag's own README.
 */
function xDefaultUrl(
  route: LocalizedRoute,
  urls: Readonly<Record<string, string>>,
  config: SiteConfig,
): string {
  const preferred = route.locales.includes(config.defaultLocale)
    ? config.defaultLocale
    : route.locales[0];

  const url = preferred === undefined ? undefined : urls[preferred];
  if (url === undefined) {
    throw new Error(`Route ${JSON.stringify(route.path)} has no locale to serve as x-default`);
  }

  return url;
}

function localizedUrls(
  route: LocalizedRoute,
  config: SiteConfig,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    route.locales.map((locale) => [locale, `${config.baseUrl}/${locale}${route.path}`]),
  );
}

/**
 * Resolve a route to one page: its canonical and its hreflang cluster.
 *
 * Asking for a locale a route is not served in throws rather than inventing a
 * URL. It is a build-time mistake, and the alternative is a canonical for a
 * page that does not exist — the failure mode this whole layer is built to
 * prevent.
 */
export function locate(config: SiteConfig, route: Route, locale?: string): PageLocation {
  if (route.policy === "monolingual") {
    const url = `${config.baseUrl}${route.path}`;

    // Self-referential, and only that. The page exists in one language, so its
    // own tag and `x-default` both point here; listing the other locales would
    // aim a cluster at URLs that 404. Declaring nothing at all is what goflag
    // reports as `hreflang.missing` on a site that serves four locales, and it
    // is right to: silence leaves the language of this page undeclared.
    return { url, languages: { [route.locale]: url, "x-default": url } };
  }

  if (locale === undefined) {
    throw new Error(`Localized route ${JSON.stringify(route.path)} needs a locale`);
  }

  const urls = localizedUrls(route, config);
  const url = urls[locale];

  if (url === undefined) {
    throw new Error(
      `Route ${JSON.stringify(route.path)} is not served in ${JSON.stringify(locale)} ` +
        `(served in: ${route.locales.join(", ")})`,
    );
  }

  return { url, languages: { ...urls, "x-default": xDefaultUrl(route, urls, config) } };
}

/**
 * Freeze a set of route declarations into a registry, refusing duplicates.
 *
 * Two routes on one path is not a harmless redundancy: the lookup answers with
 * the first and the sitemap lists the page twice, so the head and the sitemap
 * describe different routes under the same URL. It is also reachable by
 * accident — a documentation page whose slug is `cli` collides with the
 * hand-declared `/docs/cli` — which is why it is checked rather than assumed.
 */
export function defineRegistry(routes: readonly Route[]): readonly Route[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const route of routes) {
    if (seen.has(route.path)) duplicates.push(route.path);
    seen.add(route.path);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate route paths in the registry: ${duplicates.join(", ")}`);
  }

  return Object.freeze([...routes]);
}

/** Look a route up by the path a page declares. */
export function findRoute(routes: readonly Route[], path: string): Route | undefined {
  return routes.find((route) => route.path === path);
}

/**
 * Look a route up, or fail the build.
 *
 * An unregistered path is not a missing entry in a lookup table — it is a page
 * that renders a canonical and never appears in the sitemap. Returning
 * `undefined` here would let that ship quietly; throwing at build time is the
 * mechanism that keeps the two projections in step.
 */
export function requireRoute(routes: readonly Route[], path: string): Route {
  const route = findRoute(routes, path);

  if (route === undefined) {
    throw new Error(
      `No route registered for ${JSON.stringify(path)}. Add it to site-routes.ts — ` +
        `a page absent from the registry is absent from the sitemap.`,
    );
  }

  return route;
}

/**
 * Every URL the site serves, in registry order.
 *
 * Monolingual routes carry no `languages`: the sitemap lists the page, and the
 * page's own head declares its self-referential cluster. Repeating a
 * single-entry cluster in the sitemap adds no information a consumer does not
 * already have from the document.
 */
export function sitemapUrls(config: SiteConfig, routes: readonly Route[]): SitemapUrl[] {
  return routes.flatMap((route) => {
    if (route.policy === "monolingual") {
      return [{ url: `${config.baseUrl}${route.path}` }];
    }

    const languages = { ...localizedUrls(route, config) };
    const withDefault = { ...languages, "x-default": xDefaultUrl(route, languages, config) };

    return route.locales.map((locale) => ({
      url: `${config.baseUrl}/${locale}${route.path}`,
      languages: withDefault,
    }));
  });
}
