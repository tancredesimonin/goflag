import type { Rule } from "./types";

const LOCALE_PATTERN = /^[a-z]{2,3}_[A-Z]{2}$/;

const rule: Rule = {
  id: "og.locale.valid",
  severity: "warning",
  docs: {
    summary: "`og:locale` must use the `language_TERRITORY` form (e.g. `en_US`, `fr_FR`)",
    rationale: `Open Graph locales follow Facebook's variant of BCP-47:
\`{language}_{TERRITORY}\` with an underscore (not a hyphen) and an
uppercase territory code. \`en-US\`, \`en_us\`, or just \`en\` are all
**invalid** OG locales — Facebook ignores them and falls back to
\`en_US\`, which silently breaks i18n unfurls.

This rule fires when \`og:locale\` is present but doesn't match the
required shape.`,
    references: [
      {
        label: "Facebook: supported locales",
        href: "https://developers.facebook.com/docs/internationalization/",
      },
    ],
  },
  check: ({ page, issue }) => {
    const issues = [];
    const locale = page.openGraph.locale?.value?.trim();
    if (locale && !LOCALE_PATTERN.test(locale)) {
      issues.push(
        issue({
          message: `og:locale "${locale}" is not a valid \`language_TERRITORY\` value.`,
          origin: page.openGraph.locale!.origin,
        }),
      );
    }
    for (const alt of page.openGraph.localeAlternates) {
      if (LOCALE_PATTERN.test(alt.value.trim())) continue;
      issues.push(
        issue({
          message: `og:locale:alternate "${alt.value}" is not a valid \`language_TERRITORY\` value.`,
          origin: alt.origin,
        }),
      );
    }
    return issues;
  },
};

export default rule;
