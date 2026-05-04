/**
 * Canonical Headlint data model.
 *
 * Everything the engine, rules, suggestions, previews, snapshots, diff, and
 * report layers consume comes from this single shape. The `Page` is the
 * entire deterministic output of fetching + parsing one URL — no behavior,
 * no side effects, fully serializable to JSON.
 *
 * Design constraints (see PLAN.md "Architectural non-negotiables"):
 *
 *  - **No DOM, no React, no Next.js types here.** This module must be safely
 *    importable from a Node CLI, a browser bundle, an edge worker, or a
 *    future `@headlint/core` package consumed by a hosted SaaS.
 *  - **Stable contract.** Adding fields is fine; removing or renaming is a
 *    semver-major event. Snapshot files (Phase 9) and `--json` consumers
 *    (Phase 11.5) depend on this shape.
 *  - **Origins, not just values.** For most metadata we record both the
 *    parsed value AND where it came from (which raw tag, attribute, or
 *    JSON-LD path). This is what powers Phase 4's "what if I remove
 *    `og:image`?" toggle and the Phase 9 diff classifier.
 */

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

/**
 * Where a parsed value originated. Used by previews to highlight which tag a
 * given preview consumed and by rules/suggestions to point the user back at
 * the exact line in the source.
 */
export type TagOrigin =
  | { kind: "title" }
  | { kind: "meta"; name?: string; property?: string; httpEquiv?: string }
  | { kind: "link"; rel: string }
  | { kind: "html"; attribute: string }
  | { kind: "json-ld"; path: string; index: number }
  | { kind: "header"; name: string }
  | { kind: "computed" };

/**
 * A typed wrapper around a value that knows where it came from and which raw
 * source produced it. We do not unwrap until we render or diff.
 */
export interface Sourced<T> {
  value: T;
  origin: TagOrigin;
  /** The literal string as it appeared in the source, before any normalization. */
  raw?: string;
}

// ---------------------------------------------------------------------------
// Raw HEAD inventory
// ---------------------------------------------------------------------------

export interface RawMetaTag {
  name?: string;
  property?: string;
  httpEquiv?: string;
  content?: string;
  charset?: string;
  /** All attributes verbatim, lowercased keys. Useful for unusual meta tags. */
  attributes: Record<string, string>;
}

export interface RawLinkTag {
  rel: string;
  href?: string;
  hreflang?: string;
  type?: string;
  sizes?: string;
  media?: string;
  crossorigin?: string;
  attributes: Record<string, string>;
}

export interface RawScriptTag {
  type?: string;
  src?: string;
  /** Inline script content, only kept for `application/ld+json`. */
  content?: string;
  attributes: Record<string, string>;
}

export interface RawHead {
  /** Document `<title>` text content, trimmed. */
  title?: string;
  /** Outer-HTML `lang` attribute on `<html>`. */
  htmlLang?: string;
  /** Outer-HTML `dir` attribute on `<html>`. */
  htmlDir?: string;
  /** Document `base` href, when present. */
  baseHref?: string;
  metas: RawMetaTag[];
  links: RawLinkTag[];
  scripts: RawScriptTag[];
}

// ---------------------------------------------------------------------------
// Parsed views — Open Graph, Twitter, generic meta
// ---------------------------------------------------------------------------

export interface OpenGraphImage {
  url: Sourced<string>;
  secureUrl?: Sourced<string>;
  type?: Sourced<string>;
  width?: Sourced<number>;
  height?: Sourced<number>;
  alt?: Sourced<string>;
}

export interface OpenGraph {
  title?: Sourced<string>;
  type?: Sourced<string>;
  url?: Sourced<string>;
  description?: Sourced<string>;
  siteName?: Sourced<string>;
  locale?: Sourced<string>;
  localeAlternates: Sourced<string>[];
  images: OpenGraphImage[];
  /** Any `og:*` property we didn't map explicitly — kept verbatim for rules. */
  unknown: Array<{ property: string; value: Sourced<string> }>;
}

export type TwitterCardType = "summary" | "summary_large_image" | "app" | "player" | string;

export interface TwitterCard {
  card?: Sourced<TwitterCardType>;
  site?: Sourced<string>;
  creator?: Sourced<string>;
  title?: Sourced<string>;
  description?: Sourced<string>;
  image?: Sourced<string>;
  imageAlt?: Sourced<string>;
}

/**
 * The "generic" parsed surface — values that exist on every page regardless
 * of OG / Twitter coverage. Pulled from `<title>`, `<meta name="…">`,
 * `<link rel="…">`, `<html lang>`, etc.
 */
export interface GenericMeta {
  title?: Sourced<string>;
  description?: Sourced<string>;
  keywords?: Sourced<string[]>;
  author?: Sourced<string>;
  themeColor?: Sourced<string>;
  colorScheme?: Sourced<string>;
  viewport?: Sourced<string>;
  charset?: Sourced<string>;
  canonical?: Sourced<string>;
  robots?: Sourced<string>;
  googlebot?: Sourced<string>;
  generator?: Sourced<string>;
  referrer?: Sourced<string>;
  applicationName?: Sourced<string>;
}

// ---------------------------------------------------------------------------
// Links: hreflang, icons, manifest, RSS, etc.
// ---------------------------------------------------------------------------

export interface HreflangAlternate {
  hreflang: string;
  href: string;
  /** True when `hreflang === "x-default"`. */
  isXDefault: boolean;
}

export interface IconLink {
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
  /** Parsed `sizes` like `32x32` or `any`. Empty for unparseable values. */
  parsedSizes: Array<{ width: number; height: number } | "any">;
}

export interface ManifestLink {
  href: string;
  crossorigin?: string;
}

export interface FeedLink {
  rel: "alternate";
  type: string;
  href: string;
  title?: string;
}

export interface ParsedLinks {
  canonical?: string;
  alternates: HreflangAlternate[];
  icons: IconLink[];
  manifest?: ManifestLink;
  feeds: FeedLink[];
  preconnects: string[];
  dnsPrefetches: string[];
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

/** A single `<script type="application/ld+json">` block, parsed if possible. */
export interface JsonLdBlock {
  /** Index in document order (0-based). */
  index: number;
  /** Verbatim script content (after trimming). */
  raw: string;
  /** Parsed JSON, or `null` if parsing failed. */
  data: unknown;
  parseError?: string;
  /** Top-level `@type` values found in the block (covers `@graph` too). */
  types: string[];
}

// ---------------------------------------------------------------------------
// Side-channel probes
// ---------------------------------------------------------------------------

export interface RobotsProbe {
  url: string;
  status: number;
  found: boolean;
  raw?: string;
  /** Parsed `Sitemap:` declarations. */
  sitemaps: string[];
  /** True iff at least one `Disallow: /` line exists for `User-agent: *`. */
  blocksAll: boolean;
}

export interface SitemapProbe {
  url: string;
  status: number;
  found: boolean;
  /** True when the body looks like a sitemap index (`<sitemapindex>`). */
  isIndex: boolean;
  /** Number of `<url>` or `<sitemap>` entries detected (cheap regex count). */
  entryCount: number;
}

export interface ManifestProbe {
  url: string;
  status: number;
  found: boolean;
  raw?: string;
  parseError?: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Network metadata
// ---------------------------------------------------------------------------

export interface FetchMeta {
  /** The URL we were asked to fetch. */
  requestedUrl: string;
  /** The URL after following redirects, or `requestedUrl` if no redirect. */
  finalUrl: string;
  status: number;
  statusText: string;
  /** Lowercased HTTP headers from the final response. */
  headers: Record<string, string>;
  /** Number of redirects followed. */
  redirectCount: number;
  /** Total wall-clock time in milliseconds. */
  durationMs: number;
  /** Body size in bytes (UTF-8). */
  bodyBytes: number;
  /** Content type from `content-type`, lowercased, parameters stripped. */
  contentType?: string;
}

// ---------------------------------------------------------------------------
// The Page
// ---------------------------------------------------------------------------

/**
 * Engine-wide marker. Bumped manually whenever the `Page` shape changes in a
 * way that invalidates committed snapshots or `--json` consumers.
 */
export const PAGE_SCHEMA_VERSION = 1 as const;

export interface Page {
  /** Constant marker for schema migrations. */
  schemaVersion: typeof PAGE_SCHEMA_VERSION;
  /** When this `Page` was produced (ISO string, UTC). */
  fetchedAt: string;
  fetch: FetchMeta;
  raw: RawHead;
  meta: GenericMeta;
  openGraph: OpenGraph;
  twitter: TwitterCard;
  links: ParsedLinks;
  jsonLd: JsonLdBlock[];
  /** Side-channel probes; populated when the engine is asked to do so. */
  probes: {
    robots?: RobotsProbe;
    sitemap?: SitemapProbe;
    manifest?: ManifestProbe;
  };
}

// ---------------------------------------------------------------------------
// Issues (forward declaration — Phase 5 fills in the rule engine)
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface Issue {
  ruleId: string;
  severity: Severity;
  message: string;
  /** Optional pointer back into the `Page` for UI highlighting. */
  origin?: TagOrigin;
  /** Optional fix snippet for "Copy fix" buttons and PR comments. */
  fix?: { title: string; snippet: string; language: string };
  /** Optional suggested replacement value. */
  suggestion?: string;
  /** Documentation link (relative path under `/rules/`). */
  docs?: string;
}
