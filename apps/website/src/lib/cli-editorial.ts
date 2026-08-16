/**
 * What the flag table cannot carry: the prose a reference page adds on top.
 *
 * The data — which flags exist, their short forms, defaults, argument
 * placeholders and `requires` relations — comes from `packages/cli/flags.json`,
 * generated from the CLI's own table. What lives here is everything that is a
 * choice about how to *explain* them: group headings, the longer description a
 * page has room for where a terminal does not, what each exit code means in
 * practice, and the engine's internal caps.
 *
 * Exactly the split between `rules-catalog.ts` and `rules-editorial.ts`, and
 * for the same reason: a hand copy of the *facts* drifts and nobody notices,
 * while prose written on purpose is meant to be hand-written. `cli-reference.
 * test.ts` fails when the two sets of flag names stop matching, so a flag
 * cannot be added to the CLI without someone writing its paragraph, and a
 * paragraph cannot outlive the flag it describes.
 */

export const FLAG_GROUP_META: ReadonlyArray<{ id: string; title: string; intro: string }> = [
  {
    id: "output",
    title: "Output",
    intro:
      "The terminal view is a render of the JSON, not the other way round. Reach for these when something other than a human reads the result.",
  },
  {
    id: "crawl",
    title: "Crawl",
    intro: "What gets visited, and how the pages to audit are chosen.",
  },
  {
    id: "i18n",
    title: "Multilingual sites",
    intro:
      "goflag never guesses a locale from the shape of a path. These two flags are how you tell it what it cannot observe.",
  },
  {
    id: "gate",
    title: "The gate",
    intro:
      "A plain run fails on any finding, which is unusable on a site that is not clean yet, so it gets switched off. These flags make the gate ask whether a change made things worse.",
  },
  {
    id: "boot",
    title: "Booting the app",
    intro:
      "Audit a branch before it ships, against the build it actually produced rather than against production.",
  },
  {
    id: "fetch",
    title: "Fetching",
    intro:
      "How pages and links are retrieved. --no-external belongs in a CI gate; --static is an opt-in for sites that are certain everything renders on the server.",
  },
  {
    id: "terminal",
    title: "Terminal",
    intro: "Progress goes to stderr, so stdout stays clean for the JSON.",
  },
];

export const FLAG_EDITORIAL: Record<string, string> = {
  "--json": "Print the JSON report to stdout (nothing else).",
  "--summary":
    "Roll findings up, deduplicated by link, rule or code. Pairs with --json for a compact, agent-friendly payload. Not available with --baseline, which is an error rather than a preference: baseline mode answers with the diff, a rollup has no way to express one, and accepting the flag would print an answer to the other question — the whole backlog, next to an exit code decided by findings it never named. --report writes the full report alongside the diff.",
  "--report": "Write the full JSON report to <file>.",
  "--conformance":
    "Report every rule's status on every page (pass, fail, warn, n/a), not just the violations. A violations list cannot tell a rule that passes everywhere apart from one that never applied; this can. The terminal shows per-rule totals, and the JSON carries the full rule by page grid.",
  "--advisories":
    "Attach the prose rules: the judgment calls goflag refuses to fake, each with its sources and the observed facts an agent needs to judge it. Asked only where the subject exists, and never counted toward the verdict or the exit code, because nobody has judged them yet.",
  "--depth":
    "How far the crawl follows links out of each page it visits. 0 follows none. It does not bound the page set on its own: sitemap URLs are seeded at depth 0, so --depth 0 still audits every page the coverage selection named. Add --no-sitemap to audit the entry page alone.",
  "--max-pages":
    'The crawl\'s page budget. A hard cap under --coverage all, or when no sitemap was found. Under structural coverage the selection has already answered "how many", so the effective budget is max(--max-pages, pages selected + 5) and a run left at the default will audit as many pages as the selection needs. Narrow a structural run with --include/--exclude instead.',
  "--coverage":
    'How the pages to audit are chosen. "structural" keeps every page that stands alone and samples three pages from each family of pages built from one template, so a site of thousands of pages is covered by its templates rather than by whichever URLs the crawl reached first. "all" audits what the sitemap lists, in order, up to --max-pages. Selecting needs a sitemap: with --no-sitemap, or when discovery finds nothing, there is nothing to select from and the run behaves as "all" — though diagnostics.coverage.mode still echoes the value you passed, with no considered/selected/families beside it, which is how you tell the two apart.',
  "--include": "Only crawl paths matching <glob>. Repeatable.",
  "--exclude": "Skip paths matching <glob>. Repeatable.",
  "--no-sitemap":
    "Do not discover the sitemap; crawl from <url> only. Discovery is on by default because link-only crawling cannot find locales a site never links to.",
  "--locales":
    'Comma-separated locales the site serves, e.g. "fr,en,pt-br". Your declaration of intent, and the only way to make a locale the site does not serve yet show up as missing. The list is unioned with the prefixes the sitemap shows, never substituted for them, so a locale your sitemap demonstrably serves stays on the axis; the report labels the source "explicit" as soon as the flag is present. It is also what folds /en/… and /fr/… into one route family for structural coverage, so it is worth passing on any locale-prefixed site.',
  "--ignore-holes":
    "A locale-free route that is deliberately not translated everywhere, so its gaps are not reported as missing translations. Repeatable, and the suppressed count is still reported under diagnostics.ignoredHoles.",
  "--profile":
    "Policy overlay on the rule set: default, strict (every spec-backed rule fails the build), spec-only (heuristic rules switched off entirely), or marketing (snippet and unfurl metadata gaps are errors). It changes how loudly a rule fires and whether it runs, never what it observes or how authoritative it claims to be. The report records which profile judged it, and the terminal names any non-default one.",
  "--fail-on": "Exit 1 at or above this severity: warning, error, or never.",
  "--baseline":
    "Stored report to compare against. On its own it is an error: it weakens the gate, so it has to be asked for by name.",
  "--regressions-only":
    "Fail only on findings that are new relative to the baseline. Known findings stop blocking the build, so a passing run no longer means a clean site, and the output never claims otherwise.",
  "--update-baseline":
    "Write this run to the baseline and exit 0 instead of judging against it. Use it to capture a baseline, or to accept findings you have decided to live with; it prints what it accepted.",
  "--max-debt":
    "Fail when the site carries more than <n> findings in total, new or known. Lower it as you fix, to stop a baseline from fossilising behind a passing build.",
  "--start":
    "Boot <cmd>, wait for <url> to answer, audit, then stop it. The process group is killed on exit.",
  "--start-cwd":
    "Directory to run --start in. Set it when auditing a monorepo package from the repository root.",
  "--start-timeout": "How long to wait for --start to answer. Any HTTP response counts as up.",
  "--static":
    "Static HTML only; never launch headless Chromium, and skip the detection that would. Only safe when every page emits its metadata on the server, an assumption that drifts as a site grows. A client-rendered page is then judged on its unhydrated shell.",
  "--no-external": "Do not probe off-origin links. Their failures are somebody else's outage.",
  "--timeout":
    "Per-request timeout, applied to page fetches and link probes alike. The two defaults differ when the flag is left off; headless navigation has its own and this flag does not reach it.",
  "--allow-insecure-tls": "Accept self-signed or otherwise invalid TLS. For localhost and tunnels.",
  "--verbose": "Log every page as it is analyzed, and stream the --start child's output.",
  "--quiet": "Suppress the live progress output.",
  "--no-color": "Disable coloured output.",
  "--help": "Show the help text.",
  "--version": "Show the version.",
};

export const EXIT_CODE_MEANINGS: Record<
  number,
  { tone: "green" | "yellow" | "red"; meaning: string }
> = {
  0: {
    tone: "green",
    meaning:
      "No findings at or above --fail-on. With a baseline it means nothing got worse, not that the site is clean: known findings pass through by design. Also returned by --update-baseline, --help and --version.",
  },
  1: {
    tone: "yellow",
    meaning:
      "Findings at or above --fail-on, a new regression against a baseline, or --max-debt exceeded. This is the CI gate.",
  },
  2: {
    tone: "red",
    meaning:
      "The audit could not run, or refused to report: malformed URL, a missing <url>, an unknown flag, an unreadable baseline, a --start command that never answered — or a sitemap that was declared and could not be fetched, which leaves the crawl following links and auditing a different site from the one a baseline was taken on.",
  },
};

/**
 * The caps the engine applies, documented because a truncated run says so in
 * `diagnostics` and the number should be findable.
 *
 * Still hand-written, and still therefore capable of drifting — the audit that
 * prompted this work found a limit here the CLI never reaches. Two of these
 * seven are real named constants in the engine (`maxLinks`, `maxUrls`); the
 * rest are concurrency and hop limits spread across modules that do not export
 * them. Deriving them is a separate job, and pretending otherwise by moving
 * them into `flags.json` would claim a guarantee that is not there.
 */
export const ENGINE_LIMITS: ReadonlyArray<{ what: string; value: string }> = [
  { what: "Pages inspected in parallel", value: "4" },
  {
    what: "Pages scanned for links",
    value: "the pages the crawl audited (--max-pages, or the structural selection)",
  },
  { what: "Unique link targets probed", value: "10,000" },
  { what: "Link probes in parallel", value: "8 overall, 3 per host" },
  { what: "Redirect hops followed", value: "10, then reported as a loop" },
  { what: "URLs collected from a sitemap", value: "5,000" },
  { what: "Child sitemaps followed from an index", value: "50" },
];
