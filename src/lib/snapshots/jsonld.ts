/**
 * Project the page's JSON-LD blocks to `SnapshotJsonLd[]`.
 *
 * One snapshot entry per `@type` in document order, even when a
 * single `<script>` carries an `@graph`. We store the `@type` and
 * the sorted set of *paths* present — not their values, because
 * "the article description was tweaked" should not register as a
 * structural regression. The Phase 9 diff classifier relies on this
 * shape to distinguish lost-type (regression) from lost-field
 * (sub-regression) from content-only changes.
 */

import type { JsonLdBlock } from "@/lib/core/types";
import type { SnapshotJsonLd } from "./types";

/**
 * `@type` carries the structural identity of a JSON-LD entry, so we
 * exclude it from the `fields` set (it lives on `SnapshotJsonLd.type`
 * already). Everything else — including `@context`, `@id`, vendor
 * extensions — stays.
 */
const EXCLUDED_KEYS = new Set(["@type"]);

export function projectJsonLd(blocks: JsonLdBlock[]): SnapshotJsonLd[] {
  const out: SnapshotJsonLd[] = [];
  for (const block of blocks) {
    if (block.parseError) continue;
    const data = block.data;
    if (data === null || typeof data !== "object") continue;
    for (const item of expandGraph(data)) {
      const types = readTypes(item);
      if (types.length === 0) continue;
      const fields = collectFields(item);
      for (const type of types) {
        out.push({ type, fields });
      }
    }
  }
  return out;
}

/**
 * Yield every "node" in a parsed JSON-LD block. A plain block has
 * exactly one node (itself); a block with `@graph: [...]` yields one
 * node per array element. Nodes that are not plain objects are
 * silently ignored — schema.org node identifiers can be string IRIs,
 * but those carry no field structure for us to record.
 */
function expandGraph(data: unknown): unknown[] {
  if (data === null || typeof data !== "object") return [];
  if (Array.isArray(data)) {
    // Top-level arrays of nodes are valid JSON-LD; walk each.
    return data.filter((node) => node !== null && typeof node === "object");
  }
  const obj = data as Record<string, unknown>;
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    return graph.filter((node) => node !== null && typeof node === "object");
  }
  return [obj];
}

function readTypes(node: unknown): string[] {
  if (node === null || typeof node !== "object") return [];
  const t = (node as Record<string, unknown>)["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Walk a JSON-LD node and return the sorted, deduplicated list of
 * leaf paths. Arrays collapse to `[*]` (we record presence-of-list,
 * not list length — length drift is content noise). Nested objects
 * use dotted segments.
 */
export function collectFields(node: unknown): string[] {
  const acc = new Set<string>();
  walk(node, "", acc);
  return Array.from(acc).sort();
}

function walk(value: unknown, prefix: string, acc: Set<string>): void {
  if (value === null || value === undefined) {
    if (prefix) acc.add(prefix);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix) acc.add(`${prefix}[*]`);
      return;
    }
    for (const item of value) walk(item, `${prefix}[*]`, acc);
    return;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (EXCLUDED_KEYS.has(key) && prefix === "") continue;
      const next = prefix ? `${prefix}.${key}` : key;
      walk((value as Record<string, unknown>)[key], next, acc);
    }
    return;
  }
  if (prefix) acc.add(prefix);
}
