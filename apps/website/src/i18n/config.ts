/**
 * `en` is the default locale here, unlike the sibling sites which default to
 * `fr`. The CLI, its findings and every rule message are written in English,
 * and so is the phrase a reader searches for when they land — "hreflang
 * reciprocity", not "réciprocité hreflang".
 */
export const locales = ["en", "fr", "es", "pt-br"] as const;
export const defaultLocale = "en" as const;
export type Locale = (typeof locales)[number];

const ogLocaleMap: Record<Locale, string> = {
  en: "en_US",
  fr: "fr_FR",
  es: "es_ES",
  "pt-br": "pt_BR",
};

/** Open Graph wants `en_US`, not `en`. */
export function localeToOGCompatibleLocale(locale: string): string {
  return ogLocaleMap[locale as Locale] ?? locale;
}

const bcp47LocaleMap: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  "pt-br": "pt-BR",
};

/**
 * Map an app locale to a BCP 47 tag suitable for `Intl` and `hreflang`.
 * goflag's own `locale.invalid` rule rejects anything that is not valid BCP 47,
 * so this map is what keeps the site from failing its own audit.
 */
export function localeToBcp47(locale: string): string {
  return bcp47LocaleMap[locale as Locale] ?? locale;
}

const localeLabels: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  "pt-br": "Português (BR)",
};

export function localeLabel(locale: string): string {
  return localeLabels[locale as Locale] ?? locale;
}
