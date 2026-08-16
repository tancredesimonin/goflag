import { describe, expect, it } from "vitest";

import { truncateGraphemes } from "./text.js";

describe("truncateGraphemes", () => {
  it("leaves a string that fits alone", () => {
    expect(truncateGraphemes("Changelog", 20)).toBe("Changelog");
  });

  it("leaves a string that fits exactly alone", () => {
    expect(truncateGraphemes("Changelog", 9)).toBe("Changelog");
  });

  it("counts the ellipsis, so the result is never longer than the budget", () => {
    expect(truncateGraphemes("abcdefghij", 5)).toBe("abcd…");
  });

  it("cuts on glyphs, not code units, so an accent is not half a character", () => {
    // Measured in code units this would cut inside the combining sequence and
    // render a stray accent — the same disagreement `fitTitle` avoids by
    // counting glyphs too.
    const value = "Política de privacidade";

    expect([...truncateGraphemes(value, 10)]).not.toContain("́");
  });

  it("refuses a budget with no room in it", () => {
    expect(() => truncateGraphemes("Changelog", 0)).toThrow(/nothing to show/);
  });
});
