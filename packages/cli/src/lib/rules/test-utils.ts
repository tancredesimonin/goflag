/**
 * Helpers shared by rule unit tests and the contract harness.
 *
 * The rule layer is consumed via pure `Page → Issue[]` calls, so every
 * test fixture wants the same thing: turn a snippet of HTML into a
 * fully-typed `Page` so it can be passed to `lint()` (or to a single
 * rule's `check()`) without spinning up the Hono fixture server. This
 * file is the only place that knows how to fake a `FetchMeta` on the
 * way in.
 */

import type { AssetProbe, Page } from "../core/types";
import { PAGE_SCHEMA_VERSION } from "../core/types";
import { extractStatic } from "../core/extract/static";

export interface PageFromHtmlOptions {
  /** Used to resolve relative URLs and as the `final` fetch URL. */
  url?: string;
  /** Lowercased HTTP headers to attach to `Page.fetch.headers`. */
  headers?: Record<string, string>;
  /** Status code on the synthetic fetch (defaults to 200). */
  status?: number;
  /**
   * Parsed payload for the manifest probe, as if the page's
   * `<link rel="manifest">` had been fetched and read.
   *
   * Omitting it leaves `probes` empty, which is what a run with no probing
   * looks like — a different claim from a manifest that was fetched and turned
   * out to declare nothing, and the rules are written to tell the two apart.
   */
  manifest?: unknown;
  /**
   * What the asset probe pass found, keyed by URL. Omitting it leaves `assets`
   * absent, which is what a run without the pass looks like — and what the
   * reachability rules must read as "not looked at".
   */
  assets?: Record<string, AssetProbe>;
}

/**
 * Build a complete `Page` from a raw HTML string. The fetch metadata is
 * synthetic but shaped exactly like what `fetchStatic` returns, so any
 * code that reads `page.fetch.headers` (e.g. `robots.conflict`) keeps
 * working.
 */
export function pageFromHtml(html: string, options: PageFromHtmlOptions = {}): Page {
  const url = options.url ?? "https://example.com/";
  const status = options.status ?? 200;
  const headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  const parsed = extractStatic(html, { baseUrl: url });

  return {
    ...parsed,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    fetch: {
      requestedUrl: url,
      finalUrl: url,
      status,
      statusText: status === 200 ? "OK" : "",
      headers,
      redirectCount: 0,
      durationMs: 0,
      bodyBytes: Buffer.byteLength(html, "utf8"),
      contentType: headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "text/html",
    },
    extractor: { mode: "static", escalated: false },
    html: { static: html },
    probes:
      options.manifest === undefined
        ? {}
        : {
            manifest: {
              url: new URL("/site.webmanifest", url).toString(),
              status: 200,
              found: true,
              data: options.manifest,
            },
          },
    ...(options.assets ? { assets: options.assets } : {}),
    schemaVersion: PAGE_SCHEMA_VERSION,
  } satisfies Page;
}
