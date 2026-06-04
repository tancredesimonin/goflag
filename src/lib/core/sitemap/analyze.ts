/**
 * Strengthened sitemap analysis.
 *
 * `discoverSitemap` answers the cheap structural questions (found?
 * well-formed? index? how many URLs?). This module adds the deeper health
 * signals the spec calls for, reusing the link engine's `checkLink` for
 * entry reachability so we don't duplicate fetch logic:
 *
 *   - entry reachability (% of `<loc>` returning 2xx),
 *   - `lastmod` hygiene (missing / malformed / future-dated),
 *   - protocol & host consistency (http vs https, www vs apex),
 *   - robots.txt conflicts (entries disallowed for `*`),
 *   - orphan pages (linked internally but absent from the sitemap).
 *
 * The cheap signals are pure (`analyzeEntries`); reachability + robots are
 * computed against the real network in `analyzeSitemapHealth`. Never
 * throws.
 */

import { checkLink } from "../links/check";
import { probeRobots } from "../probes/robots";
import { canonicaliseUrl } from "../crawl";
import type { LinkCheck } from "../links/types";
import type { SiteDiscovery, SitemapUrlEntry } from "./types";

export interface EntryStats {
  /** Entries with missing / malformed / future-dated `<lastmod>`. */
  lastmodIssues: number;
  /** Entries mix http and https. */
  mixedProtocol: boolean;
  /** Entries mix hosts (e.g. www vs apex). */
  mixedHost: boolean;
}

export interface SitemapHealth extends EntryStats {
  reachable: { checked: number; ok: number; broken: number; redirected: number };
  robotsConflicts: number;
  orphanCount: number;
  /** Internal pages linked across the site but missing from the sitemap. */
  orphans: string[];
  /** Per-entry reachability checks, keyed by entry URL. */
  checks: Record<string, LinkCheck>;
  /** True when reachability probing was capped. */
  truncated: boolean;
}

export interface AnalyzeSitemapOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  allowInsecureTls?: boolean;
  /** Cap on reachability probes. Defaults to 200. */
  maxProbe?: number;
  /** Probe concurrency. Defaults to 8. */
  concurrency?: number;
  /** Skip the reachability probe entirely (cheap-only analysis). */
  probeReachability?: boolean;
  /** Internal URLs linked across the site, for orphan detection. */
  linkedInternalUrls?: string[];
  /** Injectable sleep forwarded to checkLink (tests). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = { maxProbe: 200, concurrency: 8 };

/** Pure: compute lastmod hygiene + protocol/host consistency from entries. */
export function analyzeEntries(urls: SitemapUrlEntry[], now: number = Date.now()): EntryStats {
  let lastmodIssues = 0;
  const protocols = new Set<string>();
  const hosts = new Set<string>();

  for (const entry of urls) {
    if (lastmodHasIssue(entry.lastmod, now)) lastmodIssues += 1;
    try {
      const u = new URL(entry.loc);
      protocols.add(u.protocol);
      hosts.add(u.host);
    } catch {
      // An un-parseable loc is itself a problem, but it is surfaced by the
      // reachability probe; don't double-count it here.
    }
  }

  return {
    lastmodIssues,
    mixedProtocol: protocols.size > 1,
    mixedHost: hosts.size > 1,
  };
}

function lastmodHasIssue(lastmod: string | undefined, now: number): boolean {
  if (!lastmod) return true; // missing
  const parsed = Date.parse(lastmod);
  if (Number.isNaN(parsed)) return true; // malformed
  if (parsed > now) return true; // future-dated
  return false;
}

/** Full health analysis: cheap signals + reachability + robots + orphans. */
export async function analyzeSitemapHealth(
  discovery: SiteDiscovery,
  options: AnalyzeSitemapOptions = {},
): Promise<SitemapHealth> {
  const entryStats = analyzeEntries(discovery.urls);
  const maxProbe = options.maxProbe ?? DEFAULTS.maxProbe;

  // --- Reachability -------------------------------------------------------
  const checks: Record<string, LinkCheck> = {};
  const reachable = { checked: 0, ok: 0, broken: 0, redirected: 0 };
  let truncated = false;

  if (options.probeReachability !== false) {
    const entries = discovery.urls.map((u) => u.loc);
    const toProbe = entries.slice(0, maxProbe);
    if (entries.length > maxProbe) truncated = true;

    await pool(
      toProbe,
      options.concurrency ?? DEFAULTS.concurrency,
      options.signal,
      async (url) => {
        const check = await checkLink(url, {
          timeoutMs: options.timeoutMs,
          allowInsecureTls: options.allowInsecureTls,
          signal: options.signal,
          sleep: options.sleep,
        });
        checks[url] = check;
        reachable.checked += 1;
        if (check.verdict === "ok") reachable.ok += 1;
        else if (check.verdict === "redirect") reachable.redirected += 1;
        else reachable.broken += 1;
      },
    );
  }

  // --- robots.txt conflicts ----------------------------------------------
  const robotsConflicts = await countRobotsConflicts(discovery, options.signal);

  // --- Orphans ------------------------------------------------------------
  const orphans = findOrphans(discovery, options.linkedInternalUrls ?? []);

  return {
    ...entryStats,
    reachable,
    robotsConflicts,
    orphanCount: orphans.length,
    orphans,
    checks,
    truncated,
  };
}

/** Pages linked internally that are not present in the sitemap. */
function findOrphans(discovery: SiteDiscovery, linkedInternalUrls: string[]): string[] {
  const inSitemap = new Set<string>();
  for (const entry of discovery.urls) {
    const c = canonicaliseUrl(entry.loc);
    if (c) inSitemap.add(c);
  }
  const orphans = new Set<string>();
  for (const linked of linkedInternalUrls) {
    const c = canonicaliseUrl(linked);
    if (!c) continue;
    if (originOf(c) !== discovery.origin) continue;
    if (!inSitemap.has(c)) orphans.add(c);
  }
  return Array.from(orphans).sort();
}

async function countRobotsConflicts(
  discovery: SiteDiscovery,
  signal: AbortSignal | undefined,
): Promise<number> {
  const robots = await probeRobots(discovery.origin, { signal });
  if (!robots.found || !robots.raw) return 0;
  const disallows = parseWildcardDisallows(robots.raw);
  if (disallows.length === 0) return 0;

  let conflicts = 0;
  for (const entry of discovery.urls) {
    let path: string;
    try {
      path = new URL(entry.loc).pathname;
    } catch {
      continue;
    }
    if (disallows.some((rule) => pathDisallowed(path, rule))) conflicts += 1;
  }
  return conflicts;
}

/** Disallow paths declared for the `*` user-agent group. */
export function parseWildcardDisallows(raw: string): string[] {
  const out: string[] = [];
  let inWildcard = false;
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    const ua = /^User-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      inWildcard = ua[1]!.trim() === "*";
      continue;
    }
    if (!inWildcard) continue;
    const dis = /^Disallow:\s*(.*)$/i.exec(line);
    if (dis) {
      const path = dis[1]!.trim();
      if (path.length > 0) out.push(path);
    }
  }
  return out;
}

/** A minimal robots path-prefix match (supports a trailing `*` wildcard). */
export function pathDisallowed(path: string, rule: string): boolean {
  if (rule === "/") return true;
  if (rule.endsWith("*")) return path.startsWith(rule.slice(0, -1));
  return path === rule || path.startsWith(rule);
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Minimal concurrency pool (single host group). */
function pool<T>(
  items: T[],
  concurrency: number,
  signal: AbortSignal | undefined,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (items.length === 0) {
      resolve();
      return;
    }
    let index = 0;
    let active = 0;
    let settled = false;
    const limit = Math.max(1, concurrency);

    const launch = () => {
      if (settled) return;
      if (signal?.aborted) {
        if (active === 0) {
          settled = true;
          resolve();
        }
        return;
      }
      while (active < limit && index < items.length) {
        const item = items[index++]!;
        active += 1;
        void worker(item)
          .catch(() => undefined)
          .finally(() => {
            active -= 1;
            if (index >= items.length && active === 0) {
              settled = true;
              resolve();
            } else {
              launch();
            }
          });
      }
      if (index >= items.length && active === 0) {
        settled = true;
        resolve();
      }
    };

    launch();
  });
}
