import type { ReactElement, ReactNode } from "react";

import { fitTitle, type Fit } from "./fit.js";
import { truncateGraphemes } from "./text.js";
import type { OgTokens } from "./tokens.js";

/**
 * The default card, and the reason the core renders nothing.
 *
 * `docs/og-plan.md` D1: this returns `{ element, size, alt }` and stops there.
 * A JSX tree is a bare `{ type, props }` object — satori eats one, and so does
 * `next/og`, which embeds satori — so portability never required carrying a
 * renderer, only refusing to put one here. The immediate benefit is not the
 * hypothetical Astro site: it is that a card can be asserted about in vitest
 * with no Next build anywhere near it.
 *
 * One template, driven by tokens, not a gallery (D3). What the two sites this
 * was extracted from actually differed in was five things — the mark, the
 * wordmark, the palette, the footer's line, and the dots — and every one of
 * them is an input below. The geometry they shared to the pixel is what stays
 * fixed here.
 */

/** The 1.91:1 every unfurl expects, and the margin §8 sets. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const PADDING = 72;

/** §8: one large body, everything else at 24 or below. The scale contrast is the design. */
const WORDMARK = 34;
const LABEL = 22;
const SUBTITLE = 30;
const FOOTER = 24;
const DOT = 14;

/**
 * Longest subtitle the footer leaves room for before it has to be cut.
 *
 * A constant, like `TITLE_LINES`: it belongs to this geometry, both sites
 * arrived at it independently, and an option nobody sets is the surface I4
 * refuses.
 */
const SUBTITLE_MAX = 160;

/** The mark's side beside the wordmark, when `mark` is a function. */
const MARK_SIZE = 40;

export interface OgDefinition {
  readonly tokens: OgTokens;
  /** The wordmark, beside the mark. Usually the site's name. */
  readonly name: string;
  /**
   * The mark itself — an `<svg>` tree.
   *
   * Not drawn here, and not derived from the tokens either: a logo is the one
   * part of a card that is not a constraint (§8 is a list of constraints), and
   * a package that drew it would be a gallery of one.
   *
   * Given as a function of its side in pixels, it is drawn small beside the
   * wordmark and large in `icon()` — which is what makes §6.3's promise real
   * rather than a coincidence two files have to keep. The goflag site is the
   * measured case: `apple-icon.tsx` redrew the same flag with `#12151a` and
   * `#e8eaed`, neither of which is a colour the card uses.
   */
  readonly mark?: ReactNode | ((side: number) => ReactNode);
  /** Bottom left. The host, on both sites this came from. */
  readonly footer?: string;
  /**
   * Bottom right. §8 allows one accent and no more, and these are the exception
   * that proves it: on both sites the dots are the site's own taxonomy rendered
   * as colour — the CLI's three verdicts, the library's four categories — so
   * they are content, not decoration.
   */
  readonly dots?: readonly string[];
  /** Required, and supplied by no default. See `fit.ts`. */
  readonly fit: Fit;
}

export interface OgCardContent {
  readonly title: string;
  readonly subtitle?: string;
  /** The pill beside the wordmark: a section, a severity, a kind. */
  readonly label?: string;
  /**
   * The sentence a screen reader announces, translated and derived from the
   * same data as the title.
   *
   * Carried through rather than composed here: `og:image:alt` exists to close
   * the gap between what a card shows and what its description claims, and a
   * package inventing the sentence from a template would be re-opening it in a
   * new place. §6.2 — it comes from the site's loader, in the site's language.
   */
  readonly alt?: string;
}

export interface OgCard {
  readonly element: ReactElement;
  readonly size: { readonly width: number; readonly height: number };
  readonly contentType: string;
  readonly alt?: string;
}

export interface OgIcon {
  readonly element: ReactElement;
  readonly size: { readonly width: number; readonly height: number };
  readonly contentType: string;
}

export interface Og extends OgDefinition {
  readonly size: typeof OG_SIZE;
  readonly contentType: string;
  card(content: OgCardContent): OgCard;
  /** The mark on the surface, square. §6.3: `icon.tsx` and `apple-icon.tsx`. */
  icon(side: number): OgIcon;
}

/**
 * Freeze a site's card into something both its routes and its tests can call.
 *
 * When `@goflag/next` is present, `defineSite({ og })` takes this same object
 * and wires the image's URL into the metadata. When it is absent this stands on
 * its own, which is the whole of D1: a site may want good cards without letting
 * a library decide its routes.
 */
export function defineOg(definition: OgDefinition): Og {
  return {
    ...definition,
    size: OG_SIZE,
    contentType: OG_CONTENT_TYPE,
    card: (content) => ({
      element: render(definition, content),
      size: OG_SIZE,
      contentType: OG_CONTENT_TYPE,
      alt: content.alt,
    }),
    icon: (side) => ({
      element: renderIcon(definition, side),
      size: { width: side, height: side },
      contentType: OG_CONTENT_TYPE,
    }),
  };
}

/** The mark's share of an icon's side: §8's margin, at icon scale. */
const ICON_MARK_RATIO = 0.66;

function renderIcon(definition: OgDefinition, side: number): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: definition.tokens.bg,
      }}
    >
      {markOf(definition, Math.round(side * ICON_MARK_RATIO))}
    </div>
  );
}

function markOf(definition: OgDefinition, side: number): ReactNode {
  return typeof definition.mark === "function" ? definition.mark(side) : definition.mark;
}

function render(definition: OgDefinition, content: OgCardContent): ReactElement {
  const { tokens, fit } = definition;
  const { fontSize, lineClamp } = fitTitle(content.title, fit);
  const subtitleColour = tokens.subtitle ?? tokens.dim;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: tokens.bg,
        padding: PADDING,
        color: tokens.fg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {markOf(definition, MARK_SIZE)}
        <span style={{ fontSize: WORDMARK, fontWeight: 600 }}>{definition.name}</span>
        {content.label ? (
          <span
            style={{
              fontSize: LABEL,
              color: tokens.dim,
              border: `1px solid ${tokens.border}`,
              borderRadius: 8,
              padding: "4px 12px",
            }}
          >
            {content.label}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            // The two nets that need no measurement, since satori offers none:
            // cut what still overflows, and refuse to leave one word alone on
            // the last line.
            display: "block",
            lineClamp,
            textOverflow: "ellipsis",
            textWrap: "balance",
          }}
        >
          {content.title}
        </div>
        {content.subtitle ? (
          <div style={{ fontSize: SUBTITLE, color: subtitleColour, lineHeight: 1.4 }}>
            {truncateGraphemes(content.subtitle, SUBTITLE_MAX)}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: FOOTER,
        }}
      >
        <span style={{ color: tokens.dim }}>{definition.footer}</span>
        <div style={{ display: "flex", gap: 12 }}>
          {(definition.dots ?? []).map((colour) => (
            <span
              key={colour}
              style={{ width: DOT, height: DOT, borderRadius: DOT / 2, background: colour }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
