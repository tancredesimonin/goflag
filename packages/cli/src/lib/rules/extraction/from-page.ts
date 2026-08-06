/**
 * `Page` → `Extraction` adapter.
 *
 * The engine's `Page` already carries provenance (`Sourced<T>` is
 * structurally identical to `Fact<T>`), so most of this is a projection:
 * pick the documented fields, leave behind the engine internals (raw HTML
 * blobs, hydration deltas, probes). The only real work is promoting the
 * root-element attributes (`lang`, `dir`, `<base href>`), which `Page` keeps
 * raw-only, into `Fact`s with an origin.
 *
 * The output shares object references with the input — both are immutable
 * by convention — and is fully JSON-serializable (`Page.html` never leaks).
 */

import type { Page } from "../../core/types";
import type {
  Extraction,
  ExtractionDocument,
  ExtractionLinks,
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

function linksFromPage(page: Page): ExtractionLinks {
  return {
    hreflang: page.links.alternates,
    icons: page.links.icons,
    manifest: page.links.manifest ? { href: page.links.manifest.href } : undefined,
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
