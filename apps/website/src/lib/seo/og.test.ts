import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fitTitle, OG_TOKENS } from "./og";

/**
 * The card's palette against the stylesheet's.
 *
 * `next/og` renders through satori, which resolves no CSS variables and does
 * not speak `oklch()`, so `og.tsx` has to restate the theme's colours as sRGB.
 * That duplication is forced; going unnoticed when the theme moves is not.
 *
 * The comment in `og.tsx` used to be the whole guarantee, and a comment that
 * asserts two values are equal is a comment that will eventually be wrong. This
 * converts the real declarations out of `globals.css` and compares them, so the
 * theme and the preview card cannot drift apart in silence.
 */

const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

/** Read one `--custom-property: oklch(L C H);` declaration out of the sheet. */
function oklchToken(name: string): [number, number, number] {
  const match = new RegExp(`--${name}:\\s*oklch\\(([^)]+)\\)`).exec(css);
  if (!match) throw new Error(`globals.css declares no --${name}`);

  const parts = match[1]!.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    throw new Error(`--${name} is not three numbers: ${match[1]}`);
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

/**
 * OKLCH → sRGB hex.
 *
 * Björn Ottosson's Oklab transform, as the CSS Color 4 specification defines
 * it: polar to rectangular, Oklab to cone responses, cube, the LMS matrix to
 * linear sRGB, then the sRGB transfer function. Out-of-gamut components are
 * clamped, which is what a browser does too.
 */
function oklchToHex([l, c, h]: [number, number, number]): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;

  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];

  const channel = (value: number): string => {
    const gamma = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    const byte = Math.round(Math.min(1, Math.max(0, gamma)) * 255);
    return byte.toString(16).padStart(2, "0");
  };

  return `#${linear.map(channel).join("")}`;
}

/** Two hexes within `tolerance` on every channel. */
function closeEnough(actual: string, expected: string, tolerance = 0): boolean {
  const bytes = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return bytes(actual).every(
    (value, index) => Math.abs(value - bytes(expected)[index]!) <= tolerance,
  );
}

describe("OG_TOKENS", () => {
  // Exact, now that the tokens are computed rather than eyeballed. When they
  // were not, this comparison failed on all four greys the first time it ran —
  // which is the whole argument for having written it.
  it.each([
    ["bg", "terminal", OG_TOKENS.bg],
    ["fg", "terminal-foreground", OG_TOKENS.fg],
    ["dim", "terminal-dim", OG_TOKENS.dim],
    ["border", "terminal-border", OG_TOKENS.border],
    ["accent", "terminal-green", OG_TOKENS.accent],
  ])("%s matches --%s in globals.css", (_name, property, token) => {
    const expected = oklchToHex(oklchToken(property));
    expect(closeEnough(token, expected), `${token} vs ${expected}`).toBe(true);
  });

  it("carries the three verdict colours the CLI prints, in that order", () => {
    const expected = ["terminal-green", "terminal-yellow", "terminal-red"].map((property) =>
      oklchToHex(oklchToken(property)),
    );
    for (const [index, colour] of OG_TOKENS.verdicts.entries()) {
      expect(closeEnough(colour, expected[index]!), `${colour} vs ${expected[index]}`).toBe(true);
    }
  });

  it("converts a known colour correctly, so a passing comparison means something", () => {
    // White and black, where the transform has no room to be subtly wrong.
    expect(oklchToHex([1, 0, 0])).toBe("#ffffff");
    expect(oklchToHex([0, 0, 0])).toBe("#000000");
  });
});

describe("fitTitle", () => {
  it("gives a short title the largest step", () => {
    expect(fitTitle("Changelog").fontSize).toBe(72);
  });

  it("steps down as the title grows", () => {
    const sizes = ["Changelog", "x".repeat(40), "x".repeat(60), "x".repeat(120)].map(
      (title) => fitTitle(title).fontSize,
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBe(4);
  });

  it("never goes below the smallest step, however long the title", () => {
    expect(fitTitle("x".repeat(10_000)).fontSize).toBe(44);
  });

  it("clamps every title to the same number of lines", () => {
    // The net that does the work satori's missing text measurement cannot: the
    // step is a guess, the clamp is not.
    expect(fitTitle("Changelog").lineClamp).toBe(3);
    expect(fitTitle("x".repeat(200)).lineClamp).toBe(3);
  });

  it("counts glyphs, not code units", () => {
    // Twenty-eight family emoji are twenty-eight glyphs wide and several
    // hundred code units long. Measured in code units this would drop three
    // steps for a width the reader cannot see.
    const emoji = "👨‍👩‍👧‍👦".repeat(20);
    expect([...emoji].length).toBeGreaterThan(60);
    expect(fitTitle(emoji).fontSize).toBe(72);
  });

  it("ignores surrounding whitespace", () => {
    expect(fitTitle("  Changelog  ")).toEqual(fitTitle("Changelog"));
  });

  it("keeps the site's four hero titles on one step", () => {
    // The measured reason there is no per-locale factor yet: the four
    // translations land within seven characters of each other.
    const heroes = [
      "Your page is perfect. Google no longer sees it.",
      "Votre page est parfaite. Google ne la voit plus.",
      "Su página es perfecta. Google ya no la ve.",
      "Sua página está perfeita. O Google não a vê mais.",
    ];
    expect(new Set(heroes.map((title) => fitTitle(title).fontSize)).size).toBe(1);
  });
});
