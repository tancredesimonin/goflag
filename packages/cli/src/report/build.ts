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
import { matchesAny } from "../lib/core/glob";
import { sortIssues } from "../lib/core/lint";
import { lintSite } from "../lib/core/lint-site";
import {
  buildI18nMatrix,
  looksLikeLocaleSegment,
  reciprocityIssues,
  type I18nMatrix,
} from "../lib/core/i18n";
import { deriveLocaleAxis, suggestedLocales } from "../lib/core/locales";
import { discoverSitemap } from "../lib/core/sitemap/discover";
import { selectByStructure } from "../lib/core/coverage";
import { probeRobots } from "../lib/core/probes/robots";
import { collectAdvisories } from "../lib/rules/advisory";
import { evaluateRules, findingsToIssues } from "../lib/rules/evaluate";
import { extractionFromPage } from "../lib/rules/extraction/from-page";
import { DEFAULT_PROFILE, rulesForProfile } from "../lib/rules/profiles";
import { PROSE_RULES } from "../lib/rules/prose";
import { getSiteRule } from "../lib/rules/site-rules";
import type { SiteContext } from "../lib/rules/site-types";
import { runLinkAudit } from "../lib/core/links/audit";
import { normalizeInputUrl } from "../lib/core/net/normalize-url";
import type { SiteDiscovery } from "../lib/core/sitemap/types";
import type { Page } from "../lib/core/types";
import { buildConformance, type ConformanceRow } from "./conformance";
import { fingerprint, routeKey, targetKey } from "./fingerprint";
import type {
  BrokenLink,
  GoflagReport,
  ReportAdvisory,
  ReportReciprocityIssue,
  SeoIssue,
  SiteIssue,
  TranslationHole,
  UnreachablePage,
  Verdict,
} from "./types";

/** A 2xx response is the only "healthy" page we lint / audit for i18n. */
function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Content types whose `<head>` is worth judging.
 *
 * A crawl follows links, and links point at PDFs, images and feeds as readily
 * as at pages. Linting those produces a full set of phantom findings — a PDF
 * has no `<title>`, no canonical, no viewport — and on tancrede.eu a single
 * linked CV was the only `error`-severity finding in the run, which is the
 * difference between a red and a yellow CI gate.
 *
 * An empty content type is treated as HTML: some servers omit it, and being
 * silent about a real page is worse than one stray finding.
 */
function isHtmlPage(page: Page): boolean {
  const type = page.fetch.contentType?.trim().toLowerCase();
  if (!type) return true;
  return type === "text/html" || type === "application/xhtml+xml";
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
  /**
   * How to choose which pages to audit.
   *
   * `structural` keeps every page that stands alone and samples families of
   * pages built from one template — `docs/coverage-plan.md`. `all` is the old
   * behaviour: take what the sitemap lists in order, until `maxPages`.
   *
   * Defaults to `structural` when a sitemap was found, `all` otherwise: with
   * no list of URLs up front there is no structure to select from.
   */
  coverage?: "structural" | "all";
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
  /**
   * Locales the site serves, when the operator knows better than we can infer
   * (`--locales fr,en,pt-br`). Strongest input to the locale axis.
   */
  locales?: string[];
  /**
   * Routes (locale-free, glob-matched) that are deliberately not translated
   * everywhere, so their gaps are not reported as missing translations.
   * Suppression is counted in `diagnostics.ignoredHoles` — a silenced finding
   * that leaves no trace reads as "nothing was wrong".
   */
  ignoreHoles?: string[];
  /**
   * Skip sitemap discovery and seed the crawl from `<url>` alone. Defaults to
   * false — discovery is on by default because crawl-only discovery is exactly
   * what made hreflang checks silently vacuous.
   */
  noSitemap?: boolean;
  /**
   * Named policy overlay applied to the rule registry (`--profile`), e.g.
   * `strict` or `spec-only`. Defaults to `default` (no overlay). Throws on
   * an unknown name rather than auditing under a policy nobody asked for.
   */
  profile?: string;
  /**
   * Emit the rule × page conformance matrix (`--conformance`): every rule's
   * status on every page, passing ones included. Off by default because it
   * is the largest section of the report and only an agent (or a coverage
   * question) wants it.
   */
  conformance?: boolean;
  /**
   * Emit prose rules with their evidence bundles (`--advisories`). These
   * carry no verdict and never affect the gate.
   */
  advisories?: boolean;
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
 *
 * `ignoreRoutes` globs out routes the operator has declared intentionally
 * partial. A site has no markup for "this page does not exist here on
 * purpose", so a deliberate gap and a forgotten one are indistinguishable from
 * outside — only the operator can tell them apart. Without a way to say so, the
 * report can never reach zero on a site with a jurisdiction-specific legal
 * page, and a report that can never be clean teaches its reader to ignore it.
 *
 * Globs match the locale-free route (`/legal`, `/blog/**`), using the same
 * matcher as `--include`/`--exclude`.
 */
export function deriveTranslationHoles(
  matrix: I18nMatrix,
  ignoreRoutes: readonly string[] = [],
): TranslationHole[] {
  const realLocales = matrix.locales.filter((l) => l !== "x-default");
  if (realLocales.length < 2) return [];

  const holes: TranslationHole[] = [];
  for (const route of matrix.routes) {
    if (ignoreRoutes.length > 0 && matchesAny(route, [...ignoreRoutes])) continue;
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
 * The severity at or above which findings should fail the process.
 *
 * `warning` is the historical behaviour (any finding fails). `error` lets a
 * team adopt goflag on a site that is not clean yet: warnings stay visible in
 * the report while only hard errors block a merge. `never` reports without
 * ever failing, for exploratory runs.
 */
export type FailOn = "warning" | "error" | "never";

/**
 * Map a report to a process exit code:
 *   0 = clean (or below the failure threshold), 1 = findings at/above it.
 * Used by the CLI as a CI gate.
 *
 * `red` always fails unless `never`: a red verdict also covers broken links,
 * unreachable pages and a blind link scan — states where "no findings" would
 * be a lie rather than a pass.
 */
export function exitCode(report: GoflagReport, failOn: FailOn = "warning"): number {
  if (failOn === "never") return 0;
  if (report.summary.verdict === "green") return 0;
  if (failOn === "error") return report.summary.verdict === "red" ? 1 : 0;
  return 1;
}

/**
 * Drop pages the site itself says are duplicates.
 *
 * A cross-URL `<link rel="canonical">` is an explicit statement: "index that
 * one instead of me." Linting the variant anyway judges a page the site has
 * already disclaimed, and multiplies every finding by however many variants
 * exist. On stereo.house, 14 of 41 crawled pages were `?tag=` filters of one
 * library page — all correctly declaring the same canonical — and they carried
 * 14 of the 38 SEO findings. Better than a third of the report was one page,
 * counted fourteen times.
 *
 * The guard matters: a variant is only dropped when its canonical target was
 * actually crawled. Otherwise the canonical points somewhere we never looked,
 * and dropping the variant would remove the route from the audit entirely —
 * trading duplicate findings for no findings, which is the worse failure.
 *
 * Variants stay in the crawl either way, so the link audit still probes them.
 */
function dropCanonicalDuplicates(pages: Page[]): { kept: Page[]; dropped: number } {
  const crawled = new Set(pages.map((p) => routeKey(p.fetch.finalUrl)));

  const kept = pages.filter((page) => {
    const canonical = page.links.canonical;
    if (!canonical) return true;

    const self = routeKey(page.fetch.finalUrl);
    let target: string;
    try {
      target = routeKey(new URL(canonical, page.fetch.finalUrl).toString());
    } catch {
      return true;
    }

    if (target === self) return true;
    return !crawled.has(target);
  });

  return { kept, dropped: pages.length - kept.length };
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

  // Resolved before the crawl, and once for the whole run: every page is
  // judged under the same policy, and an unknown profile name fails here
  // rather than after a full crawl — or, worse, quietly under `default`.
  const profile = options.profile ?? DEFAULT_PROFILE;
  const rules = rulesForProfile(profile);

  // --- Sitemap discovery (independent of the markup we are about to judge) --
  //
  // Runs *before* the crawl so its URLs can seed the frontier. `crawlFallback`
  // is off: the crawl below is the fallback, and running a second one here
  // would double the work for nothing.
  const discovery = options.noSitemap
    ? undefined
    : await discoverSitemap(entry, {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        allowInsecureTls: options.allowInsecureTls,
        crawlFallback: false,
      }).catch(() => undefined);

  const allSitemapUrls = (discovery?.urls ?? []).map((u) => u.loc);

  // Which pages to audit, chosen by the shape of the site rather than by the
  // order the crawl happens to reach them. Only possible with a sitemap: with
  // no list of URLs up front there is no structure to select from, so the
  // fallback is the old behaviour and says so.
  const coverageMode = options.coverage ?? (allSitemapUrls.length > 0 ? "structural" : "all");
  const selection =
    coverageMode === "structural" && allSitemapUrls.length > 0
      ? selectByStructure(allSitemapUrls, { locales: options.locales })
      : undefined;
  const sitemapUrls = selection?.urls ?? allSitemapUrls;

  // A selection is already the answer to "how many", so the 200-page default
  // must not cut it short — that would reintroduce the arbitrary truncation it
  // exists to replace.
  //
  // The headroom is not decoration. The crawl also fetches the entry URL and
  // whatever it redirects to, and those are pages the selection never named: a
  // cap set to the selection size exactly let the entry consume a slot and
  // pushed a real page out. Measured on tancrede, which lost
  // `/es/privacy-policy` to an off-by-one nobody would have noticed in a
  // report that still looked complete.
  //
  // Keeping the default as a floor also preserves what a small site had
  // before: room to follow a link to a page the sitemap forgot, which is a
  // finding rather than noise.
  const effectiveMaxPages = selection
    ? Math.max(options.maxPages ?? maxPages, selection.urls.length + 5)
    : maxPages;

  // Fetched independently of sitemap discovery: `--no-sitemap` must not also
  // blind the robots rules, and one small request is cheaper than the class of
  // bug a site-wide `Disallow: /` represents.
  const robots = await probeRobots(origin, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  }).catch(() => undefined);

  // --- Crawl (drives SEO lint + i18n) ------------------------------------
  const crawlResult = await crawl({
    entryUrl: entry,
    seedUrls: sitemapUrls,
    depth,
    maxPages: effectiveMaxPages,
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

  // Said out loud rather than absorbed. A retry that nobody hears about turns
  // "the site answered" and "the site answered the second time we asked" into
  // the same report, and the difference is the whole reason a page went
  // missing from a baseline in the first place. It does not gate — the page was
  // audited, there is no hole — but a number that climbs run after run is a
  // site getting slower, and this is where you would see it.
  if (crawlResult.recovered.length > 0) {
    warnings.push(
      `${crawlResult.recovered.length} page(s) failed once and answered on retry: ` +
        `${crawlResult.recovered.slice(0, 3).join(", ")}` +
        `${crawlResult.recovered.length > 3 ? `, +${crawlResult.recovered.length - 3} more` : ""}.`,
    );
  }

  // A page that returned a non-2xx status has no meaningful <head>, links,
  // or hreflang — linting it produces phantom "missing title/description/…"
  // findings. Split the healthy pages out and report the rest as errored.
  const okPages = pages.filter((p) => isOkStatus(p.fetch.status));
  // Linked resources stay in the crawl (the link audit must still probe them)
  // but never reach the rule layer, which only speaks about HTML documents.
  const documents = okPages.filter(isHtmlPage);
  const { kept: htmlPages, dropped: duplicatePages } = dropCanonicalDuplicates(documents);
  // Two ways a page fails to be audited, and both belong here.
  //
  // A non-2xx answer is the obvious one. The other is a page that never
  // answered at all — a timeout, a reset, a DNS failure — which `crawl` puts in
  // `errors` rather than in `pages`. That one used to leave nothing behind but
  // a warning line, and warnings do not gate: the run stayed green, the report
  // looked complete, and the page silently left the audited set. Its slot in
  // the crawl budget then went to whatever the frontier offered next, so the
  // page *set* changed too.
  //
  // That is what poisons a baseline. Captured with four timeouts, a baseline
  // holds four pages the next run will not have and misses four it will,
  // and `--regressions-only` reports the difference as regressions on a branch
  // that touched nothing. Measured on openfinanceguide 2026-08-09: four STET
  // endpoint pages timed out at capture, and the merge request after it failed
  // on one "new" finding that had been on that template all along.
  //
  // `status: 0` is what the schema already reserved for a network error. This
  // is the first thing to produce it.
  const unreachablePages: UnreachablePage[] = [
    ...pages
      .filter((p) => !isOkStatus(p.fetch.status))
      .map((p) => ({
        id: fingerprint("page", routeKey(p.fetch.finalUrl)),
        url: p.fetch.finalUrl,
        status: p.fetch.status,
      })),
    ...crawlResult.errors.map((e) => ({
      id: fingerprint("page", routeKey(e.url)),
      url: e.url,
      status: 0,
    })),
  ];

  // --- SEO lint (healthy pages only) -------------------------------------
  //
  // Each page is projected onto the extraction and evaluated exactly once,
  // whatever the caller asked for: the violations list, the conformance
  // matrix and the advisory bundles are three narrowings of that single
  // evaluation, not three passes over the page.
  const seoIssues: SeoIssue[] = [];
  const conformanceRows: ConformanceRow[] = [];
  const advisories: ReportAdvisory[] = [];
  // Resolved from the *effective* rules, not the global registry: one issue
  // must not read its severity from one rule set and its `why` from another.
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  for (const page of htmlPages) {
    const pageUrl = page.fetch.finalUrl;
    const extraction = extractionFromPage(page);
    const evaluation = evaluateRules(extraction, rules);
    if (options.conformance) {
      conformanceRows.push({ pageUrl, findings: evaluation.findings });
    }
    if (options.advisories) {
      for (const advisory of collectAdvisories(extraction, PROSE_RULES)) {
        advisories.push({
          ...advisory,
          id: fingerprint("advisory", advisory.ruleId, routeKey(pageUrl)),
          pageUrl,
        });
      }
    }
    // The occurrence index keeps fingerprints distinct if a rule ever fires
    // more than once on a page, without depending on the (mutable) message.
    const occurrence = new Map<string, number>();
    for (const issue of sortIssues(findingsToIssues(evaluation, rules))) {
      const n = occurrence.get(issue.ruleId) ?? 0;
      occurrence.set(issue.ruleId, n + 1);
      const rule = ruleById.get(issue.ruleId);
      seoIssues.push({
        id: fingerprint("seo", issue.ruleId, routeKey(pageUrl), String(n)),
        pageUrl,
        ruleId: issue.ruleId,
        severity: issue.severity,
        message: issue.message,
        why: rule?.title,
        fix: issue.fix?.snippet,
      });
    }
  }

  // --- i18n (healthy pages only) -----------------------------------------
  //
  // The locale axis is unioned from three independent sources so that a site
  // declaring no `hreflang` at all can still be recognised as multilingual —
  // the failure the crawl-only axis could not see. Sitemap URLs are also fed
  // to the matrix as declared-but-uncrawled cells, so a route missing from a
  // locale reads as a hole rather than as absence of evidence.
  const localeAxis = deriveLocaleAxis({
    explicit: options.locales,
    sitemapUrls,
    pages: htmlPages,
  });

  // With no declared axis we do not invent one — but staying silent about it
  // would look identical to "this site is fine", which is the failure mode
  // phase 1 existed to remove. Say what we saw and what to pass instead.
  if (localeAxis.source === "none" && localeAxis.candidates.length > 0) {
    const suggestion = suggestedLocales(localeAxis);
    warnings.push(
      suggestion
        ? `No sitemap and no --locales: i18n checks are off. Locale-looking prefixes found — re-run with \`--locales ${suggestion}\` to enable them.`
        : `No sitemap and no --locales: i18n checks are off. Prefixes seen (${localeAxis.candidates
            .map((c) => c.tag)
            .join(", ")}) do not look like locales; pass --locales if any of them is one.`,
    );
  }

  const matrix = buildI18nMatrix(htmlPages, {
    declaredUrls: sitemapUrls,
    locales: localeAxis.locales,
  });
  // Holes are a claim about locale coverage. With no declared axis we have
  // just refused to claim the site is multilingual, so claiming it is missing
  // translations would contradict that — and it is exactly how `/cv` (a CV
  // page served in French) produced 31 phantom holes on tancrede.eu.
  const holes = localeAxis.multilingual ? deriveTranslationHoles(matrix, options.ignoreHoles) : [];
  // Count what the exclusion hid, so the number is auditable rather than a
  // silent shrink between two runs.
  const ignoredHoles =
    localeAxis.multilingual && (options.ignoreHoles?.length ?? 0) > 0
      ? deriveTranslationHoles(matrix).length - holes.length
      : 0;
  const reciprocity: ReportReciprocityIssue[] = reciprocityIssues(htmlPages).map((issue) => ({
    id: fingerprint(
      "i18n",
      issue.code,
      routeKey(issue.url),
      issue.peerUrl ? routeKey(issue.peerUrl) : "",
      issue.locale ?? "",
    ),
    ...issue,
  }));

  // --- Cross-page rules ---------------------------------------------------
  const siteContext: SiteContext = {
    origin,
    pages: htmlPages,
    matrix,
    localeAxis,
    discovery,
    robots,
  };
  // Fingerprints key on (rule, page, occurrence-within-that-pair) rather than
  // a global index, so adding or reordering a rule cannot renumber unrelated
  // findings and invalidate a stored baseline.
  const siteOccurrence = new Map<string, number>();
  const siteIssues: SiteIssue[] = lintSite(siteContext).map((draft) => {
    const key = `${draft.ruleId}\u0000${draft.pageUrl}`;
    const n = siteOccurrence.get(key) ?? 0;
    siteOccurrence.set(key, n + 1);
    const rule = getSiteRule(draft.ruleId);
    return {
      id: fingerprint("site", draft.ruleId, routeKey(draft.pageUrl), String(n)),
      pageUrl: draft.pageUrl,
      ruleId: draft.ruleId,
      severity: draft.severity,
      message: draft.message,
      why: rule?.summary,
      fix: draft.fix?.snippet,
    };
  });

  // --- Link audit over the healthy crawled page set ----------------------
  //
  // `effectiveMaxPages`, not `maxPages`. The crawl was told the selection is
  // the answer to "how many"; this pass was still being told 200, so a
  // structural run crawled and linted 748 pages and scanned links on the first
  // 200 of them. Nothing said so usefully either — the report carried
  // `truncated: true` and "Site has 753 pages; only the first 200 were
  // scanned" while listing 748, which reads as a display bug rather than as
  // the coverage claim it was. `0 broken links` then meant 200 pages, on a
  // report that said 748.
  const linkDiscovery = syntheticDiscovery(origin, entry, okPages, crawlResult.truncated);
  const linkReport = await runLinkAudit(linkDiscovery, {
    allowInsecureTls: options.allowInsecureTls,
    checkExternal,
    timeoutMs: options.timeoutMs,
    maxPages: effectiveMaxPages,
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
  const errorCount =
    seoIssues.filter((i) => i.severity === "error").length +
    siteIssues.filter((i) => i.severity === "error").length;
  const missingTranslations = holes.length + reciprocity.length;
  const anyFinding =
    missingTranslations > 0 ||
    seoIssues.length > 0 ||
    siteIssues.length > 0 ||
    brokenLinks.length > 0;

  // Reaching nothing at all is not a clean bill of health — it is a failed
  // audit wearing one. Without this, an unreachable host, a DNS blip or a
  // mid-run network drop reports GREEN with zero findings, which is the most
  // dangerous output the tool can produce.
  const crawlBlind = pages.length === 0;
  if (crawlBlind) {
    warnings.push(
      `Crawled 0 pages from ${entry} — the audit reached nothing, so "no findings" is unverified, not clean.`,
    );
  }

  // A page in your own crawl that errors, or a scan that saw nothing, is a
  // hard failure — never green.
  let verdict: Verdict = "green";
  if (crawlBlind || brokenCount > 0 || errorCount > 0 || unreachablePages.length > 0 || scanBlind) {
    verdict = "red";
  } else if (anyFinding) {
    verdict = "yellow";
  }

  return {
    url: entry,
    finishedAt: new Date().toISOString(),
    profile,
    summary: {
      brokenLinks: brokenCount,
      missingTranslations,
      seoIssues: seoIssues.length,
      siteIssues: siteIssues.length,
      unreachablePages: unreachablePages.length,
      verdict,
    },
    localeAxis: {
      locales: localeAxis.locales,
      source: localeAxis.source,
      multilingual: localeAxis.multilingual,
      ...(localeAxis.candidates.length > 0 ? { candidates: localeAxis.candidates } : {}),
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
    siteIssues,
    // Both sections are omitted entirely when not asked for, rather than
    // emitted empty: an empty `advisories: []` would read as "no prose rule
    // has anything to ask about this site", which is a claim goflag has not
    // made.
    ...(options.conformance ? { conformance: buildConformance(rules, conformanceRows) } : {}),
    ...(options.advisories ? { advisories } : {}),
    diagnostics: {
      pagesCrawled: pages.length,
      pagesScanned: linkReport.pagesScanned,
      pagesFailed: linkReport.diagnostics.pagesFailed,
      truncated: crawlResult.truncated || linkReport.truncated,
      warnings,
      // What the run actually looked at. A sampled audit that does not say so
      // is a partial audit wearing the face of a complete one, which is worse
      // than the cap it replaces.
      coverage: {
        mode: coverageMode,
        ...(selection
          ? {
              considered: selection.total,
              selected: selection.urls.length,
              families: selection.families,
            }
          : {}),
      },
      ...(ignoredHoles > 0 ? { ignoredHoles } : {}),
      ...(duplicatePages > 0 ? { duplicatePages } : {}),
      ...(discovery
        ? {
            sitemap: {
              found: discovery.diagnostics.found,
              sitemapUrl: discovery.diagnostics.sitemapUrl,
              urlCount: allSitemapUrls.length,
              uncrawled: countUncrawled(sitemapUrls, pages),
              ...(discovery.diagnostics.unreachable
                ? { unreachable: discovery.diagnostics.unreachable }
                : {}),
            },
          }
        : {}),
    },
  };
}

/**
 * How many sitemap URLs the crawl never reached — usually because `maxPages`
 * capped it. Reported so "no findings on those routes" is never mistaken for
 * "those routes are fine".
 */
function countUncrawled(sitemapUrls: string[], pages: Page[]): number {
  const crawled = new Set(pages.map((p) => p.fetch.finalUrl));
  let n = 0;
  for (const url of sitemapUrls) if (!crawled.has(url)) n += 1;
  return n;
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
