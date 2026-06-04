/**
 * Fixture {@link Page} objects used by preview component tests and visual
 * regression baselines.
 *
 * The plan calls for **three fixture inputs per platform** (Phase 4.16 +
 * 4.17):
 *
 *  1. **full** — every recommended OG / Twitter tag present, hi-res image,
 *     site_name, canonical, favicon. Exercises the "ideal" rendering path.
 *  2. **minimal** — just `<title>` + meta description; no OG, no Twitter,
 *     no image. Exercises every fallback chain.
 *  3. **missing-image** — full data but no image. Exercises image-fallback
 *     handling per platform (LinkedIn shows a placeholder, iMessage falls
 *     back to favicon, etc.).
 *
 * Building these as fully-typed {@link Page} literals keeps tests purely
 * synchronous (no fixture-server boot, no fetch) and lets the visual
 * regression suite run deterministically.
 */

import type { FetchMeta, Page, PageHtml, RawHead } from "@/lib/core/types";
import { PAGE_SCHEMA_VERSION } from "@/lib/core/types";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface FixtureInput {
  url: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogImageAlt?: string;
  ogSiteName?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterImageAlt?: string;
  twitterSite?: string;
  twitterCreator?: string;
  themeColor?: string;
  canonical?: string;
  favicons?: Array<{ rel: string; href: string; sizes?: string; type?: string }>;
  htmlLang?: string;
}

function buildPage(input: FixtureInput): Page {
  const metas: RawHead["metas"] = [];
  const links: RawHead["links"] = [];

  const pushMeta = (
    key: "name" | "property" | "httpEquiv",
    value: string,
    content: string | undefined,
  ) => {
    if (content === undefined || content === "") return;
    metas.push({
      [key]: value,
      content,
      attributes: { [key === "httpEquiv" ? "http-equiv" : key]: value, content },
    } as RawHead["metas"][number]);
  };

  if (input.description !== undefined) pushMeta("name", "description", input.description);
  if (input.ogTitle !== undefined) pushMeta("property", "og:title", input.ogTitle);
  if (input.ogDescription !== undefined)
    pushMeta("property", "og:description", input.ogDescription);
  if (input.ogImage !== undefined) pushMeta("property", "og:image", input.ogImage);
  if (input.ogImageWidth !== undefined)
    pushMeta("property", "og:image:width", String(input.ogImageWidth));
  if (input.ogImageHeight !== undefined)
    pushMeta("property", "og:image:height", String(input.ogImageHeight));
  if (input.ogImageAlt !== undefined) pushMeta("property", "og:image:alt", input.ogImageAlt);
  if (input.ogSiteName !== undefined) pushMeta("property", "og:site_name", input.ogSiteName);
  if (input.ogUrl !== undefined) pushMeta("property", "og:url", input.ogUrl);
  if (input.twitterCard !== undefined) pushMeta("name", "twitter:card", input.twitterCard);
  if (input.twitterTitle !== undefined) pushMeta("name", "twitter:title", input.twitterTitle);
  if (input.twitterDescription !== undefined)
    pushMeta("name", "twitter:description", input.twitterDescription);
  if (input.twitterImage !== undefined) pushMeta("name", "twitter:image", input.twitterImage);
  if (input.twitterImageAlt !== undefined)
    pushMeta("name", "twitter:image:alt", input.twitterImageAlt);
  if (input.twitterSite !== undefined) pushMeta("name", "twitter:site", input.twitterSite);
  if (input.twitterCreator !== undefined) pushMeta("name", "twitter:creator", input.twitterCreator);
  if (input.themeColor !== undefined) pushMeta("name", "theme-color", input.themeColor);

  if (input.canonical !== undefined) {
    links.push({
      rel: "canonical",
      href: input.canonical,
      attributes: { rel: "canonical", href: input.canonical },
    });
  }
  for (const f of input.favicons ?? []) {
    links.push({
      rel: f.rel,
      href: f.href,
      sizes: f.sizes,
      type: f.type,
      attributes: { rel: f.rel, href: f.href, ...(f.sizes ? { sizes: f.sizes } : {}) },
    });
  }

  const fetch: FetchMeta = {
    requestedUrl: input.url,
    finalUrl: input.url,
    status: 200,
    statusText: "OK",
    headers: { "content-type": "text/html; charset=utf-8" },
    redirectCount: 0,
    durationMs: 12,
    bodyBytes: 0,
    contentType: "text/html",
  };
  const html: PageHtml = { static: "" };

  return {
    schemaVersion: PAGE_SCHEMA_VERSION,
    fetchedAt: "2026-05-04T12:00:00.000Z",
    fetch,
    extractor: { mode: "static", escalated: false },
    html,
    raw: {
      title: input.title,
      htmlLang: input.htmlLang,
      htmlDir: undefined,
      baseHref: undefined,
      metas,
      links,
      scripts: [],
    },
    meta: {},
    openGraph: { localeAlternates: [], images: [], unknown: [] },
    twitter: {},
    links: {
      alternates: [],
      icons: [],
      feeds: [],
      preconnects: [],
      dnsPrefetches: [],
    },
    jsonLd: [],
    probes: {},
  };
}

// ---------------------------------------------------------------------------
// Three canonical fixtures
// ---------------------------------------------------------------------------

/** Tancrède Simonin homepage — the dogfood demo. Full OG + Twitter coverage. */
export const tancredeFull: Page = buildPage({
  url: "https://tancrede.dev/",
  title: "Tancrède Simonin — engineer building search-friendly products",
  description:
    "Tancrède Simonin is a Paris-based engineer shipping AI, infrastructure and search-grade web tools. Read essays, see open-source work, and book a chat.",
  ogTitle: "Tancrède Simonin — engineer & writer",
  ogDescription:
    "Essays on shipping software, AI infrastructure, and the next generation of developer tools. Currently building Goflag.",
  ogImage: "https://tancrede.dev/og.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: "Portrait of Tancrède Simonin in front of a vibrant gradient backdrop",
  ogSiteName: "tancrede.dev",
  ogUrl: "https://tancrede.dev/",
  twitterCard: "summary_large_image",
  twitterTitle: "Tancrède Simonin — engineer & writer",
  twitterDescription:
    "Essays on shipping software, AI infrastructure, and the next generation of developer tools.",
  twitterImage: "https://tancrede.dev/og.png",
  twitterImageAlt: "Portrait of Tancrède Simonin",
  twitterSite: "@tancredesim",
  twitterCreator: "@tancredesim",
  themeColor: "#0b1020",
  canonical: "https://tancrede.dev/",
  favicons: [
    { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  ],
  htmlLang: "en",
});

/** A barren marketing page: only `<title>` + meta description. Worst case. */
export const minimalPage: Page = buildPage({
  url: "https://example.com/blog/cheap-coffee-mugs",
  title: "Cheap coffee mugs — Example",
  description:
    "Browse our cheap coffee mugs in a wide range of sizes and colors. Free shipping over $25.",
  htmlLang: "en",
});

/** Full OG metadata but no `og:image` — exercises image-fallback paths. */
export const missingImagePage: Page = buildPage({
  url: "https://news.example.com/breaking/policy-update",
  title: "Policy update — Example News",
  description:
    "Today's policy update covers the changes coming to support, billing, and the developer terms.",
  ogTitle: "Policy update — what's changing today",
  ogDescription:
    "A summary of every change to support, billing, and developer terms taking effect today.",
  ogSiteName: "Example News",
  ogUrl: "https://news.example.com/breaking/policy-update",
  twitterCard: "summary_large_image",
  twitterSite: "@examplenews",
  themeColor: "#1a1a1a",
  canonical: "https://news.example.com/breaking/policy-update",
  favicons: [{ rel: "icon", href: "/favicon.ico", sizes: "32x32" }],
  htmlLang: "en",
});

export const FIXTURE_PAGES = {
  full: tancredeFull,
  minimal: minimalPage,
  "missing-image": missingImagePage,
} as const;

export type FixtureName = keyof typeof FIXTURE_PAGES;
export const FIXTURE_NAMES: ReadonlyArray<FixtureName> = ["full", "minimal", "missing-image"];
