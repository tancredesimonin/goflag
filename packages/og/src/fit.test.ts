import { describe, expect, it } from "vitest";

import { countGraphemes, fitTitle, type Fit } from "./fit.js";

/** The goflag site's measured table, used here as a fixture and nothing more. */
const FIT: Fit = {
  steps: [
    { upTo: 32, fontSize: 72 },
    { upTo: 56, fontSize: 60 },
    { upTo: 80, fontSize: 52 },
  ],
  smallest: 44,
};

describe("fitTitle", () => {
  it("gives a short title the largest step", () => {
    expect(fitTitle("Changelog", FIT).fontSize).toBe(72);
  });

  it("steps down as the title grows, and lands on each step once", () => {
    const sizes = ["Changelog", "x".repeat(40), "x".repeat(60), "x".repeat(120)].map(
      (title) => fitTitle(title, FIT).fontSize,
    );

    expect(sizes).toEqual([72, 60, 52, 44]);
  });

  it("treats `upTo` as inclusive, so a boundary belongs to the step it names", () => {
    expect(fitTitle("x".repeat(32), FIT).fontSize).toBe(72);
    expect(fitTitle("x".repeat(33), FIT).fontSize).toBe(60);
  });

  it("never goes below `smallest`, however long the title", () => {
    expect(fitTitle("x".repeat(10_000), FIT).fontSize).toBe(44);
  });

  it("clamps every title to the same number of lines", () => {
    // The net that does the work satori's missing measurement cannot: the step
    // is a guess, the clamp is not.
    expect(fitTitle("Changelog", FIT).lineClamp).toBe(3);
    expect(fitTitle("x".repeat(200), FIT).lineClamp).toBe(3);
  });

  it("takes the caller's line count when it has one", () => {
    expect(fitTitle("Changelog", { ...FIT, lines: 2 }).lineClamp).toBe(2);
  });

  it("counts glyphs, not code units", () => {
    // Twenty family emoji are twenty glyphs wide and several hundred code units
    // long. Measured in code units this would drop three steps for a width the
    // reader cannot see.
    const emoji = "👨‍👩‍👧‍👦".repeat(20);

    expect([...emoji].length).toBeGreaterThan(60);
    expect(fitTitle(emoji, FIT).fontSize).toBe(72);
  });

  it("ignores surrounding whitespace", () => {
    expect(fitTitle("  Changelog  ", FIT)).toEqual(fitTitle("Changelog", FIT));
  });

  it("refuses a table with no steps rather than rendering everything at the floor", () => {
    expect(() => fitTitle("Changelog", { steps: [], smallest: 44 })).toThrow(/measure/);
  });

  it("refuses a table out of order, because `find` would make its later steps dead", () => {
    // The failure this guards is silent: a `{ upTo: 80 }` listed first swallows
    // every short title, and the card still renders.
    const scrambled: Fit = {
      steps: [
        { upTo: 80, fontSize: 52 },
        { upTo: 32, fontSize: 72 },
      ],
      smallest: 44,
    };

    expect(() => fitTitle("Changelog", scrambled)).toThrow(/ascend/);
  });
});

describe("countGraphemes", () => {
  it("counts a combining accent as one glyph", () => {
    // NFD: "e" followed by U+0301. Two code units, one character on the card.
    expect(countGraphemes("Política")).toBe(8);
  });

  it("counts an empty string as nothing", () => {
    expect(countGraphemes("")).toBe(0);
  });
});
