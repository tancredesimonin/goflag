#!/usr/bin/env node
/**
 * CI gate: re-run `gen-i18n-fixture.mjs` into a temp dir and diff
 * against the committed copies. If any file differs, the gate fails
 * with a hint to re-run the generator.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const COMMITTED = resolve(REPO_ROOT, "fixtures/sites/i18n-grid");

function* walk(root) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (entry === "index.html") yield full;
  }
}

const tmp = mkdtempSync(join(tmpdir(), "i18n-grid-verify-"));
// Generator writes into `<repo>/fixtures/sites/i18n-grid` — we
// shadow it by symlinking the temp dir over via env variable. The
// simpler route (and what we actually do) is to invoke the
// generator with cwd at the temp dir and a tiny wrapper that
// rewrites `__dirname`. Easier: just run the generator and compare
// the result with what's committed in-place after a fresh
// generation.

execSync("node scripts/gen-i18n-fixture.mjs", { cwd: REPO_ROOT, stdio: "inherit" });

// At this point the committed copies on disk match the latest
// generator output. We then compare the working tree against HEAD —
// if `git diff` finds any change, the committed copies were stale.
let drift;
try {
  drift = execSync(`git -C "${REPO_ROOT}" diff --name-only -- fixtures/sites/i18n-grid`, {
    encoding: "utf8",
  });
} catch (err) {
  console.error("[verify:i18n-fixture] git diff failed:", err);
  process.exit(2);
}

if (drift.trim().length > 0) {
  console.error(
    `\n[verify:i18n-fixture] Committed fixtures are stale relative to scripts/gen-i18n-fixture.mjs.\n` +
      `Run: pnpm exec node scripts/gen-i18n-fixture.mjs && git add fixtures/sites/i18n-grid\n\n` +
      `Drifted files:\n${drift}`,
  );
  process.exit(1);
}

// Sanity check: make sure the generator actually wrote the expected
// number of files (4 locales × 3 routes + 1 root = 13).
const count = [...walk(COMMITTED)].length;
if (count !== 13) {
  console.error(`[verify:i18n-fixture] expected 13 index.html files, found ${count}`);
  process.exit(1);
}

void tmp; // intentionally unused — see comment above.
console.log(`[verify:i18n-fixture] OK (${count} fixtures match generator output)`);
