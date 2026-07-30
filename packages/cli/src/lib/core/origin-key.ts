/**
 * Stable string keys for `TagOrigin` values.
 *
 * The Issues panel needs to point back at "the same tag in the Raw
 * viewer" — but `TagOrigin` is a union of structurally different
 * shapes, so we can't use it as a DOM `id` directly. This helper
 * collapses the union into a deterministic, URL-safe string the Raw
 * viewer can put on the `<li id="…">` and the Issues panel can target
 * via `document.getElementById`.
 *
 * The exact format is **not** part of the public API: it's only used
 * inside the inspect surface. Don't snapshot it, don't put it in URL
 * params consumers might bookmark — those should round-trip through a
 * different (hash-stable) representation.
 */

import type { TagOrigin } from "@/lib/core/types";

export function originKey(origin: TagOrigin): string {
  switch (origin.kind) {
    case "title":
      return "title";
    case "meta": {
      if (origin.property) return `meta:property:${origin.property}`;
      if (origin.httpEquiv) return `meta:http-equiv:${origin.httpEquiv}`;
      if (origin.name) return `meta:name:${origin.name}`;
      return "meta:unknown";
    }
    case "link":
      return `link:rel:${origin.rel}`;
    case "html":
      return `html:${origin.attribute}`;
    case "json-ld":
      return `json-ld:${origin.index}:${origin.path}`;
    case "header":
      return `header:${origin.name.toLowerCase()}`;
    case "computed":
      return "computed";
  }
}

/** DOM id used to anchor a raw row to its origin (prefixed for collision-safety). */
export function originDomId(origin: TagOrigin): string {
  return `goflag-origin-${originKey(origin)}`;
}
