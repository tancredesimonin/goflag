/**
 * Report orchestrator.
 *
 * One crawl feeds all three checks:
 *   - the crawled `Page[]` drives SEO lint + the i18n matrix, and
 *   - a synthetic `SiteDiscovery` built from the same page set drives the
 *     link audit.
 *
 * Everything funnels into a single `GoflagReport` (see `./types.ts`).
 */

import { crawl } from "../lib/core/crawl";
import { lint } from "../lib/core/lint";
import {
  buildI18nMatrix,
  looksLikeLocaleSegment,
  reciprocityIssues,
  type I18nMatrix,
} from "../lib/core/i18n";
import { getRule } from "../lib/rules";
import { runLinkAudit } from "../lib/core/links/audit";
import { normalizeInputUrl } from "../lib/core/net/normalize-url";
import type { SiteDiscovery } from "../lib/core/sitemap/types";
import type { Page } from "../lib/core/types";
import { fingerprint, routeKey, targetKey } from "./fingerprint";
import type {
  BrokenLink,
  GoflagReport,
  ReportReciprocityIssue,
  SeoIssue,
  TranslationHole,
  UnreachablePage,
  Verdict,
} from "./types";

/** A 2xx response is the only "healthy" page we lint / audit for i18n. */
function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * The phase of the audit a progress event belongs to:
 *   - "crawl": BFS-visiting + inspecting pages (SEO + i18n input).
 *   - "scan":  re-reading each page's HTML to extract its links.
 *   - "links": probing each unique link target.
 */
export type AuditPhase = "crawl" | "scan" | "links";

/** A single progress tick, emitted as the audit advances. */
export interface ProgressEvent {
  phase: AuditPhase;
  /** Items completed in the current phase. */
  done: number;
  /** Best-effort total for the phase (the crawl total grows as links are discovered). */
  total: number;
  /** The URL just processed, when the phase tracks one (crawl). */
  url?: string;
  /** HTTP status of `url`, when known (crawl). */
  status?: number;
}

export interface AuditOptions {
  /** BFS crawl depth. `0` = entry only. Defaults to 2. */
  depth?: number;
  /** Hard cap on pages crawled. Defaults to 200. */
  maxPages?: number;
  /** Glob include filter on the URL pathname. */
  include?: string[];
  /** Glob exclude filter on the URL pathname. */
  exclude?: string[];
  /** Probe external (off-origin) links too. Defaults to true. */
  checkExternal?: boolean;
  /** Skip Chromium: static HTML only (no SPA rendering). Defaults to false. */
  static?: boolean;
  /** Allow self-signed / invalid TLS (localhost, tunnels). */
  allowInsecureTls?: boolean;
  /** Per-request timeout in ms. Defaults to 8_000. */
  timeoutMs?: number;
  /** Caller-driven cancellation. */
  signal?: AbortSignal;
  /** Progress callback for a live CLI. */
  onProgress?: (event: ProgressEvent) => void;
}

/** Infer a locale from the leading path segment, or null when unprefixed. */
function localeOfUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const first = pathname.split("/").filter(Boolean)[0];
    if (first && looksLikeLocaleSegment(first)) return first;
  } catch {
    // fall through
  }
  return null;
}

/**
 * Routes present in some locales but absent in others. A "hole" is exactly
 * the "missing translation page" the tool exists to find. `x-default` is a
 * fallback pointer, not a real translation, so it never counts as a locale
 * that must be filled.
 */
export function deriveTranslationHoles(matrix: I18nMatrix): TranslationHole[] {
  const realLocales = matrix.locales.filter((l) => l !== "x-default");
  if (realLocales.length < 2) return [];

  const holes: TranslationHole[] = [];
  for (const route of matrix.routes) {
    const present: string[] = [];
    const missing: string[] = [];
    for (const locale of realLocales) {
      const cell = matrix.cells[route]?.[locale];
      if (cell && cell.url) present.push(locale);
      else missing.push(locale);
    }
    if (present.length > 0 && missing.length > 0) {
      holes.push({
        id: fingerprint("i18n", "hole", route),
        route,
        presentLocales: present,
        missingLocales: missing,
      });
    }
  }
  return holes;
}

/**
 * Map a report to a process exit code:
 *   0 = clean (green flag), 1 = findings present (yellow/red flag).
 * Used by the CLI as a CI gate.
 */
export function exitCode(report: GoflagReport): number {
  return report.summary.verdict === "green" ? 0 : 1;
}

/** Run the full audit and return the report. Never throws for site-level failures. */
export async function runAudit(
  inputUrl: string,
  options: AuditOptions = {},
): Promise<GoflagReport> {
  const normalized = normalizeInputUrl(inputUrl);
  if (!normalized.ok) {
    throw new Error(`"${inputUrl}" is not a valid http(s) URL.`);
  }
  const entry = normalized.url;
  const origin = new URL(entry).origin;

  const depth = options.depth ?? 2;
  const maxPages = options.maxPages ?? 200;
  const checkExternal = options.checkExternal !== false;

  // --- Crawl (drives SEO lint + i18n) ------------------------------------
  const crawlResult = await crawl({
    entryUrl: entry,
    depth,
    maxPages,
    include: options.include,
    exclude: options.exclude,
    inspectOptions: {
      mode: options.static ? "static" : "auto",
      probes: false,
      allowInsecureTls: options.allowInsecureTls,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    },
    onPage: (page, ctx) =>
      options.onProgress?.({
        phase: "crawl",
        done: ctx.visited,
        total: ctx.visited + ctx.queued,
        url: page.fetch.finalUrl,
        status: page.fetch.status,
      }),
  });

  const pages: Page[] = crawlResult.pages;
  const warnings = crawlResult.errors.map((e) => `crawl: ${e.url} — ${e.message}`);

  // A page that returned a non-2xx status has no meaningful <head>, links,
  // or hreflang — linting it produces phantom "missing title/description/…"
  // findings. Split the healthy pages out and report the rest as errored.
  const okPages = pages.filter((p) => isOkStatus(p.fetch.status));
  const unreachablePages: UnreachablePage[] = pages
    .filter((p) => !isOkStatus(p.fetch.status))
    .map((p) => ({
      id: fingerprint("page", routeKey(p.fetch.finalUrl)),
      url: p.fetch.finalUrl,
      status: p.fetch.status,
    }));

  // --- SEO lint (healthy pages only) -------------------------------------
  const seoIssues: SeoIssue[] = [];
  for (const page of okPages) {
    const pageUrl = page.fetch.finalUrl;
    // A rule can fire more than once on a page (e.g. robots.conflict emits
    // both an index and a follow conflict); the occurrence index keeps their
    // fingerprints distinct without depending on the (mutable) message text.
    const occurrence = new Map<string, number>();
    for (const issue of lint(page)) {
      const n = occurrence.get(issue.ruleId) ?? 0;
      occurrence.set(issue.ruleId, n + 1);
      const rule = getRule(issue.ruleId);
      seoIssues.push({
        id: fingerprint("seo", issue.ruleId, routeKey(pageUrl), String(n)),
        pageUrl,
        ruleId: issue.ruleId,
        severity: issue.severity,
        message: issue.message,
        why: rule?.summary,
        fix: issue.fix?.snippet,
      });
    }
  }

  // --- i18n (healthy pages only) -----------------------------------------
  const matrix = buildI18nMatrix(okPages);
  const holes = deriveTranslationHoles(matrix);
  const reciprocity: ReportReciprocityIssue[] = reciprocityIssues(okPages).map((issue) => ({
    id: fingerprint(
      "i18n",
      issue.code,
      routeKey(issue.url),
      issue.peerUrl ? routeKey(issue.peerUrl) : "",
      issue.locale ?? "",
    ),
    ...issue,
  }));

  // --- Link audit over the healthy crawled page set ----------------------
  const discovery = syntheticDiscovery(origin, entry, okPages, crawlResult.truncated);
  const linkReport = await runLinkAudit(discovery, {
    allowInsecureTls: options.allowInsecureTls,
    checkExternal,
    timeoutMs: options.timeoutMs,
    maxPages,
    signal: options.signal,
    onProgress: (p) =>
      options.onProgress?.({
        phase: p.phase === "scan" ? "scan" : "links",
        done: p.done,
        total: p.total,
      }),
  });
  warnings.push(...linkReport.diagnostics.warnings);

  const brokenLinks: BrokenLink[] = [];
  for (const { pageUrl, broken } of linkReport.brokenByPage) {
    for (const check of broken) {
      brokenLinks.push({
        id: fingerprint("link", routeKey(pageUrl), targetKey(check.url)),
        pageUrl,
        href: check.url,
        status: check.status,
        verdict: check.verdict,
        reason: check.reason,
      });
    }
  }

  // A total (or near-total) scan failure means "0 broken links" is not a
  // clean bill of health — it's "we couldn't check". Say so loudly instead
  // of letting the run look green.
  const scanTargets = okPages.length;
  const scanFailed = linkReport.diagnostics.pagesFailed;
  const scanBlind = scanTargets > 0 && linkReport.pagesScanned === 0;
  if (scanBlind) {
    warnings.push(
      `Link scan failed on all ${scanFailed} page(s) — "0 broken links" is unverified, not clean.`,
    );
  } else if (scanFailed > 0 && scanFailed >= scanTargets / 2) {
    warnings.push(
      `Link scan failed on ${scanFailed} of ${scanTargets} page(s); link results are partial.`,
    );
  }

  // --- Summary + verdict -------------------------------------------------
  const brokenCount = linkReport.summary.broken;
  const seoErrorCount = seoIssues.filter((i) => i.severity === "error").length;
  const missingTranslations = holes.length + reciprocity.length;

  // A page in your own crawl that errors, or a scan that saw nothing, is a
  // hard failure — never green.
  let verdict: Verdict = "green";
  if (brokenCount > 0 || seoErrorCount > 0 || unreachablePages.length > 0 || scanBlind) {
    verdict = "red";
  } else if (missingTranslations > 0 || seoIssues.length > 0 || brokenLinks.length > 0) {
    verdict = "yellow";
  }

  return {
    url: entry,
    finishedAt: new Date().toISOString(),
    summary: {
      brokenLinks: brokenCount,
      missingTranslations,
      seoIssues: seoIssues.length,
      unreachablePages: unreachablePages.length,
      verdict,
    },
    pages: pages.map((p) => ({
      url: p.fetch.finalUrl,
      status: p.fetch.status,
      locale: localeOfUrl(p.fetch.finalUrl),
    })),
    unreachablePages,
    brokenLinks,
    missingTranslations: { holes, reciprocity },
    seoIssues,
    diagnostics: {
      pagesCrawled: pages.length,
      pagesScanned: linkReport.pagesScanned,
      pagesFailed: linkReport.diagnostics.pagesFailed,
      truncated: crawlResult.truncated || linkReport.truncated,
      warnings,
    },
  };
}

/** Build a `SiteDiscovery` from the crawl result so the link audit can reuse the page set. */
function syntheticDiscovery(
  origin: string,
  baseUrl: string,
  pages: Page[],
  truncated: boolean,
): SiteDiscovery {
  return {
    origin,
    baseUrl,
    source: "crawl",
    urls: pages.map((p) => ({ loc: p.fetch.finalUrl })),
    diagnostics: {
      found: false,
      status: 0,
      declaredInRobots: false,
      robotsFound: false,
      atWellKnownPath: false,
      wellFormed: false,
      isIndex: false,
      childSitemapCount: 0,
      childSitemapErrors: 0,
      urlCount: pages.length,
      warnings: [],
    },
    truncated,
  };
}
