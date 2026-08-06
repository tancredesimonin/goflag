import type { Metadata } from "next";

import { localeToOGCompatibleLocale } from "@/i18n/config";

import { locate, type OgType, type Route } from "./routes";
import type { SiteConfig } from "./site";

/**
 * The one metadata builder.
 *
 * There used to be two — one for localized pages, one for the documentation —
 * and the split was not cosmetic: the documentation sits outside the locale
 * segment and declares a self-referential hreflang cluster, while a localized
 * page declares the full one. That difference is a property of the *route*, so
 * it moved into the registry, and one function reads it. See
 * `docs/next-plan.md` §2.1.
 *
 * Nothing here reads `process.env`. The configuration arrives as a value, which
 * is what lets every case below be asserted without mutating a global.
 */

/**
 * Robots directives for the whole tree.
 *
 * Declared once at the root and inherited by every child segment that does not
 * override it. It reads the same `indexable` flag as `robots.txt`, so the two
 * declarations cannot disagree — which is what `robots.conflict` reports when
 * they do.
 *
 * Icons are deliberately absent: `app/icon.svg` and `app/apple-icon.tsx` are
 * picked up by Next's file conventions, and declaring them twice is how a site
 * ends up linking a favicon it does not serve.
 */
export function rootRobots(config: SiteConfig): Metadata["robots"] {
  return {
    index: config.indexable,
    follow: config.indexable,
    googleBot: { index: config.indexable, follow: config.indexable },
  };
}

/**
 * Trim to the 160-character window `description.length` reports on, at a word
 * boundary. Used where the text is generated from another source — a rule's own
 * prose — and cannot simply be rewritten shorter by hand.
 */
export function clampDescription(text: string, max = 160): string {
  if (text.length <= max) return text;

  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, "")}…`;
}

export interface RouteContent {
  title: string;
  description: string;
  /**
   * Skip the `%s · goflag` template from the root layout, for pages whose title
   * already names the product so it is not repeated twice in a tab.
   */
  absoluteTitle?: boolean;
  /**
   * An explicit `og:image`, as a site-absolute path.
   *
   * Localized pages leave this alone: `opengraph-image.tsx` renders one per
   * segment at build time and Next injects the tag itself, so setting it here
   * would override a file that is already correct. The documentation cannot use
   * that convention — Next will not place a metadata image under a catch-all
   * segment — so those pages name their card instead.
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
 * Build the `<head>` for one page of one route.
 *
 * `locale` is required for a localized route and ignored for a monolingual one.
 * Passing a locale a route is not served in throws rather than emitting a
 * canonical for a page that does not exist.
 */
export function buildMetadata(
  config: SiteConfig,
  route: Route,
  content: RouteContent,
  locale?: string,
): Metadata {
  const location = locate(config, route, locale);
  const pageLocale = route.policy === "monolingual" ? route.locale : locale;

  const ogTitle = content.og?.title ?? content.title;
  const ogDescription = content.og?.description ?? content.description;
  const ogType = content.og?.type ?? route.ogType;

  const images = content.image
    ? [{ url: `${config.baseUrl}${content.image}`, width: 1200, height: 630, alt: content.title }]
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
    metadataBase: new URL(config.baseUrl),
    title: content.absoluteTitle ? { absolute: content.title } : content.title,
    description: content.description,
    alternates: { canonical: location.url, languages: location.languages },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: location.url,
      siteName: config.name,
      locale: localeToOGCompatibleLocale(pageLocale ?? ""),
      type: ogType,
      ...articleTimes,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(images ? { images } : {}),
    },
  };
}
