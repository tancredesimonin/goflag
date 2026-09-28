/**
 * Whether goflag read every sitemap the site declares — the precondition of any
 * rule that judges a URL by its *absence* from the sitemap.
 *
 * Presence is safe to judge on part of an inventory: an entry goflag read is
 * listed, whatever the rest says. Absence is not. A page listed in a document
 * goflag did not read looks exactly like a page the site forgot, so a rule that
 * says "absent from the sitemap" after a partial read reports goflag's blind
 * spot as the site's omission.
 *
 * The read falls short three ways, and discovery records each one:
 *
 *   - a cap stopped it (`truncated`). The caps are 5,000 URLs and 50 children,
 *     far below the protocol's own limits, so a search engine reads past them;
 *   - an index named a child that yielded no urlset (`childSitemapErrors`):
 *     unreachable, unparsable, or an index itself, which discovery does not
 *     follow;
 *   - `robots.txt` declares a sitemap that is not among the documents read.
 *     Discovery stops at the first declared sitemap that parses, where a search
 *     engine reads every `Sitemap:` line — so on a site declaring two, each page
 *     only the second one lists would read as absent. A declared sitemap that
 *     could not be fetched lands here too: it may be the one listing the page.
 */

import type { SiteContext } from "./site-types";

export function sitemapReadInFull(site: SiteContext): boolean {
  const discovery = site.discovery;
  if (discovery?.diagnostics.found !== true) return false;
  if (discovery.truncated || discovery.diagnostics.childSitemapErrors > 0) return false;

  const read = new Set(discovery.documents.map((doc) => resolved(doc.url)));
  // RFC 9309 resolves nothing, but a relative `Sitemap:` line does name a file,
  // and the one it names is the one to look for among the documents read.
  // `robotstxt.sitemap.relative` is the finding about the line itself.
  const base = site.robots?.url ?? `${site.origin}/robots.txt`;

  return (site.robots?.sitemaps ?? []).every((declared) => {
    const url = resolved(declared.value, base);
    // A line that names no URL at all declares nothing a crawler could read,
    // so it hides nothing either.
    return url === undefined || read.has(url);
  });
}

function resolved(value: string, base?: string): string | undefined {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}
