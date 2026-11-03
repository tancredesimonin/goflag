import type { SitemapProbe } from "../types";
import { combineSignals } from "./abort";
import { fetchScoped, type ScopedHeaders } from "../net/scoped-headers";

export interface SitemapProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The operator's `--header`s, sent only to their origin (`net/scoped-headers.ts`). */
  scopedHeaders?: ScopedHeaders;
}

export async function probeSitemap(
  origin: string,
  options: SitemapProbeOptions = {},
): Promise<SitemapProbe> {
  const url = new URL("/sitemap.xml", origin).toString();
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);

  try {
    const res = await fetchScoped(url, { signal, redirect: "follow" }, options.scopedHeaders);
    if (!res.ok) return { url, status: res.status, found: false, isIndex: false, entryCount: 0 };
    const body = await res.text();
    return {
      url,
      status: res.status,
      found: true,
      isIndex: /<sitemapindex\b/i.test(body),
      entryCount: countEntries(body),
    };
  } catch {
    return { url, status: 0, found: false, isIndex: false, entryCount: 0 };
  } finally {
    cleanup();
  }
}

export function countEntries(body: string): number {
  const url = body.match(/<url\b/gi)?.length ?? 0;
  const sm = body.match(/<sitemap\b/gi)?.length ?? 0;
  return url + sm;
}
