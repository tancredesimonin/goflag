import type { Metadata } from "next";

import { locate } from "./locate";
import type { Site } from "./site";
import type { OgType, Route } from "./types";

/** What a page contributes that the registry cannot know: its words. */
export interface RouteContent {
  title: string;
  description: string;
  /**
   * Skip the root layout's title template, for a page whose title already
   * names the product so it is not repeated twice in a tab.
   */
  absoluteTitle?: boolean;
  keywords?: string[];
  /**
   * An explicit `og:image`, as a site-absolute path.
   *
   * Leave it unset wherever `opengraph-image.tsx` applies: Next renders one per
   * segment at build time and injects the tag itself, so naming one here
   * overrides a file that is already correct. It exists for the routes that
   * cannot use the convention — Next will not place a metadata image under a
   * catch-all segment — which then have to name their card.
   */
  image?: string;
  og?: {
    title?: string;
    description?: string;
    /** Overrides the route family's default. */
    type?: OgType;
    publishedTime?: string;
    modifiedTime?: string;
  };
}

/**
 * Build one page's `<head>`.
 *
 * One builder for both policies. A localized page and a monolingual one differ
 * in the cluster they declare, and that is a property of the route, so it is
 * read from the route rather than chosen by the caller. Two builders is how the
 * hand-written version of this drifted.
 */
export function buildMetadata<L extends string>(
  site: Site<L>,
  route: Route<L>,
  content: RouteContent,
  locale?: L,
): Metadata {
  const location = locate(site, route, locale);
  const pageLocale = route.policy === "monolingual" ? route.locale : locale;

  if (pageLocale === undefined) {
    throw new Error(`Localized route ${JSON.stringify(route.path)} needs a locale`);
  }

  const ogTitle = content.og?.title ?? content.title;
  const ogDescription = content.og?.description ?? content.description;
  const ogType = content.og?.type ?? route.ogType;

  const images = content.image
    ? [{ url: `${site.baseUrl}${content.image}`, width: 1200, height: 630, alt: content.title }]
    : undefined;

  // Only an article carries times. A `website` that declares a published date
  // describes itself with a vocabulary Open Graph does not give it.
  const articleTimes =
    ogType === "article"
      ? {
          ...(content.og?.publishedTime ? { publishedTime: content.og.publishedTime } : {}),
          ...(content.og?.modifiedTime ? { modifiedTime: content.og.modifiedTime } : {}),
        }
      : {};

  return {
    metadataBase: new URL(site.baseUrl),
    title: content.absoluteTitle ? { absolute: content.title } : content.title,
    description: content.description,
    ...(content.keywords ? { keywords: content.keywords } : {}),
    alternates: { canonical: location.url, languages: location.languages },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: location.url,
      siteName: site.name,
      locale: site.openGraphLocale(pageLocale),
      type: ogType,
      ...articleTimes,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: site.twitter.card,
      ...(site.twitter.site ? { site: site.twitter.site } : {}),
      title: ogTitle,
      description: ogDescription,
      ...(images ? { images } : {}),
    },
  };
}
