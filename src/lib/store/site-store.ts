import type { SiteDiscovery } from "@/lib/core/sitemap/types";

/**
 * Process-scoped, in-memory store of discovered sitemaps keyed by origin.
 *
 * Sibling to `inspect-cache.ts`: same local-first rationale, same "this
 * becomes the backend seam for the SaaS layer" note. We key by origin
 * (not full URL) because a sitemap describes a whole site, so any page on
 * `https://example.com` should resolve to the same navigation list.
 */

const MAX_ORIGINS = 20;

interface SiteEntry {
  discovery: SiteDiscovery;
  discoveredAt: number;
}

const store = new Map<string, SiteEntry>();

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function setSite(discovery: SiteDiscovery): void {
  const key = discovery.origin;
  if (store.size >= MAX_ORIGINS && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.delete(key);
  store.set(key, { discovery, discoveredAt: Date.now() });
}

/** Look up a discovery by any URL on the site (resolved to its origin). */
export function getSite(url: string): SiteDiscovery | undefined {
  const origin = originOf(url);
  if (!origin) return undefined;
  return store.get(origin)?.discovery;
}

/** All discoveries made this session, newest first. */
export function listSites(): SiteDiscovery[] {
  return Array.from(store.values())
    .sort((a, b) => b.discoveredAt - a.discoveredAt)
    .map((entry) => entry.discovery);
}

export function clearSiteStore(): void {
  store.clear();
}
