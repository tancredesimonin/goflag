/**
 * Canonical Goflag data model.
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
 *    future `@goflag/core` package consumed by a hosted SaaS.
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

/** One intrinsic size a file declares about itself. */
export interface AssetSize {
  width: number;
  height: number;
}

/**
 * What is actually served at an asset URL a page declared — an `og:image`, an
 * icon. Produced once per distinct URL by the probe pass in `report/build.ts`
 * (`docs/og-plan.md` D8), never by a rule.
 */
export interface AssetProbe {
  url: string;
  /** HTTP status. `0` on a network failure. */
  status: number;
  /** 2xx *and* an image content type. A 200 of HTML is not an image. */
  ok: boolean;
  contentType?: string;
  /**
   * Sizes decoded from the file's header. Several for an ICO container, one
   * for a PNG, absent for every format this does not decode — which a rule
   * must read as "unknown", never as "none".
   */
  sizes?: AssetSize[];
}

/**
 * What the origin answers at `/favicon.ico`.
 *
 * Origin-level by nature: one file governs the whole site, exactly like
 * robots.txt, so it is probed once per run rather than per page.
 */
export interface FaviconProbe {
  url: string;
  status: number;
  /** 2xx *and* an image content type. A 200 of HTML is a soft 404. */
  found: boolean;
  /** From `content-type`, lowercased, parameters stripped. */
  contentType?: string;
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
// Extractor mode + hydration delta
// ---------------------------------------------------------------------------

/**
 * Which extraction strategy produced this `Page`.
 *
 *  - `"static"`: HTML was fetched once via `fetchStatic` and parsed as-is.
 *    What we see is what a non-JS crawler sees (e.g. older social previewers,
 *    historic Slackbot, plain `curl`).
 *  - `"headless"`: HTML was rendered in Chromium and parsed after the
 *    network went idle. What we see is what a JS-aware crawler sees
 *    (modern Googlebot, X / Twitter, Discord).
 *
 * `escalated: true` means the orchestrator started in static mode, decided
 * the `<head>` looked suspiciously empty (likely client-rendered SPA), and
 * automatically re-ran the extractor in headless mode. `escalationReason`
 * carries the human-readable trigger ("title missing, no og:*, no canonical")
 * so rules and the UI can surface "we had to render JS to see this page".
 */
export type ExtractorMode = "static" | "headless";

export interface ExtractorMeta {
  mode: ExtractorMode;
  /** True when we started in static mode and auto-fell-through to headless. */
  escalated: boolean;
  /** Human-readable trigger for the escalation (only set when `escalated`). */
  escalationReason?: string;
  /**
   * Why the escalation this page needed could not run — Playwright absent, or
   * its Chromium missing.
   *
   * Separate from `escalationReason` because the two are opposite facts and
   * one used to carry both as prose. A page that wanted the browser and did
   * not get it is judged on an unhydrated shell, which invents a full column
   * of `title.missing` / `description.missing` findings; the report has to say
   * so rather than let the reader believe the site is empty. `report/build.ts`
   * turns any page carrying this into a diagnostics warning.
   */
  escalationBlocked?: string;
}

/**
 * Difference between what a non-JS fetch saw and what Chromium saw after the
 * page hydrated.
 *
 * The lists are deliberately minimal subsets of `RawMetaTag` / `RawLinkTag` —
 * just enough to identify a tag and let Phase 5 rules say "this `og:image`
 * is client-injected, Slack's previewer won't see it". The full raw HTML for
 * both passes lives on `Page.html` if richer diffing is needed later.
 */
export interface HydrationDelta {
  /** Mode the static pass ran in (always "static" today; kept for symmetry). */
  fromMode: "static";
  /** Mode the rendered pass ran in (always "headless" today). */
  toMode: "headless";
  /** Did the document `<title>` text change after hydration? */
  titleChanged: boolean;
  /** Did the `<html lang>` attribute change after hydration? */
  htmlLangChanged: boolean;
  /** Metas present in the rendered HTML but not in the static HTML. */
  clientInjectedMetas: Array<{
    name?: string;
    property?: string;
    httpEquiv?: string;
    content?: string;
  }>;
  /** Metas present in the static HTML but removed by client JS. */
  clientRemovedMetas: Array<{
    name?: string;
    property?: string;
    httpEquiv?: string;
    content?: string;
  }>;
  /** Links present in the rendered HTML but not in the static HTML. */
  clientInjectedLinks: Array<{
    rel: string;
    href?: string;
    hreflang?: string;
  }>;
  /** Links present in the static HTML but removed by client JS. */
  clientRemovedLinks: Array<{
    rel: string;
    href?: string;
    hreflang?: string;
  }>;
  /** Number of new JSON-LD blocks introduced by client JS. */
  jsonLdBlocksAdded: number;
}

export interface PageHtml {
  /**
   * Raw HTML returned by the static fetch, before any JS executed.
   * Always present.
   */
  static: string;
  /**
   * Final HTML after Chromium rendered the page and the network went idle.
   * Only present when the headless extractor ran (either by user request or
   * by auto-escalation).
   */
  rendered?: string;
}

// ---------------------------------------------------------------------------
// The Page
// ---------------------------------------------------------------------------

/**
 * Engine-wide marker. Bumped manually whenever the `Page` shape changes in a
 * way that invalidates committed snapshots or `--json` consumers.
 */
export const PAGE_SCHEMA_VERSION = 2 as const;

export interface Page {
  /** Constant marker for schema migrations. */
  schemaVersion: typeof PAGE_SCHEMA_VERSION;
  /** When this `Page` was produced (ISO string, UTC). */
  fetchedAt: string;
  fetch: FetchMeta;
  /**
   * Which extraction strategy produced the `raw`/`meta`/`openGraph`/etc.
   * fields below. When `mode === "headless"`, the parsed views reflect the
   * post-hydration DOM; `html.static` still carries the original non-JS
   * markup so rules can compare the two.
   */
  extractor: ExtractorMeta;
  /** Raw HTML for both passes. `rendered` is only set in headless mode. */
  html: PageHtml;
  raw: RawHead;
  meta: GenericMeta;
  openGraph: OpenGraph;
  twitter: TwitterCard;
  links: ParsedLinks;
  jsonLd: JsonLdBlock[];
  /**
   * What changed between the static HTML and the rendered HTML. Only set
   * when both passes ran (i.e. `extractor.mode === "headless"`).
   */
  hydration?: HydrationDelta;
  /** Side-channel probes; populated when the engine is asked to do so. */
  probes: {
    robots?: RobotsProbe;
    sitemap?: SitemapProbe;
    manifest?: ManifestProbe;
  };
  /**
   * What was served at the asset URLs this page declared — `og:image`, icons —
   * keyed by the URL as it was resolved. Filled by the probe pass in
   * `report/build.ts`, deduplicated across the whole run.
   *
   * Absent when no pass ran, which is a different claim from an empty map: the
   * rules that read it answer `na` on absence and would be inventing a finding
   * if they did anything else.
   */
  assets?: Record<string, AssetProbe>;
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
