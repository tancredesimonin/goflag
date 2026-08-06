/**
 * The rule catalogue, as documentation.
 *
 * This is a hand-maintained mirror of `packages/cli/src/lib/rules/index.ts`,
 * `prose.ts` and `site-rules.ts`, and it is deliberately not an import: an
 * ESLint rule forbids `apps/**` from reaching into `packages/cli` (invariant
 * I3), so the site cannot read the registry directly.
 *
 * The field names match what `goflag rules --json` will emit when that command
 * lands; this file is then replaced by its output and the pages rendering it do
 * not change.
 *
 * `summary`, `message` and `fix.snippet` are verbatim from the registry. `why`
 * is the only editorial field — the cost of the mistake, which the code has no
 * reason to carry.
 */

export type RuleSeverity = "error" | "warning" | "info";

/**
 * How authoritative the requirement behind a rule is — the honest expression
 * of "source of truth", and the thing that tells a reader (or an agent) how
 * much a finding is worth arguing with. A `heuristic` is folklore that may be
 * safely ignored on a given page; a `spec-required` is not.
 */
export type RuleRigor =
  "spec-required" | "spec-recommended" | "vendor-spec" | "guideline" | "heuristic";

/** How authoritative a cited document is, on the source catalogue's own scale. */
export type SourceRigor = "normative" | "vendor-spec" | "guideline" | "heuristic";

export interface SourceDoc {
  id: string;
  publisher: string;
  title: string;
  rigor: SourceRigor;
  /** Deep link, with the section anchor already applied. */
  url: string;
}

/**
 * The documents the shipped rules cite, mirrored from the CLI's source
 * catalogue. Only the cited entries appear here — the catalogue itself carries
 * more, seeded for rules that do not exist yet.
 */
export const SOURCES: Readonly<Record<string, SourceDoc>> = {
  "bing-webmaster-guidelines": {
    id: "bing-webmaster-guidelines",
    publisher: "Microsoft",
    title: "Bing Webmaster Guidelines",
    rigor: "guideline",
    url: "https://www.bing.com/webmasters/help/webmasters-guidelines-30fba23a",
  },
  "google-canonicalization": {
    id: "google-canonicalization",
    publisher: "Google",
    title: "Consolidate duplicate URLs (canonicalization)",
    rigor: "vendor-spec",
    url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  },
  "google-robots-meta": {
    id: "google-robots-meta",
    publisher: "Google",
    title: "Robots meta tag and X-Robots-Tag",
    rigor: "vendor-spec",
    url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
  },
  "google-snippet": {
    id: "google-snippet",
    publisher: "Google",
    title: "Control your snippets in search results",
    rigor: "guideline",
    url: "https://developers.google.com/search/docs/appearance/snippet",
  },
  "google-title-link": {
    id: "google-title-link",
    publisher: "Google",
    title: "Influence your title links in search results",
    rigor: "guideline",
    url: "https://developers.google.com/search/docs/appearance/title-link",
  },
  "ietf-rfc6596": {
    id: "ietf-rfc6596",
    publisher: "IETF",
    title: "RFC 6596 — The Canonical Link Relation",
    rigor: "normative",
    url: "https://www.rfc-editor.org/rfc/rfc6596",
  },
  "mdn-viewport": {
    id: "mdn-viewport",
    publisher: "MDN / Mozilla",
    title: "MDN — Viewport meta tag",
    rigor: "guideline",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag",
  },
  "meta-og-sharing": {
    id: "meta-og-sharing",
    publisher: "Meta",
    title: "Sharing — webmasters (Open Graph usage)",
    rigor: "vendor-spec",
    url: "https://developers.facebook.com/docs/sharing/webmasters/",
  },
  "moz-meta-description": {
    id: "moz-meta-description",
    publisher: "Moz",
    title: "Meta description best practices",
    rigor: "heuristic",
    url: "https://moz.com/learn/seo/meta-description",
  },
  "moz-title-tag": {
    id: "moz-title-tag",
    publisher: "Moz",
    title: "Title tag best practices",
    rigor: "heuristic",
    url: "https://moz.com/learn/seo/title-tag",
  },
  ogp: {
    id: "ogp",
    publisher: "ogp.me",
    title: "The Open Graph protocol",
    rigor: "vendor-spec",
    url: "https://ogp.me/",
  },
  "w3c-i18n-language-tags": {
    id: "w3c-i18n-language-tags",
    publisher: "W3C",
    title: "W3C i18n — Language tags in HTML and XML",
    rigor: "guideline",
    url: "https://www.w3.org/International/articles/language-tags/",
  },
  "whatwg-html-lang": {
    id: "whatwg-html-lang",
    publisher: "WHATWG",
    title: "HTML Living Standard — the lang and xml:lang attributes",
    rigor: "normative",
    url: "https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes",
  },
  "whatwg-html-standard-metadata-names": {
    id: "whatwg-html-standard-metadata-names",
    publisher: "WHATWG",
    title: "HTML Living Standard — standard metadata names",
    rigor: "normative",
    url: "https://html.spec.whatwg.org/multipage/semantics.html#standard-metadata-names",
  },
  "whatwg-html-title": {
    id: "whatwg-html-title",
    publisher: "WHATWG",
    title: "HTML Living Standard — the title element",
    rigor: "normative",
    url: "https://html.spec.whatwg.org/multipage/semantics.html#the-title-element",
  },
  "whatwg-url": {
    id: "whatwg-url",
    publisher: "WHATWG",
    title: "URL Standard",
    rigor: "normative",
    url: "https://url.spec.whatwg.org/",
  },
};

export interface RuleFix {
  title: string;
  snippet: string;
  language: "tsx" | "ts";
}

export interface RuleDoc {
  id: string;
  scope: "page" | "site" | "prose";
  /**
   * `null` on prose rules. They produce no verdict, so there is nothing for a
   * severity to describe — inventing one would make a question look like a
   * finding, which is the single thing this design refuses to do.
   */
  severity: RuleSeverity | null;
  /** Verbatim `summary` from the registry. */
  summary: string;
  /**
   * The message the CLI prints, verbatim (with example values substituted).
   * On a prose rule this is the question printed under "Needs judgment".
   */
  message: string;
  /** Editorial: what the mistake costs. Not present in the registry. */
  why: string;
  fix?: RuleFix;
  /**
   * `null` on the cross-page rules only: they still run on the pre-catalogue
   * contract and pick up rigor when they move onto the descriptor (phase G).
   * Left explicit rather than absent, so the gap shows.
   */
  rigor: RuleRigor | null;
  /** Ids into `SOURCES`. Empty only where `rigor` is null, for the same reason. */
  sources: readonly string[];
}

export const PAGE_RULES: readonly RuleDoc[] = [
  {
    id: "title.missing",
    scope: "page",
    severity: "error",
    summary: "Every page needs a non-empty `<title>`",
    message: "Page is missing a `<title>` element (or it is empty).",
    why: "The title is the clickable line in every search result and the label of every browser tab. Without one, the engine invents a replacement from the page body, and the page competes with a heading someone wrote for a different purpose.",
    fix: {
      title: "Add a <title> to <head>",
      snippet: [
        "// app/…/page.tsx — App Router owns the <head>; never hand-write the tag.",
        'export const metadata = { title: "Page name — Site name" };',
      ].join("\n"),
      language: "tsx",
    },
    rigor: "spec-required",
    sources: ["whatwg-html-title"],
  },
  {
    id: "title.length",
    scope: "page",
    severity: "warning",
    summary: "Keep `<title>` between 10 and 60 characters",
    message: "Title is 74 characters — long of the recommended 10–60 window.",
    why: "Past roughly sixty characters the result gets truncated, and the truncation lands wherever it lands. A title that ends mid-word is a title whose promise the reader never saw.",
    rigor: "heuristic",
    sources: ["google-title-link", "moz-title-tag"],
  },
  {
    id: "description.missing",
    scope: "page",
    severity: "warning",
    summary: 'Provide a `<meta name="description">` on every indexable page',
    message: 'Page has no `<meta name="description">`.',
    why: "The description is not a ranking factor, and it is the only sentence you control between the title and the click. With none, the engine assembles one from whatever text sits near the matched query.",
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
    rigor: "spec-recommended",
    sources: ["whatwg-html-standard-metadata-names", "google-snippet"],
  },
  {
    id: "description.length",
    scope: "page",
    severity: "warning",
    summary: "Keep descriptions between 50 and 160 characters",
    message: "Description is 31 characters — short of the recommended 50–160 window.",
    why: "Too short and the snippet gets padded with body text you did not choose; too long and it is cut. The window is a heuristic, not a specification; see the note on rigor below.",
    rigor: "heuristic",
    sources: ["google-snippet", "moz-meta-description"],
  },
  {
    id: "canonical.missing",
    scope: "page",
    severity: "warning",
    summary: 'Declare a `<link rel="canonical">` so search engines pick the right URL',
    message: 'Page is missing `<link rel="canonical">`.',
    why: "Any tracking parameter, trailing slash or uppercase path creates a second URL serving the same page. Without a canonical, the engine picks which one to keep, and it does not have to pick yours.",
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
    rigor: "vendor-spec",
    sources: ["ietf-rfc6596", "google-canonicalization"],
  },
  {
    id: "canonical.absolute",
    scope: "page",
    severity: "error",
    summary: '`rel="canonical"` must be an absolute, fully-qualified URL',
    message:
      'Canonical is "/the-page" — must be an absolute http(s) URL (consumers see the raw value, not the resolved "https://example.com/the-page").',
    why: "This is the failure that de-indexes a site without anybody touching a page. A relative canonical resolves against `metadataBase`, which defaults to localhost, so production ships canonicals pointing at a host no crawler can reach.",
    rigor: "vendor-spec",
    sources: ["ietf-rfc6596", "google-canonicalization", "whatwg-url"],
  },
  {
    id: "viewport.missing",
    scope: "page",
    severity: "warning",
    summary: 'Declare a `<meta name="viewport">` so mobile browsers render at the right scale',
    message: 'Page has no `<meta name="viewport">` — mobile browsers will render at desktop width.',
    why: "Without it a phone renders the page at desktop width and scales it down. The layout is not broken, only unreadable, which is why it survives review.",
    fix: {
      title: "Add a viewport meta",
      snippet: [
        "// app/layout.tsx — a dedicated export, not part of `metadata`.",
        'export const viewport = { width: "device-width", initialScale: 1 };',
      ].join("\n"),
      language: "tsx",
    },
    rigor: "guideline",
    sources: ["mdn-viewport", "whatwg-html-standard-metadata-names"],
  },
  {
    id: "og.title.missing",
    scope: "page",
    severity: "warning",
    summary: "Set an explicit `og:title` instead of relying on `<title>` fallback",
    message: "Page has no `og:title`; consumers will fall back to `<title>` (or nothing).",
    why: "A search title and a shared-link title have different jobs: one ends in the site name for disambiguation, the other does not need it. Relying on the fallback means every share carries the search variant.",
    rigor: "vendor-spec",
    sources: ["ogp"],
  },
  {
    id: "og.description.missing",
    scope: "page",
    severity: "info",
    summary: "Set an explicit `og:description` for richer link unfurls",
    message:
      "Page has `og:*` tags but no `og:description`; unfurls will fall back to the meta description (or nothing).",
    why: "Only flagged when the page already carries other `og:*` tags. A page that opted into Open Graph and then skipped the description almost always did so by accident.",
    rigor: "vendor-spec",
    sources: ["ogp", "meta-og-sharing"],
  },
  {
    id: "og.image.missing",
    scope: "page",
    severity: "warning",
    summary: "Provide at least one `og:image` so links unfurl with a preview",
    message:
      "Page has no `og:image`. Link unfurls will fall back to text-only or a random body image.",
    why: "A link pasted into Slack, LinkedIn or iMessage with no image is a grey rectangle of text. The cost is not aesthetic: it is the click that does not happen.",
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
    rigor: "vendor-spec",
    sources: ["ogp", "meta-og-sharing"],
  },
  {
    id: "robots.conflict",
    scope: "page",
    severity: "error",
    summary: "`robots`, `googlebot`, and `X-Robots-Tag` must not contradict each other",
    message:
      "Conflicting indexing directives: X-Robots-Tag header say `noindex`, meta robots say `index`.",
    why: "Three places can declare indexing policy, and a header injected by a proxy outranks the tag a developer reads in the source. This is what a staging header left on a production route looks like from the outside.",
    rigor: "vendor-spec",
    sources: ["google-robots-meta"],
  },
];

export const SITE_RULES: readonly RuleDoc[] = [
  {
    id: "hreflang.missing",
    scope: "site",
    severity: "error",
    summary: "Pages on a multilingual site must advertise their locale alternates",
    message:
      "Page declares no `hreflang` alternates, but the site serves 4 locales (en, es, fr, pt-br, per the sitemap). Locale variants of this route cannot be associated with each other.",
    why: "This is the blind spot goflag was built to close. Without alternates, an engine cannot tell four translations of a page from four competing pages, so they consolidate nothing and split each other's authority.",
    fix: {
      title: "Emit alternates from generateMetadata()",
      snippet: [
        "// app/[locale]/…/page.tsx",
        "export async function generateMetadata({ params }) {",
        "  const { locale } = await params;",
        "  return {",
        "    alternates: {",
        "      canonical: `${baseUrl}/${locale}${path}`,",
        "      languages: {",
        '        "en": `${baseUrl}/en${path}`,',
        '        "fr": `${baseUrl}/fr${path}`,',
        '        "x-default": `${baseUrl}/${defaultLocale}${path}`,',
        "      },",
        "    },",
        "  };",
        "}",
      ].join("\n"),
      language: "tsx",
    },
    rigor: null,
    sources: [],
  },
  {
    id: "hreflang.sitemap-mismatch",
    scope: "site",
    severity: "warning",
    summary: "`<head>` alternates and sitemap locale coverage must agree",
    message:
      "Route `/pricing`: the sitemap lists es, pt-br but the `<head>` does not advertise them. Both are derived from the same intent and must not disagree.",
    why: "The head and the sitemap are two declarations of one intent, produced by different code paths, so they drift. Under-declaring hides real translations; over-declaring points hreflang at URLs the site itself does not list, which is read as a broken cluster.",
    fix: {
      title: "Derive both from one locale-availability source",
      snippet: [
        "// Compute availability once, feed both the <head> and the sitemap.",
        "const localesFor = (slug: string) =>",
        "  allDocs.filter((d) => d.slug === slug && !d.draft).map((d) => d.locale);",
        "",
        "// generateMetadata(): alternates.languages ← localesFor(slug)",
        "// sitemap.ts:        alternates.languages ← localesFor(slug)",
      ].join("\n"),
      language: "ts",
    },
    rigor: null,
    sources: [],
  },
  {
    id: "robots.blocks-site",
    scope: "site",
    severity: "error",
    summary: "`robots.txt` must not forbid crawling a site that asks to be indexed",
    message:
      '`robots.txt` disallows the whole site for `User-agent: *`, but 42 crawled pages declare `<meta name="robots" content="index">`. Both cannot be true: robots.txt wins, so the pages are never fetched and the meta tag is never read.',
    why: "The most expensive misconfiguration a site can carry, and it is invisible from inside a browser. Severity drops to a warning when nothing contradicts the block: a staging environment that disallows everything and claims nothing else is doing exactly what it means to.",
    fix: {
      title: "Gate the disallow on the deployed environment",
      snippet: [
        "// app/robots.ts — the flag must be readable at build AND at runtime,",
        "// or a production container silently serves the staging rules.",
        'const isProduction = process.env.APP_ENV === "production";',
        "",
        "export default function robots(): MetadataRoute.Robots {",
        '  if (!isProduction) return { rules: { userAgent: "*", disallow: "/" } };',
        "  return {",
        '    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/_next/"] },',
        "    sitemap: `${baseUrl}/sitemap.xml`,",
        "  };",
        "}",
      ].join("\n"),
      language: "ts",
    },
    rigor: null,
    sources: [],
  },
];

/**
 * The judgement calls goflag states but refuses to answer.
 *
 * Each one is a rule it could fake — count words, match a boilerplate string,
 * emit a confident verdict about whether a title "describes the page". It does
 * not: a fabricated judgement on a question of meaning is unfalsifiable noise a
 * developer learns to ignore. Instead `--advisories` attaches the observed
 * facts the answer turns on and leaves the verdict at `needs-judgment`, for a
 * human or an agent to settle.
 *
 * They are asked only where the subject exists: no question about a description
 * on a page that has none, because `description.missing` already says that.
 */
export const PROSE_RULES: readonly RuleDoc[] = [
  {
    id: "title.descriptive",
    scope: "prose",
    severity: null,
    summary: "The `<title>` describes this specific page",
    message:
      "Does the title describe what is on THIS page specifically — not the site, not the section — and would it be distinguishable from the other pages of this site in a list of search results?",
    why: "A title that repeats the site name, or describes the section rather than the page, gives a searcher no way to tell two results apart — and gives Google a reason to rewrite it into something you did not choose.",
    rigor: "guideline",
    sources: ["google-title-link", "bing-webmaster-guidelines"],
  },
  {
    id: "description.accurate",
    scope: "prose",
    severity: null,
    summary: "The meta description summarizes this page truthfully",
    message:
      "Does the description accurately summarize this page's content, and is it written for this page rather than copied across the site?",
    why: "The description is the one sentence you get to write in a search result. A boilerplate line repeated site-wide, or one that promises something the page does not deliver, gets replaced by improvised page text — or gets the click and loses the visitor.",
    rigor: "guideline",
    sources: ["google-snippet", "moz-meta-description"],
  },
  {
    id: "lang.matches-content",
    scope: "prose",
    severity: null,
    summary: "The declared `lang` is the language the page is actually written in",
    message:
      "Is the text of this page actually written in the language its `lang` attribute declares?",
    why: "A wrong `lang` is worse than a missing one: screen readers switch to the wrong pronunciation rules, browsers offer to translate a page that is already in the reader's language, and search engines file the page under the wrong audience. Nothing in the markup contradicts it, so no mechanical check can catch it.",
    rigor: "spec-required",
    sources: ["whatwg-html-lang", "w3c-i18n-language-tags"],
  },
  {
    id: "og.image.representative",
    scope: "prose",
    severity: null,
    summary: "The `og:image` represents this page and survives the unfurl crop",
    message:
      "Does the og:image represent what this page is about, rather than being a site-wide default, and does its subject survive being cropped to the 1.91:1 aspect ratio consumers render?",
    why: "The preview image is the whole payload of a shared link. A generic site-wide banner, or artwork whose subject sits outside the ~1.91:1 crop, is present enough to pass every mechanical check and still communicate nothing.",
    rigor: "guideline",
    sources: ["ogp", "meta-og-sharing"],
  },
];

export const ALL_RULES: readonly RuleDoc[] = [...PAGE_RULES, ...SITE_RULES, ...PROSE_RULES];

/**
 * Translation gaps and hreflang reciprocity are computed cross-page in
 * `core/i18n.ts` and reported under `missingTranslations`, not through the rule
 * registry — which is why they carry no severity of their own. Phase 3.5 of the
 * product plan absorbs them into the catalogue; until then they are documented
 * separately rather than described as rules they are not.
 */
export const RECIPROCITY_CODES: ReadonlyArray<{ code: string; message: string; why: string }> = [
  {
    code: "missing-back-link",
    message:
      "`/fr/pricing` declares an alternate to `/es/precios` but the peer does not link back.",
    why: "hreflang is only honoured when it is reciprocal. A one-way declaration is discarded, so the cluster silently degrades to no cluster at all.",
  },
  {
    code: "x-default-missing",
    message: 'Page advertises 4 locales but no `hreflang="x-default"`.',
    why: "`x-default` is what a visitor whose language matches none of yours is sent to. Without it the engine guesses, and it guesses per query.",
  },
  {
    code: "locale.invalid",
    message: '`hreflang="pt_BR"` is not a valid BCP 47 tag.',
    why: "An invalid tag is not a fallback, it is ignored: underscore instead of hyphen is enough to void the entire alternate.",
  },
  {
    code: "self-mismatch",
    message: "A page's self-referential alternate does not point at its own canonical URL.",
    why: "Every page in a cluster must list itself. A self-reference pointing elsewhere makes the page a member of somebody else's cluster.",
  },
];

export const SEVERITY_ORDER: Record<RuleSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};
