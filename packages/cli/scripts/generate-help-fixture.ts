#!/usr/bin/env tsx
/**
 * Rewrite `test/fixtures/help.txt` from the current help output.
 *
 * The fixture is what freezes `goflag --help` byte for byte, so this is not a
 * step in any hook: run it only when the text is *meant* to change, and read
 * the diff before committing it. That is the whole value of the fixture — the
 * help is what users read and what the docs quote, so a reflow should be a
 * deliberate line in a diff rather than a side effect.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HELP } from "../src/cli-args";

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "..", "test", "fixtures", "help.txt"), HELP, "utf8");
process.stdout.write(`help.txt: ${HELP.split("\n").length} lines\n`);
