/**
 * What the cross-page rules share across files.
 *
 * It lived in `./site-rules.ts` until the `llmstxt.*` and `indexing.*` rules
 * needed it, and those rules have files of their own because the registry already
 * runs past fifteen hundred lines. `site-rules.ts` imports them, so the reverse
 * import would be circular; one small module all of them can read is the way out.
 */

import type { Page } from "../core/types";

/** How many offending entries a finding names before it starts counting. */
const SAMPLE = 5;

/** `n` entries, listing the first few — forty repeats of one defect is noise. */
export function sample(locs: string[]): string {
  const shown = locs.slice(0, SAMPLE);
  const rest = locs.length - shown.length;
  return `${shown.map((l) => `\`${l}\``).join(", ")}${rest > 0 ? `, and ${rest} more` : ""}`;
}

/** 4xx, 5xx, or no response at all. A 3xx is a redirect, not a death. */
export function isDead(status: number): boolean {
  return status === 0 || status >= 400;
}

/**
 * The crawler the search-engine robots rules decide for.
 *
 * `User-agent: *` is the group a crawler falls back to, not the one every
 * crawler reads: RFC 9309 §2.2.1 sends a crawler to the group that names it
 * when there is one. So "does robots.txt allow this path?" has no answer until
 * it says *for whom*, and `robots.blocks-site`, `robots.blocks-page` and
 * `sitemap.entry.blocked-by-robots` say Googlebot: the crawler documented by
 * Google's robots.txt introduction, the source behind what they claim about a
 * crawl. On a file that names nobody, Googlebot reads `*` and every answer is
 * the one their `*` reading gave until 2026-10-25. The two differ only where
 * a file treats Googlebot apart, which is exactly where the `*` reading was
 * wrong about Google.
 */
export const SEARCH_CRAWLER = "Googlebot";

/** `none` is Google's own shorthand for `noindex, nofollow`. */
const NOINDEX = new Set(["noindex", "none"]);

/** The directives that take a value after a colon, so that colon names no crawler. */
const VALUED_DIRECTIVES = new Set([
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "unavailable_after",
]);

/**
 * The name of the directive each `X-Robots-Tag` token carries. A token may
 * address one crawler (`googlebot: noindex`) and a directive may carry a value
 * (`max-image-preview: none`), and the two look alike: what comes before the
 * colon is a directive when it is one of those that take a value, and the
 * crawler the rest is addressed to otherwise. Reading the last word instead
 * takes that `none` — no image preview — for `noindex, nofollow`, which is the
 * mistake this list exists to prevent. Two headers arrive joined by a comma, so
 * tokens are read one by one.
 */
function headerDirectiveNames(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((token) => {
    let directive = token.trim().toLowerCase();
    const colon = directive.indexOf(":");
    if (colon !== -1 && !VALUED_DIRECTIVES.has(directive.slice(0, colon).trim())) {
      directive = directive.slice(colon + 1);
    }
    return directive.split(":")[0]!.trim();
  });
}

/**
 * Whether a page asks not to be indexed — by `<meta name="robots">`, by
 * `<meta name="googlebot">`, or by `X-Robots-Tag`, to every crawler or to one.
 *
 * A page that tells any crawler reading the sitemap not to index it does not
 * ask to be indexed, and a sitemap that lists it contradicts it for that
 * crawler. `none` counts: it is `noindex` said in one word.
 */
export function saysNoindex(page: Page): boolean {
  const metas = [page.meta.robots?.value, page.meta.googlebot?.value];
  if (metas.some((content) => (content ?? "").split(",").some(isNoindex))) return true;
  return headerDirectiveNames(page.fetch.headers["x-robots-tag"]).some(isNoindex);
}

function isNoindex(directive: string): boolean {
  return NOINDEX.has(directive.trim().toLowerCase());
}

/**
 * Whether a page asks **Google** not to index it: `<meta name="robots">`,
 * `<meta name="googlebot">`, or an `X-Robots-Tag` token addressed to nobody or to
 * Googlebot.
 *
 * Narrower than `saysNoindex`, whose question is whether a sitemap contradicts the
 * page for any crawler reading it. A rule claiming what Google will do cannot count
 * `bingbot: noindex`, which leaves the page free to enter Google's index. An
 * addressee holds over the tokens after it, as in `bingbot: noarchive, noindex`,
 * until another one takes over. Two headers arrive joined by a comma with nothing
 * to tell them apart, so a bare `noindex` after an addressed header reads as that
 * crawler's: the reading that reports a page, not the one that hides it.
 */
export function saysNoindexToGoogle(page: Page): boolean {
  const metas = [page.meta.robots?.value, page.meta.googlebot?.value];
  if (metas.some((content) => (content ?? "").split(",").some(isNoindex))) return true;

  let addressee: string | undefined;
  for (const token of (page.fetch.headers["x-robots-tag"] ?? "").split(",")) {
    const normal = token.trim().toLowerCase();
    const colon = normal.indexOf(":");
    let directive = normal;
    if (colon !== -1 && !VALUED_DIRECTIVES.has(normal.slice(0, colon).trim())) {
      addressee = normal.slice(0, colon).trim();
      directive = normal.slice(colon + 1);
    }
    const speaksToGoogle = addressee === undefined || addressee === SEARCH_CRAWLER.toLowerCase();
    if (speaksToGoogle && isNoindex(directive.split(":")[0]!)) return true;
  }
  return false;
}
