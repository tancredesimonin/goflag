/**
 * Rule registry.
 *
 * The single source of truth for which rules ship with Goflag. The
 * runner (`src/lib/core/lint.ts`), the docs route (`/rules/[id]`), the
 * CLI (`goflag lint`), and the contract test harness all walk this
 * array. Adding a rule means:
 *
 *   1. Drop a new module at `src/lib/rules/<id>.ts` exporting a
 *      `Rule` as its default export. The filename's basename MUST equal
 *      the rule's `id` (the contract test rejects mismatches).
 *   2. Add an `import` line below in alphabetical order, then an entry to
 *      `RULES` (also alphabetical so the docs index is stable).
 *   3. Ship `fixtures/rules/<id>/{pass,fail}.html` (the Phase 5.11 gate
 *      blocks merges that forget either file).
 *
 * We intentionally use static imports rather than dynamic discovery: the
 * rules layer needs to be importable from edge runtimes, the CLI single-
 * file bundle, and a future `@goflag/core` package, none of which can
 * scan the filesystem at runtime.
 */

import type { Rule, RuleCategory } from "./types";

// Core (title, description, canonical, viewport, lang)
import titleMissing from "./title.missing";
import titleLength from "./title.length";
import descriptionMissing from "./description.missing";
import descriptionLength from "./description.length";
import canonicalMissing from "./canonical.missing";
import canonicalAbsolute from "./canonical.absolute";
import viewportMissing from "./viewport.missing";
import langMissing from "./lang.missing";

// Open Graph
import ogImageMissing from "./og.image.missing";
import ogImageAbsolute from "./og.image.absolute";
import ogTitleMissing from "./og.title.missing";
import ogImageDimensions from "./og.image.dimensions";
import ogImageSize from "./og.image.size";
import ogUrlMatches from "./og.url.matches";
import ogTypeValid from "./og.type.valid";
import ogLocaleValid from "./og.locale.valid";
import ogSiteNameMissing from "./og.siteName.missing";

// Twitter
import twitterCardMissing from "./twitter.card.missing";
import twitterImageAlt from "./twitter.image.alt";
import twitterCardMatchesImage from "./twitter.card.matchesImage";

// i18n / structural
import hreflangReciprocal from "./hreflang.reciprocal";
import hreflangXDefault from "./hreflang.x-default";
import faviconSizes from "./favicon.sizes";
import manifestMissing from "./manifest.missing";
import robotsConflict from "./robots.conflict";

/**
 * The full set of rules registered with Goflag, alphabetised by id.
 * `lint()` iterates this list in order; the order is also surfaced in the
 * docs index, so keep it stable. Adding a new rule = appending to this
 * list AND its import above.
 */
export const RULES: ReadonlyArray<Rule> = [
  canonicalAbsolute,
  canonicalMissing,
  descriptionLength,
  descriptionMissing,
  faviconSizes,
  hreflangReciprocal,
  hreflangXDefault,
  langMissing,
  manifestMissing,
  ogImageAbsolute,
  ogImageDimensions,
  ogImageMissing,
  ogImageSize,
  ogLocaleValid,
  ogSiteNameMissing,
  ogTitleMissing,
  ogTypeValid,
  ogUrlMatches,
  robotsConflict,
  titleLength,
  titleMissing,
  twitterCardMatchesImage,
  twitterCardMissing,
  twitterImageAlt,
  viewportMissing,
];

/** Map for O(1) lookup by id. Built once at module load. */
const RULE_BY_ID: Map<string, Rule> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): Rule | undefined {
  return RULE_BY_ID.get(id);
}

/**
 * Bucket a rule into one of the seven UI categories. Driven entirely by
 * the rule id prefix so contributors never set the category by hand.
 */
export function categoryOf(id: string): RuleCategory {
  if (id.startsWith("og.")) return "open-graph";
  if (id.startsWith("twitter.")) return "twitter";
  if (id.startsWith("hreflang.") || id.startsWith("lang.")) return "i18n";
  if (id.startsWith("favicon.")) return "icons";
  if (id.startsWith("manifest.")) return "manifest";
  if (id.startsWith("robots.")) return "robots";
  return "core";
}

/** Convenience: rules grouped by category, ids sorted within each bucket. */
export function rulesByCategory(): Record<RuleCategory, Rule[]> {
  const out: Record<RuleCategory, Rule[]> = {
    core: [],
    "open-graph": [],
    twitter: [],
    i18n: [],
    icons: [],
    manifest: [],
    robots: [],
  };
  for (const rule of RULES) {
    out[categoryOf(rule.id)].push(rule);
  }
  for (const bucket of Object.values(out)) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
  }
  return out;
}

export type { Rule, RuleCategory, RuleContext, RuleDocs } from "./types";
