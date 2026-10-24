/**
 * URL canonicalisation, shared by the crawl frontier and the link checker.
 *
 * Its own module because both sides of the audit need it and the link
 * extractor must not import the crawler to get it: the crawler imports
 * `inspect`, `inspect` extracts links, and that circle is how a module ends up
 * reading a binding that has not been initialised yet. `crawl.ts` re-exports
 * it, so existing imports keep working.
 */

export interface CanonicaliseOptions {
  /**
   * Keep a trailing slash instead of dropping it.
   *
   * Dropping it is right for the crawl frontier: `/about` and `/about/` are
   * almost always the same page, and collapsing them halves the work. It is
   * wrong for link checking, where the job is to answer "does the URL the
   * author wrote resolve?" — and the slash is significant on plenty of
   * servers. EUR-Lex is the case that caught us: `/legal-content/FR/TXT/?uri=…`
   * returns 200 and `/legal-content/FR/TXT?uri=…` returns 404, so normalising
   * turned 159 healthy citations into phantom broken links.
   */
  preserveTrailingSlash?: boolean;
}

/**
 * Resolve `href` against `base` (when given), strip the fragment, drop
 * a trailing slash unless the path is just `/`, and return the
 * canonical string. Returns `null` for non-http(s), invalid, or
 * obviously useless URLs (mailto:, tel:, javascript:).
 */
export function canonicaliseUrl(
  href: string,
  base?: string,
  options: CanonicaliseOptions = {},
): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  if (!options.preserveTrailingSlash && url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
