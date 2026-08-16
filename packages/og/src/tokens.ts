/**
 * The card's palette.
 *
 * `docs/og-plan.md` §6.1 makes this the single artefact the package takes from
 * a site — and, on the private side, the only thing the illustration pipeline
 * shares with it. Scattering the same hexes through a JSX tree is what made
 * lifting the template out impossible on both sites this came from, and what
 * let four of goflag's greys be wrong for months without anyone seeing it.
 *
 * Five colours, not the eight a theme has. §8's constraints are the reason: one
 * accent and never three, one large body and everything else secondary. A
 * palette with room for more choices is a palette that will be used to make
 * them.
 *
 * Derive these from the stylesheet with `oklchPalette` rather than transcribing
 * them — that is what `oklch.ts` exists for, and the drift it closes is
 * measured, not hypothetical.
 */
export interface OgTokens {
  /** The surface. */
  readonly bg: string;
  /** The one colour the title is allowed to be. */
  readonly fg: string;
  /** Everything that is not the title. */
  readonly dim: string;
  /** The label pill's outline. */
  readonly border: string;
  /** The single accent. */
  readonly accent: string;
  /**
   * Optional second level of secondary text, for a site whose subtitle needs to
   * stay distinguishable from its footer at thumbnail size. Defaults to `dim`.
   */
  readonly subtitle?: string;
}
