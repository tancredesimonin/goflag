import { Command } from "commander";
import open from "open";
import { inspect } from "../core/inspect";
import { FetchError } from "../core/fetch/static";
import { HeadlessUnavailableError } from "../core/extract/headless";
import { renderPageSummary } from "./render-page";
import { HEADLINT_VERSION } from "../version";
import { findFreePort, spawnNextDev } from "./dev-server";

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
    .option("--static", "Disable Chromium rendering; only inspect what a non-JS fetch returns")
    .option("--headless", "Force Chromium rendering even when the static <head> looks complete")
    .action(
      async (
        url: string,
        opts: {
          json?: boolean;
          probes?: boolean;
          insecure?: boolean;
          timeout?: string;
          static?: boolean;
          headless?: boolean;
        },
      ) => {
        const timeoutMs = Number.parseInt(opts.timeout ?? "15000", 10);
        if (opts.static && opts.headless) {
          io.stderr.write("headlint: --static and --headless are mutually exclusive\n");
          process.exitCode = 2;
          return;
        }
        const mode: "auto" | "static" | "headless" = opts.static
          ? "static"
          : opts.headless
            ? "headless"
            : "auto";
        try {
          const page = await inspect(url, {
            probes: opts.probes !== false,
            allowInsecureTls: opts.insecure === true,
            timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15_000,
            mode,
          });
          if (opts.json) {
            io.stdout.write(`${JSON.stringify(page, null, 2)}\n`);
          } else {
            io.stdout.write(`${renderPageSummary(page)}\n`);
          }
        } catch (err) {
          if (err instanceof HeadlessUnavailableError) {
            io.stderr.write(`headlint: ${err.message}\n`);
            io.stderr.write(
              "headlint: hint — re-run with --static to skip Chromium for this page.\n",
            );
            process.exitCode = 2;
            return;
          }
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

  program
    .command("dev")
    .description(
      "Boot the local Headlint UI and open the browser straight to /inspect for the given URL",
    )
    .argument("<url>", "URL to inspect (http or https)")
    .option("--port <port>", "Bind Next.js to this port (default: random free port)")
    .option("--no-open", "Don't open the system browser; just print the URL")
    .action(async (url: string, opts: { port?: string; open?: boolean }) => {
      try {
        const port = opts.port ? Number.parseInt(opts.port, 10) : await findFreePort();
        if (!Number.isFinite(port) || port <= 0) {
          io.stderr.write(`headlint: invalid --port "${String(opts.port)}"\n`);
          process.exitCode = 2;
          return;
        }
        io.stdout.write(`headlint: starting dev server on http://127.0.0.1:${port} …\n`);
        const handle = await spawnNextDev({ port });
        const inspectUrl = `${handle.url}/inspect?url=${encodeURIComponent(url)}`;
        io.stdout.write(`headlint: ready — ${inspectUrl}\n`);
        if (opts.open !== false) {
          await open(inspectUrl).catch(() => {
            io.stderr.write("headlint: could not open browser; copy the URL above.\n");
          });
        }
        // Hand control to the child until the user kills it.
        await new Promise<void>((resolve) => {
          handle.child.on("exit", () => resolve());
          const stop = () => {
            handle.child.kill("SIGINT");
          };
          process.once("SIGINT", stop);
          process.once("SIGTERM", stop);
        });
      } catch (err) {
        io.stderr.write(`headlint: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });

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
