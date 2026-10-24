/**
 * Phase 7 crawler.
 *
 * Walks a site BFS-style starting from `entryUrl`, calling `inspect()`
 * on every URL it visits. Discovery uses three sources, in this order
 * of trust:
 *
 *   1. `<link rel="alternate" hreflang="...">` siblings on every
 *      visited page — Goflag's primary use-case is i18n surfaces, so
 *      we always follow these even when they wouldn't pass an
 *      include filter (otherwise the i18n matrix would have
 *      systematic blind spots).
 *   2. `<a href>` anchors in the static HTML body. We deliberately
 *      stay on the static document (no Chromium re-render per
 *      candidate) — discovery doesn't need hydration; if a
 *      candidate URL itself looks SPA-shaped, `inspect()` will
 *      escalate to headless when we reach it.
 *   3. `<link rel="next">` and `<link rel="prev">` so paginated
 *      indexes (blog list pages) link forward into article pages.
 *
 * Same-origin filter: only URLs whose origin matches `entryUrl`'s
 * origin are followed. Glob include/exclude are applied to the URL's
 * pathname (not the full URL) using a small Bash-like matcher
 * (`./glob.ts`). Trailing-slash variants and `#fragment` are
 * normalized away; query strings are kept (they often carry meaning
 * for hreflang variants like `?hl=fr`).
 *
 * The crawler is intentionally polite by default:
 *
 *   - `concurrency: 4` parallel fetches.
 *   - `maxPages: 200` hard cap so a misconfigured `--depth 99` can't
 *     run forever.
 *   - `respectRobots: true` (Phase 7.7 follow-up — for now we always
 *     send the standard browser UA via `inspect`).
 */

import { canonicaliseUrl } from "./canonicalise";
import { inspect, type InspectOptions } from "./inspect";
import type { Page } from "./types";
import { matchesAny } from "./glob";
import { extractCandidateLinks } from "./discover";

export { canonicaliseUrl, type CanonicaliseOptions } from "./canonicalise";

export interface CrawlOptions {
  /** Entry-point URL the crawl starts from. Must be absolute http/https. */
  entryUrl: string;
  /**
   * Extra same-origin URLs to enqueue alongside the entry point, at depth 0.
   *
   * Discovery via links alone is circular for i18n: a site that declares no
   * `hreflang` gives the BFS nothing to follow into its other locales, so the
   * frontier never leaves the entry locale and the i18n matrix collapses to a
   * single column. Seeding from an independent artefact — the sitemap — breaks
   * that loop. Seeds bypass include/exclude for the same reason hreflang
   * siblings do: a filter must not reintroduce a systematic blind spot.
   */
  seedUrls?: readonly string[];
  /**
   * BFS depth. `0` means "only the entry page". `1` means "entry +
   * its direct children". Defaults to `1` (matches `goflag inspect
   * --crawl --depth 1`).
   */
  depth?: number;
  /** Glob include filter applied to the URL pathname. */
  include?: string[];
  /** Glob exclude filter applied to the URL pathname. */
  exclude?: string[];
  /** Maximum number of in-flight inspections. Defaults to 4. */
  concurrency?: number;
  /** Hard safety cap on visited pages. Defaults to 200. */
  maxPages?: number;
  /**
   * Whether to follow `<link rel="alternate" hreflang="...">` siblings
   * regardless of include/exclude filters. Defaults to `true` so the
   * i18n matrix is never artificially incomplete.
   */
  followHreflang?: boolean;
  /**
   * Optional progress callback fired after each successful inspect.
   * Useful for streaming progress lines to the CLI while the crawl
   * is still running.
   */
  onPage?: (page: Page, ctx: { visited: number; queued: number }) => void;
  /** Forwarded to every per-page `inspect()` call. */
  inspectOptions?: Omit<InspectOptions, "signal"> & { signal?: AbortSignal };
}

export interface CrawlError {
  url: string;
  message: string;
}

export interface CrawlResult {
  /** Pages that successfully inspected, in BFS visit order. */
  pages: Page[];
  /** Canonicalized URLs that were either visited or attempted. */
  visited: string[];
  /** Per-URL failures with the engine's error message, after the retry. */
  errors: CrawlError[];
  /**
   * URLs that failed once and answered on the second attempt. Reported rather
   * than swallowed: a page that needs two tries is a fact about the site, and
   * a run that quietly recovered from six of them is not the same run as one
   * that recovered from none.
   */
  recovered: string[];
  /** True when the crawl stopped because `maxPages` was hit. */
  truncated: boolean;
}

interface QueueItem {
  url: string;
  depth: number;
  /** How many times this URL has already been tried and thrown. */
  attempt?: number;
}

/**
 * One retry per URL, and the retry goes to the back of the frontier rather
 * than firing straight away.
 *
 * Immediately is the wrong moment: a page that just timed out is a page whose
 * server is cold or busy, and asking again in the same wave asks the same
 * question of the same overloaded process. The back of the queue is minutes
 * away on a crawl of any size, which is the spacing this needs and costs
 * nothing to arrange.
 *
 * One, not three: the report now treats a page that never answered as a
 * finding, so the cost of a false timeout is a red pipeline rather than a
 * silent hole. That is worth one more request. It is not worth turning a site
 * that is genuinely down into three times the load and three times the wait —
 * `errors` is the honest answer there, and it arrives sooner.
 */
const MAX_ATTEMPTS = 2;

/**
 * Public entry point. Resolves once the BFS frontier is empty, the
 * `maxPages` cap is hit, or the abort signal fires. Never throws — all
 * per-page failures are collected into `result.errors` so a single
 * 500 deep in the site can't take the whole crawl down.
 */
export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const depthLimit = options.depth ?? 1;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxPages = Math.max(1, options.maxPages ?? 200);
  const followHreflang = options.followHreflang !== false;
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];

  const entry = canonicaliseUrl(options.entryUrl);
  if (!entry) {
    return {
      pages: [],
      visited: [],
      errors: [{ url: options.entryUrl, message: "entry URL is not a valid http(s) URL" }],
      recovered: [],
      truncated: false,
    };
  }
  const origin = new URL(entry).origin;

  const visitedSet = new Set<string>([entry]);
  const queue: QueueItem[] = [{ url: entry, depth: 0 }];

  // Seeds join the entry at depth 0 so their own children remain reachable
  // within `depth`. Off-origin and unparseable seeds are dropped silently —
  // a sitemap listing another host is the sitemap's problem, not the crawl's.
  for (const seed of options.seedUrls ?? []) {
    const normalised = canonicaliseUrl(seed);
    if (!normalised || visitedSet.has(normalised)) continue;
    if (new URL(normalised).origin !== origin) continue;
    visitedSet.add(normalised);
    queue.push({ url: normalised, depth: 0 });
  }

  const pages: Page[] = [];
  const errors: CrawlError[] = [];
  const recovered: string[] = [];
  let truncated = false;

  // `visitedSet` holds the URLs we *asked* for. This one holds the URLs we were
  // *given*, and they are not the same set: a redirect makes two requests land
  // on one document. `/` → `/en` while `/en` is also in the sitemap, `/stet` →
  // `/stet/1.6.3`, `/privacy-policy` → `/en/privacy-policy`. Both requests
  // succeed, both return the same page, and without this the crawl keeps both.
  //
  // Keeping both is not cosmetic. The page is linted twice, so every finding on
  // it is emitted twice — with the same fingerprint, because the fingerprint is
  // built from the final URL. `--max-debt` counts the copies (32 on tancredo
  // for 31 real findings) while a baseline diff collapses them, so one of a
  // pair can disappear and the gate sees nothing. The duplicate also spends a
  // slot of the page budget on a document already audited: openfinanceguide
  // crawled 753 pages to cover 748.
  //
  // First answer wins. The pages are identical, so which one is arbitrary.
  //
  // Filled only from pages actually kept — seeding it with the entry URL would
  // pre-reject the document the entry resolves to, which is the one page every
  // crawl must have.
  const seenFinal = new Set<string>();

  type Inspection =
    { kind: "ok"; item: QueueItem; page: Page } | { kind: "err"; item: QueueItem; error: string };
  const inspectItem = async (item: QueueItem): Promise<Inspection> => {
    try {
      const page = await inspect(item.url, options.inspectOptions);
      return { kind: "ok", item, page };
    } catch (err) {
      return { kind: "err", item, error: err instanceof Error ? err.message : String(err) };
    }
  };

  // Inspections started and not yet taken into account, oldest first.
  //
  // A new one starts the moment a request finishes, not when a whole batch is
  // done. This loop used to start `concurrency` pages, wait for all of them,
  // and only then start the next batch, so every batch ran at the pace of its
  // slowest page and the slots that finished early sat idle until it answered.
  //
  // Results are still taken strictly in the order the pages were started, which
  // is the queue's order. Everything downstream depends on that: the frontier
  // grows in the same order, `seenFinal` keeps the same copy of a redirected
  // document, and a run cut short by `maxPages` keeps the same pages. Taking
  // results as they arrive would make all three depend on which response
  // happened to be faster, and a baseline cannot be compared against a page set
  // that changes from one run to the next.
  //
  // So two counts, not one. `active` is requests in flight, held to
  // `concurrency`. `pending` also holds the answers that arrived ahead of an
  // older, slower page and wait for it to be taken first; it is bounded so that
  // one page that hangs until its timeout cannot pull the rest of the queue in
  // behind it — the work past a `maxPages` cut is thrown away.
  const pending: Promise<Inspection>[] = [];
  const maxPending = concurrency * 4;
  let active = 0;
  let requestDone: () => void = () => undefined;
  const start = (item: QueueItem): void => {
    active += 1;
    pending.push(
      inspectItem(item).finally(() => {
        active -= 1;
        requestDone();
      }),
    );
  };

  while (queue.length > 0 || pending.length > 0) {
    if (options.inspectOptions?.signal?.aborted) break;

    while (active < concurrency && pending.length < maxPending && queue.length > 0) {
      start(queue.shift()!);
    }

    // Wake for whichever comes first: the oldest answer, which is the next one
    // to take, or any request finishing, which is room to start another page.
    const oldest = pending[0]!;
    const finished = new Promise<void>((resolve) => {
      requestDone = resolve;
    });
    const oldestReady = await Promise.race([oldest.then(() => true), finished.then(() => false)]);
    if (!oldestReady) continue;

    const result = await pending.shift()!;
    if (result.kind === "err") {
      const attempt = (result.item.attempt ?? 0) + 1;
      if (attempt < MAX_ATTEMPTS) {
        queue.push({ ...result.item, attempt });
        continue;
      }
      errors.push({ url: result.item.url, message: result.error });
      continue;
    }

    if (result.item.attempt) recovered.push(result.item.url);

    // A document already answered for. Its links were extracted from the
    // copy we kept, so there is nothing here the frontier has not seen.
    //
    // That holds because the queue is BFS and never goes back up a level: the
    // copy we kept is always the shallowest one, so it is the copy that had
    // the most depth budget left to follow links with. Drop that ordering and
    // this becomes a way to lose a subtree.
    const finalUrl = canonicaliseUrl(result.page.fetch.finalUrl) ?? result.page.fetch.finalUrl;
    if (seenFinal.has(finalUrl)) continue;
    seenFinal.add(finalUrl);

    pages.push(result.page);
    if (options.onPage) {
      options.onPage(result.page, { visited: pages.length, queued: queue.length });
    }
    if (pages.length >= maxPages) {
      truncated = true;
      break;
    }

    if (result.item.depth >= depthLimit) continue;

    const candidates = extractCandidateLinks(result.page);
    for (const candidate of candidates) {
      const normalised = canonicaliseUrl(candidate.href, result.page.fetch.finalUrl);
      if (!normalised) continue;
      if (visitedSet.has(normalised)) continue;
      const parsed = new URL(normalised);
      if (parsed.origin !== origin) continue;

      const passesIncludeExclude = filterAllows(parsed.pathname, include, exclude);
      const isHreflang = candidate.source === "hreflang";
      if (!passesIncludeExclude && !(followHreflang && isHreflang)) continue;

      visitedSet.add(normalised);
      queue.push({ url: normalised, depth: result.item.depth + 1 });
    }
  }

  return {
    pages,
    visited: [...visitedSet],
    errors,
    recovered,
    truncated,
  };
}

function filterAllows(pathname: string, include: string[], exclude: string[]): boolean {
  if (exclude.length > 0 && matchesAny(pathname, exclude)) return false;
  if (include.length === 0) return true;
  return matchesAny(pathname, include);
}
