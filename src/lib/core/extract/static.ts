import * as cheerio from "cheerio";
import type {
  GenericMeta,
  HreflangAlternate,
  IconLink,
  OpenGraph,
  OpenGraphImage,
  Page,
  ParsedLinks,
  RawHead,
  RawLinkTag,
  RawMetaTag,
  RawScriptTag,
  Sourced,
  TagOrigin,
  TwitterCard,
} from "../types";
import { PAGE_SCHEMA_VERSION } from "../types";
import { parseJsonLdScripts } from "./json-ld";

export interface ExtractStaticOptions {
  /** Base URL used to resolve relative `href`/`src` values. Defaults to the
   *  fetch's final URL (which is what `fetchStatic` provides). */
  baseUrl: string;
}

/**
 * Parse a fetched HTML document into a partial `Page` (everything except the
 * `fetch` metadata + side-channel probes, which the orchestrator stitches in).
 *
 * This function is fully deterministic and side-effect-free. It accepts a
 * string of HTML and returns a JSON-serializable object.
 */
export function extractStatic(
  html: string,
  options: ExtractStaticOptions,
): Omit<Page, "fetch" | "fetchedAt" | "probes" | "extractor" | "html" | "hydration"> {
  const $ = cheerio.load(html);
  const base = resolveBase($, options.baseUrl);

  const raw = extractRaw($);
  const meta = parseGenericMeta(raw, base);
  const openGraph = parseOpenGraph(raw);
  const twitter = parseTwitter(raw);
  const links = parseLinks(raw, base);
  const jsonLd = parseJsonLdScripts(raw.scripts);

  return {
    schemaVersion: PAGE_SCHEMA_VERSION,
    raw,
    meta,
    openGraph,
    twitter,
    links,
    jsonLd,
  };
}

// ---------------------------------------------------------------------------
// Raw inventory
// ---------------------------------------------------------------------------

function extractRaw($: cheerio.CheerioAPI): RawHead {
  const html = $("html").first();
  const baseEl = $("head base").first();

  // React 19 / Next 15 streaming SSR emits hoistable metadata (`<title>`,
  // `<meta>`, `<link>`, JSON-LD) inside `<body>`; the browser hoists them
  // into `<head>` at parse time, and social scrapers read them wherever
  // they appear. Scoping to `<head>` alone would miss every tag on these
  // increasingly common pages, so we collect document-wide (the legacy
  // head-only case is a strict subset).
  const head: RawHead = {
    title: pickTitle($),
    htmlLang: attr(html, "lang"),
    htmlDir: attr(html, "dir"),
    baseHref: attr(baseEl, "href"),
    metas: [],
    links: [],
    scripts: [],
  };

  $("meta").each((_, el) => {
    head.metas.push(toRawMeta($, el));
  });
  $("link").each((_, el) => {
    head.links.push(toRawLink($, el));
  });
  $('script[type="application/ld+json"]').each((_, el) => {
    head.scripts.push(toRawScript($, el));
  });

  return head;
}

/**
 * Document title, preferring a real `<head><title>` but falling back to
 * the first `<title>` rendered in the body (React 19 hoistables). SVG
 * `<title>` elements are skipped — they're accessibility labels for
 * inline icons, not the document title.
 */
function pickTitle($: cheerio.CheerioAPI): string | undefined {
  const headTitle = trim($("head title").first().text());
  if (headTitle) return headTitle;
  let found: string | undefined;
  $("title").each((_, el) => {
    if (found) return;
    if ($(el).parents("svg").length > 0) return;
    const text = trim($(el).text());
    if (text) found = text;
  });
  return found || undefined;
}

function toRawMeta($: cheerio.CheerioAPI, el: ReturnType<cheerio.CheerioAPI>[number]): RawMetaTag {
  const attributes = collectAttributes($, el);
  return {
    name: attributes.name,
    property: attributes.property,
    httpEquiv: attributes["http-equiv"],
    content: attributes.content,
    charset: attributes.charset,
    attributes,
  };
}

function toRawLink($: cheerio.CheerioAPI, el: ReturnType<cheerio.CheerioAPI>[number]): RawLinkTag {
  const attributes = collectAttributes($, el);
  return {
    rel: attributes.rel ?? "",
    href: attributes.href,
    hreflang: attributes.hreflang,
    type: attributes.type,
    sizes: attributes.sizes,
    media: attributes.media,
    crossorigin: attributes.crossorigin,
    attributes,
  };
}

function toRawScript(
  $: cheerio.CheerioAPI,
  el: ReturnType<cheerio.CheerioAPI>[number],
): RawScriptTag {
  const attributes = collectAttributes($, el);
  return {
    type: attributes.type,
    src: attributes.src,
    content: trim($(el).text()) || undefined,
    attributes,
  };
}

// ---------------------------------------------------------------------------
// Generic meta
// ---------------------------------------------------------------------------

function parseGenericMeta(raw: RawHead, base: URL): GenericMeta {
  const meta: GenericMeta = {};

  if (raw.title) {
    meta.title = sourced(raw.title, { kind: "title" }, raw.title);
  }

  for (const m of raw.metas) {
    const name = m.name?.toLowerCase();
    if (name === "description" && m.content !== undefined) {
      meta.description = sourcedMeta(m.content, m);
    } else if (name === "keywords" && m.content !== undefined) {
      const list = m.content
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      meta.keywords = sourcedMeta(list, m);
    } else if (name === "author" && m.content !== undefined) {
      meta.author = sourcedMeta(m.content, m);
    } else if (name === "theme-color" && m.content !== undefined) {
      meta.themeColor = sourcedMeta(m.content, m);
    } else if (name === "color-scheme" && m.content !== undefined) {
      meta.colorScheme = sourcedMeta(m.content, m);
    } else if (name === "viewport" && m.content !== undefined) {
      meta.viewport = sourcedMeta(m.content, m);
    } else if (name === "robots" && m.content !== undefined) {
      meta.robots = sourcedMeta(m.content, m);
    } else if (name === "googlebot" && m.content !== undefined) {
      meta.googlebot = sourcedMeta(m.content, m);
    } else if (name === "generator" && m.content !== undefined) {
      meta.generator = sourcedMeta(m.content, m);
    } else if (name === "referrer" && m.content !== undefined) {
      meta.referrer = sourcedMeta(m.content, m);
    } else if (name === "application-name" && m.content !== undefined) {
      meta.applicationName = sourcedMeta(m.content, m);
    } else if (m.charset !== undefined) {
      meta.charset = sourced(m.charset, { kind: "meta", name: "charset" }, m.charset);
    } else if (m.httpEquiv?.toLowerCase() === "content-type" && m.content !== undefined) {
      const charset = /charset=([^;]+)/i.exec(m.content)?.[1]?.trim();
      if (charset && !meta.charset) {
        meta.charset = sourced(charset, { kind: "meta", httpEquiv: "content-type" }, m.content);
      }
    }
  }

  for (const l of raw.links) {
    const rel = l.rel?.toLowerCase();
    if (rel === "canonical" && l.href) {
      const resolved = safeResolve(l.href, base);
      meta.canonical = sourced(resolved, { kind: "link", rel: "canonical" }, l.href);
    }
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Open Graph
// ---------------------------------------------------------------------------

function parseOpenGraph(raw: RawHead): OpenGraph {
  const og: OpenGraph = {
    localeAlternates: [],
    images: [],
    unknown: [],
  };
  let current: OpenGraphImage | undefined;

  for (const m of raw.metas) {
    const property = m.property?.toLowerCase();
    if (!property?.startsWith("og:") || m.content === undefined) continue;

    const value = m.content;
    switch (property) {
      case "og:title":
        og.title = sourcedMeta(value, m);
        break;
      case "og:type":
        og.type = sourcedMeta(value, m);
        break;
      case "og:url":
        og.url = sourcedMeta(value, m);
        break;
      case "og:description":
        og.description = sourcedMeta(value, m);
        break;
      case "og:site_name":
        og.siteName = sourcedMeta(value, m);
        break;
      case "og:locale":
        og.locale = sourcedMeta(value, m);
        break;
      case "og:locale:alternate":
        og.localeAlternates.push(sourcedMeta(value, m));
        break;
      case "og:image":
      case "og:image:url":
        current = { url: sourcedMeta(value, m) };
        og.images.push(current);
        break;
      case "og:image:secure_url":
        if (current) current.secureUrl = sourcedMeta(value, m);
        break;
      case "og:image:type":
        if (current) current.type = sourcedMeta(value, m);
        break;
      case "og:image:width": {
        const n = Number.parseInt(value, 10);
        if (current && Number.isFinite(n)) current.width = sourcedMeta(n, m);
        break;
      }
      case "og:image:height": {
        const n = Number.parseInt(value, 10);
        if (current && Number.isFinite(n)) current.height = sourcedMeta(n, m);
        break;
      }
      case "og:image:alt":
        if (current) current.alt = sourcedMeta(value, m);
        break;
      default:
        og.unknown.push({ property, value: sourcedMeta(value, m) });
    }
  }

  return og;
}

// ---------------------------------------------------------------------------
// Twitter
// ---------------------------------------------------------------------------

function parseTwitter(raw: RawHead): TwitterCard {
  const tw: TwitterCard = {};
  for (const m of raw.metas) {
    const name = m.name?.toLowerCase();
    if (!name?.startsWith("twitter:") || m.content === undefined) continue;
    switch (name) {
      case "twitter:card":
        tw.card = sourcedMeta(m.content, m);
        break;
      case "twitter:site":
        tw.site = sourcedMeta(m.content, m);
        break;
      case "twitter:creator":
        tw.creator = sourcedMeta(m.content, m);
        break;
      case "twitter:title":
        tw.title = sourcedMeta(m.content, m);
        break;
      case "twitter:description":
        tw.description = sourcedMeta(m.content, m);
        break;
      case "twitter:image":
      case "twitter:image:src":
        tw.image = sourcedMeta(m.content, m);
        break;
      case "twitter:image:alt":
        tw.imageAlt = sourcedMeta(m.content, m);
        break;
    }
  }
  return tw;
}

// ---------------------------------------------------------------------------
// Links: hreflang, icons, manifest, feeds
// ---------------------------------------------------------------------------

function parseLinks(raw: RawHead, base: URL): ParsedLinks {
  const out: ParsedLinks = {
    alternates: [],
    icons: [],
    feeds: [],
    preconnects: [],
    dnsPrefetches: [],
  };

  for (const l of raw.links) {
    const rel = l.rel.toLowerCase();
    if (rel === "canonical" && l.href) {
      out.canonical = safeResolve(l.href, base);
    } else if (rel === "alternate" && l.hreflang && l.href) {
      const alt: HreflangAlternate = {
        hreflang: l.hreflang,
        href: safeResolve(l.href, base),
        isXDefault: l.hreflang.toLowerCase() === "x-default",
      };
      out.alternates.push(alt);
    } else if (rel === "alternate" && l.type && l.href && isFeedType(l.type)) {
      out.feeds.push({
        rel: "alternate",
        type: l.type.toLowerCase(),
        href: safeResolve(l.href, base),
        title: l.attributes.title,
      });
    } else if (
      (rel === "icon" || rel === "apple-touch-icon" || rel === "shortcut icon") &&
      l.href
    ) {
      const icon: IconLink = {
        rel,
        href: safeResolve(l.href, base),
        sizes: l.sizes,
        type: l.type,
        parsedSizes: parseSizes(l.sizes),
      };
      out.icons.push(icon);
    } else if (rel === "manifest" && l.href) {
      out.manifest = { href: safeResolve(l.href, base), crossorigin: l.crossorigin };
    } else if (rel === "preconnect" && l.href) {
      out.preconnects.push(safeResolve(l.href, base));
    } else if (rel === "dns-prefetch" && l.href) {
      out.dnsPrefetches.push(safeResolve(l.href, base));
    }
  }

  return out;
}

function isFeedType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t === "application/rss+xml" || t === "application/atom+xml" || t === "application/feed+json"
  );
}

function parseSizes(sizes: string | undefined): IconLink["parsedSizes"] {
  if (!sizes) return [];
  return sizes
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token.toLowerCase() === "any") return "any" as const;
      const m = /^(\d+)x(\d+)$/i.exec(token);
      if (!m) return undefined;
      const w = Number.parseInt(m[1]!, 10);
      const h = Number.parseInt(m[2]!, 10);
      if (!Number.isFinite(w) || !Number.isFinite(h)) return undefined;
      return { width: w, height: h };
    })
    .filter((v): v is { width: number; height: number } | "any" => v !== undefined);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectAttributes(
  $: cheerio.CheerioAPI,
  el: ReturnType<cheerio.CheerioAPI>[number],
): Record<string, string> {
  const result: Record<string, string> = {};
  const attribs = (el as { attribs?: Record<string, string> }).attribs;
  if (attribs) {
    for (const [k, v] of Object.entries(attribs)) {
      result[k.toLowerCase()] = v;
    }
  }
  return result;
}

function attr(el: ReturnType<cheerio.CheerioAPI>, name: string): string | undefined {
  const v = el.attr(name);
  return v === undefined || v === "" ? undefined : v;
}

function trim(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function resolveBase($: cheerio.CheerioAPI, requestUrl: string): URL {
  let base: URL;
  try {
    base = new URL(requestUrl);
  } catch {
    base = new URL("http://invalid.local/");
  }
  const baseHref = $("head base").first().attr("href");
  if (baseHref) {
    try {
      base = new URL(baseHref, base);
    } catch {
      // Ignore unparseable <base href> — fall back to the request URL.
    }
  }
  return base;
}

function safeResolve(href: string, base: URL): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function sourced<T>(value: T, origin: TagOrigin, raw?: string): Sourced<T> {
  return { value, origin, raw };
}

function sourcedMeta<T>(value: T, m: RawMetaTag): Sourced<T> {
  const origin: TagOrigin = m.property
    ? { kind: "meta", property: m.property }
    : m.name
      ? { kind: "meta", name: m.name }
      : m.httpEquiv
        ? { kind: "meta", httpEquiv: m.httpEquiv }
        : { kind: "meta" };
  return { value, origin, raw: m.content };
}
