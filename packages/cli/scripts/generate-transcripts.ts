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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildFingerprintFixture } from "./fingerprint-fixture";
import { renderPreviewFixture } from "./preview-fixture";
import { TRANSCRIPTS } from "./transcripts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test", "fixtures", "transcripts");

mkdirSync(outDir, { recursive: true });

for (const spec of TRANSCRIPTS) {
  writeFileSync(join(outDir, `${spec.id}.ansi`), spec.render(true), "utf8");
  writeFileSync(join(outDir, `${spec.id}.txt`), spec.render(false), "utf8");
}

// The fingerprint comparisons, computed by the engine's own functions. The
// documentation makes a claim about identity that a reader cannot check, and an
// id written by hand is a number they would be right not to believe.
writeFileSync(
  join(outDir, "fingerprints.json"),
  `${JSON.stringify(buildFingerprintFixture(), null, 2)}\n`,
  "utf8",
);

// The preview lands in the same folder, and that is not laziness: the
// `changes:` glob of `deploy-develop` and the `git add` of the pre-commit hook
// both already name `packages/cli/test/fixtures/transcripts`, and
// `**/fixtures/**` is prettier-ignored so the HTML is not reformatted. A new
// folder would cost two more edits and a paragraph in `.gitlab-ci.yml` to buy
// a more accurate directory name.
writeFileSync(join(outDir, "preview.html"), renderPreviewFixture(), "utf8");

// The manifest is what the site iterates: it carries the order the tabs appear
// in and the command printed above each panel, so neither is retyped there.
const manifest = TRANSCRIPTS.map((spec) => ({ id: spec.id, command: spec.command }));
writeFileSync(join(outDir, "index.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// --- The README ---------------------------------------------------------
//
// The root README *is* the npm page for `@goflag/cli` — `prepack` copies it —
// and it quotes the CLI's output in blocks that were typed by hand, the same
// arrangement that rotted `terminal-samples.ts` one surface over. A marker pair
// turns such a block into a generated region: everything between the two
// comments is rewritten from the same `.txt` the fixtures carry, and
// `readme.test.ts` fails when the file and the renderer disagree.
//
// Plain text, deliberately. GitHub renders a fence and so does npm, whereas npm
// strips `<video>` outright and a coloured image would need a font vendored
// into a repository that holds no binaries. A block only appears here when its
// markers are already in the file: this rewrites regions, it never invents one.
const readmePath = join(here, "..", "..", "..", "README.md");
let readme = readFileSync(readmePath, "utf8");
let injected = 0;
for (const spec of TRANSCRIPTS) {
  const region = new RegExp(
    `(<!-- goflag:transcript ${spec.id} -->\\n)[\\s\\S]*?(<!-- /goflag:transcript -->)`,
  );
  if (!region.test(readme)) continue;
  readme = readme.replace(region, `$1\n\`\`\`plaintext\n${trim(spec.render(false))}\n\`\`\`\n\n$2`);
  injected += 1;
}
writeFileSync(readmePath, readme, "utf8");
process.stdout.write(`README.md: ${injected} transcript region(s) rewritten\n`);

for (const spec of TRANSCRIPTS) {
  const lines = spec.render(false).split("\n");
  const widest = Math.max(...lines.map((line) => line.length));
  process.stdout.write(`${spec.id}: ${lines.length} lines, ${widest} columns\n`);
}

const preview = renderPreviewFixture();
process.stdout.write(
  `preview.html: ${Buffer.byteLength(preview, "utf8")} bytes, ` +
    `${(preview.match(/<img/g) ?? []).length} images\n`,
);

/** The renderers breathe with a blank line at each end; a fence does not. */
function trim(text: string): string {
  const lines = text.split("\n");
  while (lines.length && lines[0]!.trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.join("\n");
}
