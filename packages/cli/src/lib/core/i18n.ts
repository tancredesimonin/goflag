/**
 * Hreflang reciprocity + matrix derivation (Phase 7.4 / 7.5).
 *
 * Given a set of crawled `Page`s, builds two derived views:
 *
 *   1. A locale → route grid (`I18nMatrix`) the UI renders as a
 *      green/red heatmap. Routes are derived from the canonical or
 *      hreflang group, locales from the URL pathname segment when it
 *      looks like a known BCP 47 tag (`/fr`, `/en-us`, …).
 *
 *   2. Per-page reciprocity findings (`reciprocityIssues`) — when
 *      `/fr/about` declares an `<link rel="alternate" hreflang="en">`
 *      pointing at `/en/about`, but `/en/about` does not advertise
 *      `/fr/about` back, that's a Google-flagged broken cluster.
 *
 * Both helpers are pure: they accept a `Page[]` and return data, no
 * I/O. The crawler in `crawl.ts` calls them once after the BFS
 * finishes to populate the inspect-cache i18n payload.
 *
 * Locale code validity is decided in `./bcp47`, by ICU rather than by a
 * shape: a tag whose language, script or region does not exist flags as
 * `locale.invalid`, and `x-default` is always accepted.
 */

import { isValidLocale, looksLikeLocaleSegment } from "./bcp47";
import type { Page } from "./types";

/**
 * The codes `reciprocityIssues` emits — all three of them.
 *
 * `self-mismatch` used to sit here too, declared and unreachable: no branch
 * ever produced it, so the site's rule catalogue advertised a check goflag
 * could not perform, and a reader took silence for a pass. The declaration is
 * gone rather than the check implemented, because a page whose self-reference
 * points elsewhere is already caught as a `missing-back-link` on the peer it
 * names. If it is ever worth its own code, it comes back with the branch that
 * emits it.
 */
export type ReciprocityCode = "missing-back-link" | "x-default-missing" | "locale.invalid";

export interface ReciprocityIssue {
  code: ReciprocityCode;
  /** URL of the page where the issue is observed. */
  url: string;
  /** Locale tag involved in the issue (or `x-default`). */
  locale?: string;
  /** Sister URL involved when the issue is cross-page. */
  peerUrl?: string;
  message: string;
}

export interface I18nCell {
  /** Absolute URL serving this (route, locale) cell. `null` when
   *  no page in the crawl filled this cell. */
  url: string | null;
  /** True when the page was actually inspected (vs. discovered only). */
  inspected: boolean;
}

export interface I18nMatrix {
  /** Stable locale axis, `x-default` first when present, then BCP 47
   *  tags sorted alphabetically. */
  locales: string[];
  /** Stable route axis. Each route is a "canonical pathname" derived
   *  by stripping the leading locale segment. Sorted alphabetically. */
  routes: string[];
  /** `cells[route][locale]` lookup. Always populated for every
   *  (route, locale) pair, with `url: null` for missing alternates. */
  cells: Record<string, Record<string, I18nCell>>;
}

/**
 * Fold a language tag to the form the matrix keys on.
 *
 * BCP 47 §2.1.1 makes tags case-insensitive, and says the conventional
 * capitalisation "MUST NOT be taken to carry meaning". This file already knew
 * that — validation has always been case-insensitive — but it applied it to
 * *validation* only. Identity kept the raw string, so a site routing on
 * `/pt-br/` while declaring `hreflang="pt-BR"` grew two columns for one
 * language, and every route in it reported a translation hole in a language
 * the site already served.
 *
 * That combination is not exotic. It is what Next.js and next-intl produce by
 * default: lowercase URL segments, canonically-cased tags.
 */
export function localeIdentity(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Tag validity lives in `./bcp47`, which asks ICU rather than a regex. Both
 * are re-exported here because this module is where the matrix and the
 * reciprocity walk consume them, and the call sites read better for it.
 *
 * They answer two different questions, and the split is the point:
 * `looksLikeLocaleSegment` judges a URL segment on shape alone — `/de/` and
 * `/api/` are indistinguishable to a crawler, and the axis is what decides
 * between them — while `isValidLocale` judges a tag a site actually declared,
 * where an invented language is the defect being looked for.
 */
export { isValidLocale, looksLikeLocaleSegment };

/**
 * Build the (route, locale) grid from a set of inspected pages.
 *
 * Route extraction: for each URL pathname, strip the leading segment
 * if it parses as a BCP 47 tag (`/fr/about` → `/about`,
 * `/en-us/blog/post` → `/blog/post`). When no leading segment
 * matches, the full pathname is used (so unprefixed pages map to
 * their own route slot).
 *
 * Locale extraction: the same leading segment becomes the locale
 * axis. When the segment isn't a BCP 47 tag, the locale defaults to
 * `x-default` so unprefixed pages still show up in the matrix.
 */
export interface BuildI18nMatrixOptions {
  /**
   * Absolute URLs the site *declares* it serves (today: the sitemap's `<loc>`
   * entries) but which the crawl may not have reached. They fill their
   * (route, locale) cell with `inspected: false`.
   *
   * This is what stops a site with no `hreflang` from looking monolingual:
   * the crawler cannot discover `/fr/about` with no alternate link pointing
   * at it, but the sitemap names it outright.
   */
  declaredUrls?: readonly string[];
  /**
   * Locales that must appear on the axis even when nothing filled them. An
   * empty column is exactly what a translation hole looks like, so forcing
   * the axis is how `--locales fr,en` makes a missing `/en` visible instead
   * of silently shrinking the grid to the locales that happen to exist.
   */
  locales?: readonly string[];
}

export function buildI18nMatrix(pages: Page[], options: BuildI18nMatrixOptions = {}): I18nMatrix {
  const inspectedByUrl = new Map<string, Page>();
  for (const page of pages) inspectedByUrl.set(page.fetch.finalUrl, page);

  type Slot = { url: string; inspected: boolean };
  const grid = new Map<string, Map<string, Slot>>();
  const locales = new Set<string>();
  const routes = new Set<string>();

  for (const locale of options.locales ?? []) {
    const tag = locale.trim().toLowerCase();
    if (tag) locales.add(tag);
  }

  function record(route: string, locale: string, url: string): void {
    routes.add(route);
    locales.add(locale);
    let row = grid.get(route);
    if (!row) {
      row = new Map();
      grid.set(route, row);
    }
    if (!row.has(locale)) {
      row.set(locale, { url, inspected: inspectedByUrl.has(url) });
    }
  }

  for (const page of pages) {
    const url = new URL(page.fetch.finalUrl);
    const { route: selfRoute, locale: selfLocale } = splitRoute(url.pathname);
    record(selfRoute, selfLocale, page.fetch.finalUrl);

    for (const alt of page.links.alternates) {
      let altUrl: URL;
      try {
        altUrl = new URL(alt.href);
      } catch {
        continue;
      }
      const { route } = splitRoute(altUrl.pathname);
      const locale = alt.isXDefault ? "x-default" : localeIdentity(alt.hreflang);
      // Use the alternate's *route* but trust the declared locale —
      // some sites colocate hreflang URLs without a locale prefix
      // (e.g. `/about` for both en and x-default).
      record(route || selfRoute, locale, altUrl.toString());
    }
  }

  // Declared-but-uncrawled URLs land last so a real inspected page always wins
  // the cell (`record` keeps the first writer).
  for (const declared of options.declaredUrls ?? []) {
    let url: URL;
    try {
      url = new URL(declared);
    } catch {
      continue;
    }
    const { route, locale } = splitRoute(url.pathname);
    record(route, locale, url.toString());
  }

  const sortedLocales = sortLocales([...locales]);
  const sortedRoutes = [...routes].sort((a, b) => a.localeCompare(b));
  const cells: I18nMatrix["cells"] = {};
  for (const route of sortedRoutes) {
    cells[route] = {};
    for (const locale of sortedLocales) {
      const slot = grid.get(route)?.get(locale);
      cells[route][locale] = slot
        ? { url: slot.url, inspected: slot.inspected }
        : { url: null, inspected: false };
    }
  }
  return { locales: sortedLocales, routes: sortedRoutes, cells };
}

/**
 * Returns reciprocity findings across the crawl.
 *
 *   - Every alternate `A → B` must be matched by `B → A` (both must
 *     point at each other). When `B` was crawled and lacks the back
 *     link, emit `missing-back-link`.
 *   - When a page advertises 2+ locales and no `x-default`, emit
 *     `x-default-missing` — once per page, not once per cluster.
 *   - When a locale tag names a language, script or region that does not
 *     exist, emit `locale.invalid`.
 */
export function reciprocityIssues(pages: Page[]): ReciprocityIssue[] {
  const issues: ReciprocityIssue[] = [];
  const byUrl = new Map<string, Page>();
  for (const page of pages) byUrl.set(page.fetch.finalUrl, page);

  for (const page of pages) {
    const url = page.fetch.finalUrl;
    const seenLocalesOnPage = new Set<string>();
    for (const alt of page.links.alternates) {
      // Folded for identity, raw for the finding. Counting `pt-BR` and
      // `pt-br` as two locales is the defect; but reporting a *rejected* tag
      // in a form the page never wrote would be judging what we altered
      // rather than what the site declared.
      const raw = alt.isXDefault ? "x-default" : alt.hreflang;
      const locale = alt.isXDefault ? "x-default" : localeIdentity(alt.hreflang);
      seenLocalesOnPage.add(locale);
      if (!isValidLocale(locale)) {
        issues.push({
          code: "locale.invalid",
          url,
          locale: raw,
          message: `\`hreflang="${raw}"\` is not a valid BCP 47 tag.`,
        });
        continue;
      }
      let altUrl: string;
      try {
        altUrl = new URL(alt.href).toString();
      } catch {
        continue;
      }

      // Reciprocity only fires when we actually crawled the peer.
      const peer = byUrl.get(altUrl);
      if (!peer) continue;
      const back = peer.links.alternates.find((p) => {
        let peerHref: string;
        try {
          peerHref = new URL(p.href).toString();
        } catch {
          return false;
        }
        return peerHref === url;
      });
      if (!back) {
        issues.push({
          code: "missing-back-link",
          url,
          peerUrl: altUrl,
          locale,
          message: `\`${url}\` declares an alternate to \`${altUrl}\` but the peer does not link back.`,
        });
      }
    }

    // x-default requirement only kicks in when at least 2 locales are
    // advertised — single-locale sites don't need x-default.
    const nonDefaultLocales = [...seenLocalesOnPage].filter((l) => l !== "x-default");
    if (nonDefaultLocales.length >= 2 && !seenLocalesOnPage.has("x-default")) {
      issues.push({
        code: "x-default-missing",
        url,
        message: `Page advertises ${nonDefaultLocales.length} locales but no \`hreflang="x-default"\`.`,
      });
    }
  }

  // A page can repeat the same hreflang tag (or the same broken cluster can
  // be observed twice); collapse exact duplicates so counts and fingerprints
  // stay honest.
  return dedupeBy(
    issues,
    (i) => `${i.code}\u0000${i.url}\u0000${i.peerUrl ?? ""}\u0000${i.locale ?? ""}`,
  );
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * Split a pathname into its locale-free route and its locale segment.
 * `/fr/about` → `{ route: "/about", locale: "fr" }`; an unprefixed path keeps
 * its full pathname and reports `x-default`. Exported so cross-page rules key
 * the `<head>` and the sitemap on the same route derivation — comparing two
 * artefacts is only meaningful if both are normalised identically.
 */
export function splitRoute(pathname: string): { route: string; locale: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && looksLikeLocaleSegment(segments[0]!)) {
    const locale = localeIdentity(segments[0]!);
    const rest = segments.slice(1).join("/");
    return { route: rest ? `/${rest}` : "/", locale };
  }
  return { route: pathname || "/", locale: "x-default" };
}

function sortLocales(locales: string[]): string[] {
  const xDefault = locales.includes("x-default") ? ["x-default"] : [];
  const rest = locales.filter((l) => l !== "x-default").sort((a, b) => a.localeCompare(b));
  return [...xDefault, ...rest];
}
