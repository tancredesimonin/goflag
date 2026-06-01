import { gunzipSync } from "node:zlib";
import { combineSignals } from "../probes/abort";
import { probeRobots } from "../probes/robots";
import { crawl } from "../crawl";
import { parseSitemap } from "./parse";
import type {
  SiteDiscovery,
  SiteDiscoverySource,
  SitemapDiagnostics,
  SitemapUrlEntry,
} from "./types";

export interface DiscoverSitemapOptions {
  /** Caller-driven cancellation. */
  signal?: AbortSignal;
  /** Per-request timeout in ms. Defaults to 8_000. */
  timeoutMs?: number;
  /** Hard cap on collected page URLs. Defaults to 5_000. */
  maxUrls?: number;
  /** Hard cap on child sitemaps followed from an index. Defaults to 50. */
  maxSitemaps?: number;
  /** Allow self-signed TLS (localhost / tunnels). */
  allowInsecureTls?: boolean;
  /** Run the BFS crawler when no sitemap is found. Defaults to true. */
  crawlFallback?: boolean;
  /** Crawl fallback depth. Defaults to 1. */
  crawlDepth?: number;
  /** Crawl fallback page cap. Defaults to 100. */
  crawlMaxPages?: number;
}

const DEFAULTS = {
  timeoutMs: 8_000,
  maxUrls: 5_000,
  maxSitemaps: 50,
  crawlDepth: 1,
  crawlMaxPages: 100,
};

interface SitemapCandidate {
  url: string;
  source: SiteDiscoverySource;
  declaredInRobots: boolean;
}

interface FetchedDoc {
  status: number;
  body?: string;
}

/**
 * Locate and load a site's sitemap starting from any URL on that site.
 *
 * Trust order:
 *   1. `Sitemap:` declarations in `robots.txt` (most authoritative).
 *   2. Well-known paths `/sitemap.xml` then `/sitemap_index.xml`.
 *   3. BFS crawl fallback (depth 1) when nothing else yields URLs.
 *
 * A `<sitemapindex>` root is followed into its children (bounded by
 * `maxSitemaps` / `maxUrls`). Gzipped sitemaps (`.xml.gz` or
 * `content-encoding: gzip`) are inflated transparently.
 *
 * Never throws — every failure mode collapses into an empty-but-shaped
 * `SiteDiscovery` whose `diagnostics` explain what went wrong.
 */
export async function discoverSitemap(
  baseUrl: string,
  options: DiscoverSitemapOptions = {},
): Promise<SiteDiscovery> {
  const origin = new URL(baseUrl).origin;
  const maxUrls = options.maxUrls ?? DEFAULTS.maxUrls;
  const maxSitemaps = options.maxSitemaps ?? DEFAULTS.maxSitemaps;

  const diagnostics: SitemapDiagnostics = {
    found: false,
    status: 0,
    declaredInRobots: false,
    robotsFound: false,
    atWellKnownPath: false,
    wellFormed: false,
    isIndex: false,
    childSitemapCount: 0,
    childSitemapErrors: 0,
    urlCount: 0,
    warnings: [],
  };

  // 1. Consult robots.txt for declared sitemaps.
  const robots = await probeRobots(origin, { signal: options.signal });
  diagnostics.robotsFound = robots.found;

  const candidates: SitemapCandidate[] = [];
  for (const declared of robots.sitemaps) {
    candidates.push({ url: declared, source: "robots", declaredInRobots: true });
  }
  candidates.push({
    url: new URL("/sitemap.xml", origin).toString(),
    source: "well-known",
    declaredInRobots: robots.sitemaps.includes(new URL("/sitemap.xml", origin).toString()),
  });
  candidates.push({
    url: new URL("/sitemap_index.xml", origin).toString(),
    source: "well-known",
    declaredInRobots: false,
  });

  // 2. Try each candidate until one parses into a urlset or index.
  for (const candidate of candidates) {
    const doc = await fetchDoc(candidate.url, options);
    if (!doc.body) {
      // Remember the first observed status so the UI can show a 404 etc.
      if (diagnostics.status === 0) diagnostics.status = doc.status;
      continue;
    }
    const parsed = parseSitemap(doc.body);
    if (parsed.kind === "unknown") {
      if (diagnostics.status === 0) diagnostics.status = doc.status;
      diagnostics.warnings.push(`Malformed or unrecognised sitemap at ${candidate.url}`);
      continue;
    }

    // Found a usable root document.
    diagnostics.found = true;
    diagnostics.status = doc.status;
    diagnostics.wellFormed = true;
    diagnostics.sitemapUrl = candidate.url;
    diagnostics.declaredInRobots = candidate.declaredInRobots;
    diagnostics.atWellKnownPath = isWellKnownPath(candidate.url);

    const collected: SitemapUrlEntry[] = [];
    const seen = new Set<string>();
    let truncated = false;

    if (parsed.kind === "urlset") {
      truncated = pushEntries(collected, seen, parsed.urls, maxUrls);
    } else {
      diagnostics.isIndex = true;
      const children = parsed.sitemaps.slice(0, maxSitemaps);
      diagnostics.childSitemapCount = parsed.sitemaps.length;
      if (parsed.sitemaps.length > maxSitemaps) {
        truncated = true;
        diagnostics.warnings.push(
          `Sitemap index has ${parsed.sitemaps.length} children; only the first ${maxSitemaps} were followed.`,
        );
      }
      for (const childUrl of children) {
        if (collected.length >= maxUrls) {
          truncated = true;
          break;
        }
        const childDoc = await fetchDoc(childUrl, options);
        if (!childDoc.body) {
          diagnostics.childSitemapErrors += 1;
          diagnostics.warnings.push(`Child sitemap unreachable: ${childUrl}`);
          continue;
        }
        const childParsed = parseSitemap(childDoc.body);
        if (childParsed.kind !== "urlset") {
          diagnostics.childSitemapErrors += 1;
          diagnostics.warnings.push(`Child sitemap not a urlset: ${childUrl}`);
          continue;
        }
        if (pushEntries(collected, seen, childParsed.urls, maxUrls)) truncated = true;
      }
    }

    diagnostics.urlCount = collected.length;

    // A sitemap that exists but lists nothing is useless for navigation —
    // fall back to crawling so the user still gets a page list (common for
    // freshly-deployed sites that ship an empty `<urlset>`).
    if (collected.length === 0 && options.crawlFallback !== false) {
      diagnostics.warnings.push("Sitemap found but lists no URLs — crawling instead.");
      return crawlSite(baseUrl, origin, options, diagnostics);
    }

    return {
      origin,
      baseUrl,
      source: candidate.source,
      urls: collected,
      diagnostics,
      truncated,
    };
  }

  // 3. No sitemap — optionally crawl.
  if (options.crawlFallback !== false) {
    return crawlSite(baseUrl, origin, options, diagnostics);
  }

  diagnostics.warnings.push("No sitemap found.");
  return { origin, baseUrl, source: "well-known", urls: [], diagnostics, truncated: false };
}

/**
 * Crawl the site as a navigation source, preserving whatever sitemap
 * diagnostics were already gathered. Used both when no sitemap exists
 * and when the located sitemap was empty.
 */
async function crawlSite(
  baseUrl: string,
  origin: string,
  options: DiscoverSitemapOptions,
  diagnostics: SitemapDiagnostics,
): Promise<SiteDiscovery> {
  const result = await crawl({
    entryUrl: baseUrl,
    depth: options.crawlDepth ?? DEFAULTS.crawlDepth,
    maxPages: options.crawlMaxPages ?? DEFAULTS.crawlMaxPages,
    inspectOptions: {
      mode: "static",
      probes: false,
      allowInsecureTls: options.allowInsecureTls,
      signal: options.signal,
    },
  });
  const urls = dedupe(result.visited).map((loc) => ({ loc }));
  diagnostics.urlCount = urls.length;
  if (!diagnostics.found) {
    diagnostics.warnings.push(
      urls.length === 0
        ? "No sitemap found and the crawl returned no pages."
        : "No sitemap found — URLs were discovered by crawling links.",
    );
  } else if (urls.length === 0) {
    diagnostics.warnings.push("The crawl returned no pages either.");
  }
  return {
    origin,
    baseUrl,
    source: "crawl",
    urls,
    diagnostics,
    truncated: result.truncated,
  };
}

/** Append entries up to `cap`; returns true when the cap was reached. */
function pushEntries(
  out: SitemapUrlEntry[],
  seen: Set<string>,
  entries: SitemapUrlEntry[],
  cap: number,
): boolean {
  for (const entry of entries) {
    if (out.length >= cap) return true;
    if (seen.has(entry.loc)) continue;
    seen.add(entry.loc);
    out.push(entry);
  }
  return out.length >= cap;
}

function dedupe(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

function isWellKnownPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path === "/sitemap.xml" || path === "/sitemap_index.xml";
  } catch {
    return false;
  }
}

/**
 * Fetch one sitemap document, inflating gzip when the URL ends in `.gz`
 * or the server flags `content-encoding: gzip`. Returns `{ status }`
 * with no body on any failure so the caller can fall through to the
 * next candidate without exception handling at every call site.
 */
async function fetchDoc(url: string, options: DiscoverSitemapOptions): Promise<FetchedDoc> {
  const { signal, cleanup } = combineSignals(
    options.signal,
    options.timeoutMs ?? DEFAULTS.timeoutMs,
  );
  const restoreTls = relaxTlsIfRequested(options.allowInsecureTls);
  try {
    const res = await fetch(url, {
      signal,
      redirect: "follow",
      headers: {
        accept: "application/xml,text/xml,application/gzip;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) return { status: res.status };

    const encoding = res.headers.get("content-encoding")?.toLowerCase() ?? "";
    const looksGzip = url.toLowerCase().endsWith(".gz") || encoding.includes("gzip");
    if (looksGzip) {
      // undici transparently decodes a `content-encoding: gzip` response,
      // so only inflate manually for `.gz` payloads served as raw bytes.
      const buf = Buffer.from(await res.arrayBuffer());
      try {
        return { status: res.status, body: gunzipSync(buf).toString("utf8") };
      } catch {
        // Already-decoded (or not really gzip) — fall back to raw text.
        return { status: res.status, body: buf.toString("utf8") };
      }
    }
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0 };
  } finally {
    cleanup();
    restoreTls();
  }
}

function relaxTlsIfRequested(enabled: boolean | undefined): () => void {
  if (!enabled) return () => undefined;
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return () => {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  };
}
