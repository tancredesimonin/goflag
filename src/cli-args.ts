/**
 * CLI argument parsing — split out from `cli.ts` so it can be unit-tested
 * without importing the module's top-level `main()` side effect.
 *
 * `parseArgs` is a pure function of `argv` (plus the ambient TTY / NO_COLOR
 * signals used only for the default color choice). It throws a plain `Error`
 * with a user-facing message on malformed input; the CLI turns that into an
 * exit-code-2 with the help text.
 */

import type { AuditOptions, FailOn } from "./report/build";
import type { LogMode } from "./report/logger";

export const HELP = `goflag — audit a site for broken links, missing translations, and SEO metadata

Usage:
  goflag <url> [options]

Options:
  --json                 Print the JSON report to stdout (nothing else).
  --summary, -s          Roll findings up (dedup by link/rule/code). Pairs
                         with --json for a compact, agent-friendly payload.
  --report <file>        Write the (full) JSON report to <file>.
  --depth <n>            Crawl depth (0 = entry page only). Default: 2.
  --max-pages <n>        Hard cap on pages crawled. Default: 200.
  --include <glob>       Only crawl paths matching <glob> (repeatable).
  --exclude <glob>       Skip paths matching <glob> (repeatable).
  --locales <list>       Comma-separated locales the site serves, e.g.
                         "fr,en,pt-br". Authoritative: overrides what the
                         sitemap and crawl suggest, and makes a locale the
                         site does not serve yet show up as missing.
  --no-sitemap           Do not discover the sitemap; crawl from <url> only.
                         Discovery is on by default because link-only crawling
                         cannot find locales a site never links to.
  --fail-on <level>      Exit 1 at or above this severity: warning (default),
                         error, or never.
  --start <cmd>          Boot <cmd>, wait for <url> to answer, audit, then
                         stop it. Use to gate a merge on the built app before
                         it ships.
  --start-timeout <ms>   How long to wait for --start to answer. Default: 60000.
  --no-external          Do not probe off-origin (external) links.
  --static               Static HTML only; never launch headless Chromium.
  --allow-insecure-tls   Accept self-signed / invalid TLS (localhost, tunnels).
  --timeout <ms>         Per-request timeout in ms. Default: 8000.
  --verbose, -V          Log every page as it is analyzed.
  --quiet, -q            Suppress the live progress output.
  --no-color             Disable coloured output.
  -h, --help             Show this help.
  -v, --version          Show the version.

Exit codes: 0 clean, 1 findings found, 2 fatal error.`;

export interface ParsedArgs {
  url?: string;
  json: boolean;
  summary: boolean;
  report?: string;
  color: boolean;
  help: boolean;
  version: boolean;
  /** Live-progress verbosity for the logger. */
  logMode: LogMode;
  /** Severity at or above which the process exits 1. */
  failOn: FailOn;
  /** Command to boot before auditing, and stop afterwards (`--start`). */
  start?: string;
  /** How long to wait for `--start` to answer, in ms. */
  startTimeoutMs: number;
  options: AuditOptions;
}

const FAIL_ON_LEVELS: readonly FailOn[] = ["warning", "error", "never"];

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    json: false,
    summary: false,
    color: process.stdout.isTTY === true && !process.env.NO_COLOR,
    help: false,
    version: false,
    logMode: "compact",
    failOn: "warning",
    startTimeoutMs: 60_000,
    options: { include: [], exclude: [] },
  };

  const next = (i: number, flag: string): string => {
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "-v":
      case "--version":
        parsed.version = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "-s":
      case "--summary":
        parsed.summary = true;
        break;
      case "--no-color":
        parsed.color = false;
        break;
      case "-V":
      case "--verbose":
        parsed.logMode = "verbose";
        break;
      case "-q":
      case "--quiet":
        parsed.logMode = "quiet";
        break;
      case "--static":
        parsed.options.static = true;
        break;
      case "--allow-insecure-tls":
        parsed.options.allowInsecureTls = true;
        break;
      case "--no-external":
        parsed.options.checkExternal = false;
        break;
      case "--no-sitemap":
        parsed.options.noSitemap = true;
        break;
      case "--locales": {
        // Split on commas so `--locales fr,en` and repeated flags both work.
        const value = next(i, arg);
        const tags = value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.length === 0) throw new Error(`${arg} expects at least one locale`);
        parsed.options.locales = [...(parsed.options.locales ?? []), ...tags];
        i++;
        break;
      }
      case "--fail-on": {
        const value = next(i, arg) as FailOn;
        if (!FAIL_ON_LEVELS.includes(value)) {
          throw new Error(`${arg} expects one of: ${FAIL_ON_LEVELS.join(", ")}`);
        }
        parsed.failOn = value;
        i++;
        break;
      }
      case "--start":
        parsed.start = next(i, arg);
        i++;
        break;
      case "--start-timeout":
        parsed.startTimeoutMs = toInt(next(i, arg), arg);
        i++;
        break;
      case "--report":
        parsed.report = next(i, arg);
        i++;
        break;
      case "--depth":
        parsed.options.depth = toInt(next(i, arg), arg);
        i++;
        break;
      case "--max-pages":
        parsed.options.maxPages = toInt(next(i, arg), arg);
        i++;
        break;
      case "--timeout":
        parsed.options.timeoutMs = toInt(next(i, arg), arg);
        i++;
        break;
      case "--include":
        parsed.options.include!.push(next(i, arg));
        i++;
        break;
      case "--exclude":
        parsed.options.exclude!.push(next(i, arg));
        i++;
        break;
      default:
        if (arg && arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
        if (arg && !parsed.url) parsed.url = arg;
        else if (arg) throw new Error(`unexpected argument: ${arg}`);
    }
  }

  return parsed;
}

function toInt(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} expects a non-negative integer`);
  return n;
}
