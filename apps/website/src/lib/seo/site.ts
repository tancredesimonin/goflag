import { collection, defineSite } from "@goflag/next";
import { allDocs, allLegals } from "content-collections";
import { notFound } from "next/navigation";

import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { SITE } from "@/lib/constants";
import { docsHref } from "@/lib/docs-nav";
import { ALL_RULES } from "@/lib/rules-catalog";

/**
 * This site, declared once, for `@goflag/next` to derive the rest from.
 *
 * The library reads no environment variable, so the two lookups below are the
 * site's own and stay here. They are evaluated when this module is imported,
 * which for `robots.txt` and `sitemap.xml` is during the build — both are
 * prerendered, so the flag was already fixed at build time before this change
 * and `build:local-origin` is what makes the audited build agree with the
 * served one.
 */
export function isProduction(): boolean {
  return process.env.APP_ENV === "production";
}

export const site = defineSite({
  baseUrl: process.env.NEXT_PUBLIC_WEBSITE_FRONTEND_URL || `https://${SITE.domain}`,
  name: SITE.name,
  locales,
  defaultLocale,
  indexable: isProduction(),
  // No `localeTags`. Every form is derived: `hreflang` and `lang` from the tag
  // itself, `og:locale` from ICU's likely subtags — which answers `pt_BR` for
  // `pt`, so the Brazilian variant still reaches an unfurl without this site
  // declaring a territory it does not target.
});

/**
 * Every URL this site serves.
 *
 * A fixed `locale` means the route stands alone; a derived or absent one means
 * it clusters. The documentation is English and says so; a legal notice
 * advertises whatever has actually been translated, which is derived from the
 * collection rather than assumed — the sitemap used to assume all four while
 * the page derived its own set.
 *
 * Adding a page means adding it here. One that renders a canonical without a
 * registry entry fails the build instead of shipping absent from the sitemap.
 */
export const routes = site.routes({
  home: { path: "" },
  changelog: { path: "/changelog" },
  legal: collection(allLegals, {
    path: (doc) => `/${doc.slug}`,
    locale: (doc) => doc.locale,
  }),
  docs: collection(allDocs, {
    path: (doc) => docsHref(doc.slug),
    locale: defaultLocale,
    ogType: "article",
  }),
  cliReference: { path: "/docs/cli", locale: defaultLocale, ogType: "article" },
  ruleCatalogue: { path: "/docs/rules", locale: defaultLocale, ogType: "article" },
  rules: collection(ALL_RULES, {
    path: (rule) => `/docs/rules/${rule.id}`,
    locale: defaultLocale,
    ogType: "article",
  }),
});

/**
 * Narrow a locale segment to one the site actually serves.
 *
 * `params` hands a page whatever the URL contained. The registry refuses to
 * build a canonical for a locale it does not serve — rightly, since the
 * alternative is a canonical for a page that was never rendered — but a bad URL
 * deserves a 404 rather than the 500 an exception would produce. Which of the
 * two it is, is the site's call, not the library's.
 */
export function requireLocale(locale: string): Locale {
  if (!site.servesLocale(locale)) notFound();

  return locale;
}
