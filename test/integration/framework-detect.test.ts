import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { detectFrameworkFromCwd } from "@/lib/config";

const FIXTURES = resolve(__dirname, "../fixtures/package-manifests");

describe("detectFrameworkFromCwd (real filesystem)", () => {
  it.each([
    ["next", "next"],
    ["astro", "astro"],
    ["nuxt", "nuxt"],
    ["unknown", "unknown"],
  ] as const)("detects %s fixture as `%s`", (dir, expected) => {
    expect(detectFrameworkFromCwd(resolve(FIXTURES, dir))).toBe(expected);
  });

  it("walks up from a nested cwd to find the host package.json", () => {
    expect(detectFrameworkFromCwd(resolve(FIXTURES, "next"))).toBe("next");
  });
});
