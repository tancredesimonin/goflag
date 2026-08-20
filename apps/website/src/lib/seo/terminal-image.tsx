import { readFileSync } from "node:fs";
import { join } from "node:path";

import { oklchPalette } from "@goflag/og";

import { SAMPLES, type Span, type TerminalLine, type Tone } from "@/lib/transcripts";

/**
 * A generated transcript, as an image, for the surfaces that cannot render a
 * terminal themselves.
 *
 * The README is the one that matters: `prepack` copies it into the package, so
 * it is also the npm page, and neither renders HTML. A fence there is honest
 * but monochrome — and the first thing a reader wants to know is what the tool
 * looks like when it runs, which is a question colour answers in one second.
 *
 * ## Nothing here is a second copy of anything
 *
 * The **text** comes from the same `.ansi` fixtures the site paints, compared
 * to the renderers byte for byte over in `packages/cli`.
 *
 * The **colours** are read out of `globals.css` with `oklchPalette`, the same
 * converter `og.test.ts` already uses to prove `OG_TOKENS` has not drifted.
 * Satori resolves no CSS variables and does not speak `oklch()`, so the values
 * have to arrive as sRGB hex — but they are *derived* here rather than
 * transcribed, which is the difference between this file and the four greys
 * `og.tsx` documents as having been eyeballed and every one of them wrong.
 *
 * The **font** is vendored, and that is the one cost. Satori accepts neither a
 * system face nor WOFF2, and `next/font` emits only WOFF2 — so the JetBrains
 * Mono the site already loads cannot be reused, and two OFL TTFs live beside
 * this file with their licence. A proportional face would be worse than no
 * image: a terminal is a grid, and the alignment is the information.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/**
 * Read under `:root`, deliberately. The stylesheet declares `--terminal-*`
 * twice, once per scheme, and the comment above them says the panel does not
 * flip with the theme: it is the product shot and it is dark in both. Without
 * the scope the first declaration in the file wins, which is the same one — but
 * saying so is what stops a later dark-first refactor from silently inverting
 * every image this route serves.
 */
const PALETTE = oklchPalette(CSS, { scope: ":root" });

function colour(property: string): string {
  const hex = PALETTE[property];
  if (!hex) {
    throw new Error(
      `globals.css declares no \`--${property}: oklch(...)\` under :root. ` +
        `The terminal images read their palette from the stylesheet rather than ` +
        `keeping a copy, so a renamed token has to be renamed here too.`,
    );
  }
  return hex;
}

export const TERMINAL_IMAGE = {
  bg: colour("terminal"),
  fg: colour("terminal-foreground"),
  border: colour("terminal-border"),
  dim: colour("terminal-dim"),
  red: colour("terminal-red"),
  yellow: colour("terminal-yellow"),
  green: colour("terminal-green"),
  cyan: colour("terminal-cyan"),
} as const;

const TONE_COLOUR: Record<Tone, string> = {
  dim: TERMINAL_IMAGE.dim,
  red: TERMINAL_IMAGE.red,
  yellow: TERMINAL_IMAGE.yellow,
  green: TERMINAL_IMAGE.green,
  cyan: TERMINAL_IMAGE.cyan,
};

/** The two OFL faces, read once at module load — so at build time. */
const FONT_DIR = join(process.cwd(), "src", "lib", "seo", "fonts");
export const MONO_REGULAR = readFileSync(join(FONT_DIR, "JetBrainsMono-Regular.ttf"));
export const MONO_BOLD = readFileSync(join(FONT_DIR, "JetBrainsMono-Bold.ttf"));

const FONT_SIZE = 22;
const LINE_HEIGHT = 1.45;
const PADDING = 40;
/** JetBrains Mono's advance width is 600/1000 em. */
const CHAR_WIDTH = FONT_SIZE * 0.6;

export interface TerminalImageSpec {
  /** Which generated transcript to draw. */
  id: string;
  /**
   * A contiguous slice, 1-based and inclusive, or the whole thing.
   *
   * A slice can only ever narrow a transcript that has already been compared
   * to the renderer byte for byte — it cannot reorder, edit or invent a line.
   * That is what makes cropping safe here and unsafe as a general feature: the
   * README wants the verdict and the counters above the fold, and the full
   * report is 32 lines.
   */
  lines?: readonly [number, number];
  /** The command drawn above the output, as a shell would echo it. */
  command?: boolean;
}

export function transcriptLines(spec: TerminalImageSpec): {
  lines: readonly TerminalLine[];
  command: string;
  columns: number;
} {
  const sample = SAMPLES.find((entry) => entry.id === spec.id);
  if (!sample) {
    throw new Error(`No transcript \`${spec.id}\`. Known: ${SAMPLES.map((s) => s.id).join(", ")}.`);
  }

  const [from, to] = spec.lines ?? [1, sample.lines.length];
  if (from < 1 || to > sample.lines.length || from > to) {
    // Loud, because the alternative is an image that is silently shorter than
    // the caller meant and looks deliberate.
    throw new Error(
      `\`${spec.id}\` has ${sample.lines.length} lines; ${from}-${to} is not a slice of it.`,
    );
  }

  const lines = sample.lines.slice(from - 1, to);
  const width = (line: TerminalLine) =>
    line.reduce((n, span) => n + (typeof span === "string" ? span.length : span.t.length), 0);

  return {
    lines,
    command: sample.command,
    columns: Math.max(...lines.map(width)),
  };
}

/** The element `ImageResponse` rasterises. Flexbox only — satori has no grid. */
export function TerminalImage({ spec }: { spec: TerminalImageSpec }) {
  const { lines, command } = transcriptLines(spec);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: TERMINAL_IMAGE.bg,
        padding: PADDING,
        fontFamily: "JetBrains Mono",
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        color: TERMINAL_IMAGE.fg,
      }}
    >
      {spec.command === false ? null : (
        <div style={{ display: "flex", color: TERMINAL_IMAGE.fg, marginBottom: FONT_SIZE }}>
          <span style={{ color: TERMINAL_IMAGE.dim }}>$&nbsp;</span>
          <span>{command}</span>
        </div>
      )}
      {lines.map((line, index) => (
        // An empty line still needs a box, or the blank rows that separate the
        // report's sections collapse and the output reads as one paragraph.
        <div key={index} style={{ display: "flex", height: FONT_SIZE * LINE_HEIGHT }}>
          {line.map((span: Span, i) =>
            typeof span === "string" ? (
              <span key={i} style={{ whiteSpace: "pre" }}>
                {span}
              </span>
            ) : (
              <span
                key={i}
                style={{
                  whiteSpace: "pre",
                  color: span.tone ? TONE_COLOUR[span.tone] : TERMINAL_IMAGE.fg,
                  ...(span.bold ? { fontWeight: 700 } : {}),
                }}
              >
                {span.t}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The canvas a transcript needs, rather than a fixed one.
 *
 * A social card is 1200×630 because the surfaces crop to that. Nothing crops
 * this, and a fixed height would either clip the output or float it in a pool
 * of background — so the box is measured from the text: the advance width for
 * the widest line, the line height for as many rows as there are.
 */
export function terminalImageSize(spec: TerminalImageSpec): { width: number; height: number } {
  const { lines, command, columns } = transcriptLines(spec);
  const rows = lines.length + (spec.command === false ? 0 : 2);
  const widest = spec.command === false ? columns : Math.max(columns, command.length + 2);

  return {
    width: Math.round(widest * CHAR_WIDTH + PADDING * 2),
    height: Math.round(rows * FONT_SIZE * LINE_HEIGHT + PADDING * 2),
  };
}
