import { describe, expect, it } from "vitest";

import { oklchPalette, oklchToHex, oklchToRgb, readOklch } from "./oklch.js";

describe("oklchToHex", () => {
  it("converts the two colours the transform has no room to be subtly wrong about", () => {
    expect(oklchToHex([1, 0, 0])).toBe("#ffffff");
    expect(oklchToHex([0, 0, 0])).toBe("#000000");
  });

  it("agrees with the values the goflag site's theme resolves to in a browser", () => {
    // `--terminal` and `--terminal-green` out of apps/website's globals.css,
    // and the hexes the card has carried since they were computed rather than
    // eyeballed. When they were eyeballed, all four were wrong.
    expect(oklchToHex([0.19, 0.005, 250])).toBe("#121416");
    expect(oklchToHex([0.765, 0.177, 163.223])).toBe("#00d492");
  });

  it("clamps out of gamut rather than wrapping the byte", () => {
    // A chroma no sRGB display can show. The honest answer is the edge of the
    // gamut, which is also what a browser does.
    const [r, g, b] = oklchToRgb([0.7, 0.4, 30]);

    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});

const SHEET = `
@custom-variant dark (&:is(.dark *));

@layer base {
  :root {
    --background: oklch(1 0 0);
    --terminal: oklch(0.19 0.005 250);
    --radius: 0.625rem;
  }

  .dark {
    --background: oklch(0.18 0.04 45.28);
    --foreground: oklch(85% 0.04 70.96);
    --ghost: oklch(from var(--background) l c h);
    --veil: oklch(0.2 0.03 40 / 0.6);
  }
}

.dark .grain::after {
  --background: oklch(0 0 0);
}
`;

describe("oklchPalette", () => {
  it("reads every declaration it recognises and skips the rest", () => {
    const palette = oklchPalette(SHEET, { scope: ".dark" });

    expect(Object.keys(palette).sort()).toEqual(["background", "foreground", "veil"]);
  });

  it("keeps the scope's declaration, not the first one in the file", () => {
    // The whole reason `scope` exists: a theme declares the same property once
    // per scheme, and a dark card that read the light value would be wrong in a
    // way nobody notices until the card is next looked at.
    expect(oklchPalette(SHEET, { scope: ".dark" }).background).toBe("#200b03");
    expect(oklchPalette(SHEET, { scope: ":root" }).background).toBe("#ffffff");
  });

  it("survives the nesting a Tailwind v4 sheet puts around the block", () => {
    // A regex stopping at the first `}` stops inside `@layer`.
    expect(oklchPalette(SHEET, { scope: "@layer base" }).terminal).toBe("#121416");
  });

  it("is not fooled by `@custom-variant dark`, which every one of these sheets opens with", () => {
    // The bug this was written against: `indexOf(".dark")` lands on line one,
    // then takes the body of the next rule it finds — `:root`. The dark card
    // would have been handed the light palette, and nothing would have said so.
    expect(oklchPalette(SHEET, { scope: ".dark" }).background).toBe("#200b03");
  });

  it("is not fooled by a descendant selector that starts with the scope", () => {
    // `.dark .grain::after` redeclares `--background` further down the sheet.
    expect(oklchPalette(SHEET, { scope: ".dark" }).background).not.toBe("#000000");
  });

  it("reads a lightness percentage the way CSS does", () => {
    expect(oklchPalette(SHEET, { scope: ".dark" }).foreground).toBe("#dfcab2");
  });

  it("scales a chroma percentage against 0.4, not against 1", () => {
    // CSS Color 4 fixes a different reference range per coordinate: 100% is 1
    // for lightness and 0.4 for chroma. Dividing both by 100 does not produce a
    // rounded colour, it produces a different one — and silently, which is the
    // failure this whole file exists to make impossible.
    expect(oklchPalette("--a: oklch(50% 50% 180);").a).toBe(oklchToHex([0.5, 0.2, 180]));
  });

  it("refuses a percentage on the hue, which has no reference range to scale by", () => {
    expect(oklchPalette("--a: oklch(0.5 0.2 50%);")).toEqual({});
  });

  it("does not read a declaration that is commented out", () => {
    // A theme keeps the value it replaced commented above its replacement, and
    // "first declaration wins" would hand the caller the dead one — while the
    // drift guard built on top of this passed, against a colour the site no
    // longer applies.
    const sheet = `:root {
      /* --terminal: oklch(1 0 0); the light surface, before the redesign */
      --terminal: oklch(0.19 0.005 250);
    }`;

    expect(oklchPalette(sheet, { scope: ":root" }).terminal).toBe("#121416");
  });

  it("is not truncated by a brace inside a comment", () => {
    const sheet = `:root {
      /* the terminal is dark in both themes } even here */
      --terminal: oklch(0.19 0.005 250);
    }`;

    expect(oklchPalette(sheet, { scope: ":root" }).terminal).toBe("#121416");
  });

  it("drops alpha rather than mistaking it for a fourth coordinate", () => {
    expect(oklchPalette(SHEET, { scope: ".dark" }).veil).toBe(oklchToHex([0.2, 0.03, 40]));
  });

  it("returns nothing for a scope the sheet does not declare", () => {
    expect(oklchPalette(SHEET, { scope: ".sepia" })).toEqual({});
  });

  it("reads the whole sheet when no scope is given", () => {
    expect(oklchPalette(SHEET).terminal).toBe("#121416");
  });
});

describe("readOklch", () => {
  it("names the property the stylesheet does not declare", () => {
    expect(() => readOklch(SHEET, "accent", { scope: ".dark" })).toThrow(/--accent.*\.dark/s);
  });

  it("returns the one declaration asked for", () => {
    expect(readOklch(SHEET, "terminal")).toBe("#121416");
  });
});
