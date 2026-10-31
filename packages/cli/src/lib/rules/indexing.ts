/**
 * `indexing.*` — what follows once an operator has said whether a target belongs
 * in a search index (`--expect-indexing`).
 *
 * goflag could not ask. `Disallow: /` on a site with no `index` meta is a staging
 * environment doing its job or a production outage, and `robots.blocks-site` can
 * only say so in a warning and let `--fail-on error` through. So the four sites
 * audited on their develop hosts each carried the same two findings for ever,
 * paid for with `--max-debt 2`, a budget with room for two real regressions in it.
 * And production was no better served: the worst outage there is was that same
 * warning.
 *
 * An answer is the operator's and never the target's, so no rule here reads it
 * from anything served. Nor does it switch the catalogue off: a declaration moves
 * what the audit looks for. A staging host stops being asked to be indexable and
 * starts being asked whether it really is out of the index.
 *
 * ## What "out of the index" takes
 *
 * Google is plain about it, and this is the part that surprises. robots.txt is
 * "not a mechanism for keeping a web page out of Google": a blocked URL can still
 * appear in results, and a `noindex` on it is never read. So a page has one way
 * out, a `noindex` it can be crawled to find, which sorts every crawled page
 * under `no`:
 *
 * | Googlebot may fetch it | says `noindex` | |
 * | --- | --- | --- |
 * | yes | yes | out of the index |
 * | yes | no  | `indexing.not-excluded`, an error, one per page: free to be indexed |
 * | no  | any | `indexing.blocked-url-indexable`, a warning: known by URL alone |
 *
 * The blocked case is only a warning because it is a real and common trade: the
 * URL can surface, with no description, but the content is not fetched by anything
 * that honours the file. Whether that beats opening the host to crawlers is a
 * decision, and the finding states what it costs.
 *
 * ## Why `yes` does not mean every page
 *
 * Production legitimately has `noindex` pages: search results, a thank-you page,
 * legal notices. Calling each an error would make the declaration unusable on the
 * sites that need it. What it does settle is the case nothing else reports: a
 * `noindex` on the home page, or on all of them, which is the staging build that
 * reached production. A page the sitemap lists stays `sitemap.entry.noindex`'s.
 *
 * ## Why a block under `yes` is its own rule
 *
 * `robots.blocks-site` could simply have been raised to an error. But the gate
 * matches findings by identity, and one committed baseline usually serves a staging
 * host and a production-shaped build, so the finding raised would pass as known and
 * the outage would exit 0. A rule no baseline taken under `no` holds is new when it
 * fires. For the same reason the page rules below report per page: an aggregate has
 * one identity, and a host opening up behind an accepted page would never be new.
 *
 * ## Only this origin, and only what Google is told
 *
 * A redirect's target can stay among the crawled pages, as on an SSO-gated host, and
 * nothing can be said about another host from this one's robots.txt. And
 * `bingbot: noindex` leaves a page free to enter Google's index, so these read
 * `saysNoindexToGoogle`.
 */

import { robotsAllows } from "../core/robots/match";
import type { Page } from "../core/types";
import { sample, SEARCH_CRAWLER, saysNoindexToGoogle } from "./site-shared";
import type { SiteContext, SiteRule } from "./site-types";

function ownPages(site: SiteContext): Page[] {
  const origin = new URL(site.origin).origin;
  return site.pages.filter((page) => new URL(page.fetch.finalUrl).origin === origin);
}

function blocked(site: SiteContext, page: Page): boolean {
  if (!site.robots?.found) return false;
  const { pathname, search } = new URL(page.fetch.finalUrl);
  return !robotsAllows(site.robots.groups, `${pathname}${search}`, SEARCH_CRAWLER).allowed;
}

const urlsOf = (pages: readonly Page[]) => pages.map((page) => page.fetch.finalUrl);

const NOINDEX_FIX = {
  title: "Serve `noindex` on every response of this environment",
  snippet: [
    "// next.config.mjs — a header covers what a meta tag cannot: PDFs, feeds, errors.",
    "async headers() {",
    "  if (process.env.APP_ENV === 'production') return [];",
    "  return [{",
    "    source: '/:path*',",
    "    headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],",
    "  }];",
    "}",
  ].join("\n"),
  language: "js",
};

export const indexingNotExcluded: SiteRule = {
  id: "indexing.not-excluded",
  severity: "error",
  summary: "A target declared out of the index must not serve a page Google may index",
  rigor: "vendor-spec",
  sources: ["google-block-indexing", "google-robots-meta"],
  appliesTo: (site) => site.expectIndexing === "no",
  check: ({ site, issue }) =>
    ownPages(site)
      .filter((page) => !saysNoindexToGoogle(page) && !blocked(site, page))
      .flatMap((page) =>
        issue({
          pageUrl: page.fetch.finalUrl,
          message:
            "This page is free to enter Google's index on a target declared out of it " +
            "(`--expect-indexing no`): robots.txt lets Googlebot fetch it and nothing on it " +
            "says `noindex` to Google.",
          origin: { kind: "computed" },
          fix: NOINDEX_FIX,
        }),
      ),
};

export const indexingBlockedUrlIndexable: SiteRule = {
  id: "indexing.blocked-url-indexable",
  severity: "warning",
  summary: "On a target declared out of the index, robots.txt must not hide the `noindex`",
  rigor: "vendor-spec",
  sources: ["google-block-indexing", "google-robots-intro"],
  appliesTo: (site) => site.expectIndexing === "no" && site.robots?.found === true,
  check: ({ site, issue }) => {
    const hidden = ownPages(site).filter((page) => blocked(site, page));

    if (hidden.length === 0) return [];
    const said = hidden.filter(saysNoindexToGoogle).length;
    const unread =
      said === 0
        ? `${hidden.length === 1 ? "It does not say" : "None of them says"} \`noindex\` either.`
        : `${
            hidden.length === 1
              ? "It says"
              : said === hidden.length
                ? "All of them say"
                : `${said} of them say${said === 1 ? "s" : ""}`
          } \`noindex\`, which Googlebot never reads because it never fetches them.`;
    return issue({
      pageUrl: site.robots!.url,
      message:
        `robots.txt keeps Googlebot out of ${hidden.length} page${hidden.length === 1 ? "" : "s"} ` +
        `on a target declared out of the index: ${sample(urlsOf(hidden))}. ${unread} ` +
        "A blocked URL can still appear in Google's results, from links alone.",
      origin: { kind: "computed" },
      fix: {
        title: "Let Googlebot in, so it can read the `noindex`",
        snippet: [
          "# robots.txt — exclusion is the `noindex`; this only lets it be read.",
          "# Every crawler honouring this file can then fetch the host, so keep the",
          "# block instead if that costs more than a URL surfacing with no description.",
          "User-agent: *",
          "Allow: /",
        ].join("\n"),
        language: "txt",
      },
    });
  },
};

export const indexingSiteBlocked: SiteRule = {
  id: "indexing.site-blocked",
  severity: "error",
  summary: "`robots.txt` must not keep Googlebot out of a target declared in the index",
  rigor: "vendor-spec",
  sources: ["ietf-rfc9309", "google-robots-intro"],
  appliesTo: (site) =>
    site.expectIndexing === "yes" &&
    site.robots?.found === true &&
    !robotsAllows(site.robots.groups, "/", SEARCH_CRAWLER).allowed,
  check: ({ site, issue }) => {
    const { rule } = robotsAllows(site.robots!.groups, "/", SEARCH_CRAWLER);
    const through = rule ? `, through \`Disallow: ${rule.pattern}\` (line ${rule.line}),` : "";

    return issue({
      pageUrl: site.robots!.url,
      message:
        `\`robots.txt\` keeps Googlebot out of the whole site${through} on a target declared in ` +
        "the index (`--expect-indexing yes`). Googlebot will not crawl any page on this origin.",
      origin: { kind: "computed" },
      fix: {
        title: "Gate the disallow on the deployed environment",
        snippet: [
          "// app/robots.ts — the flag must be readable at build AND at runtime,",
          "// or a production container silently serves the staging rules.",
          'const isProduction = process.env.APP_ENV === "production";',
          "",
          "export default function robots(): MetadataRoute.Robots {",
          '  if (!isProduction) return { rules: { userAgent: "*", disallow: "/" } };',
          '  return { rules: { userAgent: "*", allow: "/" } };',
          "}",
        ].join("\n"),
        language: "ts",
      },
    });
  },
};

const isBare = (url: URL, path: string) => url.search === "" && url.pathname === path;

/**
 * A site's front door: what answered at `/` or at the URL the audit started from,
 * wherever that redirected, and the root of a locale the operator named.
 *
 * A locale only when named: an axis read from a sitemap takes `/cv` or `/faq` for
 * one, and a `noindex` there is an ordinary page's. A query string is a different
 * page, and `/?s=foo` is exactly the search result production may exclude.
 */
function isHome(site: SiteContext, page: Page): boolean {
  const final = new URL(page.fetch.finalUrl);
  const requested = new URL(page.fetch.requestedUrl);
  const entry = site.entryUrl ? new URL(site.entryUrl).pathname : "/";

  if ([requested, final].some((url) => isBare(url, "/") || isBare(url, entry))) return true;
  if (site.localeAxis.source !== "explicit" || final.search !== "") return false;

  const segments = final.pathname.split("/").filter(Boolean);
  return (
    segments.length === 1 &&
    site.localeAxis.locales.some((locale) => locale.toLowerCase() === segments[0]!.toLowerCase())
  );
}

export const indexingSiteExcluded: SiteRule = {
  id: "indexing.site-excluded",
  severity: "error",
  summary: "A target declared in the index must not say `noindex` on its home or on every page",
  rigor: "vendor-spec",
  sources: ["google-block-indexing", "google-robots-meta"],
  appliesTo: (site) => site.expectIndexing === "yes" && site.pages.length > 0,
  check: ({ site, issue }) => {
    const pages = ownPages(site);
    const excluded = pages.filter(saysNoindexToGoogle);
    const everyPage = pages.length > 0 && excluded.length === pages.length;
    const named = everyPage ? excluded : excluded.filter((page) => isHome(site, page));

    return named.flatMap((page) =>
      issue({
        pageUrl: page.fetch.finalUrl,
        message:
          (everyPage
            ? `All ${pages.length} crawled page${pages.length === 1 ? " says" : "s say"} `
            : "The home page says ") +
          "`noindex` on a target declared in the index (`--expect-indexing yes`). Google drops " +
          "such a page from its results once it reads that.",
        origin: { kind: "computed" },
        fix: {
          title: "Gate the `noindex` on the deployed environment",
          snippet: [
            "// A flag read at build and at runtime, or a production container",
            "// silently serves what staging serves.",
            'const isProduction = process.env.APP_ENV === "production";',
            "",
            "export const metadata = {",
            "  robots: isProduction ? undefined : { index: false, follow: false },",
            "};",
          ].join("\n"),
          language: "ts",
        },
      }),
    );
  },
};

export const INDEXING_RULES: ReadonlyArray<SiteRule> = [
  indexingNotExcluded,
  indexingBlockedUrlIndexable,
  indexingSiteBlocked,
  indexingSiteExcluded,
];
