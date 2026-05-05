/**
 * Deterministic short hashes for snapshot fields.
 *
 * Two distinct uses:
 *
 *   - `hashValue(s)` — applied to a single field when the user
 *     configures `{ strategy: "hash" }`. Stored on the
 *     `SnapshotTag.hash` field so the diff can detect
 *     "field present, content changed" without keeping the content.
 *
 *   - `digestSnapshot(snap)` — applied to the entire body
 *     (everything except `capturedAt` and the `digest` itself) so
 *     the diff fast-path can return early when both inputs match.
 *
 * Both use SHA-256 truncated to the first 12 hex chars. 48 bits
 * of collision resistance is plenty for our use cases — we are not
 * defending against adversaries, only against accidental drift.
 */

import { createHash } from "node:crypto";
import type { Snapshot } from "./types";

const TRUNCATE_AT = 12;

export function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, TRUNCATE_AT);
}

/**
 * Stable digest of a snapshot's body. `capturedAt` and the existing
 * `digest` field are excluded (the digest can't depend on itself,
 * and the timestamp is volatile by design).
 *
 * The order of keys in the input object does not affect the result:
 * we walk the structure manually and emit a canonical JSON form.
 */
export function digestSnapshot(snap: Omit<Snapshot, "digest">): string {
  const canonical = canonicalise({
    schemaVersion: snap.schemaVersion,
    route: snap.route,
    // `sampleUrl` is volatile (host changes between dev sessions); we
    // exclude it from the digest so a re-fetch from a different port
    // does not invalidate every snapshot.
    tags: snap.tags,
    jsonLd: snap.jsonLd,
    ruleOutcomes: snap.ruleOutcomes,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, TRUNCATE_AT);
}

/**
 * Recursively serialise a value to a canonical JSON string.
 * Keys of plain objects are sorted lexically; arrays preserve
 * order; primitives go through `JSON.stringify` directly.
 *
 * Exported for tests so we can assert determinism without shipping
 * a separate JSON-stringify utility.
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`${JSON.stringify(key)}:${canonicalise(obj[key])}`);
  }
  return `{${parts.join(",")}}`;
}
