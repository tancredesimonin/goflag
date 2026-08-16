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
import { renderPreview } from "./report/render-preview";
import { summarize } from "./report/summarize";
import { Logger } from "./report/logger";
import { HELP, parseArgs, type ParsedArgs } from "./cli-args";
import { buildRuleCatalog, serialiseCatalog } from "./lib/rules/catalog";
import { buildFlagCatalog, serialiseFlags } from "./lib/flags/catalog";

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
 * Write a file, creating the directory it names.
 *
 * `writeFileSync` does not, and the one moment that matters is the first: a
 * repository adopting the gate runs `--update-baseline --baseline
 * .goflag/baseline.json` with no `.goflag/` yet, and the command that the
 * runbook documents as step one is the only one that fails. The audit had
 * already run at that point, so the failure also threw away several minutes of
 * crawling. `goflag preview` writes into the same directory and inherits it.
 */
async function writeText(path: string, contents: string): Promise<void> {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Where `goflag preview` writes, beside the baseline the gate already keeps. */
const PREVIEW_PATH = ".goflag/preview.html";

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

  // Answers a question about goflag rather than about a site: no crawl, no
  // network, no URL. It exists so a consumer stops copying the catalogue by
  // hand — `apps/website` cannot import this package (I3) and its hand-written
  // mirror had drifted in three places by the time anybody checked.
  if (args.command === "rules") {
    process.stdout.write(serialiseCatalog(buildRuleCatalog(await readVersion())));
    return 0;
  }

  // The same table `--help` is rendered from and the parser dispatches on, so
  // a consumer that reads this cannot be describing a flag goflag does not
  // have — which is exactly what the hand-written mirror on the site was doing.
  if (args.command === "flags") {
    process.stdout.write(serialiseFlags(buildFlagCatalog(await readVersion())));
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
    report = await runAudit(args.url, {
      ...args.options,
      // The preview is drawn from what the pages declared, and only this
      // section carries that. Nothing else asks for it, so nothing else pays
      // for it.
      ...(args.command === "preview" ? { extractions: true } : {}),
      onProgress: logger.onProgress,
    });
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

  // Rendering what the crawl saw, before any of the gate machinery below.
  //
  // It returns 0 on a run that produced findings, unlike every other path
  // here: looking at your own cards is not a check, and a command whose whole
  // job is "show me" has nothing to fail. A run that could not happen still
  // exits 2 — that is the block above, and it has already returned.
  //
  // It also lands before the baseline, so the extraction section can never be
  // written into a baseline file, which stores the report verbatim.
  if (args.command === "preview") {
    // `--report` still means "write the JSON too": it is a file, not a view,
    // and the report it writes is the only place the extraction section is
    // readable as data.
    if (args.report) {
      await writeJson(args.report, report);
      process.stderr.write(`goflag: report written to ${args.report}\n`);
    }
    await writeText(PREVIEW_PATH, renderPreview(report));
    const pages = report.extractions?.length ?? 0;
    process.stderr.write(
      `goflag: preview written to ${PREVIEW_PATH} — ${pages} page${pages === 1 ? "" : "s"}\n`,
    );
    // The path on stdout, alone, so `open "$(goflag preview <url>)"` works.
    process.stdout.write(`${PREVIEW_PATH}\n`);
    return 0;
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

  // Above `--update-baseline`, because that block returns. The two flags are
  // asked for together on the run that turns the gate on — capture the
  // baseline, keep the report of the run that captured it — and
  // `--baseline b.json --update-baseline --report r.json` wrote b.json, said
  // "baseline captured", and exited 0 having never written r.json, with
  // nothing on stderr to say so. A file the caller named is written on every
  // path that got as far as having a report to write.
  //
  // Below the baseline read above, so the file still carries `report.diff`
  // when there was a baseline to compare against.
  if (args.report) {
    // The report file is always the full report — the source of truth a
    // baseline/diff can rely on, regardless of the --summary view choice.
    await writeJson(args.report, report);
    process.stderr.write(`goflag: report written to ${args.report}\n`);
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

/**
 * Wait for what has been written to a stream to reach the other end of it.
 *
 * `process.exit` throws away whatever is still queued, and a write to a *pipe*
 * is asynchronous where a write to a TTY or a file is not. So `goflag <url>
 * --json` was whole on a terminal and whole redirected to a file, and cut off
 * at one pipe buffer — 64 KB, mid-token — the moment it was piped into
 * anything: `| jq`, `| tee`, a CI step reading stdout. The report is the
 * product; truncating it silently is the worst way to lose it.
 *
 * Dropping `process.exit` and setting `process.exitCode` would fix it too, but
 * it makes the exit conditional on every handle the run opened being closed —
 * a browser, a `--start` child — and a CLI that hangs in CI is worse than one
 * that truncates. Flushing first keeps the exit unconditional.
 *
 * A zero-length write queues behind the real ones, so its callback fires only
 * once they have been handed to the OS.
 */
function flush(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (stream.writableEnded || stream.destroyed) return resolve();
    stream.write("", () => resolve());
  });
}

/** A write to stdout/stderr failed for a reason that is not a closed reader. */
let undelivered = false;

// A reader that stops reading — `goflag <url> --json | head` — fails the write
// with EPIPE, and that is not a fault to report: it was invisible only because
// the process exited before the error could land, and now that it waits, the
// unhandled 'error' event would print a Node stack trace over output the caller
// cut off on purpose. Any other error means the report did not arrive, and a
// run that could not deliver its answer exits 2 rather than reporting a verdict
// nobody received.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") undelivered = true;
  });
}

main()
  .then(async (code) => {
    await Promise.all([flush(process.stdout), flush(process.stderr)]);
    process.exit(undelivered ? 2 : code);
  })
  .catch(async (err) => {
    process.stderr.write(`goflag: unexpected error: ${(err as Error).stack ?? err}\n`);
    await flush(process.stderr);
    process.exit(2);
  });
