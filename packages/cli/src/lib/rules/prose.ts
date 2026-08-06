/**
 * Prose rule registry — the policies goflag can state but must not judge
 * (plan §8).
 *
 * Every rule here is one goflag could *fake*: it could count words, match a
 * boilerplate string, run a readability score, and emit a confident verdict
 * about whether a title "describes the page". It deliberately does not. A
 * fabricated judgment on a question of meaning is worse than no judgment —
 * it is unfalsifiable noise a developer learns to ignore, and an agent
 * cannot tell it apart from a real finding.
 *
 * So a prose rule ships three things and stops: the question, the sources
 * that make it a real requirement rather than an opinion, and the observed
 * facts the answer turns on. `./advisory.ts` resolves the facts; an agent
 * supplies the verdict.
 *
 * The bar for adding one: it must be *checkable by a reader looking at the
 * evidence bundle alone*. "Is the title compelling?" fails that bar — no
 * evidence settles it. "Does the title describe the content this page
 * actually serves?" passes: title, description and URL are on the table.
 */

import type { ProseRule } from "./types";

const titleDescriptive: ProseRule = {
  id: "title.descriptive",
  kind: "prose",
  category: "document",
  title: "The `<title>` describes this specific page",
  why:
    "A title that repeats the site name, or describes the section rather " +
    "than the page, gives a searcher no way to tell two results apart — and " +
    "gives Google a reason to rewrite it into something you did not choose.",
  rigor: "guideline",
  sources: ["google-title-link", "bing-webmaster-guidelines"],
  reads: ["document.title", "meta.description", "openGraph.title", "http.finalUrl"],
  relates: ["title.missing", "title.length"],
  appliesTo: (ex) => Boolean(ex.document.title?.value?.trim()),
  prose:
    "Does the title describe what is on THIS page specifically — not the " +
    "site, not the section — and would it be distinguishable from the other " +
    "pages of this site in a list of search results?",
};

const descriptionAccurate: ProseRule = {
  id: "description.accurate",
  kind: "prose",
  category: "meta",
  title: "The meta description summarizes this page truthfully",
  why:
    "The description is the one sentence you get to write in a search " +
    "result. A boilerplate line repeated site-wide, or one that promises " +
    "something the page does not deliver, gets replaced by improvised page " +
    "text — or gets the click and loses the visitor.",
  rigor: "guideline",
  sources: ["google-snippet", "moz-meta-description"],
  reads: ["meta.description", "document.title", "http.finalUrl"],
  relates: ["description.missing", "description.length"],
  appliesTo: (ex) => Boolean(ex.meta.description?.value?.trim()),
  prose:
    "Does the description accurately summarize this page's content, and is " +
    "it written for this page rather than copied across the site?",
};

const langMatchesContent: ProseRule = {
  id: "lang.matches-content",
  kind: "prose",
  category: "i18n",
  title: "The declared `lang` is the language the page is actually written in",
  why:
    "A wrong `lang` is worse than a missing one: screen readers switch to " +
    "the wrong pronunciation rules, browsers offer to translate a page that " +
    "is already in the reader's language, and search engines file the page " +
    "under the wrong audience. Nothing in the markup contradicts it, so no " +
    "mechanical check can catch it.",
  rigor: "spec-required",
  sources: ["whatwg-html-lang", "w3c-i18n-language-tags"],
  reads: ["document.lang", "document.title", "meta.description", "openGraph.locale"],
  appliesTo: (ex) => Boolean(ex.document.lang?.value?.trim()),
  prose:
    "Is the text of this page actually written in the language its `lang` " + "attribute declares?",
};

const ogImageRepresentative: ProseRule = {
  id: "og.image.representative",
  kind: "prose",
  category: "opengraph",
  title: "The `og:image` represents this page and survives the unfurl crop",
  why:
    "The preview image is the whole payload of a shared link. A generic " +
    "site-wide banner, or artwork whose subject sits outside the ~1.91:1 " +
    "crop, is present enough to pass every mechanical check and still " +
    "communicate nothing.",
  rigor: "guideline",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.images", "openGraph.title", "document.title", "http.finalUrl"],
  relates: ["og.image.missing"],
  appliesTo: (ex) => ex.openGraph.images.length > 0,
  prose:
    "Does the og:image represent what this page is about, rather than being " +
    "a site-wide default, and does its subject survive being cropped to the " +
    "1.91:1 aspect ratio consumers render?",
};

/** The full set of prose rules, alphabetised by id (stable output order). */
export const PROSE_RULES: ReadonlyArray<ProseRule> = [
  descriptionAccurate,
  langMatchesContent,
  ogImageRepresentative,
  titleDescriptive,
];

const PROSE_RULE_BY_ID: Map<string, ProseRule> = new Map(PROSE_RULES.map((r) => [r.id, r]));

export function getProseRule(id: string): ProseRule | undefined {
  return PROSE_RULE_BY_ID.get(id);
}

export type { AdvisoryFinding, ProseRule } from "./types";
