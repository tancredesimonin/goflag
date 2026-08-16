import { defineOg, type Fit, type OgTokens } from "@goflag/og";

import { defaultLocale } from "@/i18n/config";
import { staticTranslator } from "@/i18n/static";
import { SITE } from "@/lib/constants";

/**
 * The card's palette, as sRGB.
 *
 * Not a stylistic choice to keep here — a technical one. `next/og` renders
 * through satori, which resolves no CSS variables and does not speak `oklch()`,
 * so the values in `globals.css` cannot reach this file in the form they are
 * written. They are duplicated, and the duplication is unavoidable.
 *
 * What is avoidable is the *drift*. `og.test.ts` converts the `--terminal-*`
 * declarations out of `globals.css` and fails when they no longer match these
 * constants — with `@goflag/og`'s own converter now, rather than a copy of it
 * kept in the test. It turns a comment that used to say "these are the same
 * colours" into something that has to stay true.
 *
 * It was not true. The four greys here were eyeballed rather than converted,
 * and every one of them was off — the surface by a hue step, the foreground by
 * sixteen. Small enough that nobody would ever have seen it, which is exactly
 * why a comment was never going to be enough.
 *
 * One object, because `docs/og-plan.md` §6.1 makes tokens the single artefact
 * `@goflag/og` takes from a site — and the only one shared with the private
 * illustration pipeline.
 */
export const OG_TOKENS = {
  /** `--terminal`: the surface, dark in both themes. */
  bg: "#121416",
  /** `--terminal-foreground`: the one colour the title is allowed to be. */
  fg: "#d8dbde",
  /** `--terminal-dim`: everything that is not the title. */
  dim: "#7d8185",
  /** `--terminal-border`. */
  border: "#26292d",
  /** `--terminal-green`, the single accent. Amber and red appear only as the
   *  three verdict dots, where they *are* the content. */
  accent: "#00d492",
  /** A shade lighter than `dim`, so two levels of secondary text stay
   *  distinguishable at thumbnail size. The one value here with no counterpart
   *  in the stylesheet, and the one the test cannot check. */
  subtitle: "#98a0ab",
} satisfies OgTokens;

/** The three verdicts, in the order the CLI can print them. */
export const OG_VERDICTS = ["#00d492", "#ffb900", "#ff6467"] as const;

/**
 * Title size by length — this site's table, and nobody else's.
 *
 * `@goflag/og` ships no default steps on purpose (`docs/og-plan.md` §10.5): a
 * degression calibrated on one site's copy is a wrong degression on every other.
 * These are calibrated on rule ids with sentence-long summaries, which is the
 * longest thing a card here can carry.
 *
 * **The boundaries are measured, not round.** A step boundary cuts somewhere,
 * and the first draft of this table cut at 48 — straight through the site's own
 * hero, whose four translations run 42 to 49 characters. Two locales would have
 * rendered a size larger than the other two because one of them is one character
 * longer, which is a worse defect than the one the degression exists to fix.
 * `og.test.ts` holds where they are.
 *
 * **No per-locale factor.** §4.2 predicts one, and German is the case it names —
 * but this site serves en, fr, es and pt, and once the boundaries are placed
 * properly all four land on the same step anyway. It goes in when a locale
 * overflows, measured, not guessed.
 */
export const OG_FIT = {
  steps: [
    { upTo: 32, fontSize: 72 },
    { upTo: 56, fontSize: 60 },
    { upTo: 80, fontSize: 52 },
  ],
  smallest: 44,
} satisfies Fit;

/**
 * The card every page shares.
 *
 * Deliberately a terminal, not a screenshot: the terminal *is* the product, and
 * a preview promising a dashboard would be the first thing this site says and
 * also the first thing it got wrong. Built with the ambient font rather than a
 * fetched one — a preview image is not worth a network call in the build that
 * can fail it.
 *
 * The layout, the degression and the catch-all workaround now live in
 * `@goflag/og`; what stays here is what is actually this site's — its palette,
 * its mark, its measured steps, and the sentence it puts in `og:image:alt`.
 */
export const og = defineOg({
  name: SITE.name,
  footer: SITE.domain,
  tokens: OG_TOKENS,
  dots: OG_VERDICTS,
  fit: OG_FIT,
  /**
   * One drawing for the card and for `apple-icon.tsx`, which is the point of
   * taking a function: the two used to be separate copies, and the icon's were
   * `#12151a` and `#e8eaed` — neither of them a colour in the theme, and
   * neither of them a colour the card uses.
   */
  mark: (side) => (
    <svg width={side} height={side} viewBox="0 0 24 24">
      <path d="M5.25 2.5v19" stroke={OG_TOKENS.fg} strokeWidth="1.75" strokeLinecap="square" />
      <path d="M5.25 4h13l-2.6 4.25 2.6 4.25h-13z" fill={OG_TOKENS.accent} />
    </svg>
  ),
});

/**
 * The sentence a screen reader announces, in the reader's language.
 *
 * It lives in `messages/*.json` even for the documentation, which is served in
 * English only: one wording per language, not one per route. Passing the locale
 * is therefore how a localized card differs from a monolingual one, and the
 * default is the only thing `/docs` needs to know about i18n.
 *
 * Read through the same translator as the title, deliberately: a card whose
 * image and whose description were read two different ways is the drift
 * `og:image:alt` exists to close.
 */
export function ogAlt(title: string, locale: string = defaultLocale): string {
  return staticTranslator(locale)("meta.ogAlt", { title });
}
