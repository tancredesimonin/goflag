import { describe, expect, it } from "vitest";

import { FINGERPRINTS } from "./fingerprint-card";

/**
 * The ids are computed by `packages/cli`, so nothing here re-derives them —
 * that would be a second implementation of the scheme, which is the thing the
 * whole arrangement avoids.
 *
 * What this checks is that the fixture still *demonstrates the claim*. The
 * figure exists to show that one finding keeps its identity across origins and
 * another does not; a fixture where both agree, or both differ, would render
 * perfectly and teach the opposite of the page it sits in.
 */
describe("the fingerprint figure", () => {
  it("compares more than one origin, or there is nothing to compare", () => {
    expect(FINGERPRINTS.origins.length).toBeGreaterThan(1);
    for (const item of FINGERPRINTS.cases) {
      expect(Object.keys(item.ids).sort()).toEqual([...FINGERPRINTS.origins].sort());
    }
  });

  it("shows one finding that survives a change of origin", () => {
    const stable = FINGERPRINTS.cases.filter((item) => item.stable);
    expect(stable.length).toBeGreaterThan(0);
    for (const item of stable) {
      expect(new Set(Object.values(item.ids)).size, item.finding).toBe(1);
    }
  });

  it("shows one that does not, which is the exception the page warns about", () => {
    // The broken-link case. Without it the figure teaches "ids are stable" and
    // the reader hits the exception in production, on a reddened baseline.
    const moving = FINGERPRINTS.cases.filter((item) => !item.stable);
    expect(moving.length).toBeGreaterThan(0);
    for (const item of moving) {
      expect(new Set(Object.values(item.ids)).size, item.finding).toBe(
        Object.keys(item.ids).length,
      );
    }
  });

  it("carries ids in the shape the engine emits", () => {
    // `fingerprint()` returns `<category>-<10 hex>`. A fixture of empty strings
    // or of `undefined` would satisfy every count above.
    for (const item of FINGERPRINTS.cases) {
      for (const [origin, id] of Object.entries(item.ids)) {
        expect(id, `${item.finding} @ ${origin}`).toMatch(/^[a-z]+-[0-9a-f]{10}$/);
      }
    }
  });

  it("says why, for both, in a sentence rather than a label", () => {
    for (const item of FINGERPRINTS.cases) {
      expect(item.why.length, item.finding).toBeGreaterThan(40);
      expect(item.parts.length, item.finding).toBeGreaterThan(1);
    }
  });
});
