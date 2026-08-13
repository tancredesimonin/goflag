import type { ExtractorMode, FetchMeta, Page } from "./types";

/**
 * Inspection strategy passed to `inspect()`. Re-exported as a top-level
 * type so callers (CLI, App Router routes, future SDK) can import it
 * without reaching into individual extractor modules.
 */
export type InspectMode = "auto" | ExtractorMode;
import { extractStatic } from "./extract/static";
import { fetchStatic, type FetchStaticOptions } from "./fetch/static";
import {
  extractHeadless,
  HeadlessUnavailableError,
  type HeadlessExtractOptions,
} from "./extract/headless";
import { looksClientRendered } from "./extract/heuristics";
import { computeHydrationDelta } from "./extract/hydration";
import { probeManifest } from "./probes/manifest";
import { probeRobots } from "./probes/robots";
import { probeSitemap } from "./probes/sitemap";

export interface InspectOptions extends FetchStaticOptions {
  /**
   * Whether to fetch `/robots.txt`, `/sitemap.xml`, and the linked manifest.
   * Defaults to `true`. Disable in tests that only care about the HTML.
   */
  probes?: boolean;
  /**
   * Extraction strategy:
   *  - `"static"` — fetch + parse only, never boot Chromium. Fastest, but
   *    misses anything injected by client JS.
   *  - `"headless"` — boot Chromium and parse the post-hydration HTML.
   *    Always sees client-injected tags. Pays ~1–2 s of browser boot.
   *  - `"auto"` (default) — start in static mode; if the `<head>` looks
   *    like an unhydrated SPA shell (no title / og / canonical / json-ld /
   *    hreflang), automatically re-run in headless mode.
   */
  mode?: "auto" | ExtractorMode;
  /**
   * Options forwarded to the headless extractor when it runs. Tests inject
   * `launcher` here to avoid touching the real Playwright binary.
   */
  headless?: Pick<HeadlessExtractOptions, "launcher" | "waitUntil" | "timeoutMs">;
}

/**
 * High-level orchestrator: fetch the URL, parse the HTML, optionally render
 * it in Chromium for SPA support, run the side-channel probes, and stitch
 * everything into a complete `Page`.
 *
 * This is the single entry point shared by the CLI (`goflag inspect`),
 * the UI Server Action (Phase 3), and the snapshot/diff layers (Phases 9+).
 * Keeping it thin and pure means we never have to maintain two divergent
 * code paths between local UI and CI.
 */
export async function inspect(url: string, options: InspectOptions = {}): Promise<Page> {
  const {
    probes: enableProbes = true,
    mode = "auto",
    headless: headlessOpts,
    ...fetchOptions
  } = options;

  const fetchedAt = new Date().toISOString();

  // Headless-only mode skips the static fetch entirely. We still need a
  // FetchMeta, which the headless extractor provides from the navigation.
  if (mode === "headless") {
    return inspectHeadlessOnly({
      url,
      fetchedAt,
      enableProbes,
      fetchOptions,
      headlessOpts,
    });
  }

  // Both `"static"` and `"auto"` start with a static fetch + parse.
  const { meta: staticMeta, body: staticBody } = await fetchStatic(url, fetchOptions);
  const staticParsed = extractStatic(staticBody, { baseUrl: staticMeta.finalUrl });

  if (mode === "static") {
    const probes = await runProbes({
      enabled: enableProbes,
      origin: new URL(staticMeta.finalUrl).origin,
      manifestHref: staticParsed.links.manifest?.href,
      signal: fetchOptions.signal,
    });
    return {
      ...staticParsed,
      fetchedAt,
      fetch: staticMeta,
      extractor: { mode: "static", escalated: false },
      html: { static: staticBody },
      probes,
    };
  }

  // Auto: decide whether to escalate.
  const heuristic = looksClientRendered(staticParsed);
  if (!heuristic.likely) {
    const probes = await runProbes({
      enabled: enableProbes,
      origin: new URL(staticMeta.finalUrl).origin,
      manifestHref: staticParsed.links.manifest?.href,
      signal: fetchOptions.signal,
    });
    return {
      ...staticParsed,
      fetchedAt,
      fetch: staticMeta,
      extractor: { mode: "static", escalated: false },
      html: { static: staticBody },
      probes,
    };
  }

  // Escalation path: render in Chromium and reparse. If headless is
  // unavailable, fall back to the static result and record why on
  // `escalationBlocked`, which `report/build.ts` turns into a diagnostics
  // warning: judging an unhydrated shell produces a page of findings that are
  // all false, and the reader has no way to know unless the report says it.
  // We still never crash a default `inspect` run over a missing Playwright.
  let renderedBody: string | undefined;
  let renderedFetch: FetchMeta | undefined;
  try {
    const result = await extractHeadless(url, {
      ...headlessOpts,
      allowInsecureTls: fetchOptions.allowInsecureTls,
      signal: fetchOptions.signal,
    });
    renderedBody = result.renderedHtml;
    renderedFetch = result.fetch;
  } catch (err) {
    if (!(err instanceof HeadlessUnavailableError)) throw err;
    const probes = await runProbes({
      enabled: enableProbes,
      origin: new URL(staticMeta.finalUrl).origin,
      manifestHref: staticParsed.links.manifest?.href,
      signal: fetchOptions.signal,
    });
    return {
      ...staticParsed,
      fetchedAt,
      fetch: staticMeta,
      extractor: {
        mode: "static",
        escalated: false,
        escalationReason: heuristic.reason,
        escalationBlocked: err.message,
      },
      html: { static: staticBody },
      probes,
    };
  }

  const renderedParsed = extractStatic(renderedBody, { baseUrl: renderedFetch.finalUrl });
  const hydration = computeHydrationDelta(staticParsed, renderedParsed);
  const probes = await runProbes({
    enabled: enableProbes,
    origin: new URL(renderedFetch.finalUrl).origin,
    manifestHref: renderedParsed.links.manifest?.href,
    signal: fetchOptions.signal,
  });

  return {
    ...renderedParsed,
    fetchedAt,
    fetch: renderedFetch,
    extractor: {
      mode: "headless",
      escalated: true,
      escalationReason: heuristic.reason,
    },
    html: { static: staticBody, rendered: renderedBody },
    hydration,
    probes,
  };
}

async function inspectHeadlessOnly(args: {
  url: string;
  fetchedAt: string;
  enableProbes: boolean;
  fetchOptions: FetchStaticOptions;
  headlessOpts: InspectOptions["headless"];
}): Promise<Page> {
  const { url, fetchedAt, enableProbes, fetchOptions, headlessOpts } = args;
  const result = await extractHeadless(url, {
    ...headlessOpts,
    allowInsecureTls: fetchOptions.allowInsecureTls,
    signal: fetchOptions.signal,
  });
  const parsed = extractStatic(result.renderedHtml, { baseUrl: result.fetch.finalUrl });
  const probes = await runProbes({
    enabled: enableProbes,
    origin: new URL(result.fetch.finalUrl).origin,
    manifestHref: parsed.links.manifest?.href,
    signal: fetchOptions.signal,
  });
  return {
    ...parsed,
    fetchedAt,
    fetch: result.fetch,
    extractor: { mode: "headless", escalated: false },
    html: { static: "", rendered: result.renderedHtml },
    probes,
  };
}

async function runProbes(args: {
  enabled: boolean;
  origin: string;
  manifestHref: string | undefined;
  signal: AbortSignal | undefined;
}): Promise<Page["probes"]> {
  if (!args.enabled) return {};
  const [robots, sitemap, manifest] = await Promise.all([
    probeRobots(args.origin, { signal: args.signal }),
    probeSitemap(args.origin, { signal: args.signal }),
    args.manifestHref
      ? probeManifest(args.manifestHref, { signal: args.signal })
      : Promise.resolve(undefined),
  ]);
  const probes: Page["probes"] = { robots, sitemap };
  if (manifest) probes.manifest = manifest;
  return probes;
}
