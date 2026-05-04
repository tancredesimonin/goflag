/**
 * Platform-faithful truncation helpers.
 *
 * Each platform has well-documented (or empirically observed) limits:
 *
 *  - Google SERP desktop:  ~60 characters for title, ~155 for description
 *  - Google SERP mobile:   ~70 characters for title, ~155 for description
 *  - X summary card:        50 characters for title, 200 for description
 *  - Facebook feed:        ~88 characters for title before the "..." cut
 *  - LinkedIn:             ~119 characters for title (one line on desktop)
 *  - Slack unfurl:         titles never break; descriptions clamp to ~3 lines
 *
 * We always cut on a grapheme boundary (so we don't break combined emoji /
 * accented characters) and replace the ellipsis with the Unicode `…`.
 */

const SEGMENTER =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("en", { granularity: "grapheme" })
    : undefined;

/** Count grapheme clusters (so emoji and accents count as 1). */
export function graphemeLength(input: string): number {
  if (!SEGMENTER) return Array.from(input).length;
  let n = 0;
  // The segment is unused — we only count clusters.
  for (const _segment of SEGMENTER.segment(input)) {
    void _segment;
    n++;
  }
  return n;
}

/**
 * Truncate `input` to at most `max` graphemes, appending `…` if the source
 * exceeded the limit. Always trims trailing whitespace before the ellipsis
 * so we don't render `"Hello, World    …"`.
 */
export function truncateGraphemes(input: string, max: number): string {
  if (max <= 0) return "";
  if (!SEGMENTER) {
    const arr = Array.from(input);
    if (arr.length <= max) return input;
    return `${arr.slice(0, max).join("").replace(/\s+$/u, "")}…`;
  }
  const segs: string[] = [];
  for (const s of SEGMENTER.segment(input)) {
    segs.push(s.segment);
    if (segs.length > max) break;
  }
  if (segs.length <= max) return input;
  return `${segs.slice(0, max).join("").replace(/\s+$/u, "")}…`;
}
