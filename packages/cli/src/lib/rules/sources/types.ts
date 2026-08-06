/**
 * Source-of-truth records for the rule catalog.
 *
 * Every rule goflag ships must cite at least one `Source` — the authoritative
 * document that makes the rule true. A source is a link plus provenance
 * (`retrievedAt`), never a copy: standards bodies license their prose in ways
 * that allow quoting with attribution, vendor docs (Google, Apple, Meta, X,
 * Microsoft) are all-rights-reserved, and vendor URLs drift over time. So each
 * record stores the URL, the date we last confirmed it, an optional short
 * fair-use quote, and our own paraphrase (`note`) — which is original content
 * and always safe to ship.
 *
 * The catalog itself lives in `./index.ts`; the structural validator in
 * `./validate.ts` runs as a unit test on every pipeline, and the network
 * liveness check (`scripts/validate-sources.ts`) confirms the URLs still
 * resolve on scheduled pipelines and on merge requests that touch this folder.
 */

/**
 * How authoritative the document itself is. This is the source's own rigor —
 * rules carry a finer-grained scale (`spec-required` … `heuristic`, Phase C)
 * derived from what the source says, not just from who published it.
 *
 * - `normative`   — web standards: WHATWG, W3C TRs, IETF RFCs, sitemaps.org.
 * - `vendor-spec` — de-facto specs a single vendor controls: Open Graph,
 *                   Twitter cards, Google Search behavior, schema.org.
 * - `guideline`   — best-practice documentation: MDN, Lighthouse, Google
 *                   appearance guides, Bing webmaster guidelines.
 * - `heuristic`   — industry folklore with no spec behind it: SERP length
 *                   windows and similar. Agents must weight these accordingly.
 */
export type SourceRigor = "normative" | "vendor-spec" | "guideline" | "heuristic";

/** One authoritative reference a rule can cite. */
export interface Source {
  /** Stable kebab-case identifier (e.g. `whatwg-html-title`). */
  id: string;
  /** Who publishes and maintains the document (e.g. `WHATWG`, `Google`). */
  publisher: string;
  /** How authoritative the document is. */
  rigor: SourceRigor;
  /** Human-readable document title. */
  title: string;
  /** Where the document lives. Stored without a fragment; see `anchor`. */
  url: string;
  /** Section id within the doc (the URL fragment, without the leading `#`). */
  anchor?: string;
  /** ISO date (YYYY-MM-DD) we last confirmed the URL and its content. */
  retrievedAt: string;
  /** Short fair-use excerpt. Keep it short — this is quoted, not copied. */
  quote?: string;
  /** Our own paraphrase of what the source establishes. Original content. */
  note?: string;
}
