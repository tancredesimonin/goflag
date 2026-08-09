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
import { diffReports, diffExitCode, totalFindings } from "./report/diff";
import { renderDiffTerminal } from "./report/render-diff";
import { startServer, type StartedServer } from "./lib/runner/dev-server";
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

/**
 * Write JSON to a path, creating the directory it names.
 *
 * `writeFileSync` does not, and the one moment that matters is the first: a
 * repository adopting the gate runs `--update-baseline --baseline
 * .goflag/baseline.json` with no `.goflag/` yet, and the command that the
 * runbook documents as step one is the only one that fails. The audit had
 * already run at that point, so the failure also threw away several minutes of
 * crawling.
 */
async function writeJson(path: string, value: unknown): Promise<void> {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

  // `--start` owns a child process for the whole audit; it must be torn down
  // on every exit path, including a failed audit, or CI leaks a held port.
  let server: StartedServer | undefined;
  let report;
  try {
    if (args.start) {
      logger.note(`goflag: starting \`${args.start}\` …`);
      server = await startServer({
        command: args.start,
        cwd: args.startCwd,
        url: args.url,
        timeoutMs: args.startTimeoutMs,
        allowInsecureTls: args.options.allowInsecureTls,
        onOutput: args.logMode === "verbose" ? (chunk) => process.stderr.write(chunk) : undefined,
      });
    }
    logger.note(`goflag: auditing ${args.url} …`);
    report = await runAudit(args.url, { ...args.options, onProgress: logger.onProgress });
    logger.stop();
  } catch (err) {
    logger.stop();
    process.stderr.write(`goflag: ${(err as Error).message}\n`);
    return 2;
  } finally {
    await server?.stop();
  }

  // A sitemap that timed out is not a site without one. The crawl seeds from
  // the sitemap when there is one, so losing it drops the audit to link
  // following and it sees a fraction of the pages — measured on
  // openfinanceguide, 46 instead of 600, and 5 findings instead of 279.
  //
  // Reporting that as a result is how a gate goes red on nothing, or green on
  // 8% of a site. Neither is worth having, so this is fatal: the run could not
  // ask the question it was asked to ask.
  const sitemap = report.diagnostics.sitemap;
  if (sitemap?.unreachable) {
    process.stderr.write(
      `goflag: the sitemap could not be fetched — ${sitemap.unreachable}\n` +
        `goflag: this run crawled links instead, so it saw a different site ` +
        `from one that reads the sitemap, and its findings are not comparable.\n` +
        `goflag: retry, or pass --no-sitemap to audit by crawling on purpose.\n`,
    );
    return 2;
  }

  // A baseline changes the question from "is this site clean?" to "did this
  // change make it worse?" — the only one a site with a backlog can answer.
  if (args.baseline) {
    const { existsSync, readFileSync } = await import("node:fs");
    // Capturing a baseline for the first time is the one case where the file
    // is legitimately absent. Everywhere else a missing baseline is a typo,
    // and continuing would turn it into a green build.
    if (existsSync(args.baseline) || !args.updateBaseline) {
      try {
        const baseline = JSON.parse(readFileSync(args.baseline, "utf8"));
        report.diff = diffReports(baseline, report);
      } catch (err) {
        process.stderr.write(
          `goflag: could not read baseline ${args.baseline}: ${(err as Error).message}\n`,
        );
        return 2;
      }
    }
  }

  // Writing the baseline is accepting everything in it. The one thing this
  // must not do is accept it quietly: a counter that drops without explanation
  // reads as "the problem went away".
  if (args.updateBaseline && args.baseline) {
    await writeJson(args.baseline, report);
    const total = totalFindings(report);
    if (report.diff) {
      const { added, resolved } = report.diff;
      process.stdout.write(
        `goflag: baseline updated — ${added.length} newly accepted, ${resolved.length} resolved, ` +
          `${total} findings now grandfathered in ${args.baseline}\n`,
      );
      if (added.length > 0) {
        process.stdout.write(`${renderDiffTerminal(report.diff, { color: args.color })}\n`);
      }
    } else {
      process.stdout.write(
        `goflag: baseline captured — ${total} findings grandfathered in ${args.baseline}\n`,
      );
    }
    process.stdout.write(
      `goflag: set --max-debt ${total} to stop that number growing, and lower it as you fix.\n`,
    );
    return 0;
  }

  if (args.report) {
    // The report file is always the full report — the source of truth a
    // baseline/diff can rely on, regardless of the --summary view choice.
    await writeJson(args.report, report);
    process.stderr.write(`goflag: report written to ${args.report}\n`);
  }

  // In baseline mode the diff *is* the answer. Printing the full report first
  // buries "nothing changed" under a hundred known findings — the reader stops
  // looking, which is precisely the failure the baseline exists to prevent.
  // The complete report stays available via --json and --report.
  if (report.diff && !args.json) {
    process.stdout.write(`${renderDiffTerminal(report.diff, { color: args.color })}\n`);
    const total = totalFindings(report);
    if (args.maxDebt !== undefined && total > args.maxDebt) {
      process.stderr.write(
        `goflag: ${total} findings exceeds the --max-debt budget of ${args.maxDebt}.\n`,
      );
    }
    return diffExitCode(report.diff, args.failOn, { total, max: args.maxDebt });
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

  const total = totalFindings(report);
  if (args.maxDebt !== undefined && total > args.maxDebt) {
    process.stderr.write(
      `goflag: ${total} findings exceeds the --max-debt budget of ${args.maxDebt}.\n`,
    );
    return 1;
  }

  if (report.diff) {
    return diffExitCode(report.diff, args.failOn, { total, max: args.maxDebt });
  }

  return exitCode(report, args.failOn);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`goflag: unexpected error: ${(err as Error).stack ?? err}\n`);
    process.exit(2);
  });
