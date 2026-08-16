import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fitTitle, oklchPalette } from "@goflag/og";
import { describe, expect, it } from "vitest";

import { OG_FIT, OG_TOKENS, OG_VERDICTS } from "./og";

/**
 * The card's palette against the stylesheet's, and the degression against this
 * site's real titles.
 *
 * `next/og` renders through satori, which resolves no CSS variables and does
 * not speak `oklch()`, so `og.tsx` has to restate the theme's colours as sRGB.
 * That duplication is forced; going unnoticed when the theme moves is not.
 *
 * The comment in `og.tsx` used to be the whole guarantee, and a comment that
 * asserts two values are equal is a comment that will eventually be wrong. It
 * was: all four greys were off, invisibly, when this was first written.
 *
 * The conversion itself is no longer a copy kept here — `@goflag/og` owns it,
 * because the same transcription happens on every site that renders a card and
 * every one of them was doing it by hand.
 */

const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

/**
 * `:root`, not `.dark`.
 *
 * The terminal surface is the product shot and is dark in both themes, so the
 * card takes the default declaration rather than the one the dark theme
 * overrides it with. Naming the scope is what stops that from being an accident
 * of which declaration comes first in the file.
 */
const theme = oklchPalette(css, { scope: ":root" });

/** Two hexes within `tolerance` on every channel. */
function closeEnough(actual: string, expected: string, tolerance = 0): boolean {
  const bytes = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

  return bytes(actual).every(
    (value, index) => Math.abs(value - bytes(expected)[index]!) <= tolerance,
  );
}

describe("OG_TOKENS", () => {
  it.each([
    ["bg", "terminal", OG_TOKENS.bg],
    ["fg", "terminal-foreground", OG_TOKENS.fg],
    ["dim", "terminal-dim", OG_TOKENS.dim],
    ["border", "terminal-border", OG_TOKENS.border],
    ["accent", "terminal-green", OG_TOKENS.accent],
  ])("%s matches --%s in globals.css", (_name, property, token) => {
    const expected = theme[property];

    expect(expected, `globals.css declares no --${property} under :root`).toBeDefined();
    expect(closeEnough(token, expected!), `${token} vs ${expected}`).toBe(true);
  });

  it("carries the three verdict colours the CLI prints, in that order", () => {
    const expected = ["terminal-green", "terminal-yellow", "terminal-red"].map(
      (property) => theme[property],
    );

    for (const [index, colour] of OG_VERDICTS.entries()) {
      expect(closeEnough(colour, expected[index]!), `${colour} vs ${expected[index]}`).toBe(true);
    }
  });

  it("draws the icon in the same two colours the card uses", () => {
    // Three copies of one mark used to disagree: `icon.svg` was `#12151a` on
    // `#e8eaed`, neither of which the stylesheet declares anywhere.
    const icon = readFileSync(join(__dirname, "../../app/icon.svg"), "utf8");

    expect(icon).toContain(OG_TOKENS.bg);
    expect(icon).toContain(OG_TOKENS.fg);
    expect(icon).toContain(OG_TOKENS.accent);
  });
});

describe("OG_FIT", () => {
  const fit = (title: string) => fitTitle(title, OG_FIT);

  it("gives a short title the largest step", () => {
    expect(fit("Changelog").fontSize).toBe(72);
  });

  it("steps down as the title grows, and reaches every step", () => {
    const sizes = ["Changelog", "x".repeat(40), "x".repeat(60), "x".repeat(120)].map(
      (title) => fit(title).fontSize,
    );

    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBe(4);
  });

  it("keeps the site's four hero titles on one step", () => {
    // The measured reason there is no per-locale factor yet: the four
    // translations land within seven characters of each other, and the first
    // draft of the table cut straight through them at 48.
    const heroes = [
      "Your page is perfect. Google no longer sees it.",
      "Votre page est parfaite. Google ne la voit plus.",
      "Su página es perfecta. Google ya no la ve.",
      "Sua página está perfeita. O Google não a vê mais.",
    ];

    expect(new Set(heroes.map((title) => fit(title).fontSize)).size).toBe(1);
  });

  it("keeps every rule id on a step that leaves room for its summary", () => {
    // The longest thing a card here can carry, and the reason these boundaries
    // are not the ones stereo-house measured for itself.
    expect(fit("hreflang.sitemap-mismatch").fontSize).toBe(72);
  });
});
