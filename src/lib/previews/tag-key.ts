/**
 * Stable string identifiers for raw `<head>` tags.
 *
 * Used by:
 *
 *  - the "What if?" toggle (Phase 4.15) to select tags to suppress;
 *  - the per-preview footer (Phase 4.14) to label which tags fed which
 *    fields;
 *  - future Phase 5 rules and the Raw-tab "jump to source" affordance.
 *
 * The key intentionally collapses sibling tags onto one row when that
 * matches user intent: `og:image`, `og:image:width`, `og:image:height`,
 * `og:image:alt` all answer to `meta:property=og:image` because nobody
 * thinks of them as separate things to toggle. The `siblingsOf()` helper
 * formalises that grouping for the resolver.
 */

import type { Page, RawLinkTag, RawMetaTag, RawScriptTag, TagOrigin } from "@/lib/core/types";
import type { TagKey } from "./types";

/** Stable key for a raw meta tag. */
export function metaKey(meta: RawMetaTag): TagKey | undefined {
  if (meta.property) return `meta:property=${meta.property.toLowerCase()}`;
  if (meta.name) return `meta:name=${meta.name.toLowerCase()}`;
  if (meta.httpEquiv) return `meta:http-equiv=${meta.httpEquiv.toLowerCase()}`;
  if (meta.charset) return `meta:charset`;
  return undefined;
}

/** Stable key for a raw link tag. Multiple `<link rel="…">` collapse to one key. */
export function linkKey(link: RawLinkTag): TagKey | undefined {
  if (!link.rel) return undefined;
  return `link:rel=${link.rel.toLowerCase()}`;
}

/** Stable key for a JSON-LD block. */
export function jsonLdKey(script: RawScriptTag, index: number): TagKey {
  const t = script.type?.toLowerCase() ?? "application/ld+json";
  return `script:type=${t}:${index}`;
}

/** Title key. */
export const TITLE_KEY: TagKey = "title";
/** `<html lang>` key. */
export const HTML_LANG_KEY: TagKey = "html:lang";

/**
 * Translate a {@link TagOrigin} (which is what every parsed value carries
 * via `Sourced<T>.origin`) back into the {@link TagKey} that addresses the
 * underlying raw tag. Returns `undefined` for synthetic origins (header,
 * computed) that don't correspond to a single source tag.
 */
export function tagKeyFromOrigin(origin: TagOrigin): TagKey | undefined {
  switch (origin.kind) {
    case "title":
      return TITLE_KEY;
    case "meta":
      if (origin.property) return `meta:property=${origin.property.toLowerCase()}`;
      if (origin.name) return `meta:name=${origin.name.toLowerCase()}`;
      if (origin.httpEquiv) return `meta:http-equiv=${origin.httpEquiv.toLowerCase()}`;
      return undefined;
    case "link":
      return `link:rel=${origin.rel.toLowerCase()}`;
    case "html":
      return `html:${origin.attribute.toLowerCase()}`;
    case "json-ld":
      return `script:type=application/ld+json:${origin.index}`;
    case "header":
    case "computed":
      return undefined;
  }
}

/**
 * Enumerate every {@link TagKey} present on a {@link Page}. Returns the
 * keys in stable order (title, html attrs, metas in document order, links,
 * json-ld) so the toggle UI can render them as a deterministic list.
 *
 * Each entry carries a short human label so the toggle UI doesn't need to
 * re-derive it.
 */
export function listTagKeys(page: Page): Array<{ key: TagKey; label: string }> {
  const seen = new Set<TagKey>();
  const out: Array<{ key: TagKey; label: string }> = [];

  const push = (key: TagKey | undefined, label: string) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, label });
  };

  if (page.raw.title !== undefined) push(TITLE_KEY, "<title>");
  if (page.raw.htmlLang !== undefined) push(HTML_LANG_KEY, "<html lang>");

  for (const meta of page.raw.metas) {
    const key = metaKey(meta);
    if (!key) continue;
    push(key, prettyMetaLabel(meta));
  }

  for (const link of page.raw.links) {
    const key = linkKey(link);
    if (!key) continue;
    push(key, `<link rel="${link.rel}">`);
  }

  page.raw.scripts.forEach((script, i) => {
    if ((script.type ?? "").toLowerCase() === "application/ld+json") {
      push(jsonLdKey(script, i), `<script type="application/ld+json"> #${i + 1}`);
    }
  });

  return out;
}

function prettyMetaLabel(meta: RawMetaTag): string {
  if (meta.property) return `<meta property="${meta.property}">`;
  if (meta.name) return `<meta name="${meta.name}">`;
  if (meta.httpEquiv) return `<meta http-equiv="${meta.httpEquiv}">`;
  if (meta.charset) return `<meta charset="${meta.charset}">`;
  return `<meta>`;
}

/**
 * Sibling-aware membership check used by the resolver: returns true if
 * `key` (or any of its sibling-group members) is in `removed`.
 *
 * The `og:image` family is grouped: removing `meta:property=og:image` also
 * suppresses `og:image:width`, `og:image:height`, `og:image:alt`, and
 * `og:image:secure_url`. Same for `twitter:image*`. This matches what users
 * mean when they click "what if og:image were missing?".
 */
export function isSuppressed(key: TagKey, removed: ReadonlySet<TagKey>): boolean {
  if (removed.has(key)) return true;
  for (const r of removed) {
    if (r === key) return true;
    // og:image* family
    if (r === "meta:property=og:image" && key.startsWith("meta:property=og:image:")) {
      return true;
    }
    // twitter:image* family
    if (r === "meta:name=twitter:image" && key.startsWith("meta:name=twitter:image:")) {
      return true;
    }
  }
  return false;
}

/** True when the meta tag (or its grouped sibling) is suppressed. */
export function metaSuppressed(meta: RawMetaTag, removed: ReadonlySet<TagKey>): boolean {
  const key = metaKey(meta);
  if (!key) return false;
  return isSuppressed(key, removed);
}

/** True when the link tag is suppressed. */
export function linkSuppressed(link: RawLinkTag, removed: ReadonlySet<TagKey>): boolean {
  const key = linkKey(link);
  if (!key) return false;
  return isSuppressed(key, removed);
}
