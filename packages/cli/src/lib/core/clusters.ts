/**
 * Which URLs are the same page in another language, when the path cannot say.
 *
 * The matrix keys a row on the pathname minus its locale segment, so a site
 * that translates its slugs — `/en/pricing` and `/fr/tarifs` — gets two rows,
 * each filled in one locale, and two translation holes on a pair that is
 * perfectly translated. Measured: 16 false holes out of 17 routes on a
 * nine-pair site (`docs/i18n-cluster-plan.md` §1).
 *
 * Two sources declare the pairing, and they are complementary rather than
 * competing (§9):
 *
 *   - the **sitemap**'s `xhtml:link` entries, which survive sampling: a `<url>`
 *     entry names its whole cluster whether or not any member was fetched.
 *     Structural coverage draws the two locales of a slug-translating family
 *     from disjoint pages — 0 of 8 pairs had both sides sampled (§2) — so this
 *     is the only source that works in the default mode;
 *   - the crawled pages' **`<head>`**, which is the canonical mechanism and the
 *     one most correct sites actually use. It needs both members in hand, so it
 *     is a no-op exactly where sampling bites; it is what fixes the frequent
 *     site that declares properly in its `<head>` and nothing in its sitemap,
 *     which was earning 4 mismatch warnings and 4 false holes (§9.1).
 *
 * The sitemap wins where both answer. Three lines this must not cross, all of
 * them judged objections (§6, §9.2):
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
 *   3. **No `canonical` edge.** Self-referential per locale everywhere it was
 *      measured, already consumed as a duplicate signal, and the largest
 *      silent-merge surface the design was offered.
 */

import { splitRoute } from "./i18n";
import type { SitemapUrlEntry } from "./sitemap/types";
import type { Page } from "./types";

export interface ClusterIndex {
  /**
   * The row a URL belongs to, or `undefined` when nothing declared one — in
   * which case the caller keeps its pathname-derived route and today's
   * behaviour is unchanged.
   */
  routeOf(url: string): string | undefined;
  /**
   * Normalised URL → row. Exposed so two indexes can be combined, and so the
   * combination can tell agreement from contradiction rather than guessing.
   */
  rows: ReadonlyMap<string, string>;
  /** How many clusters were formed. Reported so a merge is never invisible. */
  size: number;
  /**
   * URLs a second entry tried to move into a different cluster. Kept rather
   * than resolved: a site declaring one URL into two clusters is contradicting
   * itself, and the report should say so rather than pick a winner quietly.
   */
  conflicts: string[];
  /**
   * Clusters the site declared and goflag declined to use, for want of an
   * anchor it could name the row after. Counted rather than swallowed: a
   * declaration we saw and did not act on is exactly the kind of quiet
   * degradation this report is supposed to admit to.
   */
  refused: number;
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

/** One cluster per distinct row: the rows *are* the clusters. */
function clusterCount(rows: ReadonlyMap<string, string>): number {
  return new Set(rows.values()).size;
}

function indexOf(rows: Map<string, string>, conflicts: string[], refused: number): ClusterIndex {
  return {
    rows,
    routeOf: (url) => {
      const key = normalise(url);
      return key === null ? undefined : rows.get(key);
    },
    size: clusterCount(rows),
    conflicts,
    refused,
  };
}

/**
 * Build the cluster index from the sitemap's own cluster declarations.
 *
 * Only `xhtml:link rel="alternate"` is read — no canonical edge, per the
 * constraint above.
 */
export function buildClusterIndex(entries: readonly SitemapUrlEntry[]): ClusterIndex {
  const rows = new Map<string, string>();
  const conflicts: string[] = [];
  let refused = 0;

  for (const entry of entries) {
    const alternates = entry.alternates;
    if (!alternates || alternates.length === 0) continue;

    const xDefault = alternates.find((a) => a.hreflang.trim().toLowerCase() === X_DEFAULT);
    // No anchor, no merge. Picking one from the members would make the row's
    // name a function of who is in it, which is the fingerprint churn this
    // exists to avoid.
    if (!xDefault) {
      refused++;
      continue;
    }

    const anchorUrl = normalise(xDefault.href);
    if (!anchorUrl) {
      refused++;
      continue;
    }

    const { route: anchorRoute } = splitRoute(new URL(anchorUrl).pathname);

    // The entry's own URL belongs to the cluster it declares, even when the
    // alternate list omits it — a site is not obliged to list itself, though
    // Google asks it to.
    const members = [entry.loc, ...alternates.map((a) => a.href)];

    for (const member of members) {
      const url = normalise(member);
      if (!url) continue;

      const existing = rows.get(url);
      if (existing === undefined) {
        rows.set(url, anchorRoute);
        continue;
      }
      // First writer wins, like every other map in this layer, and the second
      // claim is surfaced rather than dropped.
      if (existing !== anchorRoute && !conflicts.includes(url)) conflicts.push(url);
    }
  }

  return indexOf(rows, conflicts, refused);
}

/** What one crawled page's `<head>` declares about its cluster. */
interface HeadDeclaration {
  /** Normalised alternate targets, minus the page itself and minus x-default. */
  peers: Set<string>;
  /**
   * The declared `x-default` target, or null when the page declares none — or
   * declares two different ones, which is a contradiction we refuse to resolve.
   */
  xDefault: string | null;
}

function readHeads(pages: readonly Page[]): Map<string, HeadDeclaration> {
  const seen = new Map<string, HeadDeclaration>();

  for (const page of pages) {
    const self = normalise(page.fetch.finalUrl);
    if (self === null || seen.has(self)) continue;

    const peers = new Set<string>();
    const xDefaults = new Set<string>();
    for (const alt of page.links.alternates) {
      const href = normalise(alt.href);
      if (href === null) continue;
      if (alt.isXDefault) xDefaults.add(href);
      else if (href !== self) peers.add(href);
    }

    seen.set(self, { peers, xDefault: xDefaults.size === 1 ? [...xDefaults][0]! : null });
  }

  return seen;
}

/**
 * Build the cluster index from reciprocal `<head>` alternates.
 *
 * An edge exists between two **crawled** pages only when each one's `<head>`
 * points at the other. A one-sided declaration asserts an identity its supposed
 * peer does not confirm, and acting on it is the silent-merge surface §6
 * refused; requiring reciprocity is what makes this safe enough to run
 * alongside the sitemap rather than instead of it.
 *
 * A connected component merges only when its members name **one** `x-default`
 * and that target is itself a member. The second half is not decoration:
 * pointing `x-default` at the site's home page is a common field mistake, and
 * without the membership test every page on such a site would try to merge onto
 * the `/` row and collapse the whole audit into one route. With it, the home
 * page is not reciprocally linked to `/en/pricing`, so nothing merges — the
 * guard is structural rather than a list of special cases.
 *
 * On a site with no `hreflang` at all this is a no-op by construction: no
 * alternates, no edges, no clusters. It neither fixes nor hides the founding
 * bug — `hreflang.missing` reads `alternates.length` and is untouched — and
 * like the sitemap index it only ever moves a cell, so it cannot fill a hole.
 */
export function buildHeadClusterIndex(pages: readonly Page[]): ClusterIndex {
  const seen = readHeads(pages);

  // Union-find over reciprocal edges only.
  const parent = new Map<string, string>();
  for (const url of seen.keys()) parent.set(url, url);
  const find = (start: string): string => {
    let root = start;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = start;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  for (const [url, decl] of seen) {
    for (const peer of decl.peers) {
      // Reciprocity, both halves required: the peer must have been crawled,
      // and it must point back.
      if (!seen.get(peer)?.peers.has(url)) continue;
      const [a, b] = [find(url), find(peer)];
      if (a !== b) parent.set(a, b);
    }
  }

  const components = new Map<string, string[]>();
  for (const url of seen.keys()) {
    const root = find(url);
    const members = components.get(root);
    if (members) members.push(url);
    else components.set(root, [url]);
  }

  const rows = new Map<string, string>();
  let refused = 0;

  for (const members of components.values()) {
    // A page alone in its component declared nothing reciprocal; there is no
    // cluster to name, and nothing to refuse either.
    if (members.length < 2) continue;

    const declared = new Set(
      members.map((m) => seen.get(m)?.xDefault).filter((x): x is string => Boolean(x)),
    );
    // Members that declare no `x-default` do not veto the merge — that is
    // `x-default-missing`'s finding, and refusing here would punish the same
    // page twice. Members that disagree about it do.
    if (declared.size !== 1) {
      refused++;
      continue;
    }

    const anchor = [...declared][0]!;
    if (!members.includes(anchor)) {
      refused++;
      continue;
    }

    const { route } = splitRoute(new URL(anchor).pathname);
    for (const member of members) rows.set(member, route);
  }

  // A URL belongs to exactly one component, so this index cannot contradict
  // itself. Contradiction only becomes possible against the sitemap.
  return indexOf(rows, [], refused);
}

/**
 * Combine two cluster indexes, `primary` winning wherever both answer.
 *
 * Used to put the sitemap ahead of the `<head>`: the sitemap's declaration
 * survives sampling and the `<head>`'s does not, so where the two disagree the
 * one that saw the whole site decides. The disagreement is recorded as a
 * conflict rather than resolved quietly, exactly as two sitemap entries
 * claiming one URL already are.
 */
export function combineClusterIndexes(
  primary: ClusterIndex,
  secondary: ClusterIndex,
): ClusterIndex {
  const rows = new Map(secondary.rows);
  const conflicts = [...primary.conflicts];
  const add = (url: string) => {
    if (!conflicts.includes(url)) conflicts.push(url);
  };
  for (const url of secondary.conflicts) add(url);

  for (const [url, route] of primary.rows) {
    const claimed = rows.get(url);
    if (claimed !== undefined && claimed !== route) add(url);
    rows.set(url, route);
  }

  return indexOf(rows, conflicts, primary.refused + secondary.refused);
}

/**
 * How many clusters exist only because the `<head>` declared them — the rows
 * `secondary` supplies for URLs `primary` never mentioned.
 *
 * Reported rather than inferred from a difference of totals: on a site that
 * declares both ways the two indexes describe the *same* clusters, so
 * subtracting counts would claim a gain that is not there.
 */
export function clustersOnlyFrom(primary: ClusterIndex, secondary: ClusterIndex): number {
  const routes = new Set<string>();
  for (const [url, route] of secondary.rows) {
    if (!primary.rows.has(url)) routes.add(route);
  }
  return routes.size;
}
