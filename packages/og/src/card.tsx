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
 *
 * Fonts and the accent bar are the two inputs that came later, and for the
 * reason the plan left them out: `font` was refused for want of a consumer
 * (§6). tancrede and openfinanceguide are that consumer. Each hand-writes a
 * satori route of 200 lines, because this card could carry no face and draw no
 * 8px bar. Their footers still differ from this one: a rule, a line on the right.
 * Those stay out until one of them would rather have them than the 110 lines.
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

/** The strip `accentBar` draws along the top edge, on the three sites that draw one. */
const ACCENT_BAR = 8;

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

/**
 * One font file. The bytes are the site's: this package ships none (I1).
 *
 * No `style`, because the template never sets `fontStyle` and an italic face can
 * only do harm. Satori ranks weight above style, so a family with a bold only in
 * italic slants the title, and an italic listed before a face with no `style`
 * takes the whole card. Both render without a word.
 */
export interface OgFontFace {
  readonly name: string;
  readonly data: ArrayBuffer | Uint8Array;
  readonly weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
}

/**
 * The faces a card is set in.
 *
 * **`load` is a function, and that is the whole design.** A site's `og.tsx` is
 * imported by every page that needs `ogAlt` or the tokens, so bytes read at
 * definition would be a font in memory on routes that never draw a card, and a
 * `readFileSync` in every test that touches the palette. `load` runs when the
 * first card renders and once per process after that.
 *
 * The names are CSS family names, and each must be one a loaded face carries:
 * satori falls back without a word when it is not, which is a card in the wrong
 * face that every test of the tree still passes.
 */
export interface OgFonts {
  /** The family of everything on the card, unless `display` says otherwise. */
  readonly body: string;
  /** The title and the wordmark, for a site that sets them apart. Defaults to `body`. */
  readonly display?: string;
  readonly load: () => readonly OgFontFace[] | Promise<readonly OgFontFace[]>;
}

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
  /**
   * Left out, `next/og` sets the card in its one bundled weight, so the
   * template's `fontWeight` does nothing. That is a legitimate choice: no bytes
   * to commit and nothing to trace.
   */
  readonly fonts?: OgFonts;
  /** Draws `tokens.accent` along the top edge. */
  readonly accentBar?: boolean;
}

export interface OgCardContent {
  readonly title: string;
  readonly subtitle?: string;
  /** The pill beside the wordmark: a section, a severity, a kind. */
  readonly label?: string;
  /** Bottom left, for this card: a line that has to be translated cannot be the definition's. */
  readonly footer?: string;
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
  /**
   * The faces to hand the renderer, read on the first call and validated once.
   * `undefined` for a site that declared none.
   *
   * Not called `fonts`: an `Og` carries its definition, and that name is taken.
   */
  loadFonts(): Promise<readonly OgFontFace[] | undefined>;
}

/**
 * Freeze a site's card into something both its routes and its tests can call.
 *
 * This stands on its own, with or without `@goflag/next`, which is the whole of
 * D1: a site may want good cards without letting a library decide its routes.
 * What ties a card to the metadata is the route: `@goflag/next` is told about
 * the image a page has, and takes its size from `OG_SIZE`.
 */
export function defineOg(definition: OgDefinition): Og {
  assertFontsDeclaration(definition.fonts);

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
    loadFonts: fontLoader(definition.fonts),
  };
}

function assertFontsDeclaration(fonts: OgFonts | undefined): void {
  if (!fonts) return;

  if (!fonts.body) {
    throw new Error("@goflag/og: `fonts.body` names no family");
  }
  if (typeof fonts.load !== "function") {
    throw new Error("@goflag/og: `fonts.load` must be a function, so a card's bytes are read late");
  }
}

function fontLoader(fonts: OgFonts | undefined): Og["loadFonts"] {
  if (!fonts) return () => Promise.resolve(undefined);

  let loading: Promise<readonly OgFontFace[]> | undefined;

  return () => {
    // The promise rather than its result, so the routes of one build that render
    // at once share a read instead of racing to make one each.
    loading ??= Promise.resolve()
      .then(() => fonts.load())
      .then((faces) => {
        assertFaces(fonts, faces);

        return faces;
      })
      .catch((error: unknown) => {
        // A dev server outlives a file that was missing for a moment.
        loading = undefined;
        throw error;
      });

    return loading;
  };
}

function assertFaces(fonts: OgFonts, faces: readonly OgFontFace[]): void {
  if (faces.length === 0) {
    throw new Error("@goflag/og: `fonts.load` returned no face");
  }

  const loaded = new Set(faces.map((face) => face.name));

  for (const family of [fonts.body, fonts.display]) {
    if (family !== undefined && !loaded.has(family)) {
      throw new Error(
        `@goflag/og: no loaded face is named "${family}" (loaded: ${[...loaded].join(", ")})`,
      );
    }
  }

  for (const face of faces) {
    assertFontBytes(face);
  }
}

/**
 * Satori takes TrueType, OpenType and WOFF, and answers anything else with an
 * error about `Unsupported OpenType signature` that names neither the file nor
 * the card. The usual culprits are the two below: the WOFF2 every font CDN and
 * `next/font` serve, and a text file where the font was meant to be, which is
 * what a failed download or an unfetched Git LFS pointer leaves on disk.
 *
 * The signature and no more: a font cut short passes here and fails in satori.
 * Telling those apart means reading the table directory, a parser in a package
 * that has none, for a file that was committed and rendered once already.
 */
const FONT_SIGNATURES = ["\0\x01\0\0", "OTTO", "true", "wOFF"];

function assertFontBytes(face: OgFontFace): void {
  // `isView`, since `instanceof ArrayBuffer` is false across realms, and a font is
  // not refused for having been read inside a sandbox.
  const { data } = face;
  const length = Math.min(data.byteLength, 4);
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, length)
    : new Uint8Array(data, 0, length);
  const signature = String.fromCharCode(...bytes);

  if (signature === "wOF2") {
    throw new Error(
      `@goflag/og: "${face.name}" is WOFF2, which satori cannot read. Commit a TTF, an OTF or a WOFF`,
    );
  }
  if (!FONT_SIGNATURES.includes(signature)) {
    throw new Error(`@goflag/og: "${face.name}" is not a font file`);
  }
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
        ...family(definition.fonts?.body),
      }}
    >
      {markOf(definition, Math.round(side * ICON_MARK_RATIO))}
    </div>
  );
}

/** Spread rather than assigned, so a card with no fonts carries no `fontFamily` key at all. */
function family(name: string | undefined): { fontFamily?: string } {
  return name ? { fontFamily: name } : {};
}

function markOf(definition: OgDefinition, side: number): ReactNode {
  return typeof definition.mark === "function" ? definition.mark(side) : definition.mark;
}

function render(definition: OgDefinition, content: OgCardContent): ReactElement {
  const { tokens, fit, fonts } = definition;
  const { fontSize, lineClamp } = fitTitle(content.title, fit);
  const subtitleColour = tokens.subtitle ?? tokens.dim;
  const display = family(fonts?.display ?? fonts?.body);

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
        ...family(fonts?.body),
      }}
    >
      {definition.accentBar ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: ACCENT_BAR,
            background: tokens.accent,
          }}
        />
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {markOf(definition, MARK_SIZE)}
        <span style={{ fontSize: WORDMARK, fontWeight: 600, ...display }}>{definition.name}</span>
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
            ...display,
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
        <span style={{ color: tokens.dim }}>{content.footer ?? definition.footer}</span>
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
