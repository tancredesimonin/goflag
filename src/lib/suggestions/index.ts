/**
 * Suggestion engine — Phase 6 entry point.
 *
 * Given a `Page`, returns the set of JSON-LD blocks Headlint thinks
 * should be added. The engine is purely additive: it never recommends
 * removing or replacing existing structured data. Each suggestion
 * carries a copy-pasteable snippet (`example.snippet`) that the UI
 * surfaces under "Suggestions".
 *
 * Decision flow:
 *
 *   1. Page-type heuristics (`./page-type.ts`) classify the page
 *      into a small set of buckets (homepage, article, FAQ, profile,
 *      app surface, contact). The classifier is conservative — when
 *      in doubt, don't recommend.
 *
 *   2. For each bucket the page matches, the appropriate templates
 *      are invoked. A template returns `undefined` when it can't
 *      build a meaningful snippet (e.g. the path has no segments to
 *      crumb).
 *
 *   3. We deduplicate against the JSON-LD already present on the
 *      page: if the page already declares `Article`, we don't
 *      recommend adding another `Article` block.
 */

import type { Page } from "@/lib/core/types";
import type { Suggestion, SuggestionId } from "@/lib/structured/types";
import { detectPageType } from "./page-type";
import { organisationSuggestion } from "./templates/organization";
import { websiteSuggestion } from "./templates/website";
import { breadcrumbSuggestion } from "./templates/breadcrumb";
import { articleSuggestion } from "./templates/article";
import { personSuggestion } from "./templates/person";
import { faqSuggestion } from "./templates/faq";
import { softwareApplicationSuggestion } from "./templates/software";

export function suggest(page: Page): Suggestion[] {
  const hints = detectPageType(page);
  const existing = collectExistingTypes(page);

  const candidates: Array<Suggestion | undefined> = [];

  if (hints.isHomepage) {
    candidates.push(organisationSuggestion(page));
    candidates.push(websiteSuggestion(page));
  }
  if (hints.isArticle) {
    candidates.push(articleSuggestion(page));
    candidates.push(breadcrumbSuggestion(page));
  }
  if (hints.isPerson) {
    candidates.push(personSuggestion(page));
  }
  if (hints.isFaq) {
    candidates.push(faqSuggestion(page));
  }
  if (hints.isApp) {
    candidates.push(softwareApplicationSuggestion(page));
  }

  const seen = new Set<SuggestionId>();
  return candidates
    .filter((s): s is Suggestion => s !== undefined)
    .filter((s) => !existing.has(s.id))
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
}

function collectExistingTypes(page: Page): Set<string> {
  const out = new Set<string>();
  for (const block of page.jsonLd) {
    for (const type of block.types) out.add(type);
    // Aliases: declaring a BlogPosting satisfies our Article suggestion.
    if (block.types.includes("BlogPosting") || block.types.includes("NewsArticle")) {
      out.add("Article");
    }
  }
  return out;
}

export type { Suggestion } from "@/lib/structured/types";
