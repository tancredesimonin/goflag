import type { Page } from "@/lib/core/types";

/**
 * Process-scoped, in-memory store of inspected pages keyed by URL.
 *
 * Why a module-level Map rather than a database or KV?
 *
 *  - Phase 3 is local-first: a single dev runs `goflag dev <url>` against
 *    their localhost; there's only ever one writer and one reader, both in
 *    the same Next.js process.
 *  - We deliberately avoid any persistence so the engine + UI stay shippable
 *    as `@goflag/core` later (no DB dependency, no migrations).
 *  - When the SaaS layer (v2.x) ships, this module becomes the seam where
 *    a real backend slots in — same API, different storage.
 *
 * The store is bounded so a long-running session (Phase 7's crawler will
 * push a lot of URLs through here) cannot grow unbounded.
 */

const MAX_ENTRIES = 100;

interface CacheEntry {
  page: Page;
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

export function setCachedPage(url: string, page: Page): void {
  // Evict oldest entry when over capacity. Map preserves insertion order so
  // the first key is the oldest. Re-inserting the same key refreshes its
  // position, which is the recency behaviour we want.
  if (store.size >= MAX_ENTRIES && !store.has(url)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.delete(url);
  store.set(url, { page, storedAt: Date.now() });
}

export function getCachedPage(url: string): Page | undefined {
  return store.get(url)?.page;
}

export function listCachedPages(): Array<{ url: string; page: Page; storedAt: number }> {
  return Array.from(store.entries()).map(([url, entry]) => ({
    url,
    page: entry.page,
    storedAt: entry.storedAt,
  }));
}

export function clearInspectCache(): void {
  store.clear();
}
