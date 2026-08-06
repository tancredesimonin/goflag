/**
 * Schema tests for the extraction contract.
 *
 * Two things are under test: the adapter projects a `Page` onto the
 * documented fields faithfully (values, origins, raw literals), and the
 * result honors the contract's promises — versioned, JSON-serializable,
 * and free of engine internals like the raw HTML body.
 */

import { describe, expect, it } from "vitest";

import { pageFromHtml } from "../test-utils";
import { extractionFromPage } from "./from-page";
import { EXTRACTION_VERSION } from "./types";

const BODY_SENTINEL = "RAW-HTML-MUST-NOT-LEAK";

/** A page exercising every section of the extraction. */
const FULL = `<!doctype html>
<html lang="fr-CA" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <base href="/sub/" />
    <title>  Un titre  </title>
    <meta name="description" content="Une description." />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="/page" />
    <meta property="og:title" content="Titre OG" />
    <meta property="og:image" content="https://example.com/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:audio" content="https://example.com/a.mp3" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="alternate" hreflang="fr-CA" href="https://example.com/fr/page" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/page" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="manifest" href="/manifest.json" crossorigin="use-credentials" />
    <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Flux" />
    <script type="application/ld+json">{"@type": "Article"}</script>
    <script type="application/ld+json">{broken</script>
  </head>
  <body><h1>${BODY_SENTINEL}</h1></body>
</html>`;

const BARE = `<html><head></head><body></body></html>`;

describe("extractionFromPage", () => {
  const extraction = extractionFromPage(
    pageFromHtml(FULL, { url: "https://example.com/page", headers: { "x-robots-tag": "none" } }),
  );

  it("stamps the contract version", () => {
    expect(EXTRACTION_VERSION).toBe(1);
    expect(extraction.extractionVersion).toBe(1);
  });

  it("projects the network observation", () => {
    expect(extraction.http).toMatchObject({
      requestedUrl: "https://example.com/page",
      finalUrl: "https://example.com/page",
      status: 200,
      redirects: 0,
      contentType: "text/html",
    });
    expect(extraction.http.headers["x-robots-tag"]).toBe("none");
    expect(extraction.rendering).toEqual({
      mode: "static",
      escalated: false,
      escalationReason: undefined,
    });
  });

  it("carries document facts with their origins", () => {
    expect(extraction.document.title?.value).toBe("Un titre");
    expect(extraction.document.title?.origin).toEqual({ kind: "title" });
    expect(extraction.document.lang).toEqual({
      value: "fr-CA",
      origin: { kind: "html", attribute: "lang" },
      raw: "fr-CA",
    });
    expect(extraction.document.dir?.value).toBe("ltr");
    expect(extraction.document.charset?.value).toBe("utf-8");
    expect(extraction.document.base?.value).toBe("/sub/");
  });

  it("resolves canonical while keeping the literal in raw", () => {
    const canonical = extraction.meta.canonical;
    expect(canonical?.value).toBe("https://example.com/page");
    expect(canonical?.raw).toBe("/page");
    expect(canonical?.origin).toEqual({ kind: "link", rel: "canonical" });
    expect(extraction.meta.description?.value).toBe("Une description.");
    expect(extraction.meta.robots?.value).toBe("noindex");
  });

  it("keeps the open-graph surface, unmapped properties included", () => {
    expect(extraction.openGraph.title?.value).toBe("Titre OG");
    expect(extraction.openGraph.images).toHaveLength(1);
    expect(extraction.openGraph.images[0]?.url.value).toBe("https://example.com/og.png");
    expect(extraction.openGraph.images[0]?.width?.value).toBe(1200);
    expect(extraction.openGraph.other).toEqual([expect.objectContaining({ property: "og:audio" })]);
    expect(extraction.twitter.card?.value).toBe("summary_large_image");
  });

  it("collects head links: hreflang, icons, manifest, feeds", () => {
    expect(extraction.links.hreflang).toEqual([
      { hreflang: "fr-CA", href: "https://example.com/fr/page", isXDefault: false },
      { hreflang: "x-default", href: "https://example.com/page", isXDefault: true },
    ]);
    expect(extraction.links.icons[0]).toMatchObject({
      rel: "icon",
      sizes: "32x32",
      parsedSizes: [{ width: 32, height: 32 }],
    });
    // hrefs come out resolved: the extractor normalizes against the page URL.
    expect(extraction.links.manifest).toEqual({ href: "https://example.com/manifest.json" });
    expect(extraction.links.feeds).toEqual([
      { type: "application/rss+xml", href: "https://example.com/feed.xml", title: "Flux" },
    ]);
  });

  it("keeps every JSON-LD block, parse failures included", () => {
    expect(extraction.jsonLd).toHaveLength(2);
    expect(extraction.jsonLd[0]).toMatchObject({ index: 0, types: ["Article"] });
    expect(extraction.jsonLd[1]?.parseError).toBeTruthy();
    expect(extraction.jsonLd[1]?.data).toBeNull();
    expect(extraction.jsonLd[1]?.raw).toContain("{broken");
  });

  it("survives a JSON round-trip unchanged", () => {
    expect(JSON.parse(JSON.stringify(extraction))).toEqual(extraction);
  });

  it("never leaks the raw HTML body", () => {
    expect(JSON.stringify(extraction)).not.toContain(BODY_SENTINEL);
  });
});

describe("extractionFromPage on a bare page", () => {
  const extraction = extractionFromPage(pageFromHtml(BARE));

  it("leaves absent observations absent instead of inventing defaults", () => {
    expect(extraction.document.title).toBeUndefined();
    expect(extraction.document.lang).toBeUndefined();
    expect(extraction.document.base).toBeUndefined();
    expect(extraction.meta.description).toBeUndefined();
    expect(extraction.meta.canonical).toBeUndefined();
    expect(extraction.openGraph.title).toBeUndefined();
    expect(extraction.links.manifest).toBeUndefined();
  });

  it("keeps collections as empty arrays, not undefined", () => {
    expect(extraction.openGraph.images).toEqual([]);
    expect(extraction.openGraph.localeAlternates).toEqual([]);
    expect(extraction.openGraph.other).toEqual([]);
    expect(extraction.links.hreflang).toEqual([]);
    expect(extraction.links.icons).toEqual([]);
    expect(extraction.links.feeds).toEqual([]);
    expect(extraction.jsonLd).toEqual([]);
  });
});
