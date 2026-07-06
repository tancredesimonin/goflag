/**
 * goflag CLI.
 *
 *   goflag <url> [options]
 *
 * Crawls a site and reports broken links, missing translation pages, and
 * missing/misconfigured SEO metadata. The JSON report is the source of
 * truth; the terminal output is rendered from it.
 *
 * Exit codes:
 *   0  clean (green flag)
 *   1  findings present (yellow/red flag) — useful as a CI gate
 *   2  fatal (bad URL, unexpected error)
 */

import { runAudit, exitCode } from "./report/build";
import { renderTerminal } from "./report/render-terminal";
import { renderSummaryTerminal } from "./report/render-summary";
import { summarize } from "./report/summarize";
import { Logger } from "./report/logger";
import { HELP, parseArgs, type ParsedArgs } from "./cli-args";

async function readVersion(): Promise<string> {
  try {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`goflag: ${(err as Error).message}\n\n${HELP}\n`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${await readVersion()}\n`);
    return 0;
  }
  if (!args.url) {
    process.stderr.write(`goflag: missing <url>\n\n${HELP}\n`);
    return 2;
  }

  // Progress always goes to stderr, so stdout (JSON / rendered report)
  // stays clean and pipeable. Colour follows the stderr TTY.
  const logger = new Logger({
    stream: process.stderr,
    mode: args.logMode,
    color: process.stderr.isTTY === true && !process.env.NO_COLOR,
  });

  let report;
  try {
    logger.note(`goflag: auditing ${args.url} …`);
    report = await runAudit(args.url, { ...args.options, onProgress: logger.onProgress });
    logger.stop();
  } catch (err) {
    logger.stop();
    process.stderr.write(`goflag: ${(err as Error).message}\n`);
    return 2;
  }

  if (args.report) {
    // The report file is always the full report — the source of truth a
    // baseline/diff can rely on, regardless of the --summary view choice.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stderr.write(`goflag: report written to ${args.report}\n`);
  }

  if (args.summary) {
    const summary = summarize(report);
    process.stdout.write(
      args.json
        ? `${JSON.stringify(summary, null, 2)}\n`
        : `${renderSummaryTerminal(summary, { color: args.color })}\n`,
    );
  } else {
    process.stdout.write(
      args.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : `${renderTerminal(report, { color: args.color })}\n`,
    );
  }

  return exitCode(report);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`goflag: unexpected error: ${(err as Error).stack ?? err}\n`);
    process.exit(2);
  });
