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
    const { route, locale } = splitRoute(pathname);
    if (locale === "x-default") continue;
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
      const { route } = splitRoute(pathname);
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

/** Ordered registry. Ids are unique; the runner relies on that for lookup. */
export const SITE_RULES: ReadonlyArray<SiteRule> = [
  hreflangMissing,
  hreflangSitemapMismatch,
];

export function getSiteRule(id: string): SiteRule | undefined {
  return SITE_RULES.find((rule) => rule.id === id);
}
