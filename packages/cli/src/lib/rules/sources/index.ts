/**
 * The source catalog — every authoritative reference a goflag rule may cite.
 *
 * Curated by hand (not scraped: automated spec-prose extraction is too
 * error-prone to trust) and seeded from `docs/rules-catalog-plan.md` §4.
 * Ordered as the plan orders them: web standards, then vendor / de-facto
 * specs, then practical references and folklore.
 *
 * Two validators keep this honest:
 * - `./validate.ts` (structural, offline) runs as a unit test on every
 *   pipeline: unique ids, rigor present, URLs parse, dates are real,
 *   quotes stay fair-use short.
 * - `scripts/validate-sources.ts` (network) confirms every URL still
 *   resolves; wired to scheduled pipelines and to merge requests touching
 *   this folder, because vendor URLs drift.
 *
 * When a URL is re-verified (or replaced after drifting), bump that entry's
 * `retrievedAt`.
 */

import type { Source } from "./types";

export type { Source, SourceRigor } from "./types";

// ---------------------------------------------------------------------------
// §4.1 Normative — web standards
// ---------------------------------------------------------------------------

const NORMATIVE: readonly Source[] = [
  {
    id: "whatwg-html-title",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — the title element",
    url: "https://html.spec.whatwg.org/multipage/semantics.html",
    anchor: "the-title-element",
    retrievedAt: "2026-08-06",
    note: "Documents must have exactly one title element in the head, and its text should identify the document even out of context (e.g. in history or bookmarks).",
  },
  {
    id: "whatwg-html-meta",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — the meta element",
    url: "https://html.spec.whatwg.org/multipage/semantics.html",
    anchor: "the-meta-element",
    retrievedAt: "2026-08-06",
    note: "Defines the syntax of meta: exactly one of name, http-equiv, charset or itemprop must be present, and name/http-equiv variants require a content attribute.",
  },
  {
    id: "whatwg-html-standard-metadata-names",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — standard metadata names",
    url: "https://html.spec.whatwg.org/multipage/semantics.html",
    anchor: "standard-metadata-names",
    retrievedAt: "2026-08-06",
    note: "The registry of standard meta names — description, viewport, theme-color, robots, generator, … — and the conformance requirements for each (e.g. at most one meta description per document).",
  },
  {
    id: "whatwg-html-link",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — the link element",
    url: "https://html.spec.whatwg.org/multipage/semantics.html",
    anchor: "the-link-element",
    retrievedAt: "2026-08-06",
    note: "Defines the syntax of link: a rel attribute (or itemprop) is required, and href must be a valid non-empty URL potentially surrounded by spaces.",
  },
  {
    id: "whatwg-html-link-types",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — link types",
    url: "https://html.spec.whatwg.org/multipage/links.html",
    anchor: "linkTypes",
    retrievedAt: "2026-08-06",
    note: "The registry of rel keywords — canonical, alternate, icon, manifest, … — including which are allowed on link vs a/area, and the semantics of each (e.g. alternate + hreflang designates a translation).",
  },
  {
    id: "whatwg-html-lang",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — the lang and xml:lang attributes",
    url: "https://html.spec.whatwg.org/multipage/dom.html",
    anchor: "the-lang-and-xml:lang-attributes",
    retrievedAt: "2026-08-06",
    note: "lang gives the language of the element's contents and must be a valid BCP 47 language tag or the empty string; authors are encouraged to set it on the root html element.",
  },
  {
    id: "whatwg-html-dir",
    publisher: "WHATWG",
    rigor: "normative",
    title: "HTML Living Standard — the dir attribute",
    url: "https://html.spec.whatwg.org/multipage/dom.html",
    anchor: "the-dir-attribute",
    retrievedAt: "2026-08-06",
    note: "dir declares text directionality: ltr, rtl, or auto. Governs whether an rtl-language page declares its direction explicitly.",
  },
  {
    id: "whatwg-url",
    publisher: "WHATWG",
    rigor: "normative",
    title: "URL Standard",
    url: "https://url.spec.whatwg.org/",
    retrievedAt: "2026-08-06",
    note: "How browsers actually parse URLs — the parsing/validity contract goflag applies when it checks that a canonical or alternate href is a valid, absolute URL.",
  },
  {
    id: "whatwg-encoding",
    publisher: "WHATWG",
    rigor: "normative",
    title: "Encoding Standard",
    url: "https://encoding.spec.whatwg.org/",
    retrievedAt: "2026-08-06",
    note: "Defines character encodings for the web; UTF-8 is the mandatory encoding for new content, which is what a meta charset declaration should say.",
  },
  {
    id: "ietf-rfc3986",
    publisher: "IETF",
    rigor: "normative",
    title: "RFC 3986 — URI Generic Syntax",
    url: "https://www.rfc-editor.org/rfc/rfc3986",
    retrievedAt: "2026-08-06",
    note: "The generic URI grammar: scheme, authority, path, query, fragment. The formal definition of what an absolute URL is.",
  },
  {
    id: "ietf-rfc3987",
    publisher: "IETF",
    rigor: "normative",
    title: "RFC 3987 — Internationalized Resource Identifiers (IRIs)",
    url: "https://www.rfc-editor.org/rfc/rfc3987",
    retrievedAt: "2026-08-06",
    note: "Extends URIs to non-ASCII characters and defines the IRI-to-URI mapping — relevant when localized sites use non-ASCII paths.",
  },
  {
    id: "ietf-bcp47",
    publisher: "IETF",
    rigor: "normative",
    title: "RFC 5646 / BCP 47 — Tags for Identifying Languages",
    url: "https://www.rfc-editor.org/rfc/rfc5646",
    retrievedAt: "2026-08-06",
    note: "The grammar of language tags used by lang and hreflang (language[-script][-region]…). Tags are case-insensitive; the familiar en-US casing is only a convention.",
  },
  {
    id: "ietf-rfc6596",
    publisher: "IETF",
    rigor: "normative",
    title: "RFC 6596 — The Canonical Link Relation",
    url: "https://www.rfc-editor.org/rfc/rfc6596",
    retrievedAt: "2026-08-06",
    note: 'Defines rel="canonical": the preferred IRI for duplicative content. The target must not be a 404 and should not vary per duplicate (no self-referencing loops through redirects).',
  },
  {
    id: "ietf-rfc9110",
    publisher: "IETF",
    rigor: "normative",
    title: "RFC 9110 — HTTP Semantics",
    url: "https://www.rfc-editor.org/rfc/rfc9110",
    retrievedAt: "2026-10-05",
    quote:
      "The 404 (Not Found) status code indicates that the origin server did not find a current representation for the target resource or is not willing to disclose that one exists.",
    note: "What a status code claims. 404 (§15.5.5) and 410 (§15.5.11, the permanent form) say there is nothing at the URL; a 2xx says there is; a 5xx (§15.6) says the server erred. Content-Type (§8.3) tells the recipient how to read what it was sent.",
  },
  {
    id: "ietf-rfc9309",
    publisher: "IETF",
    rigor: "normative",
    title: "RFC 9309 — Robots Exclusion Protocol",
    url: "https://www.rfc-editor.org/rfc/rfc9309",
    retrievedAt: "2026-08-06",
    note: "The robots.txt file format and matching rules: group selection by user-agent, longest-match precedence, allow wins ties, and how errors/unavailability must be treated.",
  },
  {
    id: "sitemaps-protocol",
    publisher: "sitemaps.org",
    rigor: "normative",
    title: "Sitemaps XML protocol",
    url: "https://www.sitemaps.org/protocol.html",
    retrievedAt: "2026-08-06",
    note: "The sitemap.xml schema: urlset/url/loc structure, optional lastmod/changefreq/priority, the 50,000-URL / 50 MB limits, and sitemap index files.",
  },
  {
    id: "w3c-appmanifest",
    publisher: "W3C",
    rigor: "normative",
    title: "Web Application Manifest",
    url: "https://www.w3.org/TR/appmanifest/",
    retrievedAt: "2026-08-06",
    note: 'The manifest.json format linked via link rel="manifest": members like name, icons, start_url, display, and how user agents process them.',
  },
  {
    id: "w3c-wcag22",
    publisher: "W3C",
    rigor: "normative",
    title: "WCAG 2.2",
    url: "https://www.w3.org/TR/WCAG22/",
    retrievedAt: "2026-08-06",
    note: "Accessibility success criteria — language of page (3.1.1), non-text content / alt (1.1.1), contrast, … Reserved for the future a11y vertical.",
  },
  {
    id: "w3c-wai-aria12",
    publisher: "W3C",
    rigor: "normative",
    title: "WAI-ARIA 1.2",
    url: "https://www.w3.org/TR/wai-aria-1.2/",
    retrievedAt: "2026-08-06",
    note: "ARIA roles, states and properties. Reserved for the future a11y vertical.",
  },
  {
    id: "w3c-i18n-language-tags",
    publisher: "W3C",
    rigor: "guideline",
    title: "W3C i18n — Language tags in HTML and XML",
    url: "https://www.w3.org/International/articles/language-tags/",
    retrievedAt: "2026-08-06",
    note: "W3C i18n guidance on applying BCP 47 in practice: keep tags as short as possible, subtag order and casing conventions, when to include script or region.",
  },
];

// ---------------------------------------------------------------------------
// §4.2 Vendor / de-facto specs
// ---------------------------------------------------------------------------

const VENDOR: readonly Source[] = [
  {
    id: "ogp",
    publisher: "ogp.me",
    rigor: "vendor-spec",
    title: "The Open Graph protocol",
    url: "https://ogp.me/",
    retrievedAt: "2026-08-06",
    note: "The og:* vocabulary. og:title, og:type, og:image and og:url are required for every page that wants to be a rich object in the social graph; og:description and others are optional.",
  },
  {
    id: "x-cards",
    publisher: "X (Twitter)",
    rigor: "vendor-spec",
    title: "X Cards — about cards markup",
    url: "https://developer.x.com/en/docs/twitter-for-websites/cards/overview/abouts-cards",
    retrievedAt: "2026-08-06",
    note: "The twitter:* card vocabulary (twitter:card, twitter:title, …) and the fallback behavior: X's crawler falls back to og:* tags when twitter:* equivalents are absent. X has since removed most of this documentation (the URL now redirects to docs.x.com/overview) but the crawler behavior and tag names are unchanged — the tags stayed twitter:*, not x:*.",
  },
  {
    id: "google-canonicalization",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "Consolidate duplicate URLs (canonicalization)",
    url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
    retrievedAt: "2026-08-06",
    note: 'How Google treats rel="canonical": a strong hint (not a directive), absolute URLs recommended, don\'t point to redirecting or 404 targets, one canonical per page.',
  },
  {
    id: "google-robots-meta",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "Robots meta tag and X-Robots-Tag",
    url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
    retrievedAt: "2026-08-06",
    note: "The robots meta / X-Robots-Tag directives (noindex, nofollow, …), how meta and header directives combine, and that the most restrictive directive wins on conflict.",
  },
  {
    id: "google-robots-intro",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "Introduction to robots.txt",
    url: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
    retrievedAt: "2026-08-06",
    note: "Google's robots.txt behavior on top of RFC 9309 — notably that robots.txt controls crawling, not indexing: a blocked URL can still be indexed from links, so noindex needs the page to be crawlable.",
  },
  {
    id: "google-hreflang",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "Localized versions of your pages (hreflang)",
    url: "https://developers.google.com/search/docs/specialty/international/localized-versions",
    retrievedAt: "2026-08-06",
    note: "hreflang via link annotations, headers or sitemaps: every language version must list itself and all others (reciprocity), use absolute URLs, and x-default marks the unmatched-language fallback.",
  },
  {
    id: "google-title-link",
    publisher: "Google",
    rigor: "guideline",
    title: "Influence your title links in search results",
    url: "https://developers.google.com/search/docs/appearance/title-link",
    retrievedAt: "2026-08-06",
    note: "Write descriptive, concise, non-boilerplate titles unique to each page. Google may rewrite titles it considers poor; length itself is not a ranking factor.",
  },
  {
    id: "google-snippet",
    publisher: "Google",
    rigor: "guideline",
    title: "Control your snippets in search results",
    url: "https://developers.google.com/search/docs/appearance/snippet",
    retrievedAt: "2026-08-06",
    note: "Meta descriptions feed the search snippet but Google may substitute on-page text; write a unique, accurate summary per page rather than keyword stuffing.",
  },
  {
    id: "google-structured-data",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "Introduction to structured data markup",
    url: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
    retrievedAt: "2026-08-06",
    note: "How Google consumes structured data (JSON-LD recommended) and what rich-result eligibility requires; the vocabulary itself is schema.org's.",
  },
  {
    id: "google-sitemaps",
    publisher: "Google",
    rigor: "guideline",
    title: "Build and submit a sitemap",
    url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
    retrievedAt: "2026-08-06",
    note: "Google's sitemap practice on top of the sitemaps.org protocol: when a sitemap helps, supported formats, and submission via robots.txt or Search Console.",
  },
  {
    id: "schema-org",
    publisher: "schema.org",
    rigor: "vendor-spec",
    title: "schema.org vocabulary",
    url: "https://schema.org/",
    retrievedAt: "2026-08-06",
    note: "The shared vocabulary (types and properties) that structured data — JSON-LD in particular — is written in.",
  },
  {
    id: "apple-web-apps",
    publisher: "Apple",
    rigor: "vendor-spec",
    title: "Configuring web applications (Safari Web Content Guide)",
    url: "https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html",
    retrievedAt: "2026-08-06",
    note: "apple-touch-icon and the apple-mobile-web-app-* meta tags: how iOS picks home-screen icons and startup images. Archived but still the reference Apple points to.",
  },
  {
    id: "meta-og-sharing",
    publisher: "Meta",
    rigor: "vendor-spec",
    title: "Sharing — webmasters (Open Graph usage)",
    url: "https://developers.facebook.com/docs/sharing/webmasters/",
    retrievedAt: "2026-08-06",
    note: "How Meta's crawler builds link previews from og:* tags — including image size expectations (1200×630 recommended, 200×200 minimum) beyond what ogp.me specifies.",
  },
  {
    id: "google-soft-404",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "Troubleshoot Google Search crawling errors — soft 404 errors",
    url: "https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors",
    anchor: "soft-404-errors",
    retrievedAt: "2026-10-05",
    quote:
      "If you removed the page and there's no replacement page on your site with similar content, return a 404 (not found) or 410 (gone) response (status) code for the page.",
    note: "A soft 404 is a URL with no page behind it that answers 200 anyway. Google excludes such pages from Search and asks for a 404 or 410 instead. Search Console's Page indexing report (support.google.com/webmasters/answer/7440203) lists the same case and makes the same recommendation.",
  },
  {
    id: "google-http-status",
    publisher: "Google",
    rigor: "vendor-spec",
    title: "How HTTP status codes, and network and DNS errors affect Google Search",
    url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
    anchor: "5xx-server-errors",
    retrievedAt: "2026-10-05",
    quote: "Google decreases the crawl rate for the site.",
    note: "How Google's crawlers read each status class: a 4xx other than 429 means the content does not exist; a 5xx slows crawling of the whole site in proportion to the URLs that return one, and URLs that keep returning one leave the index.",
  },
  {
    id: "anthropic-crawlers",
    publisher: "Anthropic",
    rigor: "vendor-spec",
    title: "Does Anthropic crawl data from the web, and how can site owners block the crawler?",
    url: "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
    retrievedAt: "2026-10-05",
    quote:
      "Anthropic’s Bots respect “do not crawl” signals by honoring industry standard directives in robots.txt.",
    note: "Names Anthropic's agents, Claude-User among them — the one that fetches a page when a person asks Claude about it — and states that robots.txt governs all of them. An agent reading an llms.txt on a user's behalf is therefore bound by the same file that may forbid what the llms.txt lists.",
  },
  {
    id: "bing-webmaster-guidelines",
    publisher: "Microsoft",
    rigor: "guideline",
    title: "Bing Webmaster Guidelines",
    url: "https://www.bing.com/webmasters/help/webmasters-guidelines-30fba23a",
    retrievedAt: "2026-08-06",
    note: "Bing's crawlability and content guidance — a cross-check that the catalog is not Google-only.",
  },
];

// ---------------------------------------------------------------------------
// §4.3 Practical references, guidelines & cross-check tools
// ---------------------------------------------------------------------------

const PRACTICAL: readonly Source[] = [
  {
    id: "mdn-meta-name",
    publisher: "MDN / Mozilla",
    rigor: "guideline",
    title: "MDN — <meta> name attribute values",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name",
    retrievedAt: "2026-08-06",
    note: "Practical reference for standard and de-facto meta names, browser support included.",
  },
  {
    id: "mdn-viewport",
    publisher: "MDN / Mozilla",
    rigor: "guideline",
    title: "MDN — Viewport meta tag",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag",
    retrievedAt: "2026-08-06",
    note: "width=device-width, initial-scale=1 and friends: what the viewport meta controls and the accessibility pitfalls (never disable user scaling).",
  },
  {
    id: "mdn-link-rel",
    publisher: "MDN / Mozilla",
    rigor: "guideline",
    title: "MDN — rel attribute values",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel",
    retrievedAt: "2026-08-06",
    note: "Practical reference for rel values across link, a and form, with support notes.",
  },
  {
    id: "lighthouse-seo",
    publisher: "Google",
    rigor: "guideline",
    title: "Lighthouse — SEO audits",
    url: "https://developer.chrome.com/docs/lighthouse/seo/",
    retrievedAt: "2026-08-06",
    note: "The audit definitions Lighthouse ships (document has a title, has a meta description, valid hreflang, valid canonical, …) — the closest thing to an industry-standard checklist to mirror.",
  },
  {
    id: "lighthouse-llms-txt",
    publisher: "Google",
    rigor: "guideline",
    title: "Lighthouse — llms.txt (agentic browsing audit)",
    url: "https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt",
    retrievedAt: "2026-10-05",
    quote:
      "If the file is not provided by the server (resulting in a 404), the audit is marked as Not Applicable (N/A), as providing the file is optional at the moment.",
    note: "Lighthouse's llms.txt audit fails a page when fetching /llms.txt returns a server error, and treats a 404 as not applicable. The cross-check for goflag's own reading: absent is fine, broken is not.",
  },
  {
    id: "llmstxt",
    publisher: "llmstxt.org",
    rigor: "guideline",
    title: "The /llms.txt file (a proposal)",
    url: "https://llmstxt.org/",
    retrievedAt: "2026-10-05",
    quote: "An H1 with the name of the project or site. This is the only required section",
    note: "A proposal by Jeremy Howard, first published 2024-09-03 and revised since — not a standard, and no standards body has taken it up. It describes a markdown file at /llms.txt — an H1, then an optional summary, details and H2 file lists of [name](url) links — for agents to read on a user's behalf. Rules about it can claim no more than guideline.",
  },
  {
    id: "axe-core-rules",
    publisher: "Deque",
    rigor: "guideline",
    title: "axe-core — rule descriptions",
    url: "https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md",
    retrievedAt: "2026-08-06",
    note: "The a11y rule catalog to cross-check against when the a11y vertical lands (html-has-lang, valid-lang, image-alt, …).",
  },
  {
    id: "w3c-nu-checker",
    publisher: "W3C",
    rigor: "guideline",
    title: "Nu HTML Checker",
    url: "https://validator.w3.org/nu/",
    retrievedAt: "2026-08-06",
    note: "The reference HTML validator — the cross-check for goflag's document-level syntax rules.",
  },
  {
    id: "moz-title-tag",
    publisher: "Moz",
    rigor: "heuristic",
    title: "Title tag best practices",
    url: "https://moz.com/learn/seo/title-tag",
    retrievedAt: "2026-08-06",
    note: "The ~50–60 character title window is display folklore, not spec: it approximates SERP truncation width. Ships as heuristic so agents weight it accordingly.",
  },
  {
    id: "moz-meta-description",
    publisher: "Moz",
    rigor: "heuristic",
    title: "Meta description best practices",
    url: "https://moz.com/learn/seo/meta-description",
    retrievedAt: "2026-08-06",
    note: "The ~50–160 character description window is display folklore, not spec: it approximates snippet truncation. Ships as heuristic so agents weight it accordingly.",
  },
];

/**
 * Every source a rule may cite, in the plan's order: normative standards,
 * vendor / de-facto specs, then practical references.
 */
export const SOURCES: readonly Source[] = [...NORMATIVE, ...VENDOR, ...PRACTICAL];

/** Look up a source by id. */
export function getSource(id: string): Source | undefined {
  return SOURCES.find((source) => source.id === id);
}

/** A source's full URL, fragment included — what docs and reports should link. */
export function sourceUrl(source: Source): string {
  return source.anchor ? `${source.url}#${source.anchor}` : source.url;
}
