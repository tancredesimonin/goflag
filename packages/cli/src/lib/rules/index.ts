/**
 * Rule registry — the SEO metadata policies goflag ships, as sourced
 * descriptors (rules-catalog plan §6).
 *
 * Each rule declares what it enforces (`title`, `why`), how authoritative
 * the requirement is (`rigor` + cited `sources` from `./sources`), which
 * extraction paths it reads, and a pure evaluator over the `Extraction`
 * observation model. Rules never see raw HTML or the engine's `Page`.
 *
 * Deliberately small. These cover the metadata mistakes that are (a)
 * high-impact for search/social and (b) invisible to a human eyeballing a
 * page in a browser. i18n reciprocity ("missing translations") is
 * intentionally NOT a rule here — it is a cross-page concern computed once
 * in `../core/i18n.ts` and surfaced in the report's `missingTranslations`
 * section. Cross-page rules live in `./site-rules.ts`.
 */

import { bandFor } from "./evaluate";
import type { BooleanRule, Rule, ScoredRule, TagOrigin } from "./types";

const TITLE_IDEAL: [number, number] = [10, 60];
const TITLE_ACCEPTABLE: [number, number] = [5, 70];
const DESC_IDEAL: [number, number] = [50, 160];
const DESC_ACCEPTABLE: [number, number] = [25, 200];

function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

const titleMissing: BooleanRule = {
  id: "title.missing",
  kind: "boolean",
  category: "document",
  severity: "error",
  title: "Every page needs a non-empty `<title>`",
  why:
    "The title element is required by the HTML standard and is the primary " +
    "label search engines, browser tabs, bookmarks, and screen readers use " +
    "for the page.",
  rigor: "spec-required",
  sources: ["whatwg-html-title"],
  reads: ["document.title"],
  expected: "a non-empty `<title>` element",
  relates: ["title.length", "og.title.missing"],
  fix: {
    title: "Add a <title> to <head>",
    snippet: [
      "// app/…/page.tsx — App Router owns the <head>; never hand-write the tag.",
      'export const metadata = { title: "Page name — Site name" };',
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.document.title?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: observed ?? null,
      message: "Page is missing a `<title>` element (or it is empty).",
      origin: { kind: "title" },
    };
  },
};

const titleLength: ScoredRule = {
  id: "title.length",
  kind: "scored",
  category: "document",
  title: `Keep \`<title>\` between ${TITLE_IDEAL[0]} and ${TITLE_IDEAL[1]} characters`,
  why:
    "Long titles get truncated in search results and short ones waste the " +
    "one line every result gets. The window is display folklore, not spec — " +
    "Google states title length is not a ranking factor.",
  rigor: "heuristic",
  sources: ["google-title-link", "moz-title-tag"],
  reads: ["document.title"],
  bands: { ideal: TITLE_IDEAL, acceptable: TITLE_ACCEPTABLE },
  severityByBand: { acceptable: "warning", poor: "warning" },
  expected: `${TITLE_IDEAL[0]}–${TITLE_IDEAL[1]} characters`,
  relates: ["title.missing"],
  evaluate: (ex) => {
    const value = ex.document.title?.value?.trim();
    if (!value) return { status: "na", observed: 0 };
    const { status, band } = bandFor(value.length, {
      ideal: TITLE_IDEAL,
      acceptable: TITLE_ACCEPTABLE,
    });
    if (status === "pass") return { status, band, observed: value.length };
    const direction = value.length < TITLE_IDEAL[0] ? "short" : "long";
    return {
      status,
      band,
      observed: value.length,
      message: `Title is ${value.length} characters — ${direction} of the recommended ${TITLE_IDEAL[0]}–${TITLE_IDEAL[1]} window.`,
      origin: { kind: "title" },
    };
  },
};

const descriptionMissing: BooleanRule = {
  id: "description.missing",
  kind: "boolean",
  category: "meta",
  severity: "warning",
  title: 'Provide a `<meta name="description">` on every indexable page',
  why:
    "The description feeds the search-result snippet. Without one, engines " +
    "improvise from page text — usually worse than a sentence you wrote.",
  rigor: "spec-recommended",
  sources: ["whatwg-html-standard-metadata-names", "google-snippet"],
  reads: ["meta.description"],
  expected: 'a non-empty `<meta name="description">`',
  relates: ["description.length", "og.description.missing"],
  fix: {
    title: "Add a meta description",
    snippet: [
      "// app/…/page.tsx",
      "export const metadata = {",
      '  description: "One sentence that promises what this page delivers.",',
      "};",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.meta.description?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: observed ?? null,
      message: 'Page has no `<meta name="description">`.',
      origin: { kind: "meta", name: "description" },
    };
  },
};

const descriptionLength: ScoredRule = {
  id: "description.length",
  kind: "scored",
  category: "meta",
  title: `Keep descriptions between ${DESC_IDEAL[0]} and ${DESC_IDEAL[1]} characters`,
  why:
    "Snippets truncate around 160 characters and very short descriptions " +
    "get replaced by improvised page text. Display folklore, not spec.",
  rigor: "heuristic",
  sources: ["google-snippet", "moz-meta-description"],
  reads: ["meta.description"],
  bands: { ideal: DESC_IDEAL, acceptable: DESC_ACCEPTABLE },
  severityByBand: { acceptable: "warning", poor: "warning" },
  expected: `${DESC_IDEAL[0]}–${DESC_IDEAL[1]} characters`,
  relates: ["description.missing"],
  evaluate: (ex) => {
    const value = ex.meta.description?.value?.trim();
    if (!value) return { status: "na", observed: 0 };
    const { status, band } = bandFor(value.length, {
      ideal: DESC_IDEAL,
      acceptable: DESC_ACCEPTABLE,
    });
    if (status === "pass") return { status, band, observed: value.length };
    const direction = value.length < DESC_IDEAL[0] ? "short" : "long";
    return {
      status,
      band,
      observed: value.length,
      message: `Description is ${value.length} characters — ${direction} of the recommended ${DESC_IDEAL[0]}–${DESC_IDEAL[1]} window.`,
      origin: { kind: "meta", name: "description" },
    };
  },
};

const canonicalMissing: BooleanRule = {
  id: "canonical.missing",
  kind: "boolean",
  category: "canonical",
  severity: "warning",
  title: 'Declare a `<link rel="canonical">` so search engines pick the right URL',
  why:
    "Without a canonical, engines choose among duplicate URLs (tracking " +
    "params, http/https, trailing slashes) themselves — and may split " +
    "ranking signals across them.",
  rigor: "vendor-spec",
  sources: ["ietf-rfc6596", "google-canonicalization"],
  reads: ["meta.canonical"],
  expected: 'a `<link rel="canonical">` declaration',
  relates: ["canonical.absolute"],
  fix: {
    title: "Declare the canonical URL",
    snippet: [
      "// app/…/page.tsx — relative canonicals resolve against metadataBase,",
      "// which defaults to localhost and silently breaks in production.",
      "export const metadata = {",
      "  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),",
      '  alternates: { canonical: "/the-page" },',
      "};",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.meta.canonical?.value;
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: null,
      message: 'Page is missing `<link rel="canonical">`.',
      origin: { kind: "link", rel: "canonical" },
    };
  },
};

const canonicalAbsolute: BooleanRule = {
  id: "canonical.absolute",
  kind: "boolean",
  category: "canonical",
  severity: "error",
  title: '`rel="canonical"` must be an absolute, fully-qualified URL',
  why:
    "Consumers read the literal attribute value, not the browser-resolved " +
    "URL. A relative canonical means every consumer resolves it against " +
    "whatever base it assumes — including the wrong origin.",
  rigor: "vendor-spec",
  sources: ["ietf-rfc6596", "google-canonicalization", "whatwg-url"],
  reads: ["meta.canonical"],
  expected: "an absolute `http(s)://` canonical URL",
  relates: ["canonical.missing"],
  evaluate: (ex) => {
    const canonical = ex.meta.canonical;
    const raw = canonical?.raw?.trim();
    if (!raw) return { status: "na", observed: null };
    if (/^https?:\/\//i.test(raw)) return { status: "pass", observed: raw };
    return {
      status: "fail",
      observed: raw,
      message: `Canonical is "${raw}" — must be an absolute http(s) URL (consumers see the raw value, not the resolved "${canonical?.value ?? raw}").`,
      origin: { kind: "link", rel: "canonical" },
    };
  },
};

const viewportMissing: BooleanRule = {
  id: "viewport.missing",
  kind: "boolean",
  category: "meta",
  severity: "warning",
  title: 'Declare a `<meta name="viewport">` so mobile browsers render at the right scale',
  why:
    "Without a viewport declaration mobile browsers render at desktop " +
    "width and scale down — unreadable text and a mobile-usability demotion.",
  rigor: "guideline",
  sources: ["mdn-viewport", "whatwg-html-standard-metadata-names"],
  reads: ["meta.viewport"],
  expected: 'a `<meta name="viewport">` declaration',
  fix: {
    title: "Add a viewport meta",
    snippet: [
      "// app/layout.tsx — a dedicated export, not part of `metadata`.",
      'export const viewport = { width: "device-width", initialScale: 1 };',
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.meta.viewport?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: null,
      message:
        'Page has no `<meta name="viewport">` — mobile browsers will render at desktop width.',
      origin: { kind: "meta", name: "viewport" },
    };
  },
};

const ogTitleMissing: BooleanRule = {
  id: "og.title.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "Set an explicit `og:title` instead of relying on `<title>` fallback",
  why:
    "og:title is one of the four properties the Open Graph protocol " +
    "requires. Consumers that fall back to `<title>` drag site-name " +
    "boilerplate into the unfurl.",
  rigor: "vendor-spec",
  sources: ["ogp"],
  reads: ["openGraph.title"],
  expected: "an explicit `og:title`",
  relates: ["title.missing", "og.image.missing"],
  evaluate: (ex) => {
    const observed = ex.openGraph.title?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: null,
      message: "Page has no `og:title`; consumers will fall back to `<title>` (or nothing).",
      origin: { kind: "meta", property: "og:title" },
    };
  },
};

const ogDescriptionMissing: BooleanRule = {
  id: "og.description.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "info",
  title: "Set an explicit `og:description` for richer link unfurls",
  why:
    "A page that opted into Open Graph but omitted og:description gets " +
    "unfurls that fall back to the meta description — or to nothing.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.description", "openGraph.title", "openGraph.images", "openGraph.url"],
  expected: "an `og:description` alongside the other `og:*` tags",
  relates: ["description.missing"],
  evaluate: (ex) => {
    const observed = ex.openGraph.description?.value?.trim();
    if (observed) return { status: "pass", observed };
    // Only meaningful when the page bothered with any other OG tag.
    const hasOtherOg = Boolean(
      ex.openGraph.title?.value || ex.openGraph.images.length > 0 || ex.openGraph.url?.value,
    );
    if (!hasOtherOg) return { status: "na", observed: null };
    return {
      status: "fail",
      observed: null,
      message:
        "Page has `og:*` tags but no `og:description`; unfurls will fall back to the meta description (or nothing).",
      origin: { kind: "meta", property: "og:description" },
    };
  },
};

const ogImageMissing: BooleanRule = {
  id: "og.image.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "Provide at least one `og:image` so links unfurl with a preview",
  why:
    "og:image is one of the four required Open Graph properties, and the " +
    "one with the most visible payoff: without it, unfurls are text-only " +
    "or pick a random body image.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.images"],
  expected: "at least one `og:image`",
  relates: ["og.title.missing"],
  fix: {
    title: "Add an og:image",
    snippet: [
      "// app/…/page.tsx",
      "export const metadata = {",
      '  openGraph: { images: [{ url: "/og.png", width: 1200, height: 630 }] },',
      "};",
      "// Or generate one per page: app/…/opengraph-image.tsx with ImageResponse.",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    if (ex.openGraph.images.length > 0) {
      return { status: "pass", observed: ex.openGraph.images.map((i) => i.url.value) };
    }
    return {
      status: "fail",
      observed: [],
      message:
        "Page has no `og:image`. Link unfurls will fall back to text-only or a random body image.",
      origin: { kind: "meta", property: "og:image" },
    };
  },
};

const robotsConflict: BooleanRule = {
  id: "robots.conflict",
  kind: "boolean",
  category: "robots",
  severity: "error",
  title: "`robots`, `googlebot`, and `X-Robots-Tag` must not contradict each other",
  why:
    "When directives conflict, crawlers resolve them with the most " +
    "restrictive interpretation — a stray `noindex` wins over the `index` " +
    "you meant, and the page silently drops out of search.",
  rigor: "vendor-spec",
  sources: ["google-robots-meta"],
  reads: ["meta.robots", "meta.googlebot", "http.headers"],
  expected: "consistent indexing directives across meta tags and headers",
  evaluate: (ex) => {
    const candidates: Array<{ name: string; tokens: Set<string>; origin: TagOrigin }> = [
      {
        name: "meta robots",
        tokens: new Set(tokens(ex.meta.robots?.value)),
        origin: { kind: "meta", name: "robots" },
      },
      {
        name: "meta googlebot",
        tokens: new Set(tokens(ex.meta.googlebot?.value)),
        origin: { kind: "meta", name: "googlebot" },
      },
      {
        name: "X-Robots-Tag header",
        tokens: new Set(tokens(ex.http.headers["x-robots-tag"])),
        origin: { kind: "header", name: "x-robots-tag" },
      },
    ];
    const declarations = candidates.filter((d) => d.tokens.size > 0);

    const observed = Object.fromEntries(declarations.map((d) => [d.name, [...d.tokens].sort()]));
    if (declarations.length < 2) return { status: "na", observed };

    const conflicts: string[] = [];
    let origin: TagOrigin | undefined;
    for (const [negative, positive] of [
      ["noindex", "index"],
      ["nofollow", "follow"],
    ] as const) {
      const sayNo = declarations.filter((d) => d.tokens.has(negative));
      const sayYes = declarations.filter((d) => d.tokens.has(positive) && !d.tokens.has(negative));
      if (sayNo.length > 0 && sayYes.length > 0) {
        conflicts.push(
          `${sayNo.map((d) => d.name).join(", ")} say \`${negative}\`, ${sayYes.map((d) => d.name).join(", ")} say \`${positive}\``,
        );
        origin ??= sayNo[0]!.origin;
      }
    }

    if (conflicts.length === 0) return { status: "pass", observed };
    return {
      status: "fail",
      observed,
      message: `Conflicting robots directives: ${conflicts.join("; ")}.`,
      origin,
    };
  },
};

/** The full set of rules, alphabetised by id (stable output order). */
export const RULES: ReadonlyArray<Rule> = [
  canonicalAbsolute,
  canonicalMissing,
  descriptionLength,
  descriptionMissing,
  ogDescriptionMissing,
  ogImageMissing,
  ogTitleMissing,
  robotsConflict,
  titleLength,
  titleMissing,
  viewportMissing,
];

const RULE_BY_ID: Map<string, Rule> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): Rule | undefined {
  return RULE_BY_ID.get(id);
}

export type { BooleanRule, Rule, RuleFinding, ScoredRule } from "./types";
