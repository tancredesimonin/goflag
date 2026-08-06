/**
 * Structural validation of the source catalog — the offline half of the
 * provenance contract (the online half, URL liveness, lives in
 * `scripts/validate-sources.ts` because it needs the network).
 *
 * Pure and side-effect free so it can run as a unit test on every pipeline:
 * a malformed entry fails `sources.test.ts`, not a scheduled job three days
 * later. It takes the catalog as an argument rather than importing it so the
 * negative cases are testable with fabricated bad entries.
 */

import type { Source } from "./types";

/** One problem found in one catalog entry. */
export interface SourceValidationError {
  /** The offending source's id (or its index when the id itself is bad). */
  sourceId: string;
  message: string;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fair-use posture: a quote is an excerpt, never a copy. Vendor docs are
 * all-rights-reserved, so anything longer than a sentence or two belongs in
 * `note` as our own paraphrase instead.
 */
const MAX_QUOTE_LENGTH = 300;

/** True when `value` is a YYYY-MM-DD string naming a real calendar date. */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Date rolls over out-of-range components (2026-02-31 → March 3rd);
  // round-tripping catches that.
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validate one catalog. Returns every problem found — empty means the
 * catalog honors the provenance contract (structurally; liveness is the
 * network script's job).
 */
export function validateSourceCatalog(sources: readonly Source[]): SourceValidationError[] {
  const errors: SourceValidationError[] = [];
  const seen = new Set<string>();

  sources.forEach((source, index) => {
    const ref = source.id || `#${index}`;
    const fail = (message: string) => errors.push({ sourceId: ref, message });

    if (!ID_PATTERN.test(source.id)) {
      fail(`id must be kebab-case (got ${JSON.stringify(source.id)})`);
    }
    if (seen.has(source.id)) {
      fail("duplicate id");
    }
    seen.add(source.id);

    if (!source.publisher.trim()) fail("publisher must not be empty");
    if (!source.title.trim()) fail("title must not be empty");

    let url: URL | undefined;
    try {
      url = new URL(source.url);
    } catch {
      fail(`url does not parse: ${JSON.stringify(source.url)}`);
    }
    if (url && url.protocol !== "https:") {
      fail(`url must be https (got ${url.protocol})`);
    }
    if (url && url.hash) {
      fail("url must not carry a fragment — put the section id in `anchor`");
    }
    if (source.anchor !== undefined && (!source.anchor || source.anchor.startsWith("#"))) {
      fail("anchor must be a bare section id, without the leading `#`");
    }

    if (!isValidIsoDate(source.retrievedAt)) {
      fail(
        `retrievedAt must be a real YYYY-MM-DD date (got ${JSON.stringify(source.retrievedAt)})`,
      );
    }

    if (source.quote !== undefined) {
      if (!source.quote.trim()) fail("quote, when present, must not be empty");
      if (source.quote.length > MAX_QUOTE_LENGTH) {
        fail(`quote exceeds ${MAX_QUOTE_LENGTH} chars — quote less, paraphrase in \`note\``);
      }
    }
    if (source.note !== undefined && !source.note.trim()) {
      fail("note, when present, must not be empty");
    }
  });

  return errors;
}
