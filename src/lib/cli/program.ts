import { Command } from "commander";
import { inspect } from "../core/inspect";
import { FetchError } from "../core/fetch/static";
import { renderPageSummary } from "./render-page";
import { HEADLINT_VERSION } from "../version";

export interface CliIo {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

/**
 * Build the CLI program. Kept as a factory so the E2E tests can pass in
 * captured streams instead of `process.stdout`/`process.stderr` and assert on
 * exact output without spawning a child process.
 */
export function createProgram(io: CliIo = { stdout: process.stdout, stderr: process.stderr }) {
  const program = new Command();

  program
    .name("headlint")
    .description(
      "Lighthouse for the <head>. Lint how your site appears in search and social — locally, in CI, and as a diff between localhost and production.",
    )
    .version(HEADLINT_VERSION, "-v, --version", "Print the Headlint version")
    .configureOutput({
      writeOut: (str) => io.stdout.write(str),
      writeErr: (str) => io.stderr.write(str),
    })
    .exitOverride();

  program
    .command("inspect")
    .description("Fetch a URL, parse it, and dump everything Headlint sees")
    .argument("<url>", "URL to inspect (http or https)")
    .option("--json", "Print the full Page object as JSON instead of a summary")
    .option("--no-probes", "Skip robots.txt / sitemap.xml / manifest probes")
    .option("--insecure", "Allow self-signed TLS certificates (use with care)")
    .option("--timeout <ms>", "Per-request timeout in milliseconds", "15000")
    .action(
      async (
        url: string,
        opts: { json?: boolean; probes?: boolean; insecure?: boolean; timeout?: string },
      ) => {
        const timeoutMs = Number.parseInt(opts.timeout ?? "15000", 10);
        try {
          const page = await inspect(url, {
            probes: opts.probes !== false,
            allowInsecureTls: opts.insecure === true,
            timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15_000,
          });
          if (opts.json) {
            io.stdout.write(`${JSON.stringify(page, null, 2)}\n`);
          } else {
            io.stdout.write(`${renderPageSummary(page)}\n`);
          }
        } catch (err) {
          if (err instanceof FetchError) {
            io.stderr.write(`headlint: ${err.message}\n`);
          } else {
            io.stderr.write(
              `headlint: unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
          process.exitCode = 1;
        }
      },
    );

  return program;
}

/**
 * Run the CLI from a process. Used by `bin/headlint` and by E2E tests via
 * `child_process.spawn`. Errors that escape `createProgram` (typically
 * commander's own usage errors) are surfaced with exit code 2.
 */
export async function runCli(argv: string[], io?: CliIo): Promise<number> {
  const program = createProgram(io);
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    const e = err as { code?: string; exitCode?: number; message?: string };
    if (e.code === "commander.helpDisplayed" || e.code === "commander.version") {
      return 0;
    }
    if (typeof e.exitCode === "number") return e.exitCode;
    (io?.stderr ?? process.stderr).write(`headlint: ${e.message ?? String(err)}\n`);
    return 2;
  }
  const code = process.exitCode;
  return typeof code === "number" ? code : 0;
}
