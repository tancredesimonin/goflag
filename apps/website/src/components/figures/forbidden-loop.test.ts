import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ARTWORK, FRAME, PLACEHOLDER } from "./forbidden-loop";

/**
 * This figure draws a historical measurement, not current behaviour, so there
 * is no engine expression to pin it to. What it can be pinned to is the page it
 * illustrates: the three numbers are published in `next/routes.mdx`, and a
 * figure quietly disagreeing with the prose beside it is worse than none.
 */
const ROUTES = readFileSync(join(process.cwd(), "content", "docs", "next", "routes.mdx"), "utf8");

describe("the forbidden-loop figure", () => {
  it("draws the numbers the page publishes", () => {
    expect(ROUTES).toContain(`${ARTWORK.side}×${ARTWORK.side}`);
    expect(ROUTES).toContain(`${PLACEHOLDER.bytes}-byte`);
    expect(ROUTES).toContain(`${FRAME.w}×${FRAME.h}`);
  });

  it("draws a frame whose ratio is the score the prose cites", () => {
    // "an invented 1200×630 scored 1.9 and passed". If the frame ever stopped
    // being 1.9:1, the drawing would illustrate a different number than the
    // sentence under it.
    expect((FRAME.w / FRAME.h).toFixed(1)).toBe("1.9");
    expect(ROUTES).toContain("scored 1.9");
  });

  it("draws an artwork that cannot fit, which is the point of true scale", () => {
    // Centred at true scale, a 1024-high square overflows a 630-high frame by
    // ~197 units top and bottom. Shrinking it "to fit" would remove the only
    // thing the reader is meant to see.
    expect(ARTWORK.side).toBeGreaterThan(FRAME.h);
  });

  it("draws a placeholder small enough to be invisible, and says so", () => {
    expect(PLACEHOLDER.side).toBe(1);
    expect(PLACEHOLDER.side / FRAME.w).toBeLessThan(0.001);
  });
});
