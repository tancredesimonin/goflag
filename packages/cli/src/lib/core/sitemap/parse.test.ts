import { describe, expect, it } from "vitest";
import { parseSitemap } from "./parse";

describe("parseSitemap", () => {
  it("parses a flat urlset with metadata", () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/</loc>
          <lastmod>2026-01-02</lastmod>
          <changefreq>daily</changefreq>
          <priority>1.0</priority>
        </url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;
    const result = parseSitemap(body);
    expect(result.kind).toBe("urlset");
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls).toHaveLength(2);
    expect(result.urls[0]).toEqual({
      loc: "https://example.com/",
      lastmod: "2026-01-02",
      changefreq: "daily",
      priority: "1.0",
    });
    expect(result.urls[1]).toEqual({ loc: "https://example.com/about" });
  });

  it("parses a sitemapindex into child sitemap URLs", () => {
    const body = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
      </sitemapindex>`;
    const result = parseSitemap(body);
    expect(result.kind).toBe("index");
    if (result.kind !== "index") throw new Error("expected index");
    expect(result.sitemaps).toEqual([
      "https://example.com/sitemap-1.xml",
      "https://example.com/sitemap-2.xml",
    ]);
  });

  it("prefers the index when both roots somehow appear", () => {
    const body = `<sitemapindex><sitemap><loc>https://example.com/s.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(body).kind).toBe("index");
  });

  it("deduplicates repeated <loc> entries", () => {
    const body = `<urlset>
        <url><loc>https://example.com/dup</loc></url>
        <url><loc>https://example.com/dup</loc></url>
      </urlset>`;
    const result = parseSitemap(body);
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls).toHaveLength(1);
  });

  it("skips url entries with no <loc>", () => {
    const body = `<urlset><url><lastmod>2026-01-01</lastmod></url><url><loc>https://x.com/a</loc></url></urlset>`;
    const result = parseSitemap(body);
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls).toEqual([{ loc: "https://x.com/a" }]);
  });

  it("returns unknown for an empty body", () => {
    const result = parseSitemap("   ");
    expect(result.kind).toBe("unknown");
    expect(result.wellFormed).toBe(false);
  });

  it("returns unknown for unrelated XML", () => {
    const result = parseSitemap(`<html><body>nope</body></html>`);
    expect(result.kind).toBe("unknown");
  });
});
