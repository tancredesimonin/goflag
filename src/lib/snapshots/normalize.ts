/**
 * Apply `config.normalize` rules to a base snapshot.
 *
 * Normalisation runs *after* projection and *before* the digest is
 * computed, so a stripped/hashed/redacted field is treated as the
 * canonical form for diff purposes — committed snapshots and live
 * re-fetches both go through the same pipeline.
 *
 * The user-facing path syntax (matched by `matchesPath`):
 *
 *   - `<tag-key>`                  → matches a tag by its canonical key
 *   - `meta:og:image[*]`           → wildcard over indexed tags
 *   - `jsonld:<Type>`              → the JSON-LD entry as a whole
 *   - `jsonld:<Type>.<field-path>` → a single field inside an entry
 *
 * Strategies:
 *
 *   - `present` — never appears in user config, but acts as the
 *     identity transform when we need to express "no override".
 *   - `hash`    — replace the tag value with `hash: "<sha256-12>"`.
 *     For JSON-LD, equivalent to `present` (we don't store values).
 *   - `redact`  — replace the tag value with `"<redacted>"`. For
 *     JSON-LD, equivalent to `present`.
 *   - `strip`   — drop the tag, JSON-LD entry, or JSON-LD field.
 *
 * Order semantics: rules apply top-to-bottom, **last match wins**.
 * That matches the cascade norm in CSS / ESLint overrides /
 * Stylelint, and lets users start with broad rules and end with
 * specific exceptions.
 */

import type { Snapshot, SnapshotJsonLd, SnapshotTag, NormalizeStrategy } from "./types";
import { matchesPath } from "./path";
import { hashValue } from "./digest";

/**
 * One entry in `config.normalize`. Mirrors the zod schema in
 * `src/lib/config/schema.ts` but without the runtime layer — the
 * snapshot module never imports zod.
 */
export interface NormalizeRule {
  path: string;
  strategy: Exclude<NormalizeStrategy, "present">;
}

/**
 * Apply rules to a snapshot **body** (everything except `digest`).
 * The caller is expected to compute the digest after this returns.
 */
export function normalizeSnapshotBody(
  body: Omit<Snapshot, "digest">,
  rules: ReadonlyArray<NormalizeRule>,
): Omit<Snapshot, "digest"> {
  if (rules.length === 0) return body;

  const tags: SnapshotTag[] = [];
  for (const tag of body.tags) {
    const next = normaliseTag(tag, rules);
    if (next !== null) tags.push(next);
  }

  const jsonLd: SnapshotJsonLd[] = [];
  for (const entry of body.jsonLd) {
    const next = normaliseJsonLd(entry, rules);
    if (next !== null) jsonLd.push(next);
  }

  return { ...body, tags, jsonLd };
}

function normaliseTag(tag: SnapshotTag, rules: ReadonlyArray<NormalizeRule>): SnapshotTag | null {
  const strategy = lastMatchingStrategy(rules, tag.key);
  if (!strategy) return tag;
  if (strategy === "strip") return null;
  if (strategy === "redact") return { key: tag.key, value: "<redacted>" };
  // strategy === "hash"
  if (tag.value === undefined) return { key: tag.key };
  return { key: tag.key, hash: hashValue(tag.value) };
}

function normaliseJsonLd(
  entry: SnapshotJsonLd,
  rules: ReadonlyArray<NormalizeRule>,
): SnapshotJsonLd | null {
  // Step 1: does any rule strip the entry whole?
  const entryPath = `jsonld:${entry.type}`;
  if (lastMatchingStrategy(rules, entryPath) === "strip") return null;

  // Step 2: drop individual fields whose path is stripped.
  const kept: string[] = [];
  for (const field of entry.fields) {
    const path = `${entryPath}.${field}`;
    if (lastMatchingStrategy(rules, path) === "strip") continue;
    kept.push(field);
  }

  if (kept.length === entry.fields.length) return entry;
  return { type: entry.type, fields: kept };
}

function lastMatchingStrategy(
  rules: ReadonlyArray<NormalizeRule>,
  path: string,
): NormalizeRule["strategy"] | null {
  let last: NormalizeRule["strategy"] | null = null;
  for (const rule of rules) {
    if (matchesPath(rule.path, path)) last = rule.strategy;
  }
  return last;
}
