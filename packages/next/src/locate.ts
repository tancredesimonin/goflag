import type { Site } from "./site";
import type { LocalizedRoute, PageLocation, Route } from "./types";

/**
 * Turning a route into one page's canonical and hreflang cluster.
 *
 * Everything here refuses to invent a URL. A canonical that names a page which
 * does not exist is the defect this whole library is arranged to prevent, and
 * the cheapest place to catch it is the build that would have emitted it.
 */

function localizedUrls<L extends string>(
  site: Site<L>,
  route: LocalizedRoute<L>,
): Record<string, string> {
  return Object.fromEntries(
    route.locales.map((locale) => [site.bcp47(locale), `${site.baseUrl}/${locale}${route.path}`]),
  );
}

/**
 * The `x-default` target: the site's default locale when this route serves it,
 * otherwise the first locale it does serve.
 *
 * The fallback is the point. Pointing `x-default` at the default locale
 * unconditionally means a page translated into two languages that exclude it
 * aims `x-default` at a URL that 404s — an hreflang pointing at nothing, which
 * is the defect goflag leads with.
 */
function xDefaultUrl<L extends string>(site: Site<L>, route: LocalizedRoute<L>): string {
  const locale = route.locales.includes(site.defaultLocale) ? site.defaultLocale : route.locales[0];

  if (locale === undefined) {
    throw new Error(`Route ${JSON.stringify(route.path)} serves no locale`);
  }

  return `${site.baseUrl}/${locale}${route.path}`;
}

/** Every hreflang a localized route declares, `x-default` included. */
export function clusterOf<L extends string>(
  site: Site<L>,
  route: LocalizedRoute<L>,
): Record<string, string> {
  return { ...localizedUrls(site, route), "x-default": xDefaultUrl(site, route) };
}

/**
 * Resolve a route to one page.
 *
 * `locale` is required for a localized route and ignored for a monolingual
 * one. A locale the route does not serve throws rather than producing a URL for
 * a page that was never built.
 */
export function locate<L extends string>(
  site: Site<L>,
  route: Route<L>,
  locale?: string,
): PageLocation {
  if (route.policy === "monolingual") {
    const url = `${site.baseUrl}${route.path}`;

    // Self-referential, and only that. The page exists in one language, so its
    // own tag and `x-default` both point here; naming the other locales would
    // aim a cluster at URLs that 404. Saying nothing at all is what goflag
    // reports as `hreflang.missing` on a multilingual site, and it is right to:
    // silence leaves the language of the page undeclared.
    return { url, languages: { [site.bcp47(route.locale)]: url, "x-default": url } };
  }

  if (locale === undefined) {
    throw new Error(`Localized route ${JSON.stringify(route.path)} needs a locale`);
  }

  if (!route.locales.includes(locale as L)) {
    throw new Error(
      `Route ${JSON.stringify(route.path)} is not served in ${JSON.stringify(locale)} ` +
        `(served in: ${route.locales.join(", ")})`,
    );
  }

  return {
    url: `${site.baseUrl}/${locale}${route.path}`,
    languages: clusterOf(site, route),
  };
}
