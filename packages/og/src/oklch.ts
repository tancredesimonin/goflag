/**
 * OKLCH to sRGB, and the stylesheet reader that makes it worth having.
 *
 * A card rendered by satori resolves no CSS variable and does not speak
 * `oklch()`, so a site whose theme is written in OKLCH — every site this
 * package was extracted from — has to restate its colours as sRGB somewhere
 * else. That duplication is forced. The drift is not, and it is what actually
 * happens: on the goflag site all four transcribed greys were wrong, invisibly,
 * by a hue step and by sixteen levels; on stereo-house the same two colours are
 * hand-transcribed in three places with no check anywhere.
 *
 * `docs/og-plan.md` §10.5 draws the conclusion: **the package has to supply the
 * conversion, not merely consume it.** With `oklchPalette` a site derives its
 * tokens from `globals.css` instead of transcribing them, and there is nothing
 * left to drift.
 */

/** `[L, C, H]` exactly as CSS writes them: L in 0–1, C absolute, H in degrees. */
export type Oklch = readonly [l: number, c: number, h: number];

/**
 * Björn Ottosson's Oklab transform as CSS Color 4 defines it: polar to
 * rectangular, Oklab to cone responses, cube, the LMS matrix to linear sRGB,
 * then the sRGB transfer function. Out-of-gamut components are clamped, which
 * is what a browser does too.
 */
export function oklchToRgb([l, c, h]: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;

  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ] as const;

  return linear.map(toByte) as [number, number, number];
}

export function oklchToHex(colour: Oklch): string {
  return `#${oklchToRgb(colour)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function toByte(value: number): number {
  const gamma = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

  return Math.round(Math.min(1, Math.max(0, gamma)) * 255);
}

export interface PaletteOptions {
  /**
   * Restrict the read to one rule's block — `":root"`, `".dark"`, `"@media"`.
   *
   * A theme declares the same custom property twice, once per scheme, and a
   * card is rendered in one of them. Without a scope the first declaration in
   * the file wins, which is the light theme on a site whose card is dark.
   */
  readonly scope?: string;
}

/**
 * Every `--name: oklch(L C H)` declaration in a stylesheet, as sRGB hex.
 *
 * Deliberately a reader and not a parser: it takes the declarations it
 * recognises and ignores everything else, including the `--name: oklch(from …)`
 * and `color-mix()` forms, which have no fixed value to convert. A property
 * this returns nothing for is a property the caller has to look at, which is
 * better than a value quietly invented for it.
 *
 * Alpha (`oklch(L C H / A)`) is read and dropped: an `og:image` is opaque, and
 * a card that silently lost a transparency would be worse than one that never
 * offered it.
 */
export function oklchPalette(css: string, options: PaletteOptions = {}): Record<string, string> {
  const stripped = withoutComments(css);
  const source = options.scope === undefined ? stripped : blockOf(stripped, options.scope);
  const palette: Record<string, string> = {};

  for (const match of source.matchAll(/--([\w-]+):\s*oklch\(\s*([^)]+?)\s*\)/g)) {
    const colour = triple(match[2]!);
    // First declaration wins, like `Object.assign` order and unlike the
    // cascade — inside one block a property is not normally declared twice, and
    // when it is, the caller has a stylesheet problem rather than a colour one.
    if (colour && !(match[1]! in palette)) palette[match[1]!] = oklchToHex(colour);
  }

  return palette;
}

/** One declaration, or a thrown error naming what the sheet does not declare. */
export function readOklch(css: string, property: string, options: PaletteOptions = {}): string {
  const hex = oklchPalette(css, options)[property];
  if (hex === undefined) {
    const where = options.scope === undefined ? "" : ` under ${options.scope}`;
    throw new Error(`No \`--${property}: oklch(...)\` declaration${where}.`);
  }

  return hex;
}

/**
 * A percentage means a different number on each coordinate, and CSS Color 4
 * says which.
 *
 * `100%` is `1` for lightness and **`0.4`** for chroma — the reference range the
 * specification fixes for `oklch()`. Scaling both by the same factor is not a
 * rounding difference: `oklch(50% 50% 180)` resolves to `#008368` in a browser
 * and would come out `#00a06e` here, a colour the stylesheet does not contain.
 * The whole point of this file is that such a value cannot appear silently.
 *
 * Hue is an angle and takes no percentage at all; a unit on it is rejected
 * further down, along with everything else this reader does not recognise.
 */
const REFERENCE = [1, 0.4] as const;

function triple(values: string): Oklch | null {
  // `L C H / A` — the alpha is read so it cannot be mistaken for a fourth
  // coordinate, then dropped.
  const parts = values.split("/")[0]!.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const numbers = parts.slice(0, 3).map((part, index) => scaled(part, REFERENCE[index]));
  if (numbers.some(Number.isNaN)) return null;

  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

function scaled(value: string, reference: number | undefined): number {
  if (!value.endsWith("%")) return Number(value);
  // A percentage where the coordinate has no reference range — the hue — is not
  // a value to guess at.
  if (reference === undefined) return Number.NaN;

  return (Number(value.slice(0, -1)) / 100) * reference;
}

/**
 * Comments removed before anything else looks at the sheet.
 *
 * A theme keeps the value it replaced commented above the one it replaced it
 * with, and `--bg` declared twice means the first one wins — so the dead
 * declaration would beat the live one, and the guard built on top of this would
 * pass against a colour the site no longer applies. Stripping first also keeps
 * a stray brace inside a comment from truncating the block the counter below is
 * walking.
 */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The body of the first rule whose selector *is* `scope`.
 *
 * Two decisions, both paid for by a real sheet.
 *
 * **The scope has to be the whole selector**, not a substring of one. Every
 * Tailwind v4 sheet these sites use opens with
 * `@custom-variant dark (&:is(.dark *));`, and a plain `indexOf(".dark")` lands
 * on that line and then takes the body of whatever rule comes next — `:root`,
 * so the dark card would have silently been given the light palette. Requiring
 * a `{` right after the match rules that out, along with `.dark .grain::after`
 * and the dozen other descendant selectors further down.
 *
 * **Brace counting rather than a CSS parser**: those sheets nest `@layer`,
 * `@media` and `@theme` around the block that holds the tokens, so a regex
 * stopping at the first `}` stops in the middle. Counting is a dozen lines and
 * survives the nesting; anything more would be a parser this package has no
 * business shipping.
 */
function blockOf(css: string, scope: string): string {
  const open = openingBrace(css, scope);
  if (open < 0) return "";

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }

  return css.slice(open + 1);
}

/** Where `scope`'s own block opens, or -1 if the sheet only mentions it. */
function openingBrace(css: string, scope: string): number {
  for (let at = css.indexOf(scope); at >= 0; at = css.indexOf(scope, at + scope.length)) {
    const rest = css.slice(at + scope.length);
    const spaces = rest.length - rest.trimStart().length;
    if (rest[spaces] === "{") return at + scope.length + spaces;
  }

  return -1;
}
