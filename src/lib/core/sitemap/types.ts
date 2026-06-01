/**
 * Site-wide sitemap discovery model.
 *
 * Distinct from the lightweight per-page `SitemapProbe` (see
 * `src/lib/core/probes/sitemap.ts`) which only answers "is there a
 * /sitemap.xml and roughly how many entries?". This module powers the
 * site navigation feature: it locates the sitemap (robots.txt first,
 * then well-known paths), parses the full URL list, follows sitemap
 * indexes, and records diagnostics so the UI can present a dedicated
 * "is this sitemap healthy?" analysis the same way the Assets tab
 * presents robots.txt.
 *
 * Like `Page`, everything here is plain, JSON-serializable data with no
 * DOM / React / Next.js coupling so it can move into `@headlint/core`.
 */

/** A single `<url>` entry from a `<urlset>` document. */
export interface SitemapUrlEntry {
  /** Absolute URL from `<loc>`. */
  loc: string;
  /** `<lastmod>` verbatim (ISO-ish date string) when present. */
  lastmod?: string;
  /** `<changefreq>` when present (daily, weekly, ...). */
  changefreq?: string;
  /** `<priority>` when present (0.0 – 1.0, kept as a string). */
  priority?: string;
}

/**
 * How the URL list was obtained. Mirrors the trust order used by the
 * discovery routine and lets the UI explain provenance to the user.
 */
export type SiteDiscoverySource = "robots" | "well-known" | "crawl";

/**
 * Health signals about the sitemap itself — the "analysis" surface the
 * user asked for, analogous to the robots.txt viewer. Every field is
 * cheap to compute during discovery so the UI never re-fetches.
 */
export interface SitemapDiagnostics {
  /** A sitemap document was located and parsed. */
  found: boolean;
  /** Where the (root) sitemap lived, when found. */
  sitemapUrl?: string;
  /** HTTP status of the (root) sitemap fetch. `0` on network error. */
  status: number;
  /** The sitemap URL was declared via `Sitemap:` in robots.txt. */
  declaredInRobots: boolean;
  /** robots.txt itself was reachable (200). */
  robotsFound: boolean;
  /** The located URL was reachable at a conventional well-known path. */
  atWellKnownPath: boolean;
  /** Root document parsed as valid XML. */
  wellFormed: boolean;
  /** Root document was a `<sitemapindex>` (children were followed). */
  isIndex: boolean;
  /** Number of child sitemaps referenced by an index (0 when not an index). */
  childSitemapCount: number;
  /** Number of child sitemaps that failed to fetch/parse. */
  childSitemapErrors: number;
  /** Total `<url>` entries collected across all (followed) documents. */
  urlCount: number;
  /** Human-readable warnings (malformed XML, gzip failure, caps hit, ...). */
  warnings: string[];
}

/**
 * The complete result of exploring a site from a base URL. Stored
 * per-origin in `site-store` and consumed by `/site` and the inspect
 * sidebar.
 */
export interface SiteDiscovery {
  /** Origin the discovery is keyed by (e.g. `https://example.com`). */
  origin: string;
  /** Base URL the user submitted. */
  baseUrl: string;
  /** Trust source of `urls`. */
  source: SiteDiscoverySource;
  /** Deduplicated, absolute page URLs ready to inspect. */
  urls: SitemapUrlEntry[];
  /** Sitemap health analysis. */
  diagnostics: SitemapDiagnostics;
  /** True when a hard cap (`maxUrls` / `maxSitemaps`) stopped collection. */
  truncated: boolean;
}
