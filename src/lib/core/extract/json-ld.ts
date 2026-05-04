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

/** Walk the parsed JSON-LD value and pick up every `@type` we can find. */
export function extractTypes(node: unknown): string[] {
  const out = new Set<string>();
  visit(node, out);
  return [...out];
}

function visit(node: unknown, out: Set<string>): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) visit(item, out);
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
    for (const item of graph) visit(item, out);
  }

  // For nested entities like `mainEntity`, `author.@type`, etc.
  for (const [k, v] of Object.entries(obj)) {
    if (k === "@type" || k === "@graph") continue;
    if (v && typeof v === "object") visit(v, out);
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
