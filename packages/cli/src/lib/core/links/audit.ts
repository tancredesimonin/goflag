/**
 * Link-audit orchestrator.
 *
 * Takes the suite's shared `SiteDiscovery` (the page list) and runs a
 * two-phase pipeline:
 *
 *   1. **Scan** — fetch each page's static HTML (capped `maxBytes`) and
 *      extract its links with `extractLinks`. A page fetch failure is
 *      recorded in `diagnostics.pagesFailed`; it never aborts the audit.
 *   2. **Check** — globally de-duplicate the link targets (the footer
 *      link on 500 pages is probed *once*) and `checkLink` each unique
 *      URL, bounded by a global concurrency cap *and* a per-host cap so a
 *      run can't get the IP banned.
 *
 * Then it joins checks back to occurrences to build `brokenByPage` and a
 * per-verdict summary. Every loop is bounded (`maxPages`, `maxLinks`,
 * concurrency, timeouts) and the whole thing never throws.
 */

import type { SiteDiscovery } from "../sitemap/types";
import { fetchUrl } from "../net/fetch-url";
import { extractLinks } from "./extract";
import { checkLink } from "./check";
import {
  emptyVerdictSummary,
  type AuditProgress,
  type LinkAuditReport,
  type LinkCheck,
  type LinkOccurrence,
} from "./types";

export interface LinkAuditOptions {
  signal?: AbortSignal;
  /** Parallel page HTML fetches. Defaults to 4. */
  scanConcurrency?: number;
  /** Parallel link probes (global). Defaults to 8. */
  checkConcurrency?: number;
  /** Parallel link probes per host (politeness). Defaults to 3. */
  maxPerHost?: number;
  /** Per-request timeout in ms. Defaults to 8_000. */
  timeoutMs?: number;
  /** Hard cap on pages scanned. Defaults to 500. */
  maxPages?: number;
  /** Hard cap on unique URLs checked. Defaults to 10_000. */
  maxLinks?: number;
  /** Include `<img>/<script>/<link>/<iframe>` sources. Defaults to false. */
  includeAssets?: boolean;
  /** Probe external (off-origin) links. Defaults to true. */
  checkExternal?: boolean;
  /** Allow self-signed / invalid TLS. */
  allowInsecureTls?: boolean;
  userAgent?: string;
  /** Bytes of page HTML to read during the scan. Defaults to 3 MB. */
  maxScanBytes?: number;
  /** Injectable sleep forwarded to `checkLink` (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Progress callback fired after each scanned page and each checked link. */
  onProgress?: (p: AuditProgress) => void;
}

const DEFAULTS = {
  scanConcurrency: 4,
  checkConcurrency: 8,
  maxPerHost: 3,
  timeoutMs: 8_000,
  maxPages: 500,
  maxLinks: 10_000,
  maxScanBytes: 3 * 1024 * 1024,
};

export async function runLinkAudit(
  discovery: SiteDiscovery,
  options: LinkAuditOptions = {},
): Promise<LinkAuditReport> {
  const maxPages = options.maxPages ?? DEFAULTS.maxPages;
  const maxLinks = options.maxLinks ?? DEFAULTS.maxLinks;
  const checkExternal = options.checkExternal !== false;

  const warnings: string[] = [];
  let truncated = false;

  // --- Page set -----------------------------------------------------------
  const allPages = discovery.urls.map((u) => u.loc);
  const pageUrls = allPages.slice(0, maxPages);
  if (allPages.length > maxPages) {
    truncated = true;
    warnings.push(`Site has ${allPages.length} pages; only the first ${maxPages} were scanned.`);
  }

  // --- Scan phase ---------------------------------------------------------
  const occurrences: LinkOccurrence[] = [];
  let pagesScanned = 0;
  let pagesFailed = 0;
  let scanDone = 0;

  await mapWithHostCaps(
    pageUrls,
    {
      concurrency: options.scanConcurrency ?? DEFAULTS.scanConcurrency,
      perHost: Infinity,
      signal: options.signal,
    },
    async (pageUrl) => {
      const res = await fetchUrl(pageUrl, {
        method: "GET",
        timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
        allowInsecureTls: options.allowInsecureTls,
        userAgent: options.userAgent,
        maxBytes: options.maxScanBytes ?? DEFAULTS.maxScanBytes,
        signal: options.signal,
      });
      if (res.status === 0 || res.status >= 400 || res.body === undefined) {
        pagesFailed += 1;
      } else {
        pagesScanned += 1;
        const refs = extractLinks(res.body, {
          baseUrl: res.finalUrl,
          includeAssets: options.includeAssets,
        });
        for (const ref of refs) occurrences.push({ pageUrl, ref });
      }
      scanDone += 1;
      options.onProgress?.({ phase: "scan", done: scanDone, total: pageUrls.length });
    },
    () => "scan",
  );

  // --- Global dedupe ------------------------------------------------------
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  for (const occ of occurrences) {
    const url = occ.ref.url;
    if (seen.has(url)) continue;
    if (!checkExternal && occ.ref.kind === "external") continue;
    if (uniqueUrls.length >= maxLinks) {
      truncated = true;
      warnings.push(`More than ${maxLinks} unique links found; the remainder were not checked.`);
      break;
    }
    seen.add(url);
    uniqueUrls.push(url);
  }

  // --- Check phase --------------------------------------------------------
  const checks: Record<string, LinkCheck> = {};
  let checkDone = 0;

  await mapWithHostCaps(
    uniqueUrls,
    {
      concurrency: options.checkConcurrency ?? DEFAULTS.checkConcurrency,
      perHost: options.maxPerHost ?? DEFAULTS.maxPerHost,
      signal: options.signal,
    },
    async (url) => {
      const check = await checkLink(url, {
        timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
        allowInsecureTls: options.allowInsecureTls,
        userAgent: options.userAgent,
        signal: options.signal,
        sleep: options.sleep,
      });
      checks[url] = check;
      checkDone += 1;
      options.onProgress?.({ phase: "check", done: checkDone, total: uniqueUrls.length });
    },
    (url) => hostOf(url),
  );

  // --- Map back + summarise ----------------------------------------------
  const summary = emptyVerdictSummary();
  for (const check of Object.values(checks)) summary[check.verdict] += 1;

  const brokenByPage = buildBrokenByPage(occurrences, checks);

  return {
    origin: discovery.origin,
    baseUrl: discovery.baseUrl,
    pagesScanned,
    occurrences,
    checks,
    summary,
    brokenByPage,
    truncated,
    diagnostics: { pagesFailed, warnings },
  };
}

/** Group broken/blocked/warning checks by the page they appear on. */
function buildBrokenByPage(
  occurrences: LinkOccurrence[],
  checks: Record<string, LinkCheck>,
): LinkAuditReport["brokenByPage"] {
  const byPage = new Map<string, Map<string, LinkCheck>>();
  for (const occ of occurrences) {
    const check = checks[occ.ref.url];
    if (!check) continue;
    if (check.verdict === "ok" || check.verdict === "redirect" || check.verdict === "skipped") {
      continue;
    }
    let page = byPage.get(occ.pageUrl);
    if (!page) {
      page = new Map();
      byPage.set(occ.pageUrl, page);
    }
    page.set(check.url, check);
  }
  return Array.from(byPage.entries())
    .map(([pageUrl, map]) => ({ pageUrl, broken: Array.from(map.values()) }))
    .sort((a, b) => b.broken.length - a.broken.length);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface PoolOptions {
  concurrency: number;
  perHost: number;
  signal?: AbortSignal;
}

/**
 * Run `worker` over `items` with a global concurrency cap and an optional
 * per-host cap. Resolves when every item completes (or the signal aborts
 * and in-flight work drains). Worker rejections are swallowed — each
 * worker is responsible for collapsing its own failures.
 */
function mapWithHostCaps<T>(
  items: T[],
  opts: PoolOptions,
  worker: (item: T) => Promise<void>,
  hostOf: (item: T) => string,
): Promise<void> {
  const concurrency = Math.max(1, opts.concurrency);
  const perHost = opts.perHost;
  return new Promise<void>((resolve) => {
    if (items.length === 0) {
      resolve();
      return;
    }
    const pending = items.map((item) => ({ item, host: hostOf(item) }));
    const hostActive = new Map<string, number>();
    let inflight = 0;
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const pump = () => {
      if (settled) return;
      if (opts.signal?.aborted) {
        if (inflight === 0) finish();
        return;
      }
      while (inflight < concurrency) {
        let pickIndex = -1;
        for (let k = 0; k < pending.length; k++) {
          const entry = pending[k]!;
          if ((hostActive.get(entry.host) ?? 0) < perHost) {
            pickIndex = k;
            break;
          }
        }
        if (pickIndex === -1) break;
        const [picked] = pending.splice(pickIndex, 1);
        const host = picked!.host;
        hostActive.set(host, (hostActive.get(host) ?? 0) + 1);
        inflight += 1;
        void worker(picked!.item)
          .catch(() => undefined)
          .finally(() => {
            inflight -= 1;
            hostActive.set(host, (hostActive.get(host) ?? 1) - 1);
            if (pending.length === 0 && inflight === 0) finish();
            else pump();
          });
      }
      if (pending.length === 0 && inflight === 0) finish();
    };

    pump();
  });
}
