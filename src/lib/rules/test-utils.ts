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

import type { Page } from "@/lib/core/types";
import { PAGE_SCHEMA_VERSION } from "@/lib/core/types";
import { extractStatic } from "@/lib/core/extract/static";

export interface PageFromHtmlOptions {
  /** Used to resolve relative URLs and as the `final` fetch URL. */
  url?: string;
  /** Lowercased HTTP headers to attach to `Page.fetch.headers`. */
  headers?: Record<string, string>;
  /** Status code on the synthetic fetch (defaults to 200). */
  status?: number;
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
    probes: {},
    schemaVersion: PAGE_SCHEMA_VERSION,
  } satisfies Page;
}
