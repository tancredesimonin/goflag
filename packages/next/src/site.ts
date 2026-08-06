import type { Metadata } from "next";

import { toBcp47, toOpenGraphLocale } from "./locale";
import { defineRoutes, type FamilyInput, type Routes } from "./routes";

/**
 * The site, declared once.
 *
 * Everything arrives as a value. The library reads no environment variable —
 * `NEXT_PUBLIC_…` and `APP_ENV` are naming conventions of one codebase, and a
 * library that hardcodes them cannot be tested without mutating a global or
 * adopted without renaming yours. The site computes; this derives.
 */

export interface LocaleTags {
  /** Overrides the derived `hreflang` / `lang` tag. */
  bcp47?: string;
  /** Overrides the derived `og:locale`. Required for a locale with no territory. */
  openGraph?: string;
}

export interface SiteInput<L extends string> {
  /** Public origin. A trailing slash is removed; a path is refused. */
  baseUrl: string;
  /** `og:site_name`, and the default document title. */
  name: string;
  /** Every locale served, in the order alternates should be listed. */
  locales: readonly L[];
  defaultLocale: L;
  /**
   * Whether this deployment asks to be indexed.
   *
   * One flag drives `robots.txt` and the `robots` meta tag together, because a
   * site that forbids crawling while its pages ask to be indexed is exactly
   * `robots.conflict` — and the only way to make that unsatisfiable is to leave
   * no way to set the two apart.
   */
  indexable: boolean;
  /** Per-locale tag overrides, where deriving them would be guessing. */
  localeTags?: Partial<Record<L, LocaleTags>>;
  twitter?: { card?: "summary" | "summary_large_image"; site?: string };
}

export interface Site<L extends string> {
  readonly baseUrl: string;
  readonly name: string;
  readonly locales: readonly L[];
  readonly defaultLocale: L;
  readonly indexable: boolean;
  readonly twitter: { card: "summary" | "summary_large_image"; site?: string };
  /** The `hreflang` / `lang` tag for a locale. */
  bcp47(locale: L): string;
  /** The `og:locale` for a locale. */
  openGraphLocale(locale: L): string;
  /** Whether this site serves the given tag. Narrows an unknown string. */
  servesLocale(locale: string): locale is L;
  /**
   * The parts of the root layout's metadata that follow from the declaration:
   * `metadataBase`, the title template, and the robots directives every child
   * segment inherits.
   */
  rootMetadata(input: { description: string; titleTemplate?: string }): Metadata;
  /**
   * Declare every URL the site serves. The registry is what both the `<head>`
   * and the sitemap read, so they cannot disagree.
   */
  routes<F extends Record<string, FamilyInput<L>>>(
    families: F,
  ): Routes<L, Extract<keyof F, string>>;
}

function normalizeBaseUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`baseUrl must be an absolute URL, received ${JSON.stringify(input)}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`baseUrl must be http or https, received ${JSON.stringify(input)}`);
  }
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    // A base URL with a path silently doubles into every canonical the site
    // emits, and a canonical is the one tag whose mistakes are invisible until
    // pages start dropping out of an index.
    throw new Error(`baseUrl must be an origin with no path, received ${JSON.stringify(input)}`);
  }

  return parsed.origin;
}

/**
 * Declare a site.
 *
 * Every locale is resolved to both of its tag forms here, at declaration time,
 * rather than on the page that happens to render it. A malformed locale should
 * fail the build once, not on one route in one language.
 */
export function defineSite<const L extends string>(input: SiteInput<L>): Site<L> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);

  if (input.locales.length === 0) {
    throw new Error("A site must serve at least one locale");
  }

  const duplicates = input.locales.filter(
    (locale, index) => input.locales.indexOf(locale) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`Duplicate locales: ${[...new Set(duplicates)].join(", ")}`);
  }

  if (!input.locales.includes(input.defaultLocale)) {
    throw new Error(
      `defaultLocale ${JSON.stringify(input.defaultLocale)} is not in locales ` +
        `(${input.locales.join(", ")})`,
    );
  }

  const bcp47 = new Map<string, string>();
  const openGraph = new Map<string, string>();

  for (const locale of input.locales) {
    const overrides = input.localeTags?.[locale];
    const tag = overrides?.bcp47 ?? locale;

    // Validated, not rewritten. BCP 47 is case-insensitive, so `pt-br` is as
    // correct as `pt-BR` — and re-casing it means the site's URLs say one thing
    // while its hreflang says another. A crawler comparing the two literally
    // then sees two locales where there is one, and reports a translation hole
    // that does not exist. Producing a tag the site did not declare is not this
    // library's call; `localeTags.bcp47` is, if you want a different one.
    toBcp47(tag);
    bcp47.set(locale, tag);
    openGraph.set(locale, overrides?.openGraph ?? toOpenGraphLocale(tag));
  }

  const known = new Set<string>(input.locales);
  const twitter = {
    card: input.twitter?.card ?? ("summary_large_image" as const),
    ...input.twitter,
  };

  return {
    baseUrl,
    name: input.name,
    locales: input.locales,
    defaultLocale: input.defaultLocale,
    indexable: input.indexable,
    twitter,

    bcp47(locale) {
      const tag = bcp47.get(locale);
      if (tag === undefined) throw new Error(`Unknown locale ${JSON.stringify(locale)}`);
      return tag;
    },

    openGraphLocale(locale) {
      const tag = openGraph.get(locale);
      if (tag === undefined) throw new Error(`Unknown locale ${JSON.stringify(locale)}`);
      return tag;
    },

    servesLocale(locale): locale is L {
      return known.has(locale);
    },

    routes(families) {
      return defineRoutes(this, families);
    },

    rootMetadata({ description, titleTemplate }) {
      return {
        metadataBase: new URL(baseUrl),
        title: {
          default: input.name,
          template: titleTemplate ?? `%s · ${input.name}`,
        },
        description,
        robots: {
          index: input.indexable,
          follow: input.indexable,
          googleBot: { index: input.indexable, follow: input.indexable },
        },
      };
    },
  };
}
