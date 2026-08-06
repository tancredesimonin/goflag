/**
 * The extraction model — goflag's per-page observation contract.
 *
 * This is the single normalized snapshot that deterministic rules and AI
 * agents both read (rules-catalog plan §7). Rules never touch raw HTML;
 * they read the documented fields below, which makes them testable in
 * isolation and makes run-to-run diffing tractable.
 *
 * Design constraints:
 *
 * - **Versioned.** `extractionVersion` is bumped whenever a field is removed
 *   or reshaped. Adding optional fields is not a bump.
 * - **Provenance-carrying.** Scalar observations are `Fact`s: value + which
 *   tag produced it + the literal string before normalization. An agent can
 *   always answer "says who?" from the extraction alone.
 * - **Self-contained and serializable.** Plain JSON data, no methods, no
 *   references back into the engine. The shapes mirror `core/types.ts`
 *   (`Page`) deliberately — the adapter in `./from-page.ts` is mostly a
 *   projection — but they are declared here so the contract can hold still
 *   while the engine's internal `Page` evolves.
 * - **Per-page.** Site-level artefacts (robots.txt, the sitemap tree) get
 *   their own observation models — `RobotsExtraction` / `SitemapExtraction`,
 *   specified in `docs/sitemap-robots-plan.md` — in Phase G. Site-computed
 *   i18n knowledge (locale cluster, reciprocity) and document structure
 *   (headings, landmarks) are reserved for future additive fields.
 */

import type { TagOrigin } from "../../core/types";

export type { TagOrigin };

/**
 * Bumped whenever the shape changes incompatibly (field removed or
 * reshaped). Consumers that persist extractions (baselines, fingerprints)
 * key on it.
 */
export const EXTRACTION_VERSION = 1 as const;

/**
 * One observed value and where it came from. `raw` is the literal string as
 * it appeared in the source, kept whenever normalization (trimming, URL
 * resolution, number parsing) changed it.
 */
export interface Fact<T> {
  value: T;
  origin: TagOrigin;
  raw?: string;
}

/** The network-level observation: what the server said, before any parsing. */
export interface ExtractionHttp {
  /** The URL the audit asked for. */
  requestedUrl: string;
  /** The URL after following redirects (equals `requestedUrl` when none). */
  finalUrl: string;
  status: number;
  /** Lowercased response headers from the final response. */
  headers: Record<string, string>;
  /** Number of redirects followed to reach `finalUrl`. */
  redirects: number;
  /** From `content-type`, lowercased, parameters stripped. */
  contentType?: string;
}

/**
 * How the observed DOM was produced. `static` is what a non-JS crawler sees;
 * `headless` is the post-hydration DOM a JS-aware crawler sees. `escalated`
 * means goflag started static, found the head suspiciously empty, and re-ran
 * in headless mode — itself evidence that the page client-renders its
 * metadata.
 */
export interface ExtractionRendering {
  mode: "static" | "headless";
  escalated: boolean;
  escalationReason?: string;
}

/** Document-level observations: the root element and head-wide declarations. */
export interface ExtractionDocument {
  /** `<title>` text, trimmed. */
  title?: Fact<string>;
  /** `lang` attribute on `<html>`. */
  lang?: Fact<string>;
  /** `dir` attribute on `<html>`. */
  dir?: Fact<string>;
  /** Declared character encoding (`<meta charset>` or http-equiv). */
  charset?: Fact<string>;
  /** `<base href>`, when present. */
  base?: Fact<string>;
}

/**
 * Named metadata: `<meta name="…">` values plus the canonical link, which
 * lives here (not under `links`) because rules consume it as a single
 * page-level declaration. `canonical` is resolved to an absolute URL when
 * possible; `raw` keeps what the tag literally said.
 */
export interface ExtractionMeta {
  description?: Fact<string>;
  viewport?: Fact<string>;
  robots?: Fact<string>;
  googlebot?: Fact<string>;
  canonical?: Fact<string>;
  themeColor?: Fact<string>;
  colorScheme?: Fact<string>;
  referrer?: Fact<string>;
  generator?: Fact<string>;
  applicationName?: Fact<string>;
  author?: Fact<string>;
  keywords?: Fact<string[]>;
}

/** One `og:image` structured object with its sub-properties. */
export interface ExtractionOpenGraphImage {
  url: Fact<string>;
  secureUrl?: Fact<string>;
  type?: Fact<string>;
  width?: Fact<number>;
  height?: Fact<number>;
  alt?: Fact<string>;
}

/** The `og:*` surface (ogp.me vocabulary). */
export interface ExtractionOpenGraph {
  title?: Fact<string>;
  type?: Fact<string>;
  url?: Fact<string>;
  description?: Fact<string>;
  siteName?: Fact<string>;
  locale?: Fact<string>;
  localeAlternates: Fact<string>[];
  images: ExtractionOpenGraphImage[];
  /** Any `og:*` property not mapped above, kept verbatim. */
  other: Array<{ property: string; value: Fact<string> }>;
}

/** The `twitter:*` card surface. X falls back to `og:*` for absent fields. */
export interface ExtractionTwitter {
  card?: Fact<string>;
  site?: Fact<string>;
  creator?: Fact<string>;
  title?: Fact<string>;
  description?: Fact<string>;
  image?: Fact<string>;
  imageAlt?: Fact<string>;
}

/** One `<link rel="alternate" hreflang>` annotation, href resolved. */
export interface ExtractionHreflang {
  hreflang: string;
  href: string;
  isXDefault: boolean;
}

/** One icon link (`icon`, `apple-touch-icon`, …). */
export interface ExtractionIcon {
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
  /** Parsed `sizes` entries; empty for unparseable values. */
  parsedSizes: Array<{ width: number; height: number } | "any">;
}

/** One feed advertisement (`rel="alternate"` with a feed content type). */
export interface ExtractionFeed {
  type: string;
  href: string;
  title?: string;
}

/**
 * Head link observations other than canonical (which lives under `meta`).
 * These are already-normalized collections rather than `Fact`s: their origin
 * is unambiguous (the `link` tag their `rel` names).
 */
export interface ExtractionLinks {
  hreflang: ExtractionHreflang[];
  icons: ExtractionIcon[];
  manifest?: { href: string };
  feeds: ExtractionFeed[];
}

/** One `<script type="application/ld+json">` block. */
export interface ExtractionJsonLd {
  /** Position in document order (0-based). */
  index: number;
  /** Top-level `@type` values found in the block (covers `@graph`). */
  types: string[];
  /** Parsed JSON, or `null` when parsing failed (see `parseError`). */
  data: unknown;
  parseError?: string;
  /** Verbatim script content — the evidence, especially on parse errors. */
  raw: string;
}

/**
 * The per-page observation. Everything a page rule (or an agent judging a
 * prose rule) may read; nothing else.
 */
export interface Extraction {
  extractionVersion: typeof EXTRACTION_VERSION;
  /** When the underlying fetch happened (ISO string, UTC). */
  fetchedAt: string;
  http: ExtractionHttp;
  rendering: ExtractionRendering;
  document: ExtractionDocument;
  meta: ExtractionMeta;
  openGraph: ExtractionOpenGraph;
  twitter: ExtractionTwitter;
  links: ExtractionLinks;
  jsonLd: ExtractionJsonLd[];
}
