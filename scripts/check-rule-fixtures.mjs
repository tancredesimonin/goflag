#!/usr/bin/env node
/**
 * Phase 5.11 gate.
 *
 * Walks `src/lib/rules/<id>.ts` (every module that isn't `index.ts`,
 * `types.ts`, `test-utils.ts`, or a `*.test.ts` file is considered a
 * rule definition) and verifies each one has both
 * `fixtures/rules/<id>/pass.html` and `fixtures/rules/<id>/fail.html`
 * on disk. Exits non-zero on the first violation so CI surfaces a
 * clear "you forgot to ship a fixture" failure independent of the
 * vitest harness.
 *
 * Run via `pnpm verify:rule-fixtures` (also wired into CI's `verify`
 * stage in `.gitlab-ci.yml`).
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const rulesDir = resolve(root, "src/lib/rules");
const fixturesDir = resolve(root, "fixtures/rules");

const SKIP = new Set(["index.ts", "types.ts", "test-utils.ts"]);

const ruleIds = readdirSync(rulesDir)
  .filter((name) => name.endsWith(".ts"))
  .filter((name) => !name.endsWith(".test.ts"))
  .filter((name) => !SKIP.has(name))
  .filter((name) => {
    const full = resolve(rulesDir, name);
    return statSync(full).isFile();
  })
  .map((name) => name.replace(/\.ts$/, ""));

if (ruleIds.length === 0) {
  console.error("No rule files found under src/lib/rules/. Did the directory move?");
  process.exit(1);
}

const failures = [];
for (const id of ruleIds) {
  const dir = resolve(fixturesDir, id);
  const pass = resolve(dir, "pass.html");
  const fail = resolve(dir, "fail.html");
  if (!existsSync(pass)) failures.push(`Missing fixtures/rules/${id}/pass.html`);
  if (!existsSync(fail)) failures.push(`Missing fixtures/rules/${id}/fail.html`);
}

if (failures.length > 0) {
  console.error("Rule fixture gate failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nEvery rule under src/lib/rules/<id>.ts must ship pass.html + fail.html.\n" +
      "Re-run `node scripts/gen-rule-fixtures.mjs` or author the files by hand.",
  );
  process.exit(1);
}

console.log(`OK: ${ruleIds.length} rules each have pass.html + fail.html.`);
