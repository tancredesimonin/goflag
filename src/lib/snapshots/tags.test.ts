import { describe, expect, it } from "vitest";

import { pageFromHtml } from "@/lib/rules/test-utils";
import { projectTags } from "./tags";

function keys(html: string): string[] {
  return projectTags(pageFromHtml(html, { url: "https://example.com/" })).map((t) => t.key);
}

describe("projectTags", () => {
  it("emits the basic head triplet", () => {
    const out = projectTags(
      pageFromHtml(
        `<!doctype html><html lang="en" dir="ltr"><head><title>Hi</title></head></html>`,
      ),
    );
    expect(out).toEqual([
      { key: "html:dir", value: "ltr" },
      { key: "html:lang", value: "en" },
      { key: "title", value: "Hi" },
    ]);
  });

  it("projects every singleton OG and Twitter field", () => {
    const out = keys(`<!doctype html><html><head>
      <meta property="og:title" content="T">
      <meta property="og:type" content="article">
      <meta property="og:url" content="https://example.com/x">
      <meta property="og:description" content="D">
      <meta property="og:site_name" content="S">
      <meta property="og:locale" content="en_US">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:site" content="@s">
      <meta name="twitter:creator" content="@c">
      <meta name="twitter:title" content="TT">
      <meta name="twitter:description" content="TD">
      <meta name="twitter:image" content="https://example.com/i.png">
      <meta name="twitter:image:alt" content="alt">
    </head></html>`);
    for (const k of [
      "meta:og:title",
      "meta:og:type",
      "meta:og:url",
      "meta:og:description",
      "meta:og:site_name",
      "meta:og:locale",
      "meta:twitter:card",
      "meta:twitter:site",
      "meta:twitter:creator",
      "meta:twitter:title",
      "meta:twitter:description",
      "meta:twitter:image",
      "meta:twitter:image:alt",
    ]) {
      expect(out).toContain(k);
    }
  });

  it("indexes repeated og:image and og:locale:alternate", () => {
    const out = keys(`<!doctype html><html><head>
      <meta property="og:locale:alternate" content="fr_FR">
      <meta property="og:locale:alternate" content="de_DE">
      <meta property="og:image" content="https://example.com/a.png">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:image:alt" content="alt">
      <meta property="og:image" content="https://example.com/b.png">
    </head></html>`);
    expect(out).toContain("meta:og:locale:alternate[0]");
    expect(out).toContain("meta:og:locale:alternate[1]");
    expect(out).toContain("meta:og:image[0]");
    expect(out).toContain("meta:og:image[0]:width");
    expect(out).toContain("meta:og:image[0]:height");
    expect(out).toContain("meta:og:image[0]:alt");
    expect(out).toContain("meta:og:image[1]");
  });

  it("projects link tags with attribute selectors for hreflang and icon sizes", () => {
    const out = keys(`<!doctype html><html><head>
      <link rel="canonical" href="https://example.com/x">
      <link rel="manifest" href="/manifest.webmanifest">
      <link rel="alternate" hreflang="fr" href="https://example.com/fr">
      <link rel="alternate" hreflang="x-default" href="https://example.com/">
      <link rel="icon" sizes="32x32" href="/favicon-32.png">
      <link rel="icon" href="/favicon.ico">
    </head></html>`);
    expect(out).toContain("link:canonical");
    expect(out).toContain("link:manifest");
    expect(out).toContain("link:alternate[hreflang=fr]");
    expect(out).toContain("link:alternate[hreflang=x-default]");
    expect(out).toContain("link:icon[sizes=32x32]");
    expect(out).toContain("link:icon");
  });

  it("returns the keys sorted lexically", () => {
    const tags = projectTags(
      pageFromHtml(
        `<!doctype html><html lang="en"><head><title>X</title>
         <meta name="description" content="D"></head></html>`,
      ),
    );
    const out = tags.map((t) => t.key);
    const sorted = [...out].sort();
    expect(out).toEqual(sorted);
  });

  it("omits empty keyword arrays", () => {
    const out = keys(`<!doctype html><html><head><meta name="keywords" content=""></head></html>`);
    expect(out).not.toContain("meta:keywords");
  });

  it("emits og:image with type and secure_url subkeys but no width/height/alt", () => {
    const out = keys(`<!doctype html><html><head>
      <meta property="og:image" content="https://cdn/x.png">
      <meta property="og:image:type" content="image/png">
      <meta property="og:image:secure_url" content="https://secure.cdn/x.png">
    </head></html>`);
    expect(out).toContain("meta:og:image[0]");
    expect(out).toContain("meta:og:image[0]:type");
    expect(out).toContain("meta:og:image[0]:secure_url");
    expect(out).not.toContain("meta:og:image[0]:width");
    expect(out).not.toContain("meta:og:image[0]:height");
    expect(out).not.toContain("meta:og:image[0]:alt");
  });

  it("projects probe markers when probes are populated", () => {
    const page = pageFromHtml(`<!doctype html><html><head><title>x</title></head></html>`, {
      url: "https://example.com/",
    });
    page.probes.robots = {
      url: "https://example.com/robots.txt",
      status: 200,
      found: true,
      raw: "User-agent: *\nDisallow: /",
      sitemaps: [],
      blocksAll: true,
    };
    page.probes.sitemap = {
      url: "https://example.com/sitemap.xml",
      status: 200,
      found: true,
      isIndex: false,
      entryCount: 3,
    };
    page.probes.manifest = {
      url: "https://example.com/manifest.webmanifest",
      status: 200,
      found: false,
    };
    const out = projectTags(page).map((t) => `${t.key}=${t.value}`);
    expect(out).toContain("probe:robots=found");
    expect(out).toContain("probe:robots:blocks-all=true");
    expect(out).toContain("probe:sitemap=found");
    expect(out).toContain("probe:sitemap:is-index=false");
    expect(out).toContain("probe:manifest=missing");
  });
});
