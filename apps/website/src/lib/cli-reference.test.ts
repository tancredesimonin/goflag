import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EXIT_CODES, FLAG_GROUPS } from "./cli-reference";
import { FLAG_EDITORIAL, FLAG_GROUP_META } from "./cli-editorial";

/**
 * The reference is read from `packages/cli/flags.json`, so these do not check
 * the flags themselves — the CLI's own suite does that, against the table the
 * parser dispatches on. What they check is the seam: that the generated data
 * and the prose written beside it still describe the same set of flags.
 */

const generated: {
  flags: Array<{ name: string; group: string }>;
  exitCodes: Array<{ code: number }>;
} = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "packages", "cli", "flags.json"), "utf8"),
);

describe("the flag reference the site renders", () => {
  it("comes from the CLI, not from a copy in this repo", () => {
    // If this file ever grows literals again, this is the test that should
    // have stopped it: every field below exists only because the CLI emitted
    // it. `--coverage` is named on purpose — it is the flag the hand-written
    // copy left out entirely.
    const flags = FLAG_GROUPS.flatMap((g) => g.flags);
    expect(flags.length).toBe(generated.flags.length);
    expect(flags.map((f) => f.flag)).toContain("--coverage <mode>");
    expect(flags.find((f) => f.flag === "--depth <n>")?.default).toBe("2");
  });

  it("loses no flag to a group nobody renders", () => {
    // A flag whose group id has no heading would simply not appear, which is
    // the failure the audit found and the one hardest to notice: the page
    // still looks complete.
    const rendered = new Set(FLAG_GROUPS.flatMap((g) => g.flags).map((f) => f.flag.split(" ")[0]));
    for (const flag of generated.flags) expect(rendered.has(flag.name)).toBe(true);
    const groups = new Set(FLAG_GROUP_META.map((g) => g.id));
    for (const flag of generated.flags) expect(groups.has(flag.group)).toBe(true);
  });

  it("has editorial prose for every flag, and no prose for a flag that is gone", () => {
    // The seam, in one assertion. A flag added to the CLI without a paragraph
    // throws at build time; a paragraph left behind by a removed flag fails
    // here, where a stale reference entry would otherwise live forever.
    expect(Object.keys(FLAG_EDITORIAL).sort()).toEqual(generated.flags.map((f) => f.name).sort());
  });

  it("explains every exit code the CLI reports, and invents none", () => {
    expect(EXIT_CODES.map((e) => e.code)).toEqual(generated.exitCodes.map((e) => e.code));
    for (const exit of EXIT_CODES) expect(exit.meaning.length).toBeGreaterThan(0);
  });
});
