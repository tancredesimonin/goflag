import { describe, expect, it } from "vitest";
import { graphemeLength, truncateGraphemes } from "./truncate";

describe("graphemeLength", () => {
  it("treats combining sequences as one cluster", () => {
    expect(graphemeLength("e\u0301")).toBe(1); // é = e + COMBINING ACUTE ACCENT
  });

  it("treats emoji ZWJ sequences as one cluster", () => {
    expect(graphemeLength("👨‍👩‍👧")).toBe(1);
  });

  it("returns 0 for empty input", () => {
    expect(graphemeLength("")).toBe(0);
  });
});

describe("truncateGraphemes", () => {
  it("returns the source untouched when shorter than max", () => {
    expect(truncateGraphemes("hi", 10)).toBe("hi");
  });

  it("appends an ellipsis when truncating", () => {
    expect(truncateGraphemes("hello world", 5)).toBe("hello…");
  });

  it("trims trailing whitespace before the ellipsis", () => {
    expect(truncateGraphemes("hello    world", 7)).toBe("hello…");
  });

  it("does not split combining sequences", () => {
    const long = `${"e\u0301".repeat(10)}`;
    const out = truncateGraphemes(long, 5);
    expect(graphemeLength(out)).toBeLessThanOrEqual(6); // 5 + ellipsis
    expect(out).toMatch(/…$/);
  });

  it("handles max=0 by returning empty", () => {
    expect(truncateGraphemes("hello", 0)).toBe("");
  });
});
