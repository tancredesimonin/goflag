import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HELP } from "./cli-args";

/**
 * The help text, frozen byte for byte.
 *
 * `HELP` is about to stop being a hand-written string and start being rendered
 * from the flag table, so that the parser and the help can no longer disagree.
 * That refactor is only safe if the output does not move: `goflag --help` is
 * the thing users read, it is quoted in the docs, and a reflow would look like
 * a change nobody asked for.
 *
 * The expected text lives in a fixture rather than inline, so a diff on it is
 * readable as text rather than as an escaped string literal. Regenerate
 * deliberately — `pnpm --filter @goflag/cli generate:help-fixture` — and read
 * the diff before accepting it.
 */
describe("goflag --help", () => {
  it("prints exactly the text it printed before the flag table existed", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const expected = readFileSync(join(here, "..", "test", "fixtures", "help.txt"), "utf8");
    expect(HELP).toBe(expected);
  });
});
