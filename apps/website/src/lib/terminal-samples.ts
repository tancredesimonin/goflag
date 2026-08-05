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
 * The hero transcript. Shorter than `FULL_REPORT` on purpose — a hero that
 * needs scrolling is not a product shot — but the same shape: verdict line,
 * counts, then findings grouped under the page that carries them.
 */
export const HERO_REPORT: TerminalSample = {
  id: "hero",
  command: "npx @goflag/cli https://example.com --static",
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
    ["    ", R("error"), " ", D("robots.conflict"), "  indexable page, disallowed by robots.txt"],
    ["    ", Y("warn "), " ", D("og.image.missing"), "  no og:image"],
  ],
};

export const FULL_REPORT: TerminalSample = {
  id: "full",
  command: "npx @goflag/cli https://example.com --static",
  lines: [
    [B("goflag"), " ", D("https://example.com/")],
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
      "  Page asks to be indexed while robots.txt disallows it.",
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
    [D("note: 1 link returned 403 from an anti-bot filter, not counted as broken.")],
  ],
};

export const SUMMARY_REPORT: TerminalSample = {
  id: "summary",
  command: "npx @goflag/cli https://example.com --static --summary",
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
    ["    ", D("on /blog/hreflang-basics, /blog/sitemaps, /guides (+0 more)")],
    [],
    [B("SEO issues")],
    ["  ", Y("warn "), " ", C("og.image.missing"), " ", D("×9")],
    ["    ", D("A shared link with no image is a bare text row in most clients.")],
    ["    ", D("fix:"), " export const metadata = {"],
    ["         ", D('  openGraph: { images: ["/og.png"] },')],
    ["         ", D("}")],
    ["    ", D("on /pricing, /about, /blog (+6 more)")],
    ["  ", Y("warn "), " ", C("canonical.missing"), " ", D("×4")],
    ["    ", D("Without one, a page competes with its own query-string variants.")],
    ["    ", D("on /blog/hreflang-basics, /blog/sitemaps (+2 more)")],
    [],
    [B("Site-wide issues")],
    ["  ", R("error"), " ", C("hreflang.missing"), " ", D("×1")],
    ["    ", D("Each translation competes with the others instead of consolidating.")],
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
      "  canonical.absolute: canonical is relative",
      D("  on /pricing"),
    ],
    [],
    [B("Resolved")],
    ["  ", G("-"), " ", Y("warn "), " ", D("seo"), "  og.image.missing", D("  on /about")],
    [],
    [D("exit 1")],
  ],
};

export const SAMPLES = [FULL_REPORT, SUMMARY_REPORT, GATE_REPORT] as const;
