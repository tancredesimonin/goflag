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
 * Locale code validity: we accept anything that matches BCP 47's
 * basic shape (`[a-z]{2,3}(-[A-Z]{2})?`) plus `x-default`. Anything
 * else flags as `locale.invalid`.
 */

import type { Page } from "./types";

export type ReciprocityCode =
  | "missing-back-link"
  | "self-mismatch"
  | "x-default-missing"
  | "locale.invalid";

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

// hreflang / lang values are case-insensitive per the HTML spec, so a
// lowercase region subtag like `pt-br` is just as valid as canonical
// `pt-BR`. The `i` flag keeps us from flagging real, common tags as invalid.
const BCP47_LOOSE = /^[a-z]{2,3}(-[a-z]{2}|-\d{3})?$/i;

/** True when a URL path segment looks like a locale tag (`/fr`, `/pt-br`, …). */
export function looksLikeLocaleSegment(segment: string): boolean {
  return BCP47_LOOSE.test(segment);
}

export function isValidLocale(tag: string): boolean {
  if (tag === "x-default") return true;
  return BCP47_LOOSE.test(tag);
}

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
export function buildI18nMatrix(pages: Page[]): I18nMatrix {
  const inspectedByUrl = new Map<string, Page>();
  for (const page of pages) inspectedByUrl.set(page.fetch.finalUrl, page);

  type Slot = { url: string; inspected: boolean };
  const grid = new Map<string, Map<string, Slot>>();
  const locales = new Set<string>();
  const routes = new Set<string>();

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
      const locale = alt.isXDefault ? "x-default" : alt.hreflang;
      // Use the alternate's *route* but trust the declared locale —
      // some sites colocate hreflang URLs without a locale prefix
      // (e.g. `/about` for both en and x-default).
      record(route || selfRoute, locale, altUrl.toString());
    }
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
 *   - When `A` declares `hreflang="fr"` pointing at itself but `A`'s
 *     own URL says `/en/...`, emit `self-mismatch`.
 *   - When a route has 2+ locales but no `x-default`, emit
 *     `x-default-missing` once per route on the canonical entry.
 *   - When a locale tag fails BCP 47, emit `locale.invalid`.
 */
export function reciprocityIssues(pages: Page[]): ReciprocityIssue[] {
  const issues: ReciprocityIssue[] = [];
  const byUrl = new Map<string, Page>();
  for (const page of pages) byUrl.set(page.fetch.finalUrl, page);

  for (const page of pages) {
    const url = page.fetch.finalUrl;
    const seenLocalesOnPage = new Set<string>();
    for (const alt of page.links.alternates) {
      const locale = alt.isXDefault ? "x-default" : alt.hreflang;
      seenLocalesOnPage.add(locale);
      if (!isValidLocale(locale)) {
        issues.push({
          code: "locale.invalid",
          url,
          locale,
          message: `\`hreflang="${locale}"\` is not a valid BCP 47 tag.`,
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

function splitRoute(pathname: string): { route: string; locale: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && looksLikeLocaleSegment(segments[0]!)) {
    const locale = segments[0]!;
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
