/**
 * The frozen corpus the published `preview.html` example is drawn from.
 *
 * ## Why this file is not shaped like `transcripts.ts`
 *
 * Over there, a `GoflagReport` is written by hand and the renderers turn it
 * into text. That does not transfer here. `renderPreview` draws from
 * `report.extractions`, and an `Extraction` is not a thing a person writes: a
 * realistic `<head>` projects to **302 lines of JSON**, every `Fact` carrying a
 * `TagOrigin` from a seven-variant union. Four pages would be roughly a
 * thousand lines of literal, and a typo in any of them would be a claim the
 * site publishes about a real origin.
 *
 * So the hand-written part is moved one layer earlier, to the only artefact a
 * person actually authors: **the `<head>` itself**. `pageFromHtml` and
 * `extractionFromPage` are pure — cheerio and nothing else, no server, no
 * browser — and `extractionFromPage` is the production adapter `build.ts:679`
 * calls. The findings pinned on the cards are then *derived* by the real rule
 * registry rather than asserted, which is a stronger guarantee than the frozen
 * report gets: nothing here can claim a finding the engine would not produce.
 *
 * ## What it audits, and why that is a decision
 *
 * `openfinanceguide.com`, one of the sites this project gates, mirrored
 * faithfully from what it actually served on 2026-08-20. Not `example.com`:
 * RFC 2606 reserves it and nothing answers there, so every card would draw its
 * empty state and the page that promises a look would still offer none. Not an
 * invented `<head>` on a real domain either — every line below becomes a
 * published statement about a live site, so every line is a true one.
 *
 * The consequence to accept rather than discover later: this file is dated.
 * The footer of the rendered page prints `finishedAt` verbatim, so the example
 * says "audited 2026-08-20" for as long as it stands, and it will drift from
 * what the site serves today. That is what a frozen example is.
 */

import { sortIssues } from "../src/lib/core/lint";
import { evaluateRules, findingsToIssues } from "../src/lib/rules/evaluate";
import { extractionFromPage } from "../src/lib/rules/extraction/from-page";
import type { Extraction } from "../src/lib/rules/extraction/types";
import { DEFAULT_PROFILE, rulesForProfile } from "../src/lib/rules/profiles";
import { pageFromHtml } from "../src/lib/rules/test-utils";
import { fingerprint, routeKey } from "../src/report/fingerprint";
import { renderPreview } from "../src/report/render-preview";
import type { GoflagReport, SeoIssue } from "../src/report/types";

const SITE = "https://openfinanceguide.com";

/** Frozen, and printed verbatim in the rendered page's footer. */
const FINISHED_AT = "2026-08-20T09:00:00.000Z";

/**
 * Two routes in two locales. Two is the floor for both panels that make this
 * preview worth looking at: the translation matrix needs two extractions
 * sharing a locale-stripped route (`render-preview.ts:649`), and the route
 * tree needs more than one page.
 *
 * The site serves four locales. The corpus carries the two whose `<head>` is
 * reproduced here; the `hreflang` block below still declares all four, exactly
 * as the pages do, so the alternates the preview reads are the real ones.
 */
const PAGES: ReadonlyArray<{ url: string; html: string }> = [
  {
    url: `${SITE}/en`,
    html: head({
      title: "Open Finance Guide — Open banking & PSD2 reference",
      description:
        "An independent, open reference for open banking: a navigable STET PSD2 specification, a clear glossary and references for technical teams.",
      canonical: `${SITE}/en`,
      route: "",
      locale: "en_US",
      ogTitle: "Open Finance Guide",
      ogDescription:
        "Open banking specifications, glossary and references — independent and neutral.",
      ogImage: `${SITE}/og?title=Open+Finance+Guide&description=Open+banking+%26+PSD2+reference`,
      ogImageAlt: "Open Finance Guide — Open banking & PSD2 reference",
    }),
  },
  {
    url: `${SITE}/fr`,
    html: head({
      title: "Open Finance Guide — Référence open banking & DSP2",
      description:
        "Référence indépendante et ouverte sur l’open banking : spécification STET PSD2 explorable, glossaire clair et références pour les équipes techniques.",
      canonical: `${SITE}/fr`,
      route: "",
      locale: "fr_FR",
      ogTitle: "Open Finance Guide",
      ogDescription:
        "Spécifications, glossaire et références open banking — indépendants et neutres.",
      ogImage: `${SITE}/og?title=Open+Finance+Guide&description=R%C3%A9f%C3%A9rence+open+banking+%26+DSP2`,
      ogImageAlt: "Open Finance Guide — Référence open banking & DSP2",
    }),
  },
  {
    url: `${SITE}/en/glossary`,
    html: head({
      title: "Open Banking & PSD2 glossary — Open Finance Guide",
      description: "Definitions of PSD2, STET, eIDAS and Open Banking acronyms and concepts.",
      canonical: `${SITE}/en/glossary`,
      route: "/glossary",
      locale: "en_US",
      ogTitle: "Open Banking & PSD2 glossary — Open Finance Guide",
      ogDescription: "Definitions of PSD2, STET, eIDAS and Open Banking acronyms and concepts.",
      ogImage: `${SITE}/og?title=Glossary&description=Definitions+of+PSD2%2C+STET%2C+eIDAS+and+Open+Banking+acronyms+and+concepts.`,
      ogImageAlt: "Open Banking & PSD2 glossary — Open Finance Guide",
    }),
  },
  {
    url: `${SITE}/fr/glossary`,
    html: head({
      title: "Glossaire Open Banking & DSP2 — Open Finance Guide",
      description: "Définitions des acronymes et concepts PSD2, STET, eIDAS et Open Banking.",
      canonical: `${SITE}/fr/glossary`,
      route: "/glossary",
      locale: "fr_FR",
      ogTitle: "Glossaire Open Banking & DSP2 — Open Finance Guide",
      ogDescription: "Définitions des acronymes et concepts PSD2, STET, eIDAS et Open Banking.",
      ogImage: `${SITE}/og?title=Glossaire&description=D%C3%A9finitions+des+acronymes+et+concepts+PSD2%2C+STET%2C+eIDAS+et+Open+Banking.`,
      ogImageAlt: "Glossaire Open Banking & DSP2 — Open Finance Guide",
    }),
  },
];

/**
 * One page's `<head>`, in the shape the site serves it.
 *
 * Written as a template rather than four verbatim blocks because the four
 * differ only in the fields above: repeating the `hreflang` block four times
 * is four places for it to be typed differently, and the whole point of the
 * corpus is that it says what the site says.
 *
 * `hrefLang` is spelled the way the site emits it — React's camelCase reaches
 * the served markup. HTML attribute names are case-insensitive and cheerio
 * lowercases them, so this parses identically; reproducing it keeps the
 * corpus a mirror rather than a tidied-up version.
 */
function head(page: {
  title: string;
  description: string;
  canonical: string;
  /** Path after the locale segment, `""` for the locale root. */
  route: string;
  locale: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageAlt: string;
}): string {
  const alt = (tag: string, path: string) =>
    `<link rel="alternate" hrefLang="${tag}" href="${SITE}${path}${page.route}"/>`;

  return [
    "<!DOCTYPE html>",
    `<html lang="${page.locale.slice(0, 2)}">`,
    "<head>",
    '<meta charSet="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}"/>`,
    // The five the site declares, reproduced exactly. Leaving them out made
    // the first draft of this corpus derive `icons.missing` on all four pages
    // — a finding that is false of the real origin, which is the failure this
    // whole approach exists to make impossible. Verified against the served
    // markup on 2026-08-20.
    '<link rel="icon" href="/favicon.ico" sizes="48x48"/>',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>',
    '<link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png"/>',
    '<link rel="icon" href="/icon-512.png" sizes="512x512" type="image/png"/>',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180"/>',
    '<link rel="manifest" href="/manifest.webmanifest"/>',
    '<meta name="robots" content="index, follow"/>',
    '<meta name="googlebot" content="index, follow"/>',
    `<link rel="canonical" href="${page.canonical}"/>`,
    alt("fr", "/fr"),
    alt("en", "/en"),
    alt("pt-BR", "/pt-br"),
    alt("es", "/es"),
    alt("x-default", "/fr"),
    `<meta property="og:title" content="${escape(page.ogTitle)}"/>`,
    `<meta property="og:description" content="${escape(page.ogDescription)}"/>`,
    `<meta property="og:url" content="${page.canonical}"/>`,
    '<meta property="og:site_name" content="Open Finance Guide"/>',
    `<meta property="og:locale" content="${page.locale}"/>`,
    `<meta property="og:image" content="${escape(page.ogImage)}"/>`,
    '<meta property="og:image:width" content="1200"/>',
    '<meta property="og:image:height" content="630"/>',
    `<meta property="og:image:alt" content="${escape(page.ogImageAlt)}"/>`,
    '<meta property="og:type" content="website"/>',
    '<meta name="twitter:card" content="summary_large_image"/>',
    "</head>",
    `<body><h1>${escape(page.ogTitle)}</h1></body>`,
    "</html>",
  ].join("\n");
}

/** The five characters an attribute value cannot carry raw. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The report the preview is drawn from, built the way `build.ts:676-724`
 * builds one — same adapter, same rule set, same fingerprint scheme, same
 * occurrence counter.
 *
 * The counts are derived from the arrays rather than declared, so this cannot
 * describe a run that could not happen; `preview-fixture.test.ts` re-derives
 * them a second time, against the rule `build.ts` uses.
 */
export function buildPreviewReport(): GoflagReport {
  const rules = rulesForProfile(DEFAULT_PROFILE);
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  const extractions: Extraction[] = [];
  const seoIssues: SeoIssue[] = [];

  for (const { url, html } of PAGES) {
    const extraction = extractionFromPage(pageFromHtml(html, { url }));
    extractions.push(extraction);

    const evaluation = evaluateRules(extraction, rules);
    const occurrence = new Map<string, number>();
    for (const issue of sortIssues(findingsToIssues(evaluation, rules))) {
      const n = occurrence.get(issue.ruleId) ?? 0;
      occurrence.set(issue.ruleId, n + 1);
      seoIssues.push({
        id: fingerprint("seo", issue.ruleId, routeKey(url), String(n)),
        pageUrl: url,
        ruleId: issue.ruleId,
        severity: issue.severity,
        message: issue.message,
        why: ruleById.get(issue.ruleId)?.title,
        fix: issue.fix?.snippet,
        rigor: issue.rigor,
        sources: issue.sources,
        observed: issue.observed,
        expected: issue.expected,
      });
    }
  }

  const errors = seoIssues.filter((issue) => issue.severity === "error").length;

  return {
    url: `${SITE}/`,
    finishedAt: FINISHED_AT,
    profile: DEFAULT_PROFILE,
    summary: {
      brokenLinks: 0,
      missingTranslations: 0,
      seoIssues: seoIssues.length,
      siteIssues: 0,
      unreachablePages: 0,
      // `build.ts:981`. No links were probed and no page was unreachable, so
      // the verdict turns on rule severity alone.
      verdict: errors > 0 ? "red" : seoIssues.length > 0 ? "yellow" : "green",
    },
    localeAxis: { locales: ["en", "fr"], source: "explicit", multilingual: true },
    pages: PAGES.map(({ url }) => ({
      url,
      status: 200,
      locale: new URL(url).pathname.split("/")[1] ?? null,
    })),
    unreachablePages: [],
    brokenLinks: [],
    missingTranslations: { holes: [], reciprocity: [] },
    seoIssues,
    siteIssues: [],
    extractions,
    diagnostics: {
      pagesCrawled: PAGES.length,
      pagesScanned: PAGES.length,
      pagesFailed: 0,
      truncated: false,
      warnings: [],
    },
  };
}

/** The published example, as one self-contained HTML document. */
export function renderPreviewFixture(): string {
  return renderPreview(buildPreviewReport(), { title: "Open Finance Guide — goflag preview" });
}
