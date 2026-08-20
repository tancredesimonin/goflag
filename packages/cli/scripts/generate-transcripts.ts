#!/usr/bin/env tsx
/**
 * Rewrite `test/fixtures/transcripts/` from the renderers.
 *
 * Pure: it reads the frozen reports in `transcripts.ts` and calls the three
 * renderers. No server, no browser, no pty — `color` is a parameter of every
 * renderer (`render-terminal.ts:41`), not a read of `process.stdout.isTTY`, so
 * a colourised transcript needs nothing but Node.
 *
 * Two files per view, and they are two different consumers:
 *
 *   <id>.ansi   what the documentation site paints, tokenised back into spans
 *   <id>.txt    what a CI job's log actually looks like, and what goes into
 *               the README and into an `alt` — written by the same function
 *               with one argument flipped, so the two cannot disagree
 *
 * Run it when the output is *meant* to change, and read the diff before
 * committing — the same standing as `generate-help-fixture.ts`. The pre-commit
 * hook runs it for you when `src/report/` is staged; `test/unit/transcripts.test.ts`
 * is the guarantee that `--no-verify` cannot skip.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TRANSCRIPTS } from "./transcripts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test", "fixtures", "transcripts");

mkdirSync(outDir, { recursive: true });

for (const spec of TRANSCRIPTS) {
  writeFileSync(join(outDir, `${spec.id}.ansi`), spec.render(true), "utf8");
  writeFileSync(join(outDir, `${spec.id}.txt`), spec.render(false), "utf8");
}

// The manifest is what the site iterates: it carries the order the tabs appear
// in and the command printed above each panel, so neither is retyped there.
const manifest = TRANSCRIPTS.map((spec) => ({ id: spec.id, command: spec.command }));
writeFileSync(join(outDir, "index.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

for (const spec of TRANSCRIPTS) {
  const lines = spec.render(false).split("\n");
  const widest = Math.max(...lines.map((line) => line.length));
  process.stdout.write(`${spec.id}: ${lines.length} lines, ${widest} columns\n`);
}
