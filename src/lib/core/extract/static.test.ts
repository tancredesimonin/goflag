import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractStatic } from "./static";

const KITCHEN_SINK = resolve(
  __dirname,
  "../../../../fixtures/sites/synthetic/kitchen-sink/index.html",
);

async function loadKitchenSink() {
  const html = await readFile(KITCHEN_SINK, "utf8");
  return extractStatic(html, { baseUrl: "https://localhost.test/articles/welcome" });
}

describe("extractStatic — raw inventory", () => {
  it("captures <html lang> and <html dir>", async () => {
    const page = await loadKitchenSink();
    expect(page.raw.htmlLang).toBe("en-US");
    expect(page.raw.htmlDir).toBe("ltr");
  });

  it("captures the <base href>", async () => {
    const page = await loadKitchenSink();
    expect(page.raw.baseHref).toBe("https://example.com/");
  });

  it("trims and collapses whitespace in <title>", async () => {
    const page = await loadKitchenSink();
    expect(page.raw.title).toBe("Kitchen sink — Headlint synthetic fixture");
  });

  it("collects all meta / link / json-ld scripts", async () => {
    const page = await loadKitchenSink();
    expect(page.raw.metas.length).toBeGreaterThanOrEqual(20);
    expect(page.raw.links.length).toBeGreaterThanOrEqual(11);
    expect(page.raw.scripts.length).toBe(4);
  });

  it("captures hoistable metadata rendered in <body> (React 19 / Next 15 streaming SSR)", () => {
    // React streams `<title>`/`<meta>`/`<link>` into the body; the browser
    // and social scrapers hoist them into the head. We must too, otherwise
    // every Next 15 App Router page looks like an empty SPA shell.
    const html = `<!doctype html><html lang="fr"><head><meta charSet="utf-8"/></head><body>
      <div>content</div>
      <title>Services</title>
      <meta property="og:title" content="Services"/>
      <meta property="og:image" content="https://x.com/og.png"/>
      <link rel="canonical" href="https://x.com/fr/services"/>
    </body></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/fr/services" });
    expect(page.raw.title).toBe("Services");
    expect(page.meta.title?.value).toBe("Services");
    expect(page.openGraph.title?.value).toBe("Services");
    expect(page.openGraph.images[0]?.url.value).toBe("https://x.com/og.png");
    expect(page.links.canonical).toBe("https://x.com/fr/services");
  });

  it("ignores <title> inside inline SVG when no real title exists", () => {
    const html = `<!doctype html><html><head></head><body><svg><title>icon label</title></svg></body></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.raw.title).toBeUndefined();
  });
});

describe("extractStatic — generic meta", () => {
  it("parses title, description, keywords, viewport, robots, etc.", async () => {
    const page = await loadKitchenSink();
    expect(page.meta.title?.value).toBe("Kitchen sink — Headlint synthetic fixture");
    expect(page.meta.description?.value).toBe(
      "A handcrafted page exercising every branch of the static extractor.",
    );
    expect(page.meta.keywords?.value).toEqual(["headlint", "fixture", "og", "twitter", "json-ld"]);
    expect(page.meta.viewport?.value).toContain("width=device-width");
    expect(page.meta.robots?.value).toContain("max-image-preview:large");
    expect(page.meta.googlebot?.value).toBe("index,follow");
    expect(page.meta.themeColor?.value).toBe("#0a0a0a");
    expect(page.meta.colorScheme?.value).toBe("dark light");
    expect(page.meta.referrer?.value).toBe("strict-origin-when-cross-origin");
    expect(page.meta.author?.value).toBe("Headlint");
    expect(page.meta.applicationName?.value).toBe("Headlint demo");
    expect(page.meta.charset?.value).toBe("utf-8");
  });

  it("resolves canonical against <base href>", async () => {
    const page = await loadKitchenSink();
    expect(page.meta.canonical?.value).toBe("https://example.com/articles/welcome");
  });

  it("falls back to http-equiv content-type for charset when <meta charset> is absent", () => {
    const html = `<!doctype html><html><head><meta http-equiv="content-type" content="text/html; charset=ISO-8859-1"><title>x</title></head></html>`;
    const page = extractStatic(html, { baseUrl: "https://example.com/" });
    expect(page.meta.charset?.value).toBe("ISO-8859-1");
  });
});

describe("extractStatic — Open Graph", () => {
  it("parses primary OG fields", async () => {
    const page = await loadKitchenSink();
    expect(page.openGraph.title?.value).toBe("Kitchen sink");
    expect(page.openGraph.description?.value).toBe("Synthetic OG description.");
    expect(page.openGraph.type?.value).toBe("article");
    expect(page.openGraph.url?.value).toBe("https://example.com/articles/welcome");
    expect(page.openGraph.siteName?.value).toBe("Example");
    expect(page.openGraph.locale?.value).toBe("en_US");
  });

  it("collects locale alternates and unknown OG fields", async () => {
    const page = await loadKitchenSink();
    expect(page.openGraph.localeAlternates.map((s) => s.value)).toEqual(["fr_FR", "pt_BR"]);
    expect(page.openGraph.unknown.find((u) => u.property === "og:custom:tag")?.value.value).toBe(
      "something-vendor-specific",
    );
  });

  it("groups og:image:* sub-fields under the most recent og:image", async () => {
    const page = await loadKitchenSink();
    expect(page.openGraph.images).toHaveLength(2);
    const [first, second] = page.openGraph.images;
    expect(first?.url.value).toBe("https://cdn.example.com/og-1.png");
    expect(first?.width?.value).toBe(1200);
    expect(first?.height?.value).toBe(630);
    expect(first?.alt?.value).toBe("A nice OG image");
    expect(first?.type?.value).toBe("image/png");
    expect(first?.secureUrl?.value).toBe("https://cdn.example.com/og-1.png");
    expect(second?.url.value).toBe("https://cdn.example.com/og-2.jpg");
    expect(second?.width?.value).toBe(800);
    expect(second?.height?.value).toBe(800);
  });
});

describe("extractStatic — Twitter", () => {
  it("parses every supported twitter:* field", async () => {
    const page = await loadKitchenSink();
    expect(page.twitter.card?.value).toBe("summary_large_image");
    expect(page.twitter.site?.value).toBe("@example");
    expect(page.twitter.creator?.value).toBe("@author");
    expect(page.twitter.title?.value).toBe("Twitter title");
    expect(page.twitter.description?.value).toBe("Twitter description.");
    expect(page.twitter.image?.value).toBe("https://cdn.example.com/twitter.png");
    expect(page.twitter.imageAlt?.value).toBe("Twitter image alt text");
  });

  it("accepts twitter:image:src as alias for twitter:image", () => {
    const html = `<html><head><meta name="twitter:card" content="summary"><meta name="twitter:image:src" content="https://x.com/i.png"></head></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.twitter.image?.value).toBe("https://x.com/i.png");
  });
});

describe("extractStatic — links", () => {
  it("extracts canonical, alternates (with x-default), icons, manifest, feeds, preconnect, dns-prefetch", async () => {
    const page = await loadKitchenSink();
    expect(page.links.canonical).toBe("https://example.com/articles/welcome");

    const hreflangs = page.links.alternates.map((a) => a.hreflang);
    expect(hreflangs).toEqual(["en", "fr", "x-default"]);
    expect(page.links.alternates.find((a) => a.isXDefault)?.href).toBe(
      "https://example.com/articles/welcome",
    );

    expect(page.links.icons.map((i) => i.href)).toEqual([
      "https://example.com/favicon.ico",
      "https://example.com/icon-32.png",
      "https://example.com/icon-192.png",
      "https://example.com/apple-touch-icon.png",
    ]);

    const favicon = page.links.icons[0];
    expect(favicon?.parsedSizes).toEqual(["any"]);
    const icon32 = page.links.icons[1];
    expect(icon32?.parsedSizes).toEqual([{ width: 32, height: 32 }]);

    expect(page.links.manifest?.href).toBe("https://example.com/site.webmanifest");
    expect(page.links.feeds.map((f) => f.type)).toEqual([
      "application/rss+xml",
      "application/atom+xml",
    ]);
    expect(page.links.preconnects).toEqual(["https://cdn.example.com/"]);
    expect(page.links.dnsPrefetches).toEqual(["https://analytics.example.com/"]);
  });

  it("ignores unparseable sizes tokens but keeps known ones", () => {
    const html = `<html><head><link rel="icon" href="/i.png" sizes="any 32x32 wat 64x64"></head></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.links.icons[0]?.parsedSizes).toEqual([
      "any",
      { width: 32, height: 32 },
      { width: 64, height: 64 },
    ]);
  });

  it("falls back to the request URL when no <base href>", () => {
    const html = `<html><head><link rel="canonical" href="/foo"></head></html>`;
    const page = extractStatic(html, { baseUrl: "https://no-base.test/some/path" });
    expect(page.meta.canonical?.value).toBe("https://no-base.test/foo");
  });

  it("falls back to a synthetic base when the request URL is unparseable", () => {
    const html = `<html><head><link rel="canonical" href="/foo"></head></html>`;
    const page = extractStatic(html, { baseUrl: "::not a url::" });
    expect(page.meta.canonical?.value).toBe("http://invalid.local/foo");
  });

  it("returns the raw href verbatim when both href and base fail to parse", () => {
    // safeResolve catches the URL constructor throw and returns the raw
    // href. We trigger this by combining an unparseable href with a base
    // that itself becomes the synthetic invalid.local fallback.
    const html = `<html><head><link rel="canonical" href="http://[::bad::"></head></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.meta.canonical?.value).toBe("http://[::bad::");
  });

  it("ignores an unparseable <base href> and falls back to the request URL", () => {
    const html = `<html><head>
      <base href="::not a url::">
      <link rel="canonical" href="/foo">
    </head></html>`;
    const page = extractStatic(html, { baseUrl: "https://example.test/" });
    expect(page.meta.canonical?.value).toBe("https://example.test/foo");
  });

  it("falls back to a meta with no name/property/httpEquiv (origin kind: 'meta' bare)", () => {
    // A meta tag carrying only `content` is unusual but legal — sourcedMeta
    // produces a bare `{ kind: "meta" }` origin. We exercise that branch by
    // asserting the canonical-via-charset http-equiv path works without
    // a `name` set.
    const html = `<html><head>
      <meta http-equiv="content-type" content="text/html; charset=utf-16">
    </head></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.meta.charset?.value).toBe("utf-16");
    expect(page.meta.charset?.origin).toMatchObject({
      kind: "meta",
      httpEquiv: "content-type",
    });
  });
});

describe("extractStatic — robustness", () => {
  it("handles an empty document without crashing", () => {
    const page = extractStatic("", { baseUrl: "https://x.com/" });
    expect(page.raw.metas).toEqual([]);
    expect(page.openGraph.images).toEqual([]);
    expect(page.jsonLd).toEqual([]);
    expect(page.meta.title).toBeUndefined();
  });

  it("ignores OG image sub-fields that arrive before the first og:image", () => {
    const html = `<html><head>
      <meta property="og:image:width" content="100">
      <meta property="og:image" content="https://x.com/i.png">
    </head></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.openGraph.images).toHaveLength(1);
    expect(page.openGraph.images[0]?.width).toBeUndefined();
  });

  it("ignores non-numeric og:image:width / height", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://x.com/i.png">
      <meta property="og:image:width" content="huge">
    </head></html>`;
    const page = extractStatic(html, { baseUrl: "https://x.com/" });
    expect(page.openGraph.images[0]?.width).toBeUndefined();
  });
});
