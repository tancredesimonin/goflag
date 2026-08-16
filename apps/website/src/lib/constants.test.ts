import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CARDS, LIB, PACKAGE } from "./constants";

/**
 * The versions the site quotes are literals, so nothing stops them from rotting.
 * `PACKAGE.version` sat at `0.1.4` while `0.2.0` was on npm, which put a version
 * that no longer existed into every install snippet in the documentation.
 *
 * This is the guard rather than a build-time read: `constants.ts` reaches
 * components, and importing `node:fs` there would make them all server-only.
 */
function manifestVersion(pkg: string): string {
  const path = join(process.cwd(), "..", "..", "packages", pkg, "package.json");
  return JSON.parse(readFileSync(path, "utf8")).version;
}

describe("the versions the site quotes", () => {
  it("matches what @goflag/cli actually declares", () => {
    expect(PACKAGE.version).toBe(manifestVersion("cli"));
  });

  it("matches what @goflag/next actually declares", () => {
    expect(LIB.version).toBe(manifestVersion("next"));
  });

  it("matches what @goflag/og actually declares", () => {
    expect(CARDS.version).toBe(manifestVersion("og"));
  });
});
