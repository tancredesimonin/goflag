/**
 * Locale-axis derivation.
 *
 * Answering "is this site multilingual, and in which locales?" is the
 * precondition for every hreflang check — and getting it from the wrong
 * source is what made goflag blind.
 *
 * The original i18n matrix derived its locale axis from two inputs: the URLs
 * the crawler reached, and the `hreflang` tags those pages declared. On a site
 * that declares *no* hreflang, the BFS frontier never leaves the entry locale
 * (there are no alternate links to follow), so the axis collapses to one locale
 * and "missing translations" is trivially zero. The tool reported a clean bill
 * of health precisely because the site was broken — a reassuring false
 * negative.
 *
 * The fix is to derive the axis from sources that are *independent* of the
 * markup being judged, in descending order of trust:
 *
 *   1. `explicit` — the operator passed `--locales fr,en,pt-br`. Nothing beats
 *      being told.
 *   2. `sitemap`  — locale prefixes observed across the sitemap's `<loc>`
 *      entries. The sitemap is published by the site but is a *different*
 *      artefact from the `<head>`, so using it to judge the `<head>` is not
 *      circular; a site can (and, as we found, does) get one right and the
 *      other wrong.
 *   3. `crawl`    — locale prefixes among the pages actually reached. The
 *      weakest signal, kept as a floor so a site with neither a sitemap nor a
 *      `--locales` flag still gets *some* axis.
 *
 * The sources are unioned, not short-circuited: a sitemap that lists three
 * locales and a crawl that reached a fourth yields all four. `source` records
 * the strongest contributor, for the report's provenance trail.
 */

import { looksLikeLocaleSegment } from "./i18n";

/** How the locale axis was established, strongest contributor first. */
export type LocaleAxisSource = "explicit" | "sitemap" | "crawl";

export interface LocaleAxis {
  /** Locale tags the site is believed to serve, sorted, without `x-default`. */
  locales: string[];
  /** Strongest source that contributed to `locales`. */
  source: LocaleAxisSource;
  /**
   * True when the site demonstrably serves more than one locale. Gates every
   * hreflang rule: a monolingual site must never be told it is missing
   * translations.
   */
  multilingual: boolean;
}

export interface DeriveLocaleAxisInput {
  /** Locales passed explicitly by the operator (`--locales`). */
  explicit?: readonly string[];
  /** Absolute URLs from the discovered sitemap, if any. */
  sitemapUrls?: readonly string[];
  /** Absolute URLs of the pages actually crawled. */
  crawledUrls?: readonly string[];
}

/** Leading path segment of `url` when it parses as a locale tag, else null. */
export function localePrefixOf(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const first = pathname.split("/").filter(Boolean)[0];
  if (first && looksLikeLocaleSegment(first)) return first.toLowerCase();
  return null;
}

/** Collect the distinct locale prefixes across a set of URLs. */
function prefixesIn(urls: readonly string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const url of urls ?? []) {
    const locale = localePrefixOf(url);
    if (locale) out.add(locale);
  }
  return out;
}

/**
 * Union the three sources into one axis.
 *
 * `x-default` is deliberately excluded: it is a fallback *pointer*, never a
 * locale a page can be "missing a translation" in. Including it would make
 * every unprefixed route look like a hole.
 */
export function deriveLocaleAxis(input: DeriveLocaleAxisInput): LocaleAxis {
  const explicit = new Set(
    (input.explicit ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
  const fromSitemap = prefixesIn(input.sitemapUrls);
  const fromCrawl = prefixesIn(input.crawledUrls);

  const all = new Set<string>([...explicit, ...fromSitemap, ...fromCrawl]);
  all.delete("x-default");

  const source: LocaleAxisSource =
    explicit.size > 0 ? "explicit" : fromSitemap.size > 0 ? "sitemap" : "crawl";

  return {
    locales: [...all].sort((a, b) => a.localeCompare(b)),
    source,
    multilingual: all.size >= 2,
  };
}
