/**
 * Link-checker data model.
 *
 * The link engine answers "do all the links on the site actually
 * resolve?". It shares the suite's discovery pass (`discoverSitemap`)
 * for the page list, then runs its own light scan + probe pipeline over
 * that set.
 *
 * Like the rest of `src/lib/core/**`, everything here is plain,
 * JSON-serializable data with no Next.js / React / DOM coupling so it
 * can ship as part of `@headlint/core`.
 */

/** Whether a link points back at the audited origin or off-site. */
export type LinkKind = "internal" | "external";

/** Which HTML element a link was extracted from. */
export type LinkSource = "a" | "img" | "script" | "link" | "iframe";

/**
 * A single link occurrence as authored on a page, with the metadata the
 * report needs. Distinct from `discover.ts`'s crawl-scoped
 * `CandidateLink` (same-origin, href-only) — the checker keeps every
 * link, internal and external, with its source element and attributes.
 */
export interface LinkRef {
  /** The href/src exactly as authored. */
  rawHref: string;
  /** Canonical absolute URL (fragment stripped) used as the dedupe key. */
  url: string;
  /** Internal vs external relative to the audited origin. */
  kind: LinkKind;
  /** Which element produced the link. */
  source: LinkSource;
  /** Parsed `rel` tokens (lower-cased), e.g. ["nofollow","sponsored"]. */
  rel: string[];
  /** Trimmed anchor text for `<a>` elements, when present. */
  anchorText?: string;
  /** The `#fragment` (including the hash) when authored, kept separately. */
  fragment?: string;
}

/** The outcome of probing a single URL. */
export type LinkVerdict =
  | "ok" // 2xx
  | "redirect" // 3xx resolving to 2xx
  | "broken" // 4xx / 5xx / network failure
  | "blocked" // 403 / 429 — probably anti-bot, triage manually
  | "warning" // soft-404 / suspicious
  | "skipped"; // non-http scheme

/** The result of checking one unique URL. */
export interface LinkCheck {
  /** The canonical URL that was checked. */
  url: string;
  /** The URL after following redirects (== url when none). */
  finalUrl: string;
  /** Final HTTP status. `0` = network error. */
  status: number;
  /** Classified verdict. */
  verdict: LinkVerdict;
  /** The method that produced the final status. */
  method: "HEAD" | "GET";
  /** Intermediate redirect hops (resolved absolute), in order. */
  redirectChain: string[];
  /** Human-readable reason (network reason, "soft-404", "429 rate-limited", …). */
  reason?: string;
  /** ISO timestamp of the check. */
  checkedAt: string;
  /** Wall-clock duration of the check in ms. */
  durationMs: number;
}

/** A (page → link) pair, used to map checks back to where they appear. */
export interface LinkOccurrence {
  pageUrl: string;
  ref: LinkRef;
}

/** Progress callback payload, emitted as the audit advances. */
export interface AuditProgress {
  phase: "scan" | "check";
  /** Items completed in the current phase. */
  done: number;
  /** Total items in the current phase (best-effort; grows during scan). */
  total: number;
}

/** The complete result of a link audit, cached per origin. */
export interface LinkAuditReport {
  /** Origin the report is keyed by (e.g. `https://example.com`). */
  origin: string;
  /** Base URL the audit started from. */
  baseUrl: string;
  /** Number of pages whose HTML was successfully scanned. */
  pagesScanned: number;
  /** Every (page → link) pair discovered during the scan. */
  occurrences: LinkOccurrence[];
  /** Per unique canonical URL — each URL is checked exactly once. */
  checks: Record<string, LinkCheck>;
  /** Count of checks per verdict. */
  summary: Record<LinkVerdict, number>;
  /** Report view: broken/blocked/warning links grouped by the page they appear on. */
  brokenByPage: Array<{ pageUrl: string; broken: LinkCheck[] }>;
  /** True when a hard cap (`maxPages` / `maxLinks`) stopped collection. */
  truncated: boolean;
  /** Audit-level diagnostics. */
  diagnostics: { pagesFailed: number; warnings: string[] };
}

/** Empty verdict tally with every key present (so the UI can map over it). */
export function emptyVerdictSummary(): Record<LinkVerdict, number> {
  return { ok: 0, redirect: 0, broken: 0, blocked: 0, warning: 0, skipped: 0 };
}
