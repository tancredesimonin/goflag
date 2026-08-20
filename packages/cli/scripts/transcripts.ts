/**
 * The frozen reports the published transcripts are rendered from.
 *
 * Hand-written and typed against `GoflagReport`, deliberately — not captured
 * from a live audit of the demo fixture. A captured report couples every change
 * in the audit engine to a regeneration and to reading a twelve-page diff, and
 * `packages/cli/src/report/` took 27 commits in the nineteen days before this
 * file existed. Written by hand, the shape is checked by the compiler instead:
 * a field that moves is a type error here, in the same commit that moved it.
 *
 * What that costs is honesty about the numbers, so `test/unit/transcripts.test.ts`
 * re-derives every count the way `build.ts` does. A report that could not come
 * out of a real run fails there rather than reaching the site.
 *
 * Everything is frozen: `finishedAt`, the baseline timestamp, and the clock
 * `renderDiffTerminal` reads. That renderer prints the baseline's age in whole
 * days (`render-diff.ts:92`), so without an injected `now` the rendered text
 * changes at midnight UTC and the byte-for-byte test reddens on a tree nobody
 * touched.
 */

import type { ReportDiff } from "../src/report/diff";
import { fingerprint, routeKey, targetKey } from "../src/report/fingerprint";
import { renderDiffTerminal } from "../src/report/render-diff";
import { renderSummaryTerminal } from "../src/report/render-summary";
import { renderTerminal } from "../src/report/render-terminal";
import { summarize } from "../src/report/summarize";
import type { GoflagReport } from "../src/report/types";

/** The site the transcripts audit. `example.com` is reserved by RFC 2606. */
const SITE = "https://example.com";

/** Frozen so the diff's "N days ago" is a constant rather than a clock read. */
export const FROZEN_NOW = Date.parse("2026-08-04T09:14:02.881Z");
const FINISHED_AT = "2026-08-04T09:14:02.881Z";
const BASELINE_TAKEN = "2026-07-21T09:14:02.881Z";

const page = (path: string, locale: string | null = null) => ({
  url: `${SITE}${path}`,
  status: 200,
  locale,
});

const seo = (
  path: string,
  ruleId: string,
  severity: "error" | "warning" | "info",
  message: string,
  extra: { rigor?: GoflagReport["seoIssues"][number]["rigor"]; why?: string; fix?: string } = {},
) => ({
  id: fingerprint("seo", ruleId, routeKey(`${SITE}${path}`)),
  pageUrl: `${SITE}${path}`,
  ruleId,
  severity,
  message,
  ...extra,
});

/**
 * A red run on a small multilingual site: two dead links, a translation gap
 * with a broken reciprocity pair behind it, four page findings across two
 * pages and one site-wide finding.
 *
 * Small on purpose. `renderTerminal` lists *every* finding, so a report
 * claiming fourteen SEO issues has to show fourteen — the previous
 * hand-written sample on the site claimed fourteen and showed four, which is
 * one of the ways it stopped being the output it said it was.
 */
export const DEMO_REPORT: GoflagReport = {
  url: `${SITE}/`,
  finishedAt: FINISHED_AT,
  profile: "default",
  summary: {
    // `linkReport.summary.broken` counts the `broken` verdict only: the
    // 403 below is triage, not a dead link, so it appears in the list and
    // not in this number (`build.ts:957`).
    brokenLinks: 1,
    missingTranslations: 2,
    seoIssues: 4,
    siteIssues: 1,
    unreachablePages: 0,
    verdict: "red",
  },
  localeAxis: {
    locales: ["en", "fr", "de"],
    source: "sitemap",
    multilingual: true,
  },
  pages: [
    page("/", "en"),
    page("/pricing", "en"),
    page("/blog/hreflang-basics", "en"),
    page("/fr/blog/hreflang-basics", "fr"),
  ],
  unreachablePages: [],
  brokenLinks: [
    {
      id: fingerprint(
        "link",
        routeKey(`${SITE}/blog/hreflang-basics`),
        targetKey(`${SITE}/guides/canonical-tags`),
      ),
      pageUrl: `${SITE}/blog/hreflang-basics`,
      href: `${SITE}/guides/canonical-tags`,
      status: 404,
      verdict: "broken",
    },
    {
      id: fingerprint(
        "link",
        routeKey(`${SITE}/blog/hreflang-basics`),
        targetKey("https://api.partner.example/status"),
      ),
      pageUrl: `${SITE}/blog/hreflang-basics`,
      href: "https://api.partner.example/status",
      status: 403,
      verdict: "blocked",
      reason: "403 forbidden",
    },
  ],
  missingTranslations: {
    holes: [
      {
        id: fingerprint("hole", "/blog/hreflang-basics", "de"),
        route: "/blog/hreflang-basics",
        presentLocales: ["en", "fr"],
        missingLocales: ["de"],
      },
    ],
    reciprocity: [
      {
        id: fingerprint("recip", "missing-back-link", routeKey(`${SITE}/fr/blog/hreflang-basics`)),
        code: "missing-back-link",
        url: `${SITE}/fr/blog/hreflang-basics`,
        locale: "de",
        peerUrl: `${SITE}/de/blog/hreflang-basics`,
        message:
          "/fr/blog/hreflang-basics declares an alternate to /de/... but the peer does not link back.",
      },
    ],
  },
  seoIssues: [
    seo(
      "/blog/hreflang-basics",
      "canonical.missing",
      "warning",
      'Page is missing <link rel="canonical">.',
      {
        rigor: "vendor-spec",
        why: 'Declare a <link rel="canonical"> so search engines pick the right URL',
      },
    ),
    seo(
      "/blog/hreflang-basics",
      "description.length",
      "warning",
      "Description is 31 characters — short of the recommended 50–160 window.",
      { rigor: "heuristic", why: "A description outside the window is rewritten or truncated" },
    ),
    seo(
      "/pricing",
      "robots.conflict",
      "error",
      "Conflicting robots directives: meta robots say noindex, meta googlebot say index.",
      {
        rigor: "vendor-spec",
        why: "Two directives that disagree leave indexing to the crawler's tie-break",
      },
    ),
    seo("/pricing", "og.image.missing", "warning", "Page has no og:image.", {
      rigor: "guideline",
      why: "Provide at least one og:image so links unfurl with a preview",
      fix: [
        "// app/…/page.tsx",
        "export const metadata = {",
        '  openGraph: { images: [{ url: "/og.png", width: 1200, height: 630 }] },',
        "};",
      ].join("\n"),
    }),
  ],
  siteIssues: [
    {
      id: fingerprint("site", "hreflang.missing", routeKey(`${SITE}/`)),
      pageUrl: `${SITE}/`,
      ruleId: "hreflang.missing",
      severity: "error",
      message: "Site serves 3 locales but declares no hreflang alternates.",
      why: "Pages on a multilingual site must advertise their locale alternates",
      rigor: "vendor-spec",
    },
  ],
  diagnostics: {
    pagesCrawled: 128,
    pagesScanned: 128,
    pagesFailed: 1,
    truncated: false,
    warnings: [`1 page(s) failed once and answered on retry: ${SITE}/blog/sitemaps.`],
    coverage: {
      mode: "structural",
      considered: 412,
      selected: 128,
      families: [
        { pattern: "/{locale}/blog/{2}", size: 117, sampled: 3 },
        { pattern: "/{locale}/guides/{2}", size: 41, sampled: 3 },
      ],
    },
  },
};

/**
 * The gate view: one regression against a baseline that is still carrying
 * known findings. `unchanged` is the debt the build is being let through
 * with, and it is the headline `renderDiffTerminal` prints in bold.
 */
export const DEMO_DIFF: ReportDiff = {
  baseline: { url: `${SITE}/`, finishedAt: BASELINE_TAKEN, profile: "default" },
  added: [
    {
      id: fingerprint("seo", "canonical.absolute", routeKey(`${SITE}/pricing`)),
      kind: "seo",
      severity: "error",
      summary: `canonical.absolute on ${SITE}/pricing`,
      pageUrl: `${SITE}/pricing`,
    },
  ],
  resolved: [
    {
      id: fingerprint("seo", "og.image.missing", routeKey(`${SITE}/about`)),
      kind: "seo",
      severity: "warning",
      summary: `og.image.missing on ${SITE}/about`,
      pageUrl: `${SITE}/about`,
    },
  ],
  unchanged: 13,
};

/**
 * One entry per published transcript. The generator writes what `render`
 * returns and the test re-runs the same list, so neither can render something
 * the other does not.
 */
export interface TranscriptSpec {
  /** Stable key: the file name, and the tab value the site keys off. */
  id: string;
  /** The invocation printed above the panel. */
  command: string;
  render(color: boolean): string;
}

export const TRANSCRIPTS: readonly TranscriptSpec[] = [
  {
    id: "full",
    command: `npx @goflag/cli ${SITE}`,
    render: (color) => renderTerminal(DEMO_REPORT, { color }),
  },
  {
    id: "summary",
    command: `npx @goflag/cli ${SITE} --summary`,
    // `renderSummaryTerminal` takes a `GoflagSummary`, not a report — and it
    // is the only view that prints the `[rigor]` tag, which is what the
    // hand-written copy on the site had been missing since the tag shipped.
    render: (color) => renderSummaryTerminal(summarize(DEMO_REPORT), { color }),
  },
  {
    id: "gate",
    command: `npx @goflag/cli ${SITE} --baseline .goflag/baseline.json --regressions-only --max-debt 14`,
    render: (color) => renderDiffTerminal(DEMO_DIFF, { color, now: FROZEN_NOW }),
  },
] as const;
