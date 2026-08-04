/**
 * What the tool actually does, in five passes.
 *
 * This is the hero's payload, so it is held to the same standard as the terminal
 * samples: every identifier, rule id, default and cap below is taken from
 * `packages/cli/src/lib/core/**` rather than written to sound plausible. A
 * diagram that flatters the engine would be the first thing the site says and
 * also the first thing it got wrong.
 *
 * Two deliberate omissions, because the engine does not do them: robots.txt is
 * only checked for a whole-site `Disallow: /` that contradicts pages serving
 * `<meta name="robots" content="index">`, not per-path, and nothing cross-checks
 * sitemap URLs against robots rules. Neither appears here.
 *
 * Untranslated, on the same grounds as `terminal-samples.ts`: these are
 * identifiers, flags and printed output. The prose around them comes from
 * `messages/*.json`.
 */

/** Where a stage sits in the pass: what it is handed, what it does, what it emits. */
export type StageKind = "input" | "work" | "output";

/**
 * A line inside a stage card. `tone` is the severity the CLI would print it at,
 * and it is the only colour in the diagram — see the note in `workflow-card`.
 */
export interface StageRow {
  text: string;
  tone?: "green" | "yellow" | "red";
  /** Rendered mono: an identifier, a flag, a status line. */
  code?: boolean;
}

export interface Stage {
  kind: StageKind;
  title: string;
  /** The file that does this, relative to `packages/cli/src`. Omitted when the stage is an artefact rather than a step. */
  source?: string;
  rows: StageRow[];
}

export type FlowIcon = "crawl" | "link" | "languages" | "tags" | "gate";

export interface Flow {
  id: string;
  /** Tab label. */
  name: string;
  icon: FlowIcon;
  /** The question this pass answers, in one line. */
  question: string;
  stages: [Stage, Stage, Stage];
}

export const FLOWS: readonly Flow[] = [
  {
    id: "crawl",
    name: "Crawl",
    icon: "crawl",
    question: "Which pages exist, and did they answer?",
    stages: [
      {
        kind: "input",
        title: "One URL",
        rows: [
          { text: "https://example.com", code: true },
          { text: "Sitemap: lines in robots.txt, then /sitemap.xml", code: true },
          { text: "seeds bypass include and exclude globs" },
        ],
      },
      {
        kind: "work",
        title: "crawl",
        source: "core/crawl.ts",
        rows: [
          { text: "breadth-first, same origin, depth 2", code: true },
          { text: "hreflang → head-link → body-anchor", code: true },
          { text: "four pages at a time, 200 page cap" },
          { text: "static GET; Chromium only when the head is empty" },
        ],
      },
      {
        kind: "output",
        title: "pages[] · unreachablePages[]",
        rows: [
          { text: "[500] /pricing", code: true, tone: "red" },
          { text: "[network error] /legacy", code: true, tone: "red" },
          { text: "escalated: headless — 3 pages", code: true },
        ],
      },
    ],
  },
  {
    id: "links",
    name: "Links",
    icon: "link",
    question: "Does every link still lead somewhere?",
    stages: [
      {
        kind: "input",
        title: "Crawled HTML",
        rows: [
          { text: "<a href> only; assets are opt-in", code: true },
          { text: "resolved against <base href>", code: true },
          { text: "each unique target probed once" },
        ],
      },
      {
        kind: "work",
        title: "checkLink",
        source: "core/links/check.ts",
        rows: [
          { text: "HEAD, then GET when HEAD is refused", code: true },
          { text: "eight at a time, three per host" },
          { text: "one retry on 429 and 5xx, honours Retry-After", code: true },
          { text: "200 with a not-found body is a soft-404" },
        ],
      },
      {
        kind: "output",
        title: "brokenLinks[]",
        rows: [
          { text: "[404] /ghost", code: true, tone: "red" },
          { text: "[blocked 403] /members", code: true, tone: "yellow" },
          { text: "[soft-404] /old-post", code: true, tone: "yellow" },
          { text: "every row carries the page it was found on" },
        ],
      },
    ],
  },
  {
    id: "i18n",
    name: "Translations",
    icon: "languages",
    question: "Is any locale quietly missing a page?",
    stages: [
      {
        kind: "input",
        title: "Declared locales",
        rows: [
          { text: "--locales en,fr,es,pt-br", code: true },
          { text: "or locale-shaped prefixes in the sitemap" },
          { text: "never inferred from a URL that looks French" },
        ],
      },
      {
        kind: "work",
        title: "buildI18nMatrix",
        source: "core/i18n.ts",
        rows: [
          { text: "route × locale, one cell per page", code: true },
          { text: "/fr/about → /about", code: true },
          { text: "a hole is a route some locales have and others do not" },
          { text: "x-default never fills one", code: true },
        ],
      },
      {
        kind: "output",
        title: "missingTranslations",
        rows: [
          { text: "/about — missing es (have en, fr)", code: true, tone: "yellow" },
          { text: "missing-back-link", code: true, tone: "yellow" },
          { text: "x-default-missing", code: true, tone: "yellow" },
        ],
      },
    ],
  },
  {
    id: "metadata",
    name: "Metadata",
    icon: "tags",
    question: "Will a crawler read what you meant to publish?",
    stages: [
      {
        kind: "input",
        title: "The <head>",
        rows: [
          { text: "title, description, canonical, viewport", code: true },
          { text: "og:*, twitter:*, JSON-LD", code: true },
          { text: "2xx HTML only; canonical duplicates dropped" },
        ],
      },
      {
        kind: "work",
        title: "lint · lintSite",
        source: "core/lint.ts",
        rows: [
          { text: "11 rules on a page, 3 across the site" },
          { text: "each one pure: Page → Issue[]", code: true },
          { text: "a rule that throws reports itself, and the run goes on" },
        ],
      },
      {
        kind: "output",
        title: "seoIssues[] · siteIssues[]",
        rows: [
          { text: "error title.missing", code: true, tone: "red" },
          { text: "error hreflang.missing", code: true, tone: "red" },
          { text: "warning description.length", code: true, tone: "yellow" },
          { text: "each issue ships the fix as a snippet" },
        ],
      },
    ],
  },
  {
    id: "gate",
    name: "The gate",
    icon: "gate",
    question: "Is this branch worse than the last one?",
    stages: [
      {
        kind: "input",
        title: "baseline.json",
        rows: [
          { text: "--baseline baseline.json --regressions-only", code: true },
          { text: "written by --update-baseline, by the same command", code: true },
          { text: "known findings are debt, not noise" },
        ],
      },
      {
        kind: "work",
        title: "diffReports",
        source: "report/diff.ts",
        rows: [
          { text: "findings matched by fingerprint, not by line", code: true },
          { text: "added · resolved · unchanged", code: true },
          { text: "--max-debt caps the total so debt can only shrink", code: true },
        ],
      },
      {
        kind: "output",
        title: "exit code",
        rows: [
          { text: "0 — nothing new", code: true, tone: "green" },
          { text: "1 — a regression, and which one", code: true, tone: "red" },
          { text: "2 — goflag itself could not run", code: true },
        ],
      },
    ],
  },
] as const;
