/**
 * `en` is the default locale here, unlike the sibling sites which default to
 * `fr`. The CLI, its findings and every rule message are written in English,
 * and so is the phrase a reader searches for when they land — "hreflang
 * reciprocity", not "réciprocité hreflang".
 *
 * `pt` rather than `pt-br`: the Portuguese here is Brazilian, but the site does
 * not target Brazil, and RFC 5646 §4.1 says no more specific than justified. A
 * region subtag narrows the audience to earn a distinction this site does not
 * make — there is one Portuguese version, for every Portuguese speaker.
 *
 * The Open Graph and BCP 47 tables that used to live here are gone.
 * `@goflag/next` derives both from ICU: `Intl.getCanonicalLocales` for the tag,
 * likely subtags for `og:locale` — which answers `pt_BR`, the very value the
 * table held.
 */
export const locales = ["en", "fr", "es", "pt"] as const;
export const defaultLocale = "en" as const;
export type Locale = (typeof locales)[number];

const localeLabels: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
};

export function localeLabel(locale: string): string {
  return localeLabels[locale as Locale] ?? locale;
}
