/**
 * Cross-page rule registry — the hreflang policies goflag ships.
 *
 * These are the checks that a per-page `Rule` structurally cannot make, and
 * they are the ones that catch the failure modes we actually observed in the
 * wild:
 *
 *   - a site serving four locales with not a single `hreflang` tag anywhere
 *     (`hreflang.missing`), which the old crawl-derived matrix reported as
 *     "0 missing translations" because the absence of alternates is what made
 *     the other locales undiscoverable in the first place;
 *   - a `<head>` and a `sitemap.xml` that disagree about which locales a route
 *     exists in (`hreflang.sitemap-mismatch`) — two artefacts derived
 *     independently from the same intent, drifting apart silently.
 *
 * Both are gated on `localeAxis.multilingual`: on a single-locale site they
 * are noise, not findings.
 */

import { splitRoute } from "../core/i18n";
import type { Page } from "../core/types";
import type { SiteContext, SiteRule } from "./site-types";

/** A site is only subject to hreflang policy when it serves 2+ locales. */
function isMultilingual(site: SiteContext): boolean {
  return site.localeAxis.multilingual;
}

/** Locale tags a page declares via `<link rel="alternate" hreflang>`, minus `x-default`. */
function declaredLocales(page: Page): Set<string> {
  const out = new Set<string>();
  for (const alt of page.links.alternates) {
    if (alt.isXDefault) continue;
    const tag = alt.hreflang?.trim().toLowerCase();
    if (tag) out.add(tag);
  }
  return out;
}

/**
 * The row a URL sits in: the cluster the site declared, when it declared one,
 * and the pathname-derived route otherwise.
 *
 * Both sides of `hreflang.sitemap-mismatch` have to agree on what "the same
 * route" means, and `splitRoute` alone answers with the path. On a site that
 * translates its slugs that is the wrong answer twice over: `/fr/tarifs`
 * yields route `/tarifs`, where the sitemap lists only `fr`, while its English
 * twin sits under `/pricing` — so a correct pair reads as two half-covered
 * routes and earns two warnings. Consulting the declared cluster first is the
 * same move `buildI18nMatrix` already makes (`../core/i18n.ts`); it only ever
 * moves a URL into a row, never invents one, so a site that declares no
 * cluster is byte-for-byte unaffected.
 */
function rowOf(site: SiteContext, url: string, pathname: string): string {
  return site.clusterRouteOf?.(url) ?? splitRoute(pathname).route;
}

/** Route → locales the sitemap lists a URL for. */
function sitemapLocalesByRoute(site: SiteContext): Map<string, Set<string>> {
  const byRoute = new Map<string, Set<string>>();
  for (const entry of site.discovery?.urls ?? []) {
    let pathname: string;
    try {
      pathname = new URL(entry.loc).pathname;
    } catch {
      continue;
    }
    const { locale } = splitRoute(pathname);
    if (locale === "x-default") continue;
    const route = rowOf(site, entry.loc, pathname);
    const set = byRoute.get(route) ?? new Set<string>();
    set.add(locale.toLowerCase());
    byRoute.set(route, set);
  }
  return byRoute;
}

function sorted(set: Set<string>): string[] {
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * A multilingual site whose pages advertise no alternates at all.
 *
 * This is the headline blind spot. Google has no way to associate the locale
 * variants of a route, so they compete with each other instead of consolidating
 * — and the tool that was supposed to notice was itself relying on the missing
 * tags to know the locales existed.
 */
const hreflangMissing: SiteRule = {
  id: "hreflang.missing",
  severity: "error",
  summary: "Pages on a multilingual site must advertise their locale alternates",
  appliesTo: isMultilingual,
  check: ({ site, issue }) => {
    const locales = site.localeAxis.locales.join(", ");
    return site.pages
      .filter((page) => page.links.alternates.length === 0)
      .map((page) =>
        issue({
          pageUrl: page.fetch.finalUrl,
          message:
            `Page declares no \`hreflang\` alternates, but the site serves ` +
            `${site.localeAxis.locales.length} locales (${locales}, per the ` +
            `${site.localeAxis.source}). Locale variants of this route cannot be ` +
            `associated with each other.`,
          origin: { kind: "link", rel: "alternate" },
          fix: {
            title: "Emit alternates from generateMetadata()",
            snippet: [
              "// app/[locale]/…/page.tsx",
              "export async function generateMetadata({ params }) {",
              "  const { locale } = await params;",
              "  return {",
              "    alternates: {",
              "      canonical: `${baseUrl}/${locale}${path}`,",
              "      languages: {",
              ...site.localeAxis.locales.map(
                (l) => `        "${l}": \`\${baseUrl}/${l}\${path}\`,`,
              ),
              '        "x-default": `${baseUrl}/${defaultLocale}${path}`,',
              "      },",
              "    },",
              "  };",
              "}",
            ].join("\n"),
            language: "tsx",
          },
        }),
      );
  },
};

/**
 * The `<head>` and the sitemap disagree about a route's locale coverage.
 *
 * Both are declarations of the same intent, produced by different code paths,
 * so they drift. Under-declaring in the `<head>` hides real translations from
 * search engines; over-declaring points `hreflang` at URLs the site itself does
 * not list, which Google treats as a broken cluster.
 *
 * Pages with no alternates at all are skipped: that is `hreflang.missing`'s
 * finding, and reporting both would double-count the same defect.
 */
const hreflangSitemapMismatch: SiteRule = {
  id: "hreflang.sitemap-mismatch",
  severity: "warning",
  summary: "`<head>` alternates and sitemap locale coverage must agree",
  appliesTo: (site) => isMultilingual(site) && (site.discovery?.urls.length ?? 0) > 0,
  check: ({ site, issue }) => {
    const bySitemap = sitemapLocalesByRoute(site);
    const findings = [];

    for (const page of site.pages) {
      const head = declaredLocales(page);
      if (head.size === 0) continue;

      let pathname: string;
      try {
        pathname = new URL(page.fetch.finalUrl).pathname;
      } catch {
        continue;
      }
      const route = rowOf(site, page.fetch.finalUrl, pathname);
      const inSitemap = bySitemap.get(route);
      if (!inSitemap || inSitemap.size === 0) continue;

      const onlyInSitemap = sorted(new Set([...inSitemap].filter((l) => !head.has(l))));
      const onlyInHead = sorted(new Set([...head].filter((l) => !inSitemap.has(l))));
      if (onlyInSitemap.length === 0 && onlyInHead.length === 0) continue;

      const parts: string[] = [];
      if (onlyInSitemap.length > 0) {
        parts.push(
          `the sitemap lists ${onlyInSitemap.join(", ")} but the \`<head>\` does not advertise ${onlyInSitemap.length > 1 ? "them" : "it"}`,
        );
      }
      if (onlyInHead.length > 0) {
        parts.push(
          `the \`<head>\` advertises ${onlyInHead.join(", ")} but the sitemap has no entry for ${onlyInHead.length > 1 ? "them" : "it"}`,
        );
      }

      findings.push(
        issue({
          pageUrl: page.fetch.finalUrl,
          message: `Route \`${route}\`: ${parts.join("; ")}. Both are derived from the same intent and must not disagree.`,
          origin: { kind: "link", rel: "alternate" },
          fix: {
            title: "Derive both from one locale-availability source",
            snippet: [
              "// Compute availability once, feed both the <head> and the sitemap.",
              "const localesFor = (slug: string) =>",
              "  allDocs.filter((d) => d.slug === slug && !d.draft).map((d) => d.locale);",
              "",
              "// generateMetadata(): alternates.languages ← localesFor(slug)",
              "// sitemap.ts:        alternates.languages ← localesFor(slug)",
            ].join("\n"),
            language: "ts",
          },
        }),
      );
    }

    return findings;
  },
};

/** Directive tokens from a page's `<meta name="robots">`. */
function metaRobotsTokens(page: Page): Set<string> {
  const raw = page.meta.robots?.value ?? "";
  return new Set(
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * `robots.txt` forbids the whole site.
 *
 * The most expensive misconfiguration a site can carry, and the one nothing
 * in the tool was watching: tancrede.eu served `User-agent: * / Disallow: /`
 * in production while every page carried `<meta name="robots"
 * content="index, follow">`. The pages ask to be indexed; the file forbids the
 * crawl that would read them — and because robots.txt wins, the request never
 * happens and the meta tag is never seen.
 *
 * Severity depends on whether anything contradicts the block. A staging site
 * that disallows everything and says nothing else is doing exactly what it
 * means to, so that is a warning. A site that blocks the crawl *and* asks to
 * be indexed cannot have meant both — that is an error.
 */
const robotsBlocksSite: SiteRule = {
  id: "robots.blocks-site",
  severity: "error",
  summary: "`robots.txt` must not forbid crawling a site that asks to be indexed",
  appliesTo: (site) => site.robots?.found === true && site.robots.blocksAll,
  check: ({ site, issue }) => {
    const robotsUrl = site.robots?.url ?? `${site.origin}/robots.txt`;

    // An explicit `index` is a statement of intent, not the mere absence of
    // `noindex` — which every page has by default and would make this fire
    // on every blocked staging environment.
    const asking = site.pages.filter((page) => metaRobotsTokens(page).has("index"));

    const detail = asking.length
      ? `but ${asking.length} crawled page${asking.length === 1 ? "" : "s"} declare ` +
        '`<meta name="robots" content="index">`. Both cannot be true: robots.txt ' +
        "wins, so the pages are never fetched and the meta tag is never read."
      : "so no search engine will crawl any page on this origin. If this is a " +
        "staging or preview environment, that is correct — otherwise the site is " +
        "invisible.";

    return issue({
      pageUrl: robotsUrl,
      severity: asking.length > 0 ? "error" : "warning",
      message: `\`robots.txt\` disallows the whole site for \`User-agent: *\`, ${detail}`,
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
          "  return {",
          '    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/_next/"] },',
          "    sitemap: `${baseUrl}/sitemap.xml`,",
          "  };",
          "}",
        ].join("\n"),
        language: "ts",
      },
    });
  },
};

/**
 * The fallback nobody declares and half the internet still requests.
 *
 * No specification requires `/favicon.ico`, which is why this is a guideline
 * and not a vendor-spec rule: modern browsers follow the `<link>` a page
 * declares and never touch the root. The clients that do are the naive ones —
 * feed readers, link unfurlers, crawlers written against 2005 — and they ask
 * the root blind, take what they get, and show nothing when it 404s.
 *
 * Site-level because the subject is one file at one path. Reported per page it
 * would be the same sentence five hundred times.
 */
const iconsIcoMissing: SiteRule = {
  id: "icons.ico.missing",
  severity: "info",
  summary: "Serve a `/favicon.ico` at the root for the clients that ask blind",
  rigor: "guideline",
  sources: ["whatwg-html-link-types", "mdn-link-rel"],
  // Only judged when the probe actually ran. No probe means goflag did not
  // look, and a rule that reported an absence it never checked for would be
  // inventing a finding.
  appliesTo: (site) => site.favicon !== undefined,
  check: ({ site, issue }) => {
    const probe = site.favicon;
    if (!probe || probe.found) return [];

    // Three distinguishable failures, and the remedy differs for each, so the
    // message says which one happened rather than "no favicon".
    const detail =
      probe.status === 0
        ? "the request failed outright"
        : probe.status >= 400
          ? `the origin answered ${probe.status}`
          : `the origin answered ${probe.status} with \`${probe.contentType ?? "no content type"}\`, which is not an image — a catch-all route serving the app shell looks exactly like this`;

    return issue({
      pageUrl: probe.url,
      message: `No \`/favicon.ico\` at the root: ${detail}. Clients that ask for it blind — feed readers, link unfurlers, older crawlers — get nothing.`,
      origin: { kind: "computed" },
      fix: {
        title: "Generate it from the icon you already have",
        snippet: [
          "// A multi-size ICO is a container of PNGs, and no framework convention",
          "// emits one: Next's icon.tsx goes through ImageResponse, which is PNG.",
          "// So it is generated and committed — see scripts/generate-favicon.mjs,",
          "// which fingerprints its inputs so the bytes only change when the",
          "// source does, and `--check` fails CI instead of rewriting the file.",
          "pnpm --filter @goflag/website favicon",
        ].join("\n"),
        language: "sh",
      },
    });
  },
};

/** Ordered registry. Ids are unique; the runner relies on that for lookup. */
export const SITE_RULES: ReadonlyArray<SiteRule> = [
  hreflangMissing,
  hreflangSitemapMismatch,
  iconsIcoMissing,
  robotsBlocksSite,
];

export function getSiteRule(id: string): SiteRule | undefined {
  return SITE_RULES.find((rule) => rule.id === id);
}
