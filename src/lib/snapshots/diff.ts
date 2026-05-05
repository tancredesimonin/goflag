/**
 * Snapshot diff classifier — the core of Phase 9's CI runner.
 *
 * Given a `before` and an `after` snapshot for the same route, classify
 * each delta into one of three buckets:
 *
 *   - `regression`    — a structural element that existed in `before`
 *     no longer exists in `after`. Lost tags, lost JSON-LD types,
 *     lost JSON-LD fields, rule outcomes flipping `pass → fail`.
 *     This is what fails CI.
 *   - `addition`      — present in `after`, missing in `before`. The
 *     mirror image of a regression. Reported, never fatal.
 *   - `content-drift` — both sides have the same key, different value.
 *     Reported, never fatal.
 *
 * The `kind` discriminator names *what* changed (tag, JSON-LD type,
 * JSON-LD field, rule outcome) so the PR-comment renderer (Phase 9c)
 * and the in-UI Snapshot panel can group entries meaningfully.
 *
 * This module is the single point that decides "is this delta loud or
 * quiet". The lane mapping in `headlint ci` (Phase 9b) reads
 * directly off `class` + `kind`; the UI groups by `class`.
 */

import type { Severity } from "@/lib/core/types";
import type { Snapshot, SnapshotJsonLd, SnapshotTag } from "./types";

export type DiffClass = "regression" | "addition" | "content-drift";
export type DiffKind = "tag" | "jsonld-type" | "jsonld-field" | "rule-outcome";

export interface SnapshotDiffEntry {
  class: DiffClass;
  kind: DiffKind;
  /** Stable, human-readable identifier for the entry. Examples:
   *  `"meta:og:image[0]"` (kind: tag),
   *  `"Article"` (kind: jsonld-type),
   *  `"Article.datePublished"` (kind: jsonld-field),
   *  `"og.image.missing"` (kind: rule-outcome). */
  key: string;
  before?: string;
  after?: string;
}

export interface SnapshotDiff {
  route: string;
  /** `true` when both snapshots have the same digest. The diff fast-
   *  path checks this first so byte-identical snapshots return
   *  immediately with an empty `entries` array. */
  identical: boolean;
  entries: SnapshotDiffEntry[];
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const route = after.route;
  if (before.digest === after.digest) {
    return { route, identical: true, entries: [] };
  }

  const entries: SnapshotDiffEntry[] = [];
  diffTags(before.tags, after.tags, entries);
  diffJsonLd(before.jsonLd, after.jsonLd, entries);
  diffRuleOutcomes(before.ruleOutcomes, after.ruleOutcomes, entries);

  // Stable order: by class (regression first, then addition, then
  // drift), then by kind, then by key. The CLI report and the PR
  // comment both consume entries in this order.
  entries.sort(byClassKindKey);

  return { route, identical: entries.length === 0, entries };
}

// ---------------------------------------------------------------------------
// Tag diff
// ---------------------------------------------------------------------------

function diffTags(before: SnapshotTag[], after: SnapshotTag[], out: SnapshotDiffEntry[]): void {
  const beforeMap = new Map(before.map((t) => [t.key, t]));
  const afterMap = new Map(after.map((t) => [t.key, t]));
  const keys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
  for (const key of keys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (b && !a) {
      out.push({ class: "regression", kind: "tag", key, before: tagValue(b) });
      continue;
    }
    if (!b && a) {
      out.push({ class: "addition", kind: "tag", key, after: tagValue(a) });
      continue;
    }
    if (b && a) {
      const bv = tagValue(b);
      const av = tagValue(a);
      if (bv !== av) {
        out.push({ class: "content-drift", kind: "tag", key, before: bv, after: av });
      }
    }
  }
}

function tagValue(tag: SnapshotTag): string | undefined {
  if (tag.value !== undefined) return tag.value;
  if (tag.hash !== undefined) return `hash:${tag.hash}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// JSON-LD diff (entry-level + field-level)
// ---------------------------------------------------------------------------

function diffJsonLd(
  before: SnapshotJsonLd[],
  after: SnapshotJsonLd[],
  out: SnapshotDiffEntry[],
): void {
  // We coalesce repeated `@type`s into a single bucket per side. If a
  // page declares `Article` twice, we treat it as one Article with
  // the union of the two field sets. The UI surfaces "type lost" or
  // "type added" once per type — repeated entries do not generate
  // multiple regressions.
  const beforeByType = bucketByType(before);
  const afterByType = bucketByType(after);
  const types = new Set<string>([...beforeByType.keys(), ...afterByType.keys()]);
  for (const type of types) {
    const b = beforeByType.get(type);
    const a = afterByType.get(type);
    if (b && !a) {
      out.push({ class: "regression", kind: "jsonld-type", key: type });
      continue;
    }
    if (!b && a) {
      out.push({ class: "addition", kind: "jsonld-type", key: type });
      continue;
    }
    if (b && a) {
      diffFields(type, b, a, out);
    }
  }
}

function bucketByType(entries: SnapshotJsonLd[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const entry of entries) {
    const bucket = out.get(entry.type) ?? new Set<string>();
    for (const f of entry.fields) bucket.add(f);
    out.set(entry.type, bucket);
  }
  return out;
}

function diffFields(
  type: string,
  before: Set<string>,
  after: Set<string>,
  out: SnapshotDiffEntry[],
): void {
  for (const field of before) {
    if (!after.has(field)) {
      out.push({ class: "regression", kind: "jsonld-field", key: `${type}.${field}` });
    }
  }
  for (const field of after) {
    if (!before.has(field)) {
      out.push({ class: "addition", kind: "jsonld-field", key: `${type}.${field}` });
    }
  }
}

// ---------------------------------------------------------------------------
// Rule outcomes (the Lane 1 signal)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

function diffRuleOutcomes(
  before: Record<string, Severity>,
  after: Record<string, Severity>,
  out: SnapshotDiffEntry[],
): void {
  const ids = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    const b = before[id];
    const a = after[id];
    if (b && !a) {
      // Rule no longer fires — that's an addition in the "fixed
      // a problem" sense. We deliberately don't classify it as
      // regression even when severity drops.
      out.push({ class: "addition", kind: "rule-outcome", key: id, before: b });
      continue;
    }
    if (!b && a) {
      out.push({ class: "regression", kind: "rule-outcome", key: id, after: a });
      continue;
    }
    if (b && a && b !== a) {
      // Severity changed. The `b !== a` guard above means the
      // severities differ; if `a` is strictly *worse* (info →
      // warning, warning → error) it's a regression, otherwise it's
      // an improvement (recorded as `addition` for consistency with
      // the appeared/disappeared casing above).
      const klass: DiffClass = SEVERITY_RANK[a] > SEVERITY_RANK[b] ? "regression" : "addition";
      out.push({ class: klass, kind: "rule-outcome", key: id, before: b, after: a });
    }
  }
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

const CLASS_ORDER: Record<DiffClass, number> = {
  regression: 0,
  addition: 1,
  "content-drift": 2,
};

const KIND_ORDER: Record<DiffKind, number> = {
  "rule-outcome": 0,
  tag: 1,
  "jsonld-type": 2,
  "jsonld-field": 3,
};

function byClassKindKey(a: SnapshotDiffEntry, b: SnapshotDiffEntry): number {
  const c = CLASS_ORDER[a.class] - CLASS_ORDER[b.class];
  if (c !== 0) return c;
  const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (k !== 0) return k;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
