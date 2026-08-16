import type { JsonLdBlock, RawScriptTag } from "../types";

/**
 * Parse all `<script type="application/ld+json">` blocks captured in `raw.scripts`.
 *
 * Resilient to:
 *  - Trailing commas (warn-only, parse strictly)
 *  - HTML entity-escaped content (`&amp;` → `&`, `&lt;` → `<`, etc.)
 *  - Multiple roots in `@graph`
 *  - Top-level arrays of types
 */
export function parseJsonLdScripts(scripts: RawScriptTag[]): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  let visibleIndex = 0;

  for (const s of scripts) {
    if (s.type?.toLowerCase() !== "application/ld+json") continue;
    const raw = s.content?.trim() ?? "";
    if (raw.length === 0) {
      blocks.push({
        index: visibleIndex++,
        raw,
        data: null,
        parseError: "empty",
        types: [],
      });
      continue;
    }

    const decoded = decodeHtmlEntities(raw);
    let parsed: unknown;
    let parseError: string | undefined;
    try {
      parsed = JSON.parse(decoded);
    } catch (err) {
      parsed = null;
      parseError = err instanceof Error ? err.message : String(err);
    }

    blocks.push({
      index: visibleIndex++,
      raw,
      data: parsed,
      parseError,
      types: parsed === null ? [] : extractTypes(parsed),
    });
  }

  return blocks;
}

/**
 * How far the walker descends before it stops.
 *
 * `JSON.parse` is no protection here: V8's parser is iterative and accepts
 * nesting far past what a recursive walker survives — 30 KB of
 * `{"a":{"a":…}}` parses cleanly and then overflows the stack below. This
 * walker runs on every audit, not just where a rule reports structured data,
 * and it is the extraction pass, so throwing here loses the whole page: the
 * crawl's per-page catch could only file it as `[network error] … Maximum
 * call stack size exceeded`, which is a page auditing itself out of the run
 * by declaring one script. Callers reached outside that catch got the throw.
 *
 * A real schema.org graph nests a handful of levels — `@graph` → article →
 * author → organization → image. Whatever a page declares 100 levels down is
 * not an entity anyone will search for, so refusing to descend costs no type
 * we would have reported.
 */
const MAX_DEPTH = 100;

/** Walk the parsed JSON-LD value and pick up every `@type` we can find. */
export function extractTypes(node: unknown): string[] {
  const out = new Set<string>();
  visit(node, out, 0);
  return [...out];
}

function visit(node: unknown, out: Set<string>, depth: number): void {
  if (node === null || node === undefined) return;
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) visit(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") {
    out.add(t);
  } else if (Array.isArray(t)) {
    for (const v of t) {
      if (typeof v === "string") out.add(v);
    }
  }

  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) visit(item, out, depth + 1);
  }

  // For nested entities like `mainEntity`, `author.@type`, etc.
  for (const [k, v] of Object.entries(obj)) {
    if (k === "@type" || k === "@graph") continue;
    if (v && typeof v === "object") visit(v, out, depth + 1);
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}
