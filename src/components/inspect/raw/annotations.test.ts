import { describe, expect, it } from "vitest";
import { annotateLink, annotateMeta, annotateRawHead, annotateScript } from "./annotations";
import type { Page } from "@/lib/core/types";

function meta(attrs: Record<string, string>) {
  return {
    name: attrs.name,
    property: attrs.property,
    httpEquiv: attrs["http-equiv"],
    charset: attrs.charset,
    content: attrs.content,
    attributes: attrs,
  };
}

function link(attrs: Record<string, string>) {
  return {
    rel: attrs.rel ?? "",
    href: attrs.href,
    hreflang: attrs.hreflang,
    type: attrs.type,
    sizes: attrs.sizes,
    attributes: attrs,
  };
}

describe("annotateMeta", () => {
  it("recognises descriptive SEO meta names", () => {
    expect(annotateMeta(meta({ name: "description", content: "x" })).label).toBe("Description");
    expect(annotateMeta(meta({ name: "viewport", content: "x" })).label).toBe("Viewport");
    expect(annotateMeta(meta({ name: "robots", content: "noindex" })).label).toBe(
      "Robots directives",
    );
  });

  it("annotates Open Graph and Twitter properties", () => {
    expect(annotateMeta(meta({ property: "og:title", content: "x" })).label).toBe("OG title");
    expect(annotateMeta(meta({ property: "og:image:alt", content: "x" })).label).toBe(
      "OG image alt text",
    );
    expect(annotateMeta(meta({ name: "twitter:card", content: "summary" })).label).toBe(
      "X / Twitter card type",
    );
    expect(annotateMeta(meta({ name: "twitter:image:src", content: "x" })).consumers).toContain(
      "X / Twitter",
    );
  });

  it("explains http-equiv variants", () => {
    expect(annotateMeta(meta({ "http-equiv": "refresh", content: "0;url=/x" })).label).toBe(
      "Auto-refresh / redirect",
    );
    expect(annotateMeta(meta({ "http-equiv": "x-ua-compatible", content: "IE=edge" })).label).toBe(
      "Legacy IE rendering hint",
    );
    expect(annotateMeta(meta({ "http-equiv": "content-type", content: "text/html" })).label).toBe(
      "Legacy content-type",
    );
  });

  it("handles charset and unknown vendor tags gracefully", () => {
    expect(annotateMeta(meta({ charset: "utf-8" })).label).toBe("Character set");
    expect(annotateMeta(meta({ name: "msvalidate.01", content: "x" })).label).toMatch(/msvalidate/);
    expect(annotateMeta(meta({ property: "fb:app_id", content: "1" })).label).toMatch(/fb:app_id/);
    expect(annotateMeta(meta({})).label).toBe("meta");
  });

  it("falls back to property/name for unknown OG/Twitter values", () => {
    expect(annotateMeta(meta({ property: "og:price:amount", content: "9" })).label).toBe(
      "og:price:amount",
    );
    expect(annotateMeta(meta({ name: "twitter:player", content: "x" })).label).toBe(
      "twitter:player",
    );
  });
});

describe("annotateLink", () => {
  it("recognises canonical, hreflang alternates, feeds, and icons", () => {
    expect(annotateLink(link({ rel: "canonical", href: "x" })).label).toBe("Canonical URL");
    expect(annotateLink(link({ rel: "alternate", href: "x", hreflang: "fr" })).label).toMatch(
      /hreflang=fr/,
    );
    expect(
      annotateLink(link({ rel: "alternate", href: "x", type: "application/rss+xml" })).label,
    ).toMatch(/Alternate.*rss/i);
    expect(annotateLink(link({ rel: "alternate", href: "x" })).label).toBe("Alternate");
    expect(annotateLink(link({ rel: "icon", href: "x" })).label).toBe("Favicon");
    expect(annotateLink(link({ rel: "manifest", href: "x" })).label).toBe("Web app manifest");
    expect(annotateLink(link({ rel: "preconnect", href: "x" })).label).toBe("Preconnect");
    expect(annotateLink(link({ rel: "stylesheet", href: "x" })).label).toBe("Stylesheet");
    expect(annotateLink(link({ rel: "totally-custom", href: "x" })).label).toMatch(
      /totally-custom/,
    );
  });
});

describe("annotateScript", () => {
  it("flags JSON-LD blocks specifically", () => {
    expect(
      annotateScript({
        type: "application/ld+json",
        attributes: { type: "application/ld+json" },
        content: "{}",
      }).label,
    ).toMatch(/JSON-LD/);
  });
  it("falls back to the script type for unknown types", () => {
    expect(annotateScript({ type: "module", attributes: { type: "module" } }).label).toMatch(
      /module/,
    );
    expect(annotateScript({ attributes: {} }).label).toBe("script");
  });
});

describe("annotateRawHead", () => {
  it("walks every raw tag and emits a parallel annotation array", () => {
    const page = {
      raw: {
        title: "Hello & <world>",
        htmlLang: "en",
        htmlDir: "ltr",
        metas: [
          { name: "description", content: "a", attributes: { name: "description", content: "a" } },
        ],
        links: [
          {
            rel: "canonical",
            href: "https://x/",
            attributes: { rel: "canonical", href: "https://x/" },
          },
        ],
        scripts: [
          {
            type: "application/ld+json",
            attributes: { type: "application/ld+json" },
            content: '{"@context":"https://schema.org"}',
          },
        ],
      },
    } as unknown as Page;
    const out = annotateRawHead(page);
    expect(out.map((t) => t.kind)).toEqual(["html", "title", "meta", "link", "script"]);
    expect(out[1]?.html).toBe("<title>Hello &amp; &lt;world&gt;</title>");
    expect(out[3]?.html).toContain('rel="canonical"');
    expect(out[4]?.html).toContain('type="application/ld+json"');
  });

  it("skips the html row when neither lang nor dir is set", () => {
    const page = {
      raw: { metas: [], links: [], scripts: [] },
    } as unknown as Page;
    expect(annotateRawHead(page)).toEqual([]);
  });

  it("truncates long inline script bodies", () => {
    const longContent = "x".repeat(500);
    const page = {
      raw: {
        metas: [],
        links: [],
        scripts: [{ attributes: { type: "module" }, type: "module", content: longContent }],
      },
    } as unknown as Page;
    const out = annotateRawHead(page);
    expect(out[0]?.html).toContain("…");
    expect(out[0]?.html.length).toBeLessThan(400);
  });
});
