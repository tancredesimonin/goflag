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
   * An explicit `og:image`, as a site-absolute path or a described one.
   *
   * Leave it unset wherever `opengraph-image.tsx` applies: Next renders one per
   * segment at build time and injects the tag itself, so naming one here
   * overrides a file that is already correct. It exists for the routes that
   * cannot use the convention — Next will not place a metadata image under a
   * catch-all segment — which then have to name their card.
   *
   * **A bare string declares no dimensions, and that is the change.** This used
   * to attach `width: 1200, height: 630` to whatever path it was handed, having
   * never looked at the file. On this site the cards really are that shape, so
   * the numbers happened to be right; on stereo-house the same field carries
   * cover art, and they were not — 1024×1024 artwork and a 337-byte 1×1
   * placeholder, both declared 1200×630 by this library.
   *
   * Worse than wrong: `og.image.ratio` reads those two numbers and refuses to
   * fetch, so an invented 1200×630 scored 1.9 and passed. goflag was blinded by
   * `@goflag/next`, which is the one direction that loop must never run. It is
   * the same shape as `imageAlt` below — a value the library was never in a
   * position to know, supplied anyway, and plausible enough to silence the rule
   * that would have asked.
   *
   * So the shape is the caller's to state, because the caller is the only one
   * that knows it. Say nothing and `og.image.dimensions` asks you to measure —
   * the honest verdict, and a better one than a confident lie.
   */
  image?: string | RouteImage;
  /**
   * What is *in* that image, for `og:image:alt`.
   *
   * Required alongside `image`, and deliberately not defaulted: this used to
   * fall back to the page title, which satisfies `og.image.alt` — the rule
   * checks presence — while saying nothing about the picture. ogp.me is
   * explicit that the field is "a description of what is in the image (not a
   * caption)", so the title is the one value that is always available and
   * always wrong.
   *
   * A library cannot describe a card it did not draw. Omitting the tag makes
   * `og.image.alt` fire, which is the rule doing its job; substituting the
   * title made it pass on a defect nothing could then name.
   */
  imageAlt?: string;
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
/**
 * Where a card is and what shape it has — never what is in it.
 *
 * `imageAlt` stays the one place that answers the last question, because a
 * description of the picture and a description of the file are two different
 * claims and only one of them is measurable. Every field here is optional and
 * none is invented: what is absent is absent from the HTML, and goflag says so.
 */
export interface RouteImage {
  /** Site-absolute path, as a bare string would be. */
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  /** `og:image:type`, which lets a crawler skip a format it cannot render. */
  readonly type?: string;
}

function describeImage(baseUrl: string, content: RouteContent) {
  if (!content.image) return undefined;

  const image: RouteImage =
    typeof content.image === "string" ? { url: content.image } : content.image;

  return [
    {
      url: `${baseUrl}${image.url}`,
      ...(image.width !== undefined ? { width: image.width } : {}),
      ...(image.height !== undefined ? { height: image.height } : {}),
      ...(image.type !== undefined ? { type: image.type } : {}),
      ...(content.imageAlt ? { alt: content.imageAlt } : {}),
    },
  ];
}

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

  const images = describeImage(site.baseUrl, content);

  // The same cluster `alternates.languages` declares, said in the other
  // vocabulary. Two lists for one fact drift apart when they are written twice,
  // so both are derived from `route.locales` here — which is what goflag
  // reports as `og.locale.alternates` when they disagree, and what this library
  // failed until the rule existed to say so.
  //
  // A monolingual route names none: it exists in one language, and listing the
  // others would advertise translations that were never built. Absent rather
  // than empty, for the same reason the sitemap omits what it cannot promise.
  const alternateLocale =
    route.policy === "monolingual"
      ? []
      : route.locales.filter((l) => l !== pageLocale).map((l) => site.openGraphLocale(l));

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
      ...(alternateLocale.length > 0 ? { alternateLocale } : {}),
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
