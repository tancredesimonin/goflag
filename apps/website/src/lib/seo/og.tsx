import { ImageResponse } from "next/og";

import { defaultLocale } from "@/i18n/config";
import { staticTranslator } from "@/i18n/static";
import { SITE } from "@/lib/constants";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * The card's palette, as sRGB.
 *
 * Not a stylistic choice to keep here — a technical one. `next/og` renders
 * through satori, which resolves no CSS variables and does not speak `oklch()`,
 * so the values in `globals.css` cannot reach this file in the form they are
 * written. They are duplicated, and the duplication is unavoidable.
 *
 * What is avoidable is the *drift*. `og.test.ts` converts the `--terminal-*`
 * declarations out of `globals.css` into sRGB and fails when they no longer
 * match these constants, which turns a comment that used to say "these are the
 * same colours" into something that has to stay true.
 *
 * It was not true. The four greys here were eyeballed rather than converted,
 * and every one of them was off — the surface by a hue step, the foreground by
 * sixteen. Small enough that nobody would ever have seen it, which is exactly
 * why a comment was never going to be enough. The values below are now the
 * theme's, computed.
 *
 * One object, because `docs/og-plan.md` §6.1 makes tokens the single artefact
 * the future `@goflag/og` takes from a site — and the only one shared with the
 * private illustration pipeline. Scattering the same hexes through the JSX is
 * what made that impossible to lift out.
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
  verdicts: ["#00d492", "#ffb900", "#ff6467"],
} as const;

/**
 * The subtitle colour, a shade lighter than `dim` so two levels of secondary
 * text stay distinguishable at thumbnail size.
 */
const SUBTITLE = "#98a0ab";

/** Longest subtitle the footer leaves room for before it has to be cut. */
const SUBTITLE_MAX = 160;

/**
 * Title size by length, and the fallbacks that catch what the size cannot.
 *
 * Satori **cannot measure text before rendering** (`docs/og-plan.md` §4.2), so
 * there is no honest `fitText` to write: no code here can ask how wide a string
 * will be. What is left is a deterministic degression — count the characters,
 * pick a step — plus two safety nets that do not need a measurement to work:
 * `lineClamp` truncates whatever still overflows, and `textWrap: balance` stops
 * the last line from being one orphaned word.
 *
 * Before this, the title was `fontSize: 66` with no clamp at all, which is fine
 * for "Changelog" and unreadable for a rule id with a sentence-long summary.
 *
 * **The boundaries are measured, not round.** A step boundary cuts somewhere,
 * and the first draft of this table cut at 48 — straight through the site's own
 * hero, whose four translations run 42 to 49 characters. Two locales would have
 * rendered a size larger than the other two because one of them is one character
 * longer, which is a worse defect than the one the degression exists to fix. The
 * boundaries below are placed where this site's real content does not straddle
 * them, and `og.test.ts` holds that.
 *
 * **No per-locale factor.** §4.2 predicts one, and German is the case it names —
 * but this site serves en, fr, es and pt, and once the boundaries are placed
 * properly all four land on the same step anyway. A factor written for a locale
 * nobody serves is the failure this repository has catalogued three times over.
 * It goes in when a locale overflows, measured, not guessed.
 */
const STEPS = [
  { upTo: 32, fontSize: 72 },
  { upTo: 56, fontSize: 60 },
  { upTo: 80, fontSize: 52 },
] as const;

/** Below every threshold: the floor a title of any length lands on. */
const SMALLEST = 44;

/** How many lines the title area can hold before the footer is pushed off. */
const TITLE_LINES = 3;

/**
 * Pick a title size from its length.
 *
 * Counted in graphemes rather than UTF-16 units: an emoji or a combining accent
 * occupies one glyph's width and two or three code units, and a title measured
 * in code units would shrink for a reason a reader cannot see.
 */
export function fitTitle(title: string): { fontSize: number; lineClamp: number } {
  const graphemes = countGraphemes(title.trim());
  const step = STEPS.find((candidate) => graphemes <= candidate.upTo);

  return { fontSize: step?.fontSize ?? SMALLEST, lineClamp: TITLE_LINES };
}

function countGraphemes(value: string): number {
  // Present in every runtime this builds on (Node 22+, and the edge runtime),
  // but the fallback costs one line and the difference only shows on scripts
  // this site does not yet serve.
  if (typeof Intl.Segmenter !== "function") return [...value].length;
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
}

/**
 * What every `generateImageMetadata` on this site returns.
 *
 * The `alt` export Next offers alongside `size` and `contentType` is one
 * constant string per file, which is exactly what a description of a generated
 * card cannot be: the card carries the page's title as pixels, so the sentence
 * describing it is translated and derived from data. `generateImageMetadata`
 * carries it per image instead — the difference between an `og:image` a screen
 * reader can announce and one it cannot, and the reason `og.image.alt` fired 46
 * times on this site before this existed.
 *
 * The sentence lives in `messages/*.json` even for the documentation, which is
 * served in English only: one wording per language, not one per route. Passing
 * the locale is therefore how a localized card differs from a monolingual one,
 * and the default is the only thing `/docs` needs to know about i18n.
 *
 * One entry, always: these are single-card pages. `docs/og-plan.md` §6.2 is
 * where this shape goes once a second site has written it by hand.
 */
export function ogImageMetadata(title: string, locale: string = defaultLocale) {
  const t = staticTranslator(locale);

  return [
    { id: "og", size: OG_SIZE, contentType: OG_CONTENT_TYPE, alt: t("meta.ogAlt", { title }) },
  ];
}

export interface OgCard {
  title: string;
  subtitle?: string;
  label?: string;
}

/**
 * The card every page shares.
 *
 * Deliberately a terminal, not a screenshot: the terminal *is* the product, and
 * a preview promising a dashboard would be the first thing this site says and
 * also the first thing it got wrong. Built with the ambient font rather than a
 * fetched one — a preview image is not worth a network call in the build that
 * can fail it.
 */
export function ogImage({ title, subtitle, label }: OgCard) {
  const { fontSize, lineClamp } = fitTitle(title);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG_TOKENS.bg,
        padding: 72,
        color: OG_TOKENS.fg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="40" height="40" viewBox="0 0 24 24">
          <path d="M5.25 2.5v19" stroke={OG_TOKENS.fg} strokeWidth="1.75" />
          <path d="M5.25 4h13l-2.6 4.25 2.6 4.25h-13z" fill={OG_TOKENS.accent} />
        </svg>
        <span style={{ fontSize: 34, fontWeight: 600 }}>{SITE.name}</span>
        {label ? (
          <span
            style={{
              fontSize: 22,
              color: OG_TOKENS.dim,
              border: `1px solid ${OG_TOKENS.border}`,
              borderRadius: 8,
              padding: "4px 12px",
            }}
          >
            {label}
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
            // The two nets that need no measurement: cut what still overflows,
            // and refuse to leave one word alone on the last line.
            display: "block",
            lineClamp,
            textOverflow: "ellipsis",
            textWrap: "balance",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 30, color: SUBTITLE, lineHeight: 1.4 }}>
            {subtitle.length > SUBTITLE_MAX ? `${subtitle.slice(0, SUBTITLE_MAX - 3)}…` : subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 24,
        }}
      >
        <span style={{ color: OG_TOKENS.dim }}>{SITE.domain}</span>
        {/* The three verdicts, in the order the CLI can print them. */}
        <div style={{ display: "flex", gap: 12 }}>
          {OG_TOKENS.verdicts.map((colour) => (
            <span
              key={colour}
              style={{ width: 14, height: 14, borderRadius: 7, background: colour }}
            />
          ))}
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}

/**
 * The catch-all workaround, packaged.
 *
 * **Next refuses to place a metadata image under a catch-all segment**, so the
 * documentation — one `[...slug]` route — cannot use `opengraph-image.tsx` at
 * all. A `force-static` route handler with its own `generateStaticParams` is
 * the way through, and it took a while to find. Behind a function it is knowledge
 * this repository holds once instead of a paragraph the next site rediscovers;
 * `docs/og-plan.md` §6.3 is where it goes when `@goflag/og` exists.
 *
 * The slug is looked up in a collection rather than read from a query string,
 * so this cannot be used to render arbitrary text on a goflag card.
 */
export function ogCatchAllRoute<T>(options: {
  entries: readonly T[];
  slugOf: (entry: T) => string;
  card: (entry: T) => OgCard;
}) {
  const find = (slug: string) => options.entries.find((entry) => options.slugOf(entry) === slug);

  return {
    generateStaticParams: () =>
      options.entries.map((entry) => ({ slug: options.slugOf(entry).split("/") })),

    GET: async (_request: Request, context: { params: Promise<{ slug: string[] }> }) => {
      const { slug } = await context.params;
      const entry = find(slug.join("/"));

      if (!entry) {
        return new Response("Not found\n", {
          status: 404,
          headers: { "content-type": "text/plain" },
        });
      }

      return ogImage(options.card(entry));
    },
  };
}
