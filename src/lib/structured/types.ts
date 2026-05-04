/**
 * Public types for the structured-data layer (Phase 6).
 *
 * The two artefacts callers consume:
 *
 *   - `JsonLdValidationIssue`: a single finding produced by the
 *     validator against one JSON-LD block. The Issues panel and the
 *     Structured-data tab both render these; the CLI surfaces them via
 *     `headlint lint --json` (Phase 5 hook stays unchanged because
 *     these are translated into regular `Issue`s before reaching that
 *     pipeline).
 *
 *   - `Suggestion`: a recommendation that a JSON-LD block of a given
 *     type *should* be added because the page looks like it'd benefit
 *     from one. Carries the rendered snippet so the UI can offer a
 *     one-click "Copy snippet" button.
 *
 * Both shapes are designed to be JSON-serialisable (no functions, no
 * symbols) so the snapshot diff in Phase 9 and the future hosted SaaS
 * can persist them as-is.
 */

export type JsonLdSeverity = "error" | "warning" | "info";

export interface JsonLdValidationIssue {
  /** Block index in document order, mirrors `JsonLdBlock.index`. */
  blockIndex: number;
  /**
   * Dotted path inside the parsed JSON-LD value. Empty string for
   * "the block itself"; otherwise something like `@graph[1].author`,
   * `itemListElement[2].item`. Same convention as Ajv / Zod errors so
   * the path is greppable across tools.
   */
  path: string;
  severity: JsonLdSeverity;
  /** The schema.org `@type` (or `@graph` entity type) that was being
   *  validated when this issue fired. `undefined` for parse errors. */
  type?: string;
  /** Human-readable, imperative-ish message; rendered as-is in the UI. */
  message: string;
  /** Stable code so the UI can group / filter (e.g. `missing-required`). */
  code: JsonLdValidationCode;
}

export type JsonLdValidationCode =
  | "parse-error"
  | "missing-context"
  | "missing-type"
  | "unknown-type"
  | "missing-required"
  | "expected-string"
  | "expected-url"
  | "expected-iso-date"
  | "expected-array"
  | "empty-array"
  | "expected-object";

export interface SuggestionExample {
  /** Rendered JSON-LD as a syntax-highlighted-ready string (pretty-printed). */
  snippet: string;
  /** Language tag passed to the highlighter and the clipboard. */
  language: "html" | "json";
}

export interface Suggestion {
  /**
   * Stable identifier for the suggestion *template* (one per file in
   * `src/lib/suggestions/templates/`). Doubles as the key the UI uses
   * to deduplicate suggestions when the page already advertises that
   * type via existing JSON-LD.
   */
  id: SuggestionId;
  /** Short label used as the card title. */
  title: string;
  /** One-paragraph explanation rendered above the snippet. */
  rationale: string;
  /** The schema.org type the snippet declares (e.g. `Organization`). */
  type: string;
  /** The rendered snippet — embedded inside `<script type="application/ld+json">`. */
  example: SuggestionExample;
  /**
   * Severity used when the suggestion is mirrored into the Issues
   * panel (Phase 6.8). Always `info` — suggestions never block CI.
   */
  severity: "info";
}

export type SuggestionId =
  | "Organization"
  | "WebSite"
  | "BreadcrumbList"
  | "Article"
  | "Person"
  | "FAQPage"
  | "SoftwareApplication";
