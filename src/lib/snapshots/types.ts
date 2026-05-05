/**
 * Snapshot data model.
 *
 * A snapshot is a deterministic, normalised projection of a `Page` —
 * small enough to commit alongside the source code, stable enough to
 * diff across builds. The Phase 9 differential CI runner consumes
 * snapshots; the in-UI Snapshot tab renders the diff between the
 * committed snapshot and the live re-fetch.
 *
 * Design constraints (mirroring `src/lib/core/types.ts`):
 *
 *  - **Stable contract.** Snapshot files live in the user's git
 *    history; renaming or removing a top-level field is a semver-
 *    major event for headlint. `SNAPSHOT_SCHEMA_VERSION` is the
 *    handle that lets the loader detect old snapshots and either
 *    migrate them or refuse to diff.
 *  - **No content noise.** We deliberately project *presence* +
 *    *structure* — not the literal `<title>` text or the description
 *    copy. Volatile content lives behind the `normalize` config so
 *    the diff classifies "you dropped `og:image`" loudly and
 *    "you re-worded the description" quietly.
 *  - **Pure, JSON-serialisable.** No `Date` objects, no functions,
 *    no class instances. The only side-effecting code in
 *    `src/lib/snapshots/**` is `io.ts` (writer/reader).
 */

import type { Severity } from "@/lib/core/types";

/**
 * Bumped manually whenever the snapshot shape changes in a way that
 * invalidates committed files. The `headlint snapshot` command refuses
 * to diff across major versions.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/**
 * Strategy applied to a tag value by `config.normalize`.
 *
 *   - `"present"`: the field is recorded with its raw normalised
 *     `value`. The default — used when no `normalize` rule matches.
 *   - `"hash"`: replaced with `hash: "sha256:<12-hex>"`. Detects
 *     "field still present, content changed" without storing the
 *     content (good for build hashes, datestamps, csrf tokens).
 *   - `"redact"`: replaced with `value: "<redacted>"`. The diff
 *     never reports a content change for redacted fields. Use for
 *     PII or anything you actively never want in git.
 *   - `"strip"`: the entry is dropped from `tags` entirely. The diff
 *     therefore can't classify it as a regression. Use sparingly —
 *     for fields you genuinely don't care about, not for noisy ones.
 */
export type NormalizeStrategy = "present" | "hash" | "redact" | "strip";

/**
 * A single line in the projected `<head>`.
 *
 * `key` is the canonical, content-free identifier. Examples:
 *
 *   - `"title"`
 *   - `"html:lang"`, `"html:dir"`
 *   - `"meta:description"`, `"meta:viewport"`, `"meta:robots"`
 *   - `"meta:og:title"`, `"meta:og:image[0]"`, `"meta:og:image[0]:width"`
 *   - `"meta:twitter:card"`, `"meta:twitter:image:alt"`
 *   - `"link:canonical"`, `"link:manifest"`,
 *     `"link:icon[sizes=32x32]"`, `"link:alternate[hreflang=fr]"`
 *
 * Index suffixes (`[0]`, `[1]`) are used for repeatable tags
 * (`og:image`, `og:locale:alternate`); attribute selectors
 * (`[hreflang=fr]`, `[sizes=32x32]`) for tags whose identity is
 * carried by an attribute rather than position.
 */
export interface SnapshotTag {
  key: string;
  /** Normalised value. Absent when `strategy === "strip"`. */
  value?: string;
  /** SHA-256 (first 12 hex chars) of the original value when
   *  `strategy === "hash"`. */
  hash?: string;
}

/**
 * Projection of one JSON-LD block. We keep `@type` + the sorted set
 * of *paths* present, so a diff distinguishes "added an Article"
 * (regression / addition) from "tweaked the description copy"
 * (content drift).
 */
export interface SnapshotJsonLd {
  /** Top-level `@type` value (e.g. `"Article"`, `"BreadcrumbList"`). */
  type: string;
  /** Sorted, deduplicated set of dotted field paths present in the
   *  block. Values are not stored. Examples: `"author.name"`,
   *  `"datePublished"`, `"itemListElement[*].position"`. */
  fields: string[];
}

/**
 * The fully-projected snapshot for one route.
 */
export interface Snapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  /** Stable route key — the URL pathname after normalisation
   *  (trailing slashes collapsed, query string stripped). The diff
   *  matches snapshots by this field. */
  route: string;
  /** The exact URL we sampled from. Recorded for re-fetch + debug;
   *  the host portion is volatile by design (developers run against
   *  `localhost:3000` and `localhost:4173` interchangeably) and is
   *  excluded from the diff. */
  sampleUrl: string;
  /** ISO timestamp of the projection. Excluded from the diff and
   *  the digest. */
  capturedAt: string;
  /** Sorted, deduplicated set of projected tags. */
  tags: SnapshotTag[];
  /** JSON-LD projection in document order. */
  jsonLd: SnapshotJsonLd[];
  /** Rule outcomes: ruleId → severity, for every rule that fired
   *  during projection. The lane runner uses this map to detect
   *  pass→fail / fail→pass transitions cheaply. */
  ruleOutcomes: Record<string, Severity>;
  /** SHA-256 (first 12 hex chars) of everything except `capturedAt`.
   *  Identical digests guarantee identical snapshots; the diff fast-
   *  path uses this to bail out before walking entries. */
  digest: string;
}
