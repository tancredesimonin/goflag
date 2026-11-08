import { describe, expect, it } from "vitest";
import { createSitemapParser, parseSitemap } from "./parse";

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

  it("reads the xhtml:link cluster declarations a real sitemap carries", () => {
    // `find("link")` matches none of these: cheerio keeps the prefix on
    // tagName in xmlMode, which is how 150 of them in the tancrede fixture
    // were discarded without anybody noticing.
    const body = `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
        <url>
          <loc>https://x.com/en/pricing</loc>
          <xhtml:link rel="alternate" hreflang="en" href="https://x.com/en/pricing" />
          <xhtml:link rel="alternate" hreflang="fr" href="https://x.com/fr/tarifs" />
          <xhtml:link rel="alternate" hreflang="x-default" href="https://x.com/en/pricing" />
        </url>
      </urlset>`;
    const result = parseSitemap(body);
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls[0]?.alternates).toEqual([
      { hreflang: "en", href: "https://x.com/en/pricing" },
      { hreflang: "fr", href: "https://x.com/fr/tarifs" },
      { hreflang: "x-default", href: "https://x.com/en/pricing" },
    ]);
  });

  it("reads an unprefixed <link> too, and drops one missing an attribute", () => {
    const body = `<urlset>
        <url>
          <loc>https://x.com/a</loc>
          <link rel="alternate" hreflang="fr" href="https://x.com/fr/a" />
          <link rel="alternate" hreflang="de" />
          <link rel="stylesheet" hreflang="es" href="https://x.com/es/a" />
        </url>
      </urlset>`;
    const result = parseSitemap(body);
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls[0]?.alternates).toEqual([{ hreflang: "fr", href: "https://x.com/fr/a" }]);
  });

  it("leaves alternates absent when the sitemap declares none", () => {
    const body = `<urlset><url><loc>https://x.com/a</loc></url></urlset>`;
    const result = parseSitemap(body);
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls[0]).toEqual({ loc: "https://x.com/a" });
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

  it("reads a field from its first element, even an empty one, as find().first() did", () => {
    const result = parseSitemap(
      `<urlset><url><loc></loc><loc>https://example.com/late</loc></url>` +
        `<url><wrap><loc>https://example.com/nested</loc></wrap><lastmod> 2026-01-02 </lastmod></url></urlset>`,
    );
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls).toEqual([{ loc: "https://example.com/nested", lastmod: "2026-01-02" }]);
  });

  it("reads CDATA and decodes entities, as cheerio's xmlMode did", () => {
    const result = parseSitemap(
      `<urlset><url><loc><![CDATA[https://example.com/?a=1&b=2]]></loc></url>` +
        `<url><loc>https://example.com/?c=3&amp;d=4</loc></url></urlset>`,
    );
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls.map((u) => u.loc)).toEqual([
      "https://example.com/?a=1&b=2",
      "https://example.com/?c=3&d=4",
    ]);
  });

  it("keeps entries in the order their <url> opened, so the first duplicate wins", () => {
    const result = parseSitemap(
      `<urlset><url><loc>https://example.com/outer</loc>` +
        `<url><loc>https://example.com/inner</loc><lastmod>first</lastmod></url></url>` +
        `<url><loc>https://example.com/inner</loc><lastmod>second</lastmod></url></urlset>`,
    );
    if (result.kind !== "urlset") throw new Error("expected urlset");
    expect(result.urls).toEqual([
      { loc: "https://example.com/outer", lastmod: "first" },
      { loc: "https://example.com/inner", lastmod: "first" },
    ]);
  });
});

describe("createSitemapParser", () => {
  const body = `<?xml version="1.0"?>
    <urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url><loc>https://example.com/en/caf\u00e9?a=1&amp;b=2</loc><lastmod>2026-01-02</lastmod>
        <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/caf\u00e9"/></url>
      <url><loc><![CDATA[https://example.com/en/x]]></loc></url>
    </urlset>`;

  it.each([1, 3, 64])(
    "reads a document fed %i characters at a time as it reads it whole",
    (size) => {
      const parser = createSitemapParser();
      for (let i = 0; i < body.length; i += size) parser.write(body.slice(i, i + size));
      expect(parser.end()).toEqual(parseSitemap(body));
    },
  );

  it("closes an entry the file cut off, as the tree builder did", () => {
    const parser = createSitemapParser();
    parser.write("<urlset><url><loc>https://example.com/cut");
    expect(parser.end()).toEqual({
      kind: "urlset",
      wellFormed: true,
      urls: [{ loc: "https://example.com/cut" }],
    });
  });
});
