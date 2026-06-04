import { describe, expect, it } from "vitest";
import { GOFLAG_VERSION, isPreAlpha } from "./version";

describe("version", () => {
  it("exposes a non-empty semver-ish version string", () => {
    expect(GOFLAG_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("flags 0.x.y versions as pre-alpha", () => {
    expect(isPreAlpha("0.1.0")).toBe(true);
    expect(isPreAlpha("1.0.0")).toBe(false);
  });
});
