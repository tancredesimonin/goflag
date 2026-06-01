import * as cheerio from "cheerio";
import type { SitemapUrlEntry } from "./types";

/**
 * Outcome of parsing a single sitemap document. `kind` distinguishes a
 * leaf `<urlset>` (carries page URLs) from a `<sitemapindex>` (carries
 * child sitemap locations the caller must follow). `wellFormed` is false
 * when the body could not be parsed as XML or matched neither root tag.
 */
export type ParsedSitemap =
  | { kind: "urlset"; wellFormed: true; urls: SitemapUrlEntry[] }
  | { kind: "index"; wellFormed: true; sitemaps: string[] }
  | { kind: "unknown"; wellFormed: false; urls: []; sitemaps: [] };

/**
 * Parse a sitemap XML body into either a list of page URLs (`<urlset>`)
 * or a list of child sitemap URLs (`<sitemapindex>`).
 *
 * We reuse `cheerio` (already a dependency) in `xmlMode` so namespaced
 * sitemaps and self-closing tags are handled by the same battle-tested
 * parser the extractor relies on. Tag lookups are case-insensitive and
 * namespace-agnostic (we match on the local name) because real-world
 * sitemaps mix `<loc>`, `<url:loc>`, and odd casings.
 */
export function parseSitemap(body: string): ParsedSitemap {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { kind: "unknown", wellFormed: false, urls: [], sitemaps: [] };
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(trimmed, { xmlMode: true });
  } catch {
    return { kind: "unknown", wellFormed: false, urls: [], sitemaps: [] };
  }

  // A sitemap index references other sitemaps; prefer it when present so a
  // root index isn't mistaken for a (likely empty) urlset.
  if ($("sitemapindex").length > 0) {
    const sitemaps: string[] = [];
    const seen = new Set<string>();
    $("sitemap > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc && !seen.has(loc)) {
        seen.add(loc);
        sitemaps.push(loc);
      }
    });
    return { kind: "index", wellFormed: true, sitemaps };
  }

  if ($("urlset").length > 0 || $("url").length > 0) {
    const urls: SitemapUrlEntry[] = [];
    const seen = new Set<string>();
    $("url").each((_, el) => {
      const node = $(el);
      const loc = node.find("loc").first().text().trim();
      if (!loc || seen.has(loc)) return;
      seen.add(loc);
      const entry: SitemapUrlEntry = { loc };
      const lastmod = node.find("lastmod").first().text().trim();
      if (lastmod) entry.lastmod = lastmod;
      const changefreq = node.find("changefreq").first().text().trim();
      if (changefreq) entry.changefreq = changefreq;
      const priority = node.find("priority").first().text().trim();
      if (priority) entry.priority = priority;
      urls.push(entry);
    });
    return { kind: "urlset", wellFormed: true, urls };
  }

  return { kind: "unknown", wellFormed: false, urls: [], sitemaps: [] };
}
