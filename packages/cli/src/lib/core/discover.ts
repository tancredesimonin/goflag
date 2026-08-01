/**
 * Crawl-time link discovery.
 *
 * Given a fully-inspected `Page`, returns the set of candidate URLs
 * the BFS frontier should consider. Every candidate carries its
 * `source` so the crawler can decide whether to bypass include/exclude
 * filters (we always follow `hreflang` siblings, see `crawl.ts`).
 *
 * Sources, in order of trust:
 *
 *   1. `hreflang`        — `Page.links.alternates`. Already parsed by
 *                          the static extractor with absolute hrefs.
 *   2. `head-link`       — `<link rel="next">` / `<link rel="prev">`,
 *                          read from the raw inventory so we don't
 *                          have to re-parse the HTML.
 *   3. `body-anchor`     — `<a href>` from the static body. Cheap
 *                          regex extraction; we deliberately don't
 *                          parse the body with cheerio because it'd
 *                          double the per-page CPU cost on a large
 *                          crawl and we don't need attributes beyond
 *                          `href`.
 *
 * Returned `href` is always absolute when possible (resolved against
 * `page.fetch.finalUrl`); the crawler runs canonicalisation again
 * before deduplication.
 */

import type { Page } from "./types";

export type CandidateSource = "hreflang" | "head-link" | "body-anchor";

export interface CandidateLink {
  href: string;
  source: CandidateSource;
}

const ANCHOR_HREF_RE = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;

export function extractCandidateLinks(page: Page): CandidateLink[] {
  const out: CandidateLink[] = [];
  const seen = new Set<string>();
  const base = page.fetch.finalUrl;

  for (const alt of page.links.alternates) {
    push(out, seen, alt.href, "hreflang");
  }

  for (const link of page.raw.links) {
    const rel = link.rel.toLowerCase();
    if ((rel === "next" || rel === "prev") && link.href) {
      push(out, seen, link.href, "head-link");
    }
  }

  // Body anchors. We restrict to `<a href>` — relative URLs get
  // resolved against `base` (the page's final URL after redirects).
  if (page.html.static) {
    for (const match of page.html.static.matchAll(ANCHOR_HREF_RE)) {
      const raw = match[2] ?? match[3];
      if (!raw) continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let absolute: string;
      try {
        absolute = new URL(trimmed, base).toString();
      } catch {
        continue;
      }
      push(out, seen, absolute, "body-anchor");
    }
  }

  return out;
}

function push(
  out: CandidateLink[],
  seen: Set<string>,
  href: string,
  source: CandidateSource,
): void {
  // Cheap dedupe per page; the BFS keeps a global visited set.
  if (seen.has(href)) return;
  seen.add(href);
  out.push({ href, source });
}
