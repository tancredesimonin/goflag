#!/usr/bin/env node
/**
 * Serve the site the way the container serves it.
 *
 * `next start` runs against the workspace, where every file is on disk beside
 * the server. The image does not: it copies `.next/standalone`, then
 * `.next/static` and `public/` **by hand**, because a standalone build traces
 * the server's imports and nothing imports a static file. Those three copies are
 * the entire difference between the two, and they are where a defect can hide
 * from an audit that never leaves the workspace.
 *
 * One did. `/favicon.ico` answered 404 on goflag.tech from the day the
 * Dockerfile was written — `public/` was never copied — while
 * `icons.ico.missing` passed on every local run, because `next start` had the
 * file sitting right there. The rule was correct and the auditor was standing in
 * the wrong place. `docs/og-plan.md` §10.7.
 *
 * So this reproduces the image's layout and runs its entrypoint, and `pnpm seo`
 * audits that instead. It is deliberately the same three lines as the
 * Dockerfile: if they drift apart, the audit stops being a rehearsal of the
 * deploy, which is the only reason it exists.
 *
 * Usage:
 *   node scripts/serve-standalone.mjs        # assemble, then serve on $PORT
 *   node scripts/serve-standalone.mjs --check  # assemble and exit
 */

import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE = join(ROOT, ".next/standalone/apps/website");

if (!existsSync(join(STANDALONE, "server.js"))) {
  console.error(
    "No standalone build at .next/standalone. Run `next build` first —\n" +
      '`output: "standalone"` in next.config.mjs is what produces it.',
  );
  process.exit(2);
}

// The Dockerfile's two remaining COPY lines, in the same order and to the same
// destinations. `.next/standalone` itself is the third and is already here.
for (const [from, to] of [
  [join(ROOT, ".next/static"), join(STANDALONE, ".next/static")],
  [join(ROOT, "public"), join(STANDALONE, "public")],
]) {
  if (!existsSync(from)) {
    console.error(`Nothing at ${from} to copy — the build is incomplete.`);
    process.exit(2);
  }
  cpSync(from, to, { recursive: true });
}

console.log(`standalone: assembled at ${STANDALONE}`);

if (process.argv.includes("--check")) process.exit(0);

// `server.js` chdirs into its own directory, so the relative reads the
// changelog page depends on resolve from there — the same reason the Dockerfile
// copies the workspace root rather than the app alone.
await import(join(STANDALONE, "server.js"));
