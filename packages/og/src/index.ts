/**
 * `@goflag/og` — the card a site shares, and the icon container Next cannot
 * make.
 *
 * The core renders nothing (`docs/og-plan.md` D1). It returns a JSX tree, a
 * size and an alt; `@goflag/og/next` hands that tree to `ImageResponse`, and
 * any other binding would be about fifty lines. The runtime depends on nothing
 * — `react/jsx-runtime` is a peer, `next` is an optional one, and no renderer
 * is installed twice on a site that already has one.
 *
 * The other half has no JSX in it at all: `buildIco` packs an ICO container out
 * of PNGs the site rasterised, and `writeIcons` is the idempotence guard that
 * keeps a generated-and-committed file from being dirtied by every commit.
 */

export {
  defineOg,
  OG_CONTENT_TYPE,
  OG_SIZE,
  type Og,
  type OgCard,
  type OgCardContent,
  type OgDefinition,
  type OgIcon,
} from "./card.js";
export { countGraphemes, fitTitle, type Fit, type FitStep, type FittedTitle } from "./fit.js";
export { buildIco, type IcoEntry } from "./ico.js";
export {
  oklchPalette,
  oklchToHex,
  oklchToRgb,
  readOklch,
  type Oklch,
  type PaletteOptions,
} from "./oklch.js";
export { truncateGraphemes } from "./text.js";
export type { OgTokens } from "./tokens.js";
export {
  fingerprint,
  writeIco,
  writeIcons,
  type ArtefactStatus,
  type FingerprintInput,
  type LazyArtefact,
  type WriteIconsOptions,
} from "./write.js";
