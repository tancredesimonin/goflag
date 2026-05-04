import { afterEach, describe, expect, it } from "vitest";
import { clearInspectCache, getCachedPage, listCachedPages, setCachedPage } from "./inspect-cache";
import type { Page } from "@/lib/core/types";

function fakePage(title: string): Page {
  return {
    schemaVersion: 2,
    fetchedAt: new Date(0).toISOString(),
    fetch: {
      requestedUrl: "https://x",
      finalUrl: "https://x",
      status: 200,
      statusText: "OK",
      durationMs: 0,
      bodyBytes: 0,
      redirectCount: 0,
      contentType: "text/html",
      headers: {},
    },
    extractor: { mode: "static", escalated: false },
    html: { static: "" },
    raw: { title, metas: [], links: [], scripts: [] },
    meta: {},
    openGraph: { localeAlternates: [], images: [], unknown: [] },
    twitter: {},
    links: { alternates: [], icons: [], feeds: [], preconnects: [], dnsPrefetches: [] },
    jsonLd: [],
    probes: {},
  } as unknown as Page;
}

afterEach(() => clearInspectCache());

describe("inspect-cache", () => {
  it("round-trips pages by URL", () => {
    setCachedPage("a", fakePage("A"));
    setCachedPage("b", fakePage("B"));
    expect(getCachedPage("a")?.raw.title).toBe("A");
    expect(getCachedPage("b")?.raw.title).toBe("B");
    expect(getCachedPage("missing")).toBeUndefined();
  });

  it("evicts the oldest entry once over capacity", () => {
    for (let i = 0; i < 105; i++) setCachedPage(`url-${i}`, fakePage(String(i)));
    const list = listCachedPages();
    expect(list.length).toBe(100);
    // Oldest 5 evicted.
    expect(getCachedPage("url-0")).toBeUndefined();
    expect(getCachedPage("url-104")).toBeDefined();
  });

  it("refreshes the recency of an existing entry on re-set", () => {
    for (let i = 0; i < 100; i++) setCachedPage(`url-${i}`, fakePage(String(i)));
    setCachedPage("url-0", fakePage("0-bumped"));
    setCachedPage("url-100", fakePage("100"));
    // url-0 should still exist (re-inserted), url-1 should be the evicted one.
    expect(getCachedPage("url-0")?.raw.title).toBe("0-bumped");
    expect(getCachedPage("url-1")).toBeUndefined();
  });
});
