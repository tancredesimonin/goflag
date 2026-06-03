import { listCachedPages } from "@/lib/store/inspect-cache";
import { listSites } from "@/lib/store/site-store";
import { listLinkAudits } from "@/lib/store/link-audit-store";
import type { InspectSidebarItem } from "./inspect-sidebar";

/**
 * Build the sidebar's URL list by merging two sources:
 *
 *   1. Pages actually inspected this session (`inspect-cache`) — these
 *      carry a real title, status, and extractor mode.
 *   2. Every URL discovered from a sitemap (`site-store`) — these are
 *      navigable even before they've been inspected, which is the whole
 *      point of the site-navigation feature.
 *
 * Inspected pages win on collision so we never downgrade a real result
 * back to a bare sitemap entry. Layouts can't read `searchParams`, so we
 * surface URLs from all discovered origins; the sidebar highlights the
 * active one client-side from `?url=`.
 */
export function buildSidebarItems(): InspectSidebarItem[] {
  const items = new Map<string, InspectSidebarItem>();

  // Broken-link counts per page, from any link audits run this session.
  const brokenByPage = new Map<string, number>();
  for (const report of listLinkAudits()) {
    for (const { pageUrl, broken } of report.brokenByPage) {
      const count = broken.filter((c) => c.verdict === "broken").length;
      if (count > 0) brokenByPage.set(pageUrl, (brokenByPage.get(pageUrl) ?? 0) + count);
    }
  }

  for (const site of listSites()) {
    for (const entry of site.urls) {
      if (items.has(entry.loc)) continue;
      items.set(entry.loc, {
        url: entry.loc,
        finalUrl: entry.loc,
        title: pathnameOf(entry.loc),
        locale: "",
        storedAt: 0,
        status: 0,
        inspected: false,
        brokenLinks: brokenByPage.get(entry.loc),
      });
    }
  }

  for (const { url, page, storedAt } of listCachedPages()) {
    items.set(url, {
      url,
      finalUrl: page.fetch.finalUrl,
      title: page.meta.title?.value ?? page.raw.title ?? pathnameOf(url),
      locale: page.raw.htmlLang ?? "",
      storedAt,
      status: page.fetch.status,
      extractor: page.extractor.mode,
      inspected: true,
      brokenLinks: brokenByPage.get(url),
    });
  }

  return Array.from(items.values());
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
