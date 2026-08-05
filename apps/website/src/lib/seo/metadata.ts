import type { Metadata } from "next";
import { defaultLocale, locales, localeToOGCompatibleLocale } from "@/i18n/config";
import { SITE } from "@/lib/constants";

/**
 * The public origin. Every canonical and every hreflang is built from this, so
 * a wrong value here is exactly the `canonical.absolute` failure goflag reports
 * — the one that de-indexes a site without anyone touching a page.
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WEBSITE_FRONTEND_URL || `https://${SITE.domain}`;
}

export function isProduction(): boolean {
  return process.env.APP_ENV === "production";
}

/**
 * Robots is inherited by child segments when they do not override it, so it is
 * declared once at the root and every route gets it. Icons are not here on
 * purpose: `app/icon.svg` and `app/apple-icon.tsx` are picked up by Next's file
 * conventions, and declaring them twice is how a site ends up linking a favicon
 * it does not serve.
 */
export function rootRobots(): Metadata["robots"] {
  const production = isProduction();
  return {
    index: production,
    follow: production,
    googleBot: { index: production, follow: production },
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

interface CommonInput {
  title: string;
  description: string;
  /**
   * Skip the `%s — goflag` template from the root layout. For pages whose title
   * already names the product, so it is not repeated twice in a tab.
   */
  absoluteTitle?: boolean;
  keywords?: string[];
  og?: {
    title?: string;
    description?: string;
    type?: "website" | "article";
    publishedTime?: string;
    modifiedTime?: string;
  };
}

interface LocalizedInput extends CommonInput {
  locale: string;
  /** Path after the locale segment. Empty string for the home page. */
  path: string;
  /** Restrict hreflang alternates to these locales. Defaults to all four. */
  availableLocales?: readonly string[];
}

/**
 * Metadata for a localized page: canonical, reciprocal hreflang alternates
 * including `x-default`, Open Graph and a Twitter card.
 *
 * The `og:image` is deliberately absent: `opengraph-image.tsx` renders one per
 * segment at build time and Next injects the tag itself. Setting `images` here
 * would override a file that is already correct.
 */
export function buildPageMetadata(input: LocalizedInput): Metadata {
  const { locale, path, title, description, keywords, og } = input;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/${locale}${path}`;

  const available = input.availableLocales ?? locales;
  const languages: Record<string, string> = {};
  for (const loc of available) {
    languages[loc] = `${baseUrl}/${loc}${path}`;
  }
  languages["x-default"] = `${baseUrl}/${defaultLocale}${path}`;

  return {
    metadataBase: new URL(baseUrl),
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: url, languages },
    openGraph: {
      title: og?.title ?? title,
      description: og?.description ?? description,
      url,
      siteName: SITE.name,
      locale: localeToOGCompatibleLocale(locale),
      type: og?.type ?? "website",
      ...(og?.type === "article"
        ? { publishedTime: og.publishedTime, modifiedTime: og.modifiedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: og?.title ?? title,
      description: og?.description ?? description,
    },
  };
}

/**
 * Metadata for a documentation page.
 *
 * `/docs` sits outside the locale prefix: the documentation exists in English
 * only, so its hreflang set is self-referential rather than a cluster.
 */
export function buildDocsMetadata(input: CommonInput & { path: string; image?: string }): Metadata {
  const { path, title, description, keywords, og } = input;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  // Unlike the localized pages, the docs cannot rely on the `opengraph-image`
  // file convention: they are one catch-all route, and Next will not place a
  // metadata image under a catch-all segment. Pages that have a card name it.
  const images = input.image
    ? [{ url: `${baseUrl}${input.image}`, width: 1200, height: 630, alt: title }]
    : undefined;

  return {
    metadataBase: new URL(baseUrl),
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    // Self-referential, and only that. The page exists in English alone, so
    // `en` and `x-default` both point here; listing `fr` or `es` would aim a
    // cluster at URLs that 404. Declaring nothing at all is what goflag reports
    // as `hreflang.missing` on a site that serves four locales, and it is right
    // to: silence would leave the language of this page undeclared.
    alternates: { canonical: url, languages: { en: url, "x-default": url } },
    openGraph: {
      title: og?.title ?? title,
      description: og?.description ?? description,
      url,
      siteName: SITE.name,
      locale: localeToOGCompatibleLocale(defaultLocale),
      type: "article",
      ...(images ? { images } : {}),
      ...(og?.publishedTime ? { publishedTime: og.publishedTime } : {}),
      ...(og?.modifiedTime ? { modifiedTime: og.modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: og?.title ?? title,
      description: og?.description ?? description,
      ...(images ? { images } : {}),
    },
  };
}
