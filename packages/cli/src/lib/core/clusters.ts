/**
 * Which URLs are the same page in another language, when the path cannot say.
 *
 * The matrix keys a row on the pathname minus its locale segment, so a site
 * that translates its slugs — `/en/pricing` and `/fr/tarifs` — gets two rows,
 * each filled in one locale, and two translation holes on a pair that is
 * perfectly translated. Measured: 16 false holes out of 17 routes on a
 * nine-pair site (`docs/i18n-cluster-plan.md` §1).
 *
 * The pairing evidence comes from the **sitemap**, not from the crawled
 * `<head>`s, and the reason is measured rather than aesthetic: structural
 * coverage samples each locale independently, so on a slug-translating family
 * the two locales draw disjoint pages — 0 of 8 pairs had both sides sampled
 * (§2). Pairing needs a member that is *known*, and a `<url>` entry names its
 * whole cluster whether or not any member was fetched.
 *
 * Two lines this must not cross, both of them judged objections (§6):
 *
 *   1. **A declaration decides identity, never existence.** It says "these URLs
 *      are one page"; it does not say the pages are there. The same fixture
 *      that supplies the clusters advertises six targets it does not serve, and
 *      believing those would bury six real holes.
 *   2. **The label cannot depend on the membership.** A key derived from "the
 *      smallest member" is renamed when a locale is added, which moves every
 *      finding's fingerprint and reddens a baseline on a site where nothing
 *      moved. So the anchor is `x-default` — a declaration the site makes about
 *      itself, unchanged when a member joins — and a cluster without one is not
 *      merged at all.
 */

import { splitRoute } from "./i18n";
import type { SitemapUrlEntry } from "./sitemap/types";

export interface ClusterIndex {
  /**
   * The row a URL belongs to, or `undefined` when nothing declared one — in
   * which case the caller keeps its pathname-derived route and today's
   * behaviour is unchanged.
   */
  routeOf(url: string): string | undefined;
  /** How many clusters were formed. Reported so a merge is never invisible. */
  size: number;
  /**
   * URLs a second entry tried to move into a different cluster. Kept rather
   * than resolved: a site declaring one URL into two clusters is contradicting
   * itself, and the report should say so rather than pick a winner quietly.
   */
  conflicts: string[];
}

/** Trailing slash and fragment dropped; origin, path and query kept. */
function normalise(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  url.hash = "";
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return `${url.origin}${path}${url.search}`;
}

const X_DEFAULT = "x-default";

/**
 * Build the cluster index from the sitemap's own cluster declarations.
 *
 * Only `xhtml:link rel="alternate"` is read. No canonical edge: a canonical is
 * self-referential per locale on every fixture and every field site measured,
 * it is already consumed as a duplicate signal, and it is the largest
 * silent-merge surface the design was offered — it buys nothing here and can
 * collapse two unrelated rows into one.
 */
export function buildClusterIndex(entries: readonly SitemapUrlEntry[]): ClusterIndex {
  const routeByUrl = new Map<string, string>();
  const conflicts: string[] = [];
  const anchors = new Set<string>();

  for (const entry of entries) {
    const alternates = entry.alternates;
    if (!alternates || alternates.length === 0) continue;

    const xDefault = alternates.find((a) => a.hreflang.trim().toLowerCase() === X_DEFAULT);
    // No anchor, no merge. Picking one from the members would make the row's
    // name a function of who is in it, which is the fingerprint churn this
    // exists to avoid.
    if (!xDefault) continue;

    const anchorUrl = normalise(xDefault.href);
    if (!anchorUrl) continue;

    const { route: anchorRoute } = splitRoute(new URL(anchorUrl).pathname);
    anchors.add(anchorRoute);

    // The entry's own URL belongs to the cluster it declares, even when the
    // alternate list omits it — a site is not obliged to list itself, though
    // Google asks it to.
    const members = [entry.loc, ...alternates.map((a) => a.href)];

    for (const member of members) {
      const url = normalise(member);
      if (!url) continue;

      const existing = routeByUrl.get(url);
      if (existing === undefined) {
        routeByUrl.set(url, anchorRoute);
        continue;
      }
      // First writer wins, like every other map in this layer, and the second
      // claim is surfaced rather than dropped.
      if (existing !== anchorRoute && !conflicts.includes(url)) conflicts.push(url);
    }
  }

  return {
    routeOf: (url) => {
      const key = normalise(url);
      return key === null ? undefined : routeByUrl.get(key);
    },
    size: anchors.size,
    conflicts,
  };
}
