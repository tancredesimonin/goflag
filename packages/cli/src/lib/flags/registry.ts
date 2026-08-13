/**
 * Every CLI flag, once.
 *
 * The help text used to be a hand-written string and the parser a 31-case
 * `switch`, with nothing tying them together. A flag could exist in one and not
 * the other, and the documentation site kept a third copy by hand because
 * invariant I3 forbids it from importing this package — where a documentation
 * audit found four drifts, none of which the one guard rail (a test listing
 * twelve flag names by hand) had caught.
 *
 * So the source is inverted, exactly as the rule registry was: this table is
 * the fact, `renderHelp()` prints it, `parseArgs` dispatches on it, and
 * `flags.json` ships it to the site. A flag cannot now exist in the parser
 * without existing in the help, nor the reverse — two classes of drift removed
 * rather than one.
 *
 * `help` holds the description **as the terminal wraps it**, line by line,
 * rather than a paragraph a renderer re-wraps. That is deliberate: the text was
 * wrapped by hand, `goflag --help` is quoted in the docs, and reflowing it
 * would be a visible change nobody asked for. `test/fixtures/help.txt` freezes
 * the output byte for byte.
 */

import { PROFILE_NAMES, PROFILES } from "../rules/profiles";
import type { AuditOptions, FailOn } from "../../report/build";
import type { LogMode } from "../../report/logger";

/** Where a flag belongs on the reference page. The terminal has no headings. */
export type FlagGroupId = "output" | "crawl" | "i18n" | "gate" | "boot" | "fetch" | "terminal";

/** The parse state a flag mutates. Mirrors `ParsedArgs` without importing it. */
export interface FlagTarget {
  url?: string;
  json: boolean;
  summary: boolean;
  report?: string;
  color: boolean;
  help: boolean;
  version: boolean;
  logMode: LogMode;
  failOn: FailOn;
  baseline?: string;
  regressionsOnly: boolean;
  updateBaseline: boolean;
  maxDebt?: number;
  start?: string;
  startTimeoutMs: number;
  startCwd?: string;
  options: AuditOptions;
}

export interface FlagSpec {
  /** Long form, e.g. `--depth`. The flag's identity. */
  name: string;
  /** Short form the CLI also accepts, e.g. `-V`. */
  short?: string;
  /** Argument placeholder, e.g. `<n>`. Present exactly when the flag takes one. */
  arg?: string;
  /**
   * The left column of the help line, verbatim.
   *
   * Stored rather than derived because the existing text is not consistent
   * about it — `--summary, -s` puts the long form first and `-h, --help` the
   * short — and reproducing the output byte for byte matters more than tidying
   * that up in the same change. A test asserts the label mentions both forms.
   */
  label: string;
  group: FlagGroupId;
  /** Printed default, when the flag has one. */
  default?: string;
  /** Another flag this one is meaningless without. */
  requires?: string;
  /** Description lines, already wrapped for the terminal. */
  help: readonly string[];
  /** Extra description lines computed at print time (the `--profile` list). */
  dynamicTail?: () => string[];
  /** Whether the next argv entry is this flag's value. */
  takesValue: boolean;
  apply: (ctx: { parsed: FlagTarget; value: string; flag: string }) => void;
}

const FAIL_ON_LEVELS: readonly FailOn[] = ["warning", "error", "never"];

function toInt(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} expects a non-negative integer`);
  return n;
}

export const FLAGS: readonly FlagSpec[] = [
  {
    name: "--json",
    label: "--json",
    group: "output",
    help: ["Print the JSON report to stdout (nothing else)."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.json = true;
    },
  },
  {
    name: "--summary",
    short: "-s",
    label: "--summary, -s",
    group: "output",
    help: [
      "Roll findings up (dedup by link/rule/code). Pairs",
      "with --json for a compact, agent-friendly payload.",
    ],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.summary = true;
    },
  },
  {
    name: "--report",
    arg: "<file>",
    label: "--report <file>",
    group: "output",
    help: ["Write the (full) JSON report to <file>."],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.report = value;
    },
  },
  {
    name: "--depth",
    arg: "<n>",
    label: "--depth <n>",
    group: "crawl",
    default: "2",
    help: [
      "How far to follow links out of each page (0 = follow",
      "none). Sitemap URLs are seeded regardless, so --depth 0",
      'alone is not "entry page only" — add --no-sitemap for',
      "that. Default: 2.",
    ],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      parsed.options.depth = toInt(value, flag);
    },
  },
  {
    name: "--max-pages",
    arg: "<n>",
    label: "--max-pages <n>",
    group: "crawl",
    default: "200",
    help: [
      "Page budget for the crawl. A hard cap under",
      "--coverage all; under structural coverage the selection",
      "wins and the budget is max(<n>, selected + 5).",
      "Default: 200.",
    ],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      parsed.options.maxPages = toInt(value, flag);
    },
  },
  {
    name: "--coverage",
    arg: "<mode>",
    label: "--coverage <mode>",
    group: "crawl",
    default: "structural when a sitemap is found, all otherwise",
    help: [
      "How to choose which pages to audit.",
      '"structural" (default when a sitemap is found) keeps',
      "every standalone page and samples families of pages",
      'built from one template. "all" audits everything the',
      "sitemap lists, up to --max-pages.",
    ],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      if (value !== "structural" && value !== "all") {
        throw new Error(`${flag} takes "structural" or "all", not ${JSON.stringify(value)}`);
      }
      parsed.options.coverage = value;
    },
  },
  {
    name: "--include",
    arg: "<glob>",
    label: "--include <glob>",
    group: "crawl",
    help: ["Only crawl paths matching <glob> (repeatable)."],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.options.include!.push(value);
    },
  },
  {
    name: "--exclude",
    arg: "<glob>",
    label: "--exclude <glob>",
    group: "crawl",
    help: ["Skip paths matching <glob> (repeatable)."],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.options.exclude!.push(value);
    },
  },
  {
    name: "--locales",
    arg: "<list>",
    label: "--locales <list>",
    group: "i18n",
    help: [
      "Comma-separated locales the site serves, e.g.",
      '"fr,en,pt-br". Unioned with what the sitemap shows,',
      "never substituted for it, and the only way to make a",
      "locale the site does not serve yet show up as missing.",
      "Also folds /en/… and /fr/… into one route family for",
      "structural coverage, so pass it on any locale-prefixed",
      "site.",
    ],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      // Split on commas so `--locales fr,en` and repeated flags both work.
      const tags = value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length === 0) throw new Error(`${flag} expects at least one locale`);
      parsed.options.locales = [...(parsed.options.locales ?? []), ...tags];
    },
  },
  {
    name: "--ignore-holes",
    arg: "<glob>",
    label: "--ignore-holes <glob>",
    group: "i18n",
    help: [
      "Route (locale-free) that is deliberately not",
      "translated everywhere, so its gaps are not reported",
      "as missing translations (repeatable).",
    ],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.options.ignoreHoles = [...(parsed.options.ignoreHoles ?? []), value];
    },
  },
  {
    name: "--no-sitemap",
    label: "--no-sitemap",
    group: "crawl",
    help: [
      "Do not discover the sitemap; crawl from <url> only.",
      "Discovery is on by default because link-only crawling",
      "cannot find locales a site never links to.",
    ],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.options.noSitemap = true;
    },
  },
  {
    name: "--profile",
    arg: "<name>",
    label: "--profile <name>",
    group: "gate",
    default: "default",
    help: [
      "Policy overlay on the rule set — it changes how",
      "loudly a rule fires, never what it observes:",
    ],
    dynamicTail: () => PROFILE_NAMES.map((n) => `${n} — ${PROFILES[n]!.description}`),
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      // Validated here, not in `runAudit`: a mistyped policy should cost
      // an argument-parse error, not a crawl.
      if (!PROFILE_NAMES.includes(value)) {
        throw new Error(`${flag} expects one of: ${PROFILE_NAMES.join(", ")}`);
      }
      parsed.options.profile = value;
    },
  },
  {
    name: "--conformance",
    label: "--conformance",
    group: "output",
    help: [
      "Report EVERY rule's status on every page (pass /",
      "fail / warn / na), not just the violations. Answers",
      '"where do we stand against the catalog?"; pairs with',
      "--json.",
    ],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.options.conformance = true;
    },
  },
  {
    name: "--advisories",
    label: "--advisories",
    group: "output",
    help: [
      "Attach the prose rules — the judgment calls goflag",
      "refuses to fake — each with the observed facts an",
      "agent needs to judge it. Never affects the gate.",
    ],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.options.advisories = true;
    },
  },
  {
    name: "--fail-on",
    arg: "<level>",
    label: "--fail-on <level>",
    group: "gate",
    default: "warning",
    help: ["Exit 1 at or above this severity: warning (default),", "error, or never."],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      const level = value as FailOn;
      if (!FAIL_ON_LEVELS.includes(level)) {
        throw new Error(`${flag} expects one of: ${FAIL_ON_LEVELS.join(", ")}`);
      }
      parsed.failOn = level;
    },
  },
  {
    name: "--regressions-only",
    label: "--regressions-only",
    group: "gate",
    requires: "--baseline",
    help: [
      "Weaken the gate: fail only on findings that are NEW",
      "relative to --baseline. Known findings stop blocking",
      "the build — a green run no longer means a clean site.",
      "Requires --baseline.",
    ],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.regressionsOnly = true;
    },
  },
  {
    name: "--baseline",
    arg: "<file>",
    label: "--baseline <file>",
    group: "gate",
    help: ["Stored report to compare against. Use with", "--regressions-only."],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.baseline = value;
    },
  },
  {
    name: "--update-baseline",
    label: "--update-baseline",
    group: "gate",
    requires: "--baseline",
    help: [
      "Write this run to --baseline and exit 0, instead of",
      "judging against it. Use it to capture a baseline, or",
      "to accept findings you have decided to live with —",
      "it says what it accepted.",
    ],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.updateBaseline = true;
    },
  },
  {
    name: "--max-debt",
    arg: "<n>",
    label: "--max-debt <n>",
    group: "gate",
    help: [
      "Fail when the site carries more than <n> findings in",
      "total, whether new or known. Lower it as you fix, to",
      "stop a baseline from fossilising.",
    ],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      parsed.maxDebt = toInt(value, flag);
    },
  },
  {
    name: "--start",
    arg: "<cmd>",
    label: "--start <cmd>",
    group: "boot",
    help: [
      "Boot <cmd>, wait for <url> to answer, audit, then",
      "stop it. Use to gate a merge on the built app before",
      "it ships.",
    ],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.start = value;
    },
  },
  {
    name: "--start-cwd",
    arg: "<dir>",
    label: "--start-cwd <dir>",
    group: "boot",
    default: "the current directory",
    help: [
      "Directory to run --start in. Defaults to the current",
      "one; set it when auditing a monorepo package from the",
      "repository root.",
    ],
    takesValue: true,
    apply: ({ parsed, value }) => {
      parsed.startCwd = value;
    },
  },
  {
    name: "--start-timeout",
    arg: "<ms>",
    label: "--start-timeout <ms>",
    group: "boot",
    default: "60000",
    help: ["How long to wait for --start to answer. Default: 60000."],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      parsed.startTimeoutMs = toInt(value, flag);
    },
  },
  {
    name: "--no-external",
    label: "--no-external",
    group: "fetch",
    help: ["Do not probe off-origin (external) links."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.options.checkExternal = false;
    },
  },
  {
    name: "--static",
    label: "--static",
    group: "fetch",
    help: ["Static HTML only; never launch headless Chromium."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.options.static = true;
    },
  },
  {
    name: "--allow-insecure-tls",
    label: "--allow-insecure-tls",
    group: "fetch",
    help: ["Accept self-signed / invalid TLS (localhost, tunnels)."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.options.allowInsecureTls = true;
    },
  },
  {
    name: "--timeout",
    arg: "<ms>",
    label: "--timeout <ms>",
    group: "fetch",
    default: "8000 for link probes, 15000 for page fetches",
    help: [
      "Per-request timeout in ms, for page fetches and link",
      "probes alike. Unset, the defaults differ: 8000 for link",
      "probes, 15000 for page fetches.",
    ],
    takesValue: true,
    apply: ({ parsed, value, flag }) => {
      parsed.options.timeoutMs = toInt(value, flag);
    },
  },
  {
    name: "--verbose",
    short: "-V",
    label: "--verbose, -V",
    group: "terminal",
    help: ["Log every page as it is analyzed."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.logMode = "verbose";
    },
  },
  {
    name: "--quiet",
    short: "-q",
    label: "--quiet, -q",
    group: "terminal",
    help: ["Suppress the live progress output."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.logMode = "quiet";
    },
  },
  {
    name: "--no-color",
    label: "--no-color",
    group: "terminal",
    default: "colour when stdout is a TTY and NO_COLOR is unset",
    help: ["Disable coloured output."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.color = false;
    },
  },
  {
    name: "--help",
    short: "-h",
    label: "-h, --help",
    group: "terminal",
    help: ["Show this help."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.help = true;
    },
  },
  {
    name: "--version",
    short: "-v",
    label: "-v, --version",
    group: "terminal",
    help: ["Show the version."],
    takesValue: false,
    apply: ({ parsed }) => {
      parsed.version = true;
    },
  },
];

/** Long and short forms alike, mapped to their spec. Built once. */
export const FLAGS_BY_TOKEN: ReadonlyMap<string, FlagSpec> = new Map(
  FLAGS.flatMap((spec) =>
    spec.short
      ? ([
          [spec.name, spec],
          [spec.short, spec],
        ] as const)
      : ([[spec.name, spec]] as const),
  ),
);

/** Exit codes, in the order the help prints them. */
export const EXIT_CODES: ReadonlyArray<{ code: 0 | 1 | 2; label: string }> = [
  { code: 0, label: "clean" },
  { code: 1, label: "findings found" },
  { code: 2, label: "fatal error" },
];

/** Subcommands that answer without touching the network. */
export const COMMANDS: ReadonlyArray<{ name: string; help: readonly string[] }> = [
  {
    name: "rules",
    help: [
      "Print the rule catalogue as JSON and exit. No crawl",
      "and no network: every rule with its severity, its",
      "rigor and the documents it cites.",
    ],
  },
  {
    name: "flags",
    help: [
      "Print this flag reference as JSON and exit. The same",
      "table this help is rendered from, so the two cannot",
      "disagree.",
    ],
  },
];

/** Column the description starts in. The help was written to it by hand. */
const DESCRIPTION_COLUMN = 25;

function block(label: string, lines: readonly string[]): string[] {
  const pad = " ".repeat(DESCRIPTION_COLUMN);
  return lines.map((line, i) =>
    i === 0 ? `  ${label.padEnd(DESCRIPTION_COLUMN - 2)}${line}` : `${pad}${line}`,
  );
}

/**
 * Render the help text from the table.
 *
 * Byte-identical to the string this replaced — `src/help-text.test.ts` compares
 * it against a frozen fixture, and that test was written and passing before the
 * table existed.
 */
export function renderHelp(): string {
  const lines: string[] = [
    "goflag — audit a site for broken links, missing translations, and SEO metadata",
    "",
    "Usage:",
    "  goflag <url> [options]",
  ];

  // Commands are indented deeper than flags: their names are short and their
  // descriptions long, and the original text lined them up that way.
  for (const command of COMMANDS) {
    const pad = " ".repeat(28);
    command.help.forEach((line, i) => {
      lines.push(i === 0 ? `  goflag ${command.name.padEnd(19)}${line}` : `${pad}${line}`);
    });
  }

  lines.push("", "Options:");
  for (const spec of FLAGS) {
    lines.push(...block(spec.label, [...spec.help, ...(spec.dynamicTail?.() ?? [])]));
  }

  lines.push("", `Exit codes: ${EXIT_CODES.map((e) => `${e.code} ${e.label}`).join(", ")}.`);
  return lines.join("\n");
}
