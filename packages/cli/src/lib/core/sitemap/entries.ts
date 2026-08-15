/**
 * What is actually served at the URLs a sitemap promises.
 *
 * `docs/sitemap-robots-plan.md` §4.5 asks for two judgments — an entry that
 * 404s, and one that redirects — and both need an answer per URL that the
 * rules cannot go and get: a `SiteRule` is a pure function of a `SiteContext`,
 * the same discipline that keeps page rules testable without a network.
 *
 * **Nothing here is fetched twice.** The plan's word is "global dedupe", and a
 * sitemap entry usually already has an answer by the time this runs: the crawl
 * visited it, or the link audit probed it because some page linked to it. Only
 * what is left over is fetched, which on a well-built site is close to nothing
 * — the sitemap and the link graph describe the same pages. On a site where
 * they do not, the leftovers *are* the finding.
 *
 * `via` records which of the three it was, so a report can say where its
 * answer came from rather than implying it went and looked.
 */

import { checkLink } from "../links/check";
import type { LinkCheck } from "../links/types";
import type { SitemapEntryProbe } from "../types";

export interface ProbeEntriesOptions {
  /** Answers the crawl already has: URL → status. */
  crawled: Map<string, number>;
  /** Answers the link audit already has. */
  checked: Map<string, LinkCheck>;
  /** Hard cap on URLs fetched here. The link audit's, for the same reason. */
  maxProbes: number;
  concurrency?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  allowInsecureTls?: boolean;
}

export interface ProbeEntriesResult {
  byUrl: Map<string, SitemapEntryProbe>;
  /** Entries with no answer at all, because the cap stopped this pass. */
  unprobed: number;
}

/**
 * Answer for as many entries as the caps allow.
 *
 * The count of what it could not reach is returned rather than swallowed: a
 * rule that says "3 entries are unreachable" out of a sitemap where 400 were
 * never checked is telling a true sentence that reads as a false one, and
 * `unprobed` is what lets the finding say so.
 */
export async function probeSitemapEntries(
  locs: readonly string[],
  options: ProbeEntriesOptions,
): Promise<ProbeEntriesResult> {
  const byUrl = new Map<string, SitemapEntryProbe>();
  const toFetch: string[] = [];

  for (const loc of locs) {
    if (byUrl.has(loc)) continue;

    const crawled = options.crawled.get(loc);
    if (crawled !== undefined) {
      byUrl.set(loc, { url: loc, status: crawled, via: "crawl", finalUrl: loc, redirected: false });
      continue;
    }

    const checked = options.checked.get(loc);
    if (checked) {
      byUrl.set(loc, fromCheck(loc, checked, "link-audit"));
      continue;
    }

    toFetch.push(loc);
  }

  const budget = toFetch.slice(0, options.maxProbes);
  const unprobed = toFetch.length - budget.length;

  const queue = [...budget];
  const workers = Math.min(options.concurrency ?? 6, queue.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let url = queue.pop(); url !== undefined; url = queue.pop()) {
        const check = await checkLink(url, {
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          allowInsecureTls: options.allowInsecureTls,
        }).catch(() => undefined);
        if (check) byUrl.set(url, fromCheck(url, check, "probe"));
      }
    }),
  );

  return { byUrl, unprobed };
}

function fromCheck(
  url: string,
  check: LinkCheck,
  via: SitemapEntryProbe["via"],
): SitemapEntryProbe {
  return {
    url,
    status: check.status,
    via,
    finalUrl: check.finalUrl,
    // A redirect that resolved, or one that did not: either way the entry did
    // not name the URL that answers, which is what the rule is about.
    redirected: check.finalUrl !== url || check.redirectChain.length > 0,
  };
}
