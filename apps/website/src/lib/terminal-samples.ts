/**
 * Transcripts of the three views the CLI prints.
 *
 * Written against the renderers in `packages/cli/src/report` — `renderTerminal`,
 * `renderSummaryTerminal` and `renderDiffTerminal` — so the column order, the
 * severity padding (`warn ` and `info ` are padded to five characters so the
 * rule column lines up) and the wording match what a real run emits. The site
 * cannot import those renderers (invariant I3 forbids `apps/**` from reaching
 * into `packages/cli`), so this file is the one place that has to be kept in
 * step with them by hand.
 */

export type Tone = "dim" | "bold" | "red" | "yellow" | "green" | "cyan";

export type Span = string | { t: string; tone: Tone };

export type TerminalLine = readonly Span[];

export interface TerminalSample {
  readonly id: string;
  readonly command: string;
  readonly lines: readonly TerminalLine[];
}

const B = (t: string): Span => ({ t, tone: "bold" });
const D = (t: string): Span => ({ t, tone: "dim" });
const R = (t: string): Span => ({ t, tone: "red" });
const Y = (t: string): Span => ({ t, tone: "yellow" });
const G = (t: string): Span => ({ t, tone: "green" });
const C = (t: string): Span => ({ t, tone: "cyan" });

/**
 * A shortened transcript: same shape as `FULL_REPORT` — verdict line, counts,
 * then findings grouped under the page that carries them — for any surface too
 * small for the full one. Not rendered anywhere today; the hero is the check
 * switcher, not a screenshot.
 */
export const HERO_REPORT: TerminalSample = {
  id: "hero",
  command: "npx @goflag/cli https://example.com",
  lines: [
    [B("goflag"), " ", D("https://example.com/")],
    [R("RED FLAG"), "  ", D("128 pages crawled, 128 scanned")],
    [],
    [Y("3 broken links"), "   ", Y("2 missing translations"), "   ", Y("14 SEO issues")],
    [],
    [B("Broken links")],
    ["  ", C("/blog/hreflang-basics")],
    ["    ", R("[404]"), " /guides/canonical-tags"],
    [],
    [B("Missing translations")],
    ["  ", C("/blog/hreflang-basics"), " — missing ", Y("de"), D(" (have en, fr)")],
    [],
    [B("SEO issues")],
    ["  ", C("/pricing")],
    [
      "    ",
      R("error"),
      " ",
      D("robots.conflict"),
      "  meta robots say noindex, meta googlebot say index",
    ],
    ["    ", Y("warn "), " ", D("og.image.missing"), "  no og:image"],
  ],
};

export const FULL_REPORT: TerminalSample = {
  id: "full",
  command: "npx @goflag/cli https://example.com",
  lines: [
    [B("goflag"), " ", D("https://example.com/")],
    [R("RED FLAG"), "  ", D("128 pages crawled, 128 scanned")],
    [
      D(
        "COVERAGE  128 of 412 pages audited · 9 families sampled, largest 3/117 /{locale}/blog/{2}",
      ),
    ],
    [
      D(
        "          Template rules are conclusive. Copy rules — title.length, description.length — are sampled.",
      ),
    ],
    [],
    [
      Y("3 broken links"),
      "   ",
      Y("2 missing translations"),
      "   ",
      Y("14 SEO issues"),
      "   ",
      Y("1 site issue"),
      "   ",
      D("0 unreachable pages"),
    ],
    [],
    [B("Broken links")],
    ["  ", C("https://example.com/blog/hreflang-basics")],
    ["    ", R("[404]"), " https://example.com/guides/canonical-tags"],
    ["    ", Y("[blocked 403 forbidden]"), " https://api.partner.example/status"],
    [],
    [B("Missing translations")],
    ["  ", C("/blog/hreflang-basics"), " — missing ", Y("de"), D(" (have en, fr)")],
    ["  ", Y("missing-back-link"), " ", D("https://example.com/fr/blog/hreflang-basics")],
    [
      "    /fr/blog/hreflang-basics declares an alternate to /de/... but the peer does not link back.",
    ],
    [],
    [B("SEO issues")],
    ["  ", C("https://example.com/blog/hreflang-basics")],
    ["    ", Y("warn "), " ", D("canonical.missing"), '  Page is missing <link rel="canonical">.'],
    [
      "    ",
      Y("warn "),
      " ",
      D("description.length"),
      "  Description is 31 characters — short of the recommended 50–160 window.",
    ],
    ["  ", C("https://example.com/pricing")],
    [
      "    ",
      R("error"),
      " ",
      D("robots.conflict"),
      "  Conflicting robots directives: meta robots say noindex, meta googlebot say index.",
    ],
    ["    ", Y("warn "), " ", D("og.image.missing"), "  Page has no og:image."],
    [],
    [B("Site-wide issues")],
    ["  ", D("locales: en, fr, de (via sitemap)")],
    ["  ", C("https://example.com/")],
    [
      "    ",
      R("error"),
      " ",
      D("hreflang.missing"),
      "  Site serves 3 locales but declares no hreflang alternates.",
    ],
    [],
    [D("note: 1 page(s) failed once and answered on retry: https://example.com/blog/sitemaps.")],
  ],
};

export const SUMMARY_REPORT: TerminalSample = {
  id: "summary",
  command: "npx @goflag/cli https://example.com --summary",
  lines: [
    [B("goflag"), " ", D("https://example.com/"), " ", D("(summary)")],
    [R("RED FLAG"), "  ", D("128 pages crawled, 128 scanned")],
    [],
    [
      Y("3 broken links"),
      "   ",
      Y("2 missing translations"),
      "   ",
      Y("14 SEO issues"),
      "   ",
      Y("1 site issue"),
      "   ",
      D("0 unreachable pages"),
    ],
    [],
    [B("Broken links")],
    ["  ", R("[404]"), " https://example.com/guides/canonical-tags ", D("×3")],
    ["    ", D("on /blog/hreflang-basics, /blog/sitemaps, /guides")],
    [],
    [B("SEO issues")],
    ["  ", Y("warn "), " ", C("og.image.missing"), " ", D("×9")],
    ["    ", D("Provide at least one og:image so links unfurl with a preview")],
    ["    ", D("fix:"), " // app/…/page.tsx"],
    ["         ", D("export const metadata = {")],
    ["         ", D('  openGraph: { images: [{ url: "/og.png", width: 1200, height: 630 }] },')],
    ["         ", D("};")],
    ["    ", D("on /pricing, /about, /blog (+6 more)")],
    ["  ", Y("warn "), " ", C("canonical.missing"), " ", D("×4")],
    ["    ", D('Declare a <link rel="canonical"> so search engines pick the right URL')],
    ["    ", D("on /blog/hreflang-basics, /blog/sitemaps (+2 more)")],
    [],
    [B("Site-wide issues")],
    ["  ", R("error"), " ", C("hreflang.missing"), " ", D("×1")],
    ["    ", D("Pages on a multilingual site must advertise their locale alternates")],
    ["    ", D("on /")],
  ],
};

export const GATE_REPORT: TerminalSample = {
  id: "gate",
  command:
    "npx @goflag/cli http://localhost:3000 --baseline .goflag/baseline.json --regressions-only --max-debt 14",
  lines: [
    [B("goflag"), " ", D("--regressions-only")],
    [
      R("REGRESSION"),
      "  1 new · ",
      B("13 known findings NOT gating this build"),
      D(" · 1 resolved"),
    ],
    [D("baseline https://example.com/ — taken 2026-07-21T09:14:02.881Z (14 days ago)")],
    [],
    [B("New findings")],
    [
      "  ",
      R("+"),
      " ",
      R("error"),
      " ",
      D("seo"),
      "  canonical.absolute on https://example.com/pricing",
    ],
    [],
    [B("Resolved")],
    [
      "  ",
      G("-"),
      " ",
      Y("warn "),
      " ",
      D("seo"),
      "  og.image.missing on https://example.com/about",
    ],
  ],
};

export const SAMPLES = [FULL_REPORT, SUMMARY_REPORT, GATE_REPORT] as const;
