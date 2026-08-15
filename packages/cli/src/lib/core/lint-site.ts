/**
 * The Goflag site-rule runner.
 *
 * The cross-page counterpart to `lint()`: pure function `SiteContext` →
 * ordered `SiteIssueDraft[]`. It mirrors `lint.ts` deliberately — same
 * severity-then-id ordering, same crash isolation — so the two registries
 * behave identically from every consumer's point of view and a finding's
 * provenance never changes how it is rendered or fingerprinted.
 *
 * Ordering contract, on top of `lint()`'s:
 *   1. Severity descending, then `ruleId` ascending (as per-page rules).
 *   2. Within one rule, by `pageUrl` ascending, so a rule that fires on 24
 *      pages produces a stable, diffable sequence rather than crawl order.
 */

import { sortIssues } from "./lint";
import { SITE_RULES } from "../rules/site-rules";
import type { SiteContext, SiteIssueDraft, SiteRule } from "../rules/site-types";

/**
 * Run the site-rule registry against a `SiteContext`.
 *
 * The `rules` override exists for the per-rule contract tests, which isolate
 * one policy against a fixture without the noise of the others.
 */
export function lintSite(
  site: SiteContext,
  rules: ReadonlyArray<SiteRule> = SITE_RULES,
): SiteIssueDraft[] {
  const drafts: SiteIssueDraft[] = [];

  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(site)) continue;

    let result: SiteIssueDraft[] | SiteIssueDraft | undefined | void;
    try {
      result = rule.check({
        site,
        issue: (input) => ({
          ruleId: rule.id,
          severity: input.severity ?? rule.severity,
          message: input.message,
          origin: input.origin,
          fix: input.fix,
          suggestion: input.suggestion,
          pageUrl: input.pageUrl,
          // Stamped from the descriptor, never from the check: a rule does not
          // get to claim a rigor per finding. Absent on the three rules that
          // predate the field, which is how the gap stays visible instead of
          // being filled with a plausible citation.
          ...(rule.rigor ? { rigor: rule.rigor, sources: rule.sources ?? [] } : {}),
        }),
      });
    } catch (err) {
      // One buggy policy must never take the whole audit down: the exit code
      // and every downstream consumer depend on a complete walk.
      drafts.push({
        ruleId: "engine.site-rule-crashed",
        severity: "info",
        message: `Site rule \`${rule.id}\` threw: ${err instanceof Error ? err.message : String(err)}`,
        pageUrl: site.origin,
      });
      continue;
    }

    if (!result) continue;
    if (Array.isArray(result)) drafts.push(...result);
    else drafts.push(result);
  }

  return sortSiteIssues(drafts);
}

/** Stable ordering used by every consumer. Exported for tests. */
export function sortSiteIssues(drafts: SiteIssueDraft[]): SiteIssueDraft[] {
  // `sortIssues` is stable and already encodes the severity/ruleId contract;
  // pre-sorting by pageUrl makes the third key fall out of that stability.
  const byPage = [...drafts].sort((a, b) => a.pageUrl.localeCompare(b.pageUrl));
  return sortIssues(byPage);
}
