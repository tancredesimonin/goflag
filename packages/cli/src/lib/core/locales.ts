/**
 * Locale-axis derivation.
 *
 * Answering "is this site multilingual, and in which locales?" is the
 * precondition for every hreflang check — and getting it from the wrong
 * source is what made goflag blind, then what made it noisy.
 *
 * **Blind.** The original axis came from the pages the crawler reached plus the
 * `hreflang` those pages declared. On a site declaring none, the BFS never left
 * the entry locale, the axis collapsed to one column, and every hreflang check
 * passed vacuously. Sitemap seeding fixed that.
 *
 * **Noisy.** Falling back to "any leading path segment shaped like a language
 * tag" then invented locales. On tancrede.eu, `/cv` (a CV page, served in
 * French) became a locale — `cv` is a real ISO 639-1 code, Chuvash — and
 * produced 31 phantom translation holes. Shape is not membership.
 *
 * So the axis is only ever taken from a source that *declares* it:
 *
 *   1. `explicit` — the operator passed `--locales fr,en,pt-br`.
 *   2. `sitemap`  — locale prefixes across the sitemap's `<loc>` entries. The
 *      sitemap is a different artefact from the `<head>`, so using it to judge
 *      the `<head>` is not circular.
 *
 * With neither, goflag **does not guess**. It reports `candidates` — prefixes
 * that look like locales, each carrying the evidence for and against — and
 * leaves the axis empty, which gates every hreflang rule off. A tool that
 * invents a locale is worse than one that admits it does not know: the first
 * costs you an afternoon chasing 31 findings that were never real.
 *
 * The candidate evidence is deliberately the same cross-check the rules
 * themselves use — two independent declarations compared — so promoting a
 * candidate to the axis later (an interactive `--detect-locales`, an MCP
 * method) needs no new machinery, only a decision.
 */

import { isKnownLanguageTag, looksLikeLocaleSegment } from "./bcp47";
import type { Page } from "./types";

export { isKnownLanguageTag };

/** How the locale axis was established. */
export type LocaleAxisSource = "explicit" | "sitemap" | "none";

/**
 * A path prefix that *might* be a locale, with what we know about it. Never
 * promoted automatically — this is a suggestion for the operator, not a
 * finding.
 */
export interface LocaleCandidate {
  /** The leading path segment, lowercased. */
  tag: string;
  /** Number of crawled pages sitting under this prefix. */
  pages: number;
  /** The tag is a registered ISO 639-1 language (kills `api`, `faq`, `doc`). */
  isKnownLanguage: boolean;
  /**
   * `<html lang>` declared by pages under this prefix agrees with the tag
   * (kills `cv`, whose pages declare `lang="fr"`). `undefined` when no page
   * under the prefix declared a lang at all.
   */
  htmlLangAgrees?: boolean;
  /** Distinct `<html lang>` values seen under the prefix, for the report. */
  observedLangs: string[];
}

export interface LocaleAxis {
  /** Locale tags the site is declared to serve, sorted, without `x-default`. */
  locales: string[];
  /** Where `locales` came from. `none` when nothing authoritative existed. */
  source: LocaleAxisSource;
  /**
   * True when the site is *declared* to serve more than one locale. Gates
   * every hreflang rule: a monolingual site — or one we cannot vouch for —
   * must never be told it is missing translations.
   */
  multilingual: boolean;
  /**
   * Prefixes that look like locales but were never declared anywhere. Empty
   * unless `source` is `none`; populated so the CLI can tell the operator what
   * to pass to `--locales` instead of guessing on their behalf.
   */
  candidates: LocaleCandidate[];
}

export interface DeriveLocaleAxisInput {
  /** Locales passed explicitly by the operator (`--locales`). */
  explicit?: readonly string[];
  /** Absolute URLs from the discovered sitemap, if any. */
  sitemapUrls?: readonly string[];
  /** Crawled pages, used only to describe candidates when nothing is declared. */
  pages?: readonly Page[];
}

/** Leading path segment of `url` when it is shaped like a locale tag, else null. */
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

/** Collect the distinct locale-shaped prefixes across a set of URLs. */
function prefixesIn(urls: readonly string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const url of urls ?? []) {
    const locale = localePrefixOf(url);
    if (locale) out.add(locale);
  }
  out.delete("x-default");
  return out;
}

/** Describe every locale-shaped prefix seen in the crawl, with its evidence. */
function describeCandidates(pages: readonly Page[]): LocaleCandidate[] {
  const byTag = new Map<string, { pages: number; langs: Set<string> }>();

  for (const page of pages) {
    const tag = localePrefixOf(page.fetch.finalUrl);
    if (!tag || tag === "x-default") continue;
    const entry = byTag.get(tag) ?? { pages: 0, langs: new Set<string>() };
    entry.pages += 1;
    const lang = page.raw.htmlLang?.trim().toLowerCase();
    if (lang) entry.langs.add(lang);
    byTag.set(tag, entry);
  }

  const candidates: LocaleCandidate[] = [];
  for (const [tag, { pages: n, langs }] of byTag) {
    const observedLangs = [...langs].sort();
    // A prefix that really is a locale serves pages declaring that language.
    // `/cv` serving `lang="fr"` is a route, not a Chuvash edition.
    const htmlLangAgrees =
      observedLangs.length === 0
        ? undefined
        : observedLangs.some((l) => l.split("-")[0] === tag.split("-")[0]);
    candidates.push({
      tag,
      pages: n,
      isKnownLanguage: isKnownLanguageTag(tag),
      htmlLangAgrees,
      observedLangs,
    });
  }

  // Most plausible first: agreeing langs, then registered languages, then size.
  return candidates.sort(
    (a, b) =>
      Number(b.htmlLangAgrees ?? false) - Number(a.htmlLangAgrees ?? false) ||
      Number(b.isKnownLanguage) - Number(a.isKnownLanguage) ||
      b.pages - a.pages ||
      a.tag.localeCompare(b.tag),
  );
}

/**
 * Build the axis from declared sources only.
 *
 * `x-default` is excluded throughout: it is a fallback *pointer*, never a
 * locale a page can be "missing a translation" in. On the axis it would make
 * every unprefixed route look like a hole.
 */
export function deriveLocaleAxis(input: DeriveLocaleAxisInput): LocaleAxis {
  const explicit = new Set(
    (input.explicit ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
  explicit.delete("x-default");
  const fromSitemap = prefixesIn(input.sitemapUrls);

  if (explicit.size > 0 || fromSitemap.size > 0) {
    // Union, not precedence: an explicit list narrows intent, it does not hide
    // what the sitemap demonstrably declares.
    const all = new Set([...explicit, ...fromSitemap]);
    return {
      locales: [...all].sort((a, b) => a.localeCompare(b)),
      source: explicit.size > 0 ? "explicit" : "sitemap",
      multilingual: all.size >= 2,
      candidates: [],
    };
  }

  return {
    locales: [],
    source: "none",
    multilingual: false,
    candidates: describeCandidates(input.pages ?? []),
  };
}

/** The `--locales` value we would suggest, or null when nothing is plausible. */
export function suggestedLocales(axis: LocaleAxis): string | null {
  const plausible = axis.candidates.filter((c) => c.isKnownLanguage && c.htmlLangAgrees !== false);
  if (plausible.length < 2) return null;
  return plausible
    .map((c) => c.tag)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}
