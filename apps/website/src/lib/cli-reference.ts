/**
 * The flag reference.
 *
 * Descriptions are the `HELP` string from `packages/cli/src/cli-args.ts`,
 * reflowed from terminal wrapping to prose but otherwise unchanged. Grouping
 * and the `since` notes are the only additions — the help text is a flat list
 * because a terminal has no headings, and a reference page does.
 *
 * Same constraint as the rule catalogue: `apps/**` cannot import
 * `packages/cli`, so this is a mirror, not a derivation.
 */

export interface Flag {
  /** Long form, with its argument placeholder if it takes one. */
  flag: string;
  /** Short form, when the CLI accepts one. */
  short?: string;
  /** Printed default, or `undefined` when the flag is a plain switch. */
  default?: string;
  description: string;
  /** Set when the flag is only valid alongside another. */
  requires?: string;
}

export interface FlagGroup {
  id: string;
  title: string;
  /** Why this group exists, in one line. */
  intro: string;
  flags: readonly Flag[];
}

export const FLAG_GROUPS: readonly FlagGroup[] = [
  {
    id: "output",
    title: "Output",
    intro:
      "The terminal view is a render of the JSON, not the other way round. Reach for these when something other than a human reads the result.",
    flags: [
      {
        flag: "--json",
        description: "Print the JSON report to stdout (nothing else).",
      },
      {
        flag: "--summary",
        short: "-s",
        description:
          "Roll findings up, deduplicated by link, rule or code. Pairs with --json for a compact, agent-friendly payload.",
      },
      {
        flag: "--report <file>",
        description: "Write the full JSON report to <file>.",
      },
    ],
  },
  {
    id: "crawl",
    title: "Crawl",
    intro: "What gets visited. Every default here is a ceiling, not a target.",
    flags: [
      {
        flag: "--depth <n>",
        default: "2",
        description: "Crawl depth. 0 audits the entry page only.",
      },
      {
        flag: "--max-pages <n>",
        default: "200",
        description: "Hard cap on pages crawled.",
      },
      {
        flag: "--include <glob>",
        description: "Only crawl paths matching <glob>. Repeatable.",
      },
      {
        flag: "--exclude <glob>",
        description: "Skip paths matching <glob>. Repeatable.",
      },
      {
        flag: "--no-sitemap",
        description:
          "Do not discover the sitemap; crawl from <url> only. Discovery is on by default because link-only crawling cannot find locales a site never links to.",
      },
    ],
  },
  {
    id: "i18n",
    title: "Multilingual sites",
    intro:
      "goflag never guesses a locale from the shape of a path. These two flags are how you tell it what it cannot observe.",
    flags: [
      {
        flag: "--locales <list>",
        description:
          'Comma-separated locales the site serves, e.g. "fr,en,pt-br". Authoritative: it overrides what the sitemap and crawl suggest, and makes a locale the site does not serve yet show up as missing.',
      },
      {
        flag: "--ignore-holes <glob>",
        description:
          "A locale-free route that is deliberately not translated everywhere, so its gaps are not reported as missing translations. Repeatable, and the suppressed count is still reported under diagnostics.ignoredHoles.",
      },
    ],
  },
  {
    id: "gate",
    title: "The gate",
    intro:
      "A plain run fails on any finding, which is unusable on a site that is not clean yet, so it gets switched off. These flags make the gate ask whether a change made things worse.",
    flags: [
      {
        flag: "--fail-on <level>",
        default: "warning",
        description: "Exit 1 at or above this severity: warning, error, or never.",
      },
      {
        flag: "--baseline <file>",
        description:
          "Stored report to compare against. On its own it is an error: it weakens the gate, so it has to be asked for by name.",
      },
      {
        flag: "--regressions-only",
        requires: "--baseline",
        description:
          "Fail only on findings that are new relative to the baseline. Known findings stop blocking the build, so a passing run no longer means a clean site, and the output never claims otherwise.",
      },
      {
        flag: "--update-baseline",
        requires: "--baseline",
        description:
          "Write this run to the baseline and exit 0 instead of judging against it. Use it to capture a baseline, or to accept findings you have decided to live with; it prints what it accepted.",
      },
      {
        flag: "--max-debt <n>",
        description:
          "Fail when the site carries more than <n> findings in total, new or known. Lower it as you fix, to stop a baseline from fossilising behind a passing build.",
      },
    ],
  },
  {
    id: "boot",
    title: "Booting the app",
    intro:
      "Audit a branch before it ships, against the build it actually produced rather than against production.",
    flags: [
      {
        flag: "--start <cmd>",
        description:
          "Boot <cmd>, wait for <url> to answer, audit, then stop it. The process group is killed on exit.",
      },
      {
        flag: "--start-cwd <dir>",
        default: "the current directory",
        description:
          "Directory to run --start in. Set it when auditing a monorepo package from the repository root.",
      },
      {
        flag: "--start-timeout <ms>",
        default: "60000",
        description: "How long to wait for --start to answer. Any HTTP response counts as up.",
      },
    ],
  },
  {
    id: "fetch",
    title: "Fetching",
    intro:
      "How pages and links are retrieved. --no-external belongs in a CI gate; --static is an opt-in for sites that are certain everything renders on the server.",
    flags: [
      {
        flag: "--static",
        description:
          "Static HTML only; never launch headless Chromium, and skip the detection that would. Only safe when every page emits its metadata on the server, an assumption that drifts as a site grows. A client-rendered page is then judged on its unhydrated shell.",
      },
      {
        flag: "--no-external",
        description: "Do not probe off-origin links. Their failures are somebody else's outage.",
      },
      {
        flag: "--timeout <ms>",
        default: "8000",
        description: "Per-request timeout.",
      },
      {
        flag: "--allow-insecure-tls",
        description: "Accept self-signed or otherwise invalid TLS. For localhost and tunnels.",
      },
    ],
  },
  {
    id: "terminal",
    title: "Terminal",
    intro: "Progress goes to stderr, so stdout stays clean for the JSON.",
    flags: [
      {
        flag: "--verbose",
        short: "-V",
        description: "Log every page as it is analyzed, and stream the --start child's output.",
      },
      {
        flag: "--quiet",
        short: "-q",
        description: "Suppress the live progress output.",
      },
      {
        flag: "--no-color",
        default: "colour when stdout is a TTY and NO_COLOR is unset",
        description: "Disable coloured output.",
      },
      { flag: "--help", short: "-h", description: "Show the help text." },
      { flag: "--version", short: "-v", description: "Show the version." },
    ],
  },
];

export const EXIT_CODES: ReadonlyArray<{
  code: 0 | 1 | 2;
  label: string;
  meaning: string;
  tone: "green" | "yellow" | "red";
}> = [
  {
    code: 0,
    label: "clean",
    meaning:
      "No findings at or above --fail-on. Also returned by --update-baseline, --help and --version.",
    tone: "green",
  },
  {
    code: 1,
    label: "findings",
    meaning:
      "Findings at or above --fail-on, a new regression against a baseline, or --max-debt exceeded. This is the CI gate.",
    tone: "yellow",
  },
  {
    code: 2,
    label: "fatal",
    meaning:
      "The audit could not run: malformed URL, unreadable baseline, a --start command that never answered.",
    tone: "red",
  },
];

/** Caps the engine applies that no flag exposes. Documented because a truncated run says so in `diagnostics`, and the number should be findable. */
export const ENGINE_LIMITS: ReadonlyArray<{ what: string; value: string }> = [
  { what: "Pages inspected in parallel", value: "4" },
  { what: "Pages scanned for links", value: "500" },
  { what: "Unique link targets probed", value: "10,000" },
  { what: "Link probes in parallel", value: "8 overall, 3 per host" },
  { what: "Redirect hops followed", value: "10, then reported as a loop" },
];
