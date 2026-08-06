import { allDocs, allLegals } from "content-collections";
import type { Metadata } from "next";

import { locales } from "@/i18n/config";
import { docsHref } from "@/lib/docs-nav";
import { ALL_RULES } from "@/lib/rules-catalog";

import { buildMetadata, type RouteContent } from "./metadata";
import {
  defineRegistry,
  localizedRoute,
  monolingualRoute,
  requireRoute,
  sitemapUrls,
  type Route,
  type SitemapUrl,
} from "./routes";
import { siteConfig } from "./site";

/**
 * Every URL this site serves, declared once.
 *
 * This is the only file in the metadata layer that touches generated content,
 * which is what keeps `routes.ts` and `metadata.ts` testable without a Next
 * build. Adding a page means adding it here; a page that renders a canonical
 * without a registry entry fails the build rather than shipping absent from the
 * sitemap.
 */

/** The legal pages, in the order the collection returns them. */
const LEGAL_SLUGS = [...new Set(allLegals.map((doc) => doc.slug))];

/**
 * Pages under `/[locale]`.
 *
 * The home page and the changelog are rendered for every locale the site
 * declares. The legal pages are not assumed to be: their locale set is
 * **derived** from the collection. The sitemap used to assume it while the
 * page's own head derived it, so translating a legal notice into three
 * languages instead of four would have put a fourth URL in the sitemap and left
 * it out of every hreflang cluster — the disagreement `hreflang.sitemap-mismatch`
 * exists to catch.
 */
const LOCALIZED: Route[] = [
  localizedRoute({ path: "", locales }),
  localizedRoute({ path: "/changelog", locales }),
  ...LEGAL_SLUGS.map((slug) =>
    localizedRoute({
      path: `/${slug}`,
      locales: allLegals.filter((doc) => doc.slug === slug).map((doc) => doc.locale),
    }),
  ),
];

/**
 * The documentation: one language, outside the locale segment.
 *
 * `article` rather than `website` because that is what these pages are, and it
 * is the type that gives Open Graph a vocabulary for a modified date.
 */
const DOCS = { locale: "en", ogType: "article" } as const;

/**
 * Pages outside the locale segment.
 *
 * English only, and deliberately so: a half-translated reference that quietly
 * falls back to English is worse than one that says which language it is in.
 */
const MONOLINGUAL: Route[] = [
  ...allDocs.map((doc) => monolingualRoute({ path: docsHref(doc.slug), ...DOCS })),
  monolingualRoute({ path: "/docs/cli", ...DOCS }),
  monolingualRoute({ path: "/docs/rules", ...DOCS }),
  ...ALL_RULES.map((rule) => monolingualRoute({ path: `/docs/rules/${rule.id}`, ...DOCS })),
];

export const SITE_ROUTES: readonly Route[] = defineRegistry([...LOCALIZED, ...MONOLINGUAL]);

/**
 * Build the `<head>` for a page, looking its policy up by path.
 *
 * The call site names a path and its content; whether that path belongs to an
 * hreflang cluster, and which locales are in it, is the registry's answer, not
 * the page's. That is what removed `availableLocales` from the one call site
 * that used to compute it by hand.
 */
export function routeMetadata(input: RouteContent & { path: string; locale?: string }): Metadata {
  return buildMetadata(siteConfig(), requireRoute(SITE_ROUTES, input.path), input, input.locale);
}

/** Every URL in the sitemap, projected from the same registry as the heads. */
export function siteSitemapUrls(): SitemapUrl[] {
  return sitemapUrls(siteConfig(), SITE_ROUTES);
}
