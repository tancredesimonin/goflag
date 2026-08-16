import { countGraphemes } from "./fit.js";

/**
 * Cut a string to `max` glyphs, ellipsis included in the count.
 *
 * Counted in graphemes for the same reason `fitTitle` is: a subtitle measured
 * in UTF-16 units is cut early on any language that uses combining accents,
 * which is most of the ones these sites serve. The two would otherwise disagree
 * about how long the same sentence is, inside the same card.
 */
export function truncateGraphemes(value: string, max: number): string {
  if (max < 1) throw new Error(`truncateGraphemes: ${max} leaves nothing to show.`);
  if (countGraphemes(value) <= max) return value;

  return `${graphemes(value)
    .slice(0, max - 1)
    .join("")}…`;
}

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter !== "function") return [...value];

  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(
    (entry) => entry.segment,
  );
}
