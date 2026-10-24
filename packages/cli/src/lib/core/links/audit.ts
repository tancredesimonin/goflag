/**
 * Link-audit orchestrator.
 *
 * Takes the suite's shared `SiteDiscovery` (the page list) and runs a
 * two-phase pipeline:
 *
 *   1. **Scan** — read each page's links: from the copy the caller hands
 *      over (`pages`), or else from its static HTML, fetched and capped at
 *      `maxBytes`, with `extractLinks`. A page fetch failure is recorded in
 *      `diagnostics.pagesFailed`; it never aborts the audit. A handed page
 *      is not fetched, so it cannot fail here.
 *   2. **Check** — globally de-duplicate the link targets (the footer
 *      link on 500 pages is probed *once*) and `checkLink` each unique
 *      URL, bounded by a global concurrency cap *and* a per-host cap so a
 *      run can't get the IP banned. A target the caller already holds a
 *      GET for (`answers`) is judged from it by `checkFromAnswer` when it
 *      can be, and not probed.
 *
 * Then it joins checks back to occurrences to build `brokenByPage` and a
 * per-verdict summary. Every loop is bounded (`maxPages`, `maxLinks`,
 * concurrency, timeouts) and the whole thing never throws.
 */

import type { SiteDiscovery } from "../sitemap/types";
import { capText, fetchUrl } from "../net/fetch-url";
import { extractLinks } from "./extract";
import { checkFromAnswer, checkLink, type LinkAnswer } from "./check";
import {
  emptyVerdictSummary,
  type AuditProgress,
  type LinkAuditReport,
  type LinkCheck,
  type LinkOccurrence,
  type LinkRef,
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
  /**
   * Pages already in hand, keyed by the URL the discovery lists. A page found
   * here is not fetched again — see `HandedPage`. A page left out is fetched
   * exactly as before, so a caller that passes nothing gets the old behaviour.
   */
  pages?: ReadonlyMap<string, HandedPage>;
  /**
   * GETs already made, keyed by the exact URL they asked for. A link to one of
   * those URLs is judged from that answer when `checkFromAnswer` can — a 2xx
   * with no redirect — and probed otherwise.
   *
   * The audit's crawl fetched every page it audited, and the pages of a site
   * link to each other: on openfinanceguide, 750 of the 4,551 link targets are
   * pages the crawl had fetched moments before, each of which the check probed
   * again with a HEAD and a GET.
   */
  answers?: ReadonlyMap<string, LinkAnswer>;
  /** Injectable sleep forwarded to `checkLink` (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Progress callback fired after each scanned page and each checked link. */
  onProgress?: (p: AuditProgress) => void;
}

/**
 * A page the caller already fetched, and possibly already read the links of.
 *
 * The audit's crawl fetched every page it hands over, moments before, and
 * parsed it for the `<head>`. Fetching it again cost a round trip per page,
 * and parsing it again cost more than the fetch: on openfinanceguide, whose
 * pages average 1 MB of HTML, parsing them is most of what the scan did.
 *
 * `links` are used only when they are what the scan would have read anyway:
 * anchors only, from a page no longer than `maxScanBytes`. Otherwise `html` is
 * cut and parsed as a fetched body would have been.
 */
export interface HandedPage {
  html: string;
  links?: readonly LinkRef[];
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

  // The pages that need a fetch go first, then the pages handed over.
  //
  // Not the other way round, and not mixed in one pool: reading a handed page
  // never awaits, so the event loop sits out the whole of that stretch — 15 s
  // on openfinanceguide, for the pages over `maxScanBytes`. The server closes
  // idle keep-alive connections in that time, nothing in this process hears
  // about it, and the next request goes out on a dead socket. Tried that way,
  // every run reported the four Atom feeds of openfinanceguide as failed scans,
  // all four with a network error in the same millisecond.
  const maxBytes = options.maxScanBytes ?? DEFAULTS.maxScanBytes;
  const handedPages: [string, HandedPage][] = [];
  const toFetch: string[] = [];
  for (const pageUrl of pageUrls) {
    const handed = options.pages?.get(pageUrl);
    if (handed) handedPages.push([pageUrl, handed]);
    else toFetch.push(pageUrl);
  }

  await mapWithHostCaps(
    toFetch,
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
        maxBytes,
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

  for (const [pageUrl, handed] of handedPages) {
    if (options.signal?.aborted) break;
    const refs =
      handed.links && !options.includeAssets && Buffer.byteLength(handed.html) <= maxBytes
        ? handed.links
        : extractLinks(capText(handed.html, maxBytes), {
            baseUrl: pageUrl,
            includeAssets: options.includeAssets,
          });
    for (const ref of refs) occurrences.push({ pageUrl, ref });
    pagesScanned += 1;
    scanDone += 1;
    options.onProgress?.({ phase: "scan", done: scanDone, total: pageUrls.length });
  }

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

  // Answers in hand first. They cost no request and almost no time, so the
  // pool below is left with only what has to go to the network.
  const toProbe: string[] = [];
  for (const url of uniqueUrls) {
    const answer = options.answers?.get(url);
    const check = answer ? checkFromAnswer(url, answer) : undefined;
    if (!check) {
      toProbe.push(url);
      continue;
    }
    checks[url] = check;
    checkDone += 1;
    options.onProgress?.({ phase: "check", done: checkDone, total: uniqueUrls.length });
  }

  await mapWithHostCaps(
    toProbe,
    {
      concurrency: options.checkConcurrency ?? DEFAULTS.checkConcurrency,
      perHost: options.maxPerHost ?? DEFAULTS.maxPerHost,
      // The origin is exempt, and the scan phase above is the precedent: it
      // fetches these same pages at `scanConcurrency` with `perHost: Infinity`.
      // Capping the check phase at 3 against that host made the two phases
      // disagree about the same server, and on a deployed site it is where the
      // audit spends itself: measured on openfinanceguide, 3821 same-origin
      // links at ~700 ms a round trip, three at a time — 14.8 minutes of an
      // 18.5-minute job. Against a local `--start` run the cap never binds,
      // which is why the plan's own 7-minute figure held and CI's did not.
      //
      // `checkConcurrency` still bounds it: at most 8 in flight, where the scan
      // phase already runs 4.
      unlimitedHost: hostOf(discovery.origin),
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
  /**
   * One host exempt from `perHost` — the origin under audit. Politeness is
   * owed to other people's servers; the origin is the site the caller pointed
   * this tool at, and the scan phase already fetches it with no per-host cap
   * at all.
   */
  unlimitedHost?: string;
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
          const cap = entry.host === opts.unlimitedHost ? Infinity : perHost;
          if ((hostActive.get(entry.host) ?? 0) < cap) {
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
