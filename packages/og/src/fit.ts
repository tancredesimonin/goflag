/**
 * The title degression: how big a title gets, given how long it is.
 *
 * Satori **cannot measure text before rendering** (`docs/og-plan.md` §4.2), so
 * there is no honest `fitText` to write — no code here can ask how wide a string
 * will be. What is left is a deterministic degression: count the glyphs, pick a
 * step, and back it with two nets that need no measurement. `lineClamp`
 * truncates whatever still overflows, and `textWrap: balance` stops the last
 * line from being one orphaned word.
 */

/** One step of the degression: titles up to `upTo` glyphs render at `fontSize`. */
export interface FitStep {
  /** Inclusive upper bound, in graphemes. */
  readonly upTo: number;
  readonly fontSize: number;
}

export interface Fit {
  /** Ascending by `upTo`. Never empty, and never supplied by this package. */
  readonly steps: readonly FitStep[];
  /** The floor a title longer than every step lands on. */
  readonly smallest: number;
  /** How many lines the title area holds before the footer is pushed off. */
  readonly lines?: number;
}

export interface FittedTitle {
  readonly fontSize: number;
  readonly lineClamp: number;
}

/**
 * Both sites landed on three independently, and it is a property of the
 * template's geometry rather than of anyone's copy — which is why this one has
 * a default and the steps below do not.
 */
const DEFAULT_LINES = 3;

/**
 * **This package ships no default steps, and that is the point.**
 *
 * `docs/og-plan.md` §10.5 is the reason. The goflag site calibrated its
 * boundaries on rule ids with sentence-long summaries; stereo-house has fifteen
 * possible titles clustered at 5–31 and 51–56 glyphs. Reusing goflag's table
 * would have put a boundary at 56 — exactly on stereo-house's longest real
 * title, so two locales would render a size apart for one character of
 * difference. That is a worse defect than the one the degression exists to fix,
 * and it is the defect goflag's own first draft already made once, at 48,
 * straight through its own hero.
 *
 * A degression shipped with default values is a wrong degression on every site
 * that has not measured its own content. So `steps` is required, and the README
 * says how to measure them: list every title a card can carry, count the
 * glyphs, and put the boundaries in the gaps.
 */
export function fitTitle(title: string, fit: Fit): FittedTitle {
  const steps = ascending(fit.steps);
  const graphemes = countGraphemes(title.trim());
  const step = steps.find((candidate) => graphemes <= candidate.upTo);

  return { fontSize: step?.fontSize ?? fit.smallest, lineClamp: fit.lines ?? DEFAULT_LINES };
}

/**
 * A table out of order is not a table with a different answer, it is a table
 * whose later steps are unreachable — `find` stops at the first match, so a
 * `{ upTo: 80 }` written above a `{ upTo: 32 }` swallows every short title. It
 * fails silently and it renders, which is the combination worth throwing on.
 */
function ascending(steps: readonly FitStep[]): readonly FitStep[] {
  if (steps.length === 0) {
    throw new Error("fitTitle: `steps` is empty — measure this site's titles, see the README.");
  }

  for (const [index, step] of steps.entries()) {
    const previous = steps[index - 1];
    if (previous && previous.upTo >= step.upTo) {
      throw new Error(
        `fitTitle: \`steps\` must ascend by \`upTo\` — ${previous.upTo} is listed before ${step.upTo}, ` +
          "so the later step can never be reached.",
      );
    }
  }

  return steps;
}

/**
 * Length in glyphs, not in UTF-16 code units.
 *
 * An emoji or a combining accent occupies one glyph's width and two or more
 * code units. A title measured in code units shrinks for a reason the reader
 * cannot see — a family emoji is twenty-eight code units and one character
 * wide, and would drop three steps on its own.
 */
export function countGraphemes(value: string): number {
  // Present in every runtime this builds on (Node 22+, and the edge runtime),
  // but the fallback costs one line and the difference only shows on scripts
  // these sites do not yet serve.
  if (typeof Intl.Segmenter !== "function") return [...value].length;

  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
}
