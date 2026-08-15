/**
 * `Page` → `Extraction` adapter.
 *
 * The engine's `Page` already carries provenance (`Sourced<T>` is
 * structurally identical to `Fact<T>`), so most of this is a projection:
 * pick the documented fields, leave behind the engine internals (raw HTML
 * blobs, hydration deltas). The only real work is promoting the
 * root-element attributes (`lang`, `dir`, `<base href>`), which `Page` keeps
 * raw-only, into `Fact`s with an origin.
 *
 * One probe crosses over: the Web App Manifest. It is fetched per page,
 * because the page is what declares it, and its icons are a declaration about
 * this page's `<head>` rather than about the site. Its payload arrives as
 * `unknown` from the network, so it is read defensively here — that is the
 * price of letting a rule stay a pure function of the extraction.
 *
 * The output shares object references with the input — both are immutable
 * by convention — and is fully JSON-serializable (`Page.html` never leaks).
 */

import { parseSizes } from "../../core/extract/static";
import type { Page } from "../../core/types";
import type {
  Extraction,
  ExtractionDocument,
  ExtractionLinks,
  ExtractionManifest,
  ExtractionManifestIcon,
  ExtractionOpenGraph,
  Fact,
} from "./types";
import { EXTRACTION_VERSION } from "./types";

/** Wrap a raw root-element value as a `Fact`, or propagate its absence. */
function htmlFact(value: string | undefined, attribute: string): Fact<string> | undefined {
  if (value === undefined) return undefined;
  return { value, origin: { kind: "html", attribute }, raw: value };
}

function documentFromPage(page: Page): ExtractionDocument {
  return {
    title: page.meta.title,
    lang: htmlFact(page.raw.htmlLang, "lang"),
    dir: htmlFact(page.raw.htmlDir, "dir"),
    charset: page.meta.charset,
    // `<base>` is an element, not an attribute of `<html>`; `TagOrigin` has
    // no dedicated kind for it, so the origin names the element instead.
    base: htmlFact(page.raw.baseHref, "base"),
  };
}

function openGraphFromPage(page: Page): ExtractionOpenGraph {
  const og = page.openGraph;
  return {
    title: og.title,
    type: og.type,
    url: og.url,
    description: og.description,
    siteName: og.siteName,
    locale: og.locale,
    localeAlternates: og.localeAlternates,
    images: og.images,
    other: og.unknown,
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * The `icons` member of a fetched manifest, read out of `unknown`.
 *
 * An entry without a usable `src` is dropped rather than repaired: the
 * manifest spec makes `src` the only required member of an icon, so an entry
 * missing it names nothing a rule could judge or a browser could fetch.
 */
function manifestIcons(data: unknown): ExtractionManifestIcon[] {
  if (typeof data !== "object" || data === null) return [];
  const raw = (data as { icons?: unknown }).icons;
  if (!Array.isArray(raw)) return [];

  const icons: ExtractionManifestIcon[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { src, sizes, type, purpose } = entry as Record<string, unknown>;
    const source = optionalString(src);
    if (!source) continue;

    icons.push({
      src: source,
      sizes: optionalString(sizes),
      type: optionalString(type),
      purpose: optionalString(purpose),
      parsedSizes: parseSizes(optionalString(sizes)),
    });
  }
  return icons;
}

function manifestFromPage(page: Page): ExtractionManifest | undefined {
  const link = page.links.manifest;
  if (!link) return undefined;

  const probe = page.probes.manifest;
  // No probe ran, so nothing is known beyond the declaration itself. Saying
  // `parsed: false` here would claim goflag looked and failed.
  if (!probe) return { href: link.href };
  if (!probe.found || probe.parseError !== undefined) {
    return { href: link.href, parsed: false };
  }

  return { href: link.href, parsed: true, icons: manifestIcons(probe.data) };
}

function linksFromPage(page: Page): ExtractionLinks {
  return {
    hreflang: page.links.alternates,
    icons: page.links.icons,
    manifest: manifestFromPage(page),
    feeds: page.links.feeds.map(({ type, href, title }) => ({ type, href, title })),
  };
}

/** Project one observed `Page` onto the versioned extraction contract. */
export function extractionFromPage(page: Page): Extraction {
  return {
    extractionVersion: EXTRACTION_VERSION,
    fetchedAt: page.fetchedAt,
    http: {
      requestedUrl: page.fetch.requestedUrl,
      finalUrl: page.fetch.finalUrl,
      status: page.fetch.status,
      headers: page.fetch.headers,
      redirects: page.fetch.redirectCount,
      contentType: page.fetch.contentType,
    },
    rendering: {
      mode: page.extractor.mode,
      escalated: page.extractor.escalated,
      escalationReason: page.extractor.escalationReason,
    },
    document: documentFromPage(page),
    meta: {
      description: page.meta.description,
      viewport: page.meta.viewport,
      robots: page.meta.robots,
      googlebot: page.meta.googlebot,
      canonical: page.meta.canonical,
      themeColor: page.meta.themeColor,
      colorScheme: page.meta.colorScheme,
      referrer: page.meta.referrer,
      generator: page.meta.generator,
      applicationName: page.meta.applicationName,
      author: page.meta.author,
      keywords: page.meta.keywords,
    },
    openGraph: openGraphFromPage(page),
    twitter: {
      card: page.twitter.card,
      site: page.twitter.site,
      creator: page.twitter.creator,
      title: page.twitter.title,
      description: page.twitter.description,
      image: page.twitter.image,
      imageAlt: page.twitter.imageAlt,
    },
    links: linksFromPage(page),
    jsonLd: page.jsonLd.map(({ index, types, data, parseError, raw }) => ({
      index,
      types,
      data,
      parseError,
      raw,
    })),
  };
}
