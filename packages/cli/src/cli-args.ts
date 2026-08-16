/**
 * CLI argument parsing — split out from `cli.ts` so it can be unit-tested
 * without importing the module's top-level `main()` side effect.
 *
 * `parseArgs` is a pure function of `argv` (plus the ambient TTY / NO_COLOR
 * signals used only for the default color choice). It throws a plain `Error`
 * with a user-facing message on malformed input; the CLI turns that into an
 * exit-code-2 with the help text.
 *
 * It dispatches on `FLAGS` (`./lib/flags/registry`) rather than on a `switch`,
 * and `HELP` is rendered from the same table. That is the point: a flag the
 * parser accepts and the help never mentions — or the reverse — is no longer
 * expressible.
 */

import { COMMANDS, FLAGS_BY_TOKEN, renderHelp } from "./lib/flags/registry";
import type { FlagTarget } from "./lib/flags/registry";

/** The help text, rendered from the flag table. Frozen by `help-text.test.ts`. */
export const HELP = renderHelp();

const COMMAND_NAMES = COMMANDS.map((c) => c.name);

export interface ParsedArgs extends FlagTarget {
  /**
   * A subcommand instead of an audit. Absent for the usual `goflag <url>`.
   *
   * Both print a catalogue and exit without touching the network — the two
   * things goflag can answer about itself rather than about a site.
   */
  command?: "rules" | "flags";
}

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
    const spec = arg === undefined ? undefined : FLAGS_BY_TOKEN.get(arg);
    if (spec && arg !== undefined) {
      if (spec.takesValue) {
        spec.apply({ parsed, value: next(i, arg), flag: arg });
        i++;
      } else {
        spec.apply({ parsed, value: "", flag: arg });
      }
      continue;
    }

    if (arg && arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    // A command word is a command rather than a URL, and only in first
    // position: `goflag https://x.test rules` is a typo, and treating it as a
    // command would audit nothing while looking like it worked.
    if (arg && COMMAND_NAMES.includes(arg) && i === 0) parsed.command = arg as "rules" | "flags";
    else if (arg && !parsed.url) parsed.url = arg;
    else if (arg) throw new Error(`unexpected argument: ${arg}`);
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
  // Both name what the run prints, and in baseline mode the diff has already
  // won: the CLI renders it and returns, so --summary was accepted and then
  // swallowed. Under --json it is worse than ignored — `summarize()` has no
  // `diff` field, so the payload rolls up the whole site while the exit code is
  // still decided by the diff that payload does not mention.
  //
  // Rolling up a diff is a view nobody has designed, and picking one of the two
  // silently is how a caller ends up reading an answer to the other question.
  // So this refuses, like --baseline itself refuses to weaken a gate that did
  // not ask: --report still writes the full report next to the diff.
  if (parsed.summary && parsed.baseline) {
    throw new Error(
      "--summary cannot summarise a diff, and --baseline prints the diff: drop --summary, " +
        "or use --report <file> to keep the full report",
    );
  }

  return parsed;
}
