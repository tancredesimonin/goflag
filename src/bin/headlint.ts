#!/usr/bin/env node
import { runCli } from "../lib/cli/program";

/**
 * Wait for stdout/stderr writes to flush before exiting.
 *
 * Without this, large `--json` payloads (the post-Phase-2 `Page` includes
 * the full static HTML body, which can be tens of KiB) get truncated at
 * the OS pipe buffer boundary because `process.exit` does not drain stdio.
 */
async function flushStdio(): Promise<void> {
  await Promise.all([
    new Promise<void>((resolve) => {
      if (process.stdout.writableLength === 0) return resolve();
      process.stdout.once("drain", () => resolve());
      process.stdout.write("", () => resolve());
    }),
    new Promise<void>((resolve) => {
      if (process.stderr.writableLength === 0) return resolve();
      process.stderr.once("drain", () => resolve());
      process.stderr.write("", () => resolve());
    }),
  ]);
}

runCli(process.argv.slice(2))
  .then(async (code) => {
    await flushStdio();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    process.stderr.write(`headlint: fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    await flushStdio();
    process.exit(2);
  });
