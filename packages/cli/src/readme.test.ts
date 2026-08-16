import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The versions the README hands a reader to copy.
 *
 * `pnpm release` rewrites them, and until now nothing checked them afterwards.
 * That gap cost a real defect: a release that was reverted left `0.2.12` in both
 * CI snippets, a correction for it was written, and the correction was **lost in
 * a merge** with no test to notice. The README ships inside this package —
 * `prepack` copies it — so the npm page spent that time handing people a command
 * that answers 404.
 *
 * `apps/website/src/lib/constants.test.ts` has held the site's literals against
 * these same manifests from the start. This is the same guard for the other
 * place a version is written by hand.
 */

const ROOT = join(__dirname, "..", "..", "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const version = JSON.parse(readFileSync(join(ROOT, "packages", "cli", "package.json"), "utf8"))
  .version as string;

describe("the versions README.md tells a reader to install", () => {
  it("pins the CI sample at the version this package declares", () => {
    const pins = [...readme.matchAll(/GOFLAG_VERSION: "([^"]+)"/g)].map((match) => match[1]);

    expect(pins.length, "the README no longer carries a GOFLAG_VERSION pin").toBeGreaterThan(0);
    for (const pin of pins) expect(pin).toBe(version);
  });

  it("pins every inline `@goflag/cli@x.y.z` at the same version", () => {
    // The interpolated `@goflag/cli@$GOFLAG_VERSION` forms are covered by the
    // check above; these are the ones written out in full.
    const pins = [...readme.matchAll(/@goflag\/cli@(\d+\.\d+\.\d+)/g)].map((match) => match[1]);

    expect(pins.length, "the README no longer pins a version inline").toBeGreaterThan(0);
    for (const pin of pins) expect(pin).toBe(version);
  });
});
