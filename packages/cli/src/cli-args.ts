/**
 * CLI argument parsing — split out from `cli.ts` so it can be unit-tested
 * without importing the module's top-level `main()` side effect.
 *
 * `parseArgs` is a pure function of `argv` (plus the ambient TTY / NO_COLOR
 * signals used only for the default color choice). It throws a plain `Error`
 * with a user-facing message on malformed input; the CLI turns that into an
 * exit-code-2 with the help text.
 */

import { PROFILE_NAMES, PROFILES } from "./lib/rules/profiles";
import type { AuditOptions, FailOn } from "./report/build";
import type { LogMode } from "./report/logger";

/** `--profile` names and what each one means, indented for the help block. */
const PROFILE_HELP = PROFILE_NAMES.map(
  (name) => `                         ${name} — ${PROFILES[name]!.description}`,
).join("\n");

export const HELP = `goflag — audit a site for broken links, missing translations, and SEO metadata

Usage:
  goflag <url> [options]

Options:
  --json                 Print the JSON report to stdout (nothing else).
  --summary, -s          Roll findings up (dedup by link/rule/code). Pairs
                         with --json for a compact, agent-friendly payload.
  --report <file>        Write the (full) JSON report to <file>.
  --depth <n>            How far to follow links out of each page (0 = follow
                         none). Sitemap URLs are seeded regardless, so --depth 0
                         alone is not "entry page only" — add --no-sitemap for
                         that. Default: 2.
  --max-pages <n>        Page budget for the crawl. A hard cap under
                         --coverage all; under structural coverage the selection
                         wins and the budget is max(<n>, selected + 5).
                         Default: 200.
  --coverage <mode>      How to choose which pages to audit.
                         "structural" (default when a sitemap is found) keeps
                         every standalone page and samples families of pages
                         built from one template. "all" audits everything the
                         sitemap lists, up to --max-pages.
  --include <glob>       Only crawl paths matching <glob> (repeatable).
  --exclude <glob>       Skip paths matching <glob> (repeatable).
  --locales <list>       Comma-separated locales the site serves, e.g.
                         "fr,en,pt-br". Unioned with what the sitemap shows,
                         never substituted for it, and the only way to make a
                         locale the site does not serve yet show up as missing.
                         Also folds /en/… and /fr/… into one route family for
                         structural coverage, so pass it on any locale-prefixed
                         site.
  --ignore-holes <glob>  Route (locale-free) that is deliberately not
                         translated everywhere, so its gaps are not reported
                         as missing translations (repeatable).
  --no-sitemap           Do not discover the sitemap; crawl from <url> only.
                         Discovery is on by default because link-only crawling
                         cannot find locales a site never links to.
  --profile <name>       Policy overlay on the rule set — it changes how
                         loudly a rule fires, never what it observes:
${PROFILE_HELP}
  --conformance          Report EVERY rule's status on every page (pass /
                         fail / warn / na), not just the violations. Answers
                         "where do we stand against the catalog?"; pairs with
                         --json.
  --advisories           Attach the prose rules — the judgment calls goflag
                         refuses to fake — each with the observed facts an
                         agent needs to judge it. Never affects the gate.
  --fail-on <level>      Exit 1 at or above this severity: warning (default),
                         error, or never.
  --regressions-only     Weaken the gate: fail only on findings that are NEW
                         relative to --baseline. Known findings stop blocking
                         the build — a green run no longer means a clean site.
                         Requires --baseline.
  --baseline <file>      Stored report to compare against. Use with
                         --regressions-only.
  --update-baseline      Write this run to --baseline and exit 0, instead of
                         judging against it. Use it to capture a baseline, or
                         to accept findings you have decided to live with —
                         it says what it accepted.
  --max-debt <n>         Fail when the site carries more than <n> findings in
                         total, whether new or known. Lower it as you fix, to
                         stop a baseline from fossilising.
  --start <cmd>          Boot <cmd>, wait for <url> to answer, audit, then
                         stop it. Use to gate a merge on the built app before
                         it ships.
  --start-cwd <dir>      Directory to run --start in. Defaults to the current
                         one; set it when auditing a monorepo package from the
                         repository root.
  --start-timeout <ms>   How long to wait for --start to answer. Default: 60000.
  --no-external          Do not probe off-origin (external) links.
  --static               Static HTML only; never launch headless Chromium.
  --allow-insecure-tls   Accept self-signed / invalid TLS (localhost, tunnels).
  --timeout <ms>         Per-request timeout in ms, for page fetches and link
                         probes alike. Unset, the defaults differ: 8000 for link
                         probes, 15000 for page fetches.
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
  /** Path to a stored report to compare against (`--baseline`). */
  baseline?: string;
  /** Gate on new findings only, letting known ones through. */
  regressionsOnly: boolean;
  /** Write the run to `--baseline` rather than judging against it. */
  updateBaseline: boolean;
  /** Hard ceiling on total findings, new or known. */
  maxDebt?: number;
  /** Command to boot before auditing, and stop afterwards (`--start`). */
  start?: string;
  /** How long to wait for `--start` to answer, in ms. */
  startTimeoutMs: number;
  /** Directory to run the `--start` command in. */
  startCwd?: string;
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
    regressionsOnly: false,
    updateBaseline: false,
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
      case "--conformance":
        parsed.options.conformance = true;
        break;
      case "--advisories":
        parsed.options.advisories = true;
        break;
      case "--ignore-holes":
        parsed.options.ignoreHoles = [...(parsed.options.ignoreHoles ?? []), next(i, arg)];
        i++;
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
      case "--profile": {
        const value = next(i, arg);
        // Validated here, not in `runAudit`: a mistyped policy should cost
        // an argument-parse error, not a crawl.
        if (!PROFILE_NAMES.includes(value)) {
          throw new Error(`${arg} expects one of: ${PROFILE_NAMES.join(", ")}`);
        }
        parsed.options.profile = value;
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
      case "--start-cwd":
        parsed.startCwd = next(i, arg);
        i++;
        break;
      case "--report":
        parsed.report = next(i, arg);
        i++;
        break;
      case "--baseline":
        parsed.baseline = next(i, arg);
        i++;
        break;
      case "--update-baseline":
        parsed.updateBaseline = true;
        break;
      case "--regressions-only":
        parsed.regressionsOnly = true;
        break;
      case "--max-debt":
        parsed.maxDebt = toInt(next(i, arg), arg);
        i++;
        break;
      case "--depth":
        parsed.options.depth = toInt(next(i, arg), arg);
        i++;
        break;
      case "--coverage": {
        const mode = next(i, arg);
        if (mode !== "structural" && mode !== "all") {
          throw new Error(`--coverage takes "structural" or "all", not ${JSON.stringify(mode)}`);
        }
        parsed.options.coverage = mode;
        i += 1;
        break;
      }
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

  // Each flag is meaningless without the other, and guessing which one the
  // caller meant would silently change how strict the build is.
  if (parsed.updateBaseline && !parsed.baseline) {
    throw new Error("--update-baseline needs a --baseline <file> to write to");
  }
  // Capturing a baseline is not gating against one, so the explicit opt-in that
  // --regressions-only exists to force does not apply.
  if (parsed.baseline && !parsed.regressionsOnly && !parsed.updateBaseline) {
    throw new Error(
      "--baseline weakens the gate, so it must be requested explicitly: add --regressions-only",
    );
  }
  if (parsed.regressionsOnly && !parsed.baseline) {
    throw new Error("--regressions-only needs a --baseline <file> to compare against");
  }

  return parsed;
}

function toInt(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} expects a non-negative integer`);
  return n;
}
