/**
 * Advisory collection — turning prose rules into evidence bundles.
 *
 * Pure: `Extraction` → `AdvisoryFinding[]`, one per prose rule whose subject
 * this page actually has. The gate is presence only (`ProseRule.appliesTo`):
 * asking "does the description summarize the page?" where there is no
 * description is noise on top of the deterministic finding that already
 * covers it. Nothing beyond presence may silence a question — a rule skipped
 * because the text "looked fine" would be goflag making exactly the judgment
 * it declined to make.
 *
 * The only real work is resolving the declared extraction paths. Absence is
 * recorded as `null`, never as a missing key — "this page has no og:image"
 * is evidence, and a missing key could not be told apart from a path that
 * pointed nowhere.
 */

import type { AdvisoryFinding, Extraction, ProseRule } from "./types";

/**
 * Read a dotted path out of the extraction: `meta.description`,
 * `openGraph.images`, `http.finalUrl`.
 *
 * Returns `null` for any path that runs off the end of the data — an absent
 * optional field and a typo look identical at runtime, which is why every
 * declared path is checked against a maximal fixture in `prose.test.ts`
 * rather than trusted here.
 *
 * Values come back as they sit in the model: a `Fact` (value + origin + raw)
 * for scalar observations, a plain array or string for the already-
 * normalized collections and `http` fields. Handing an agent the `Fact` is
 * the point — it can answer "says which tag?" without a second call.
 */
export function resolveEvidencePath(extraction: Extraction, path: string): unknown {
  let current: unknown = extraction;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return null;
    if (typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current ?? null;
}

/** Resolve every declared path into the bundle an agent receives. */
export function evidenceFor(
  extraction: Extraction,
  paths: ReadonlyArray<string>,
): Record<string, unknown> {
  const bundle: Record<string, unknown> = {};
  for (const path of paths) bundle[path] = resolveEvidencePath(extraction, path);
  return bundle;
}

/**
 * Build the advisory bundle for one page. `verdict` is hard-coded to
 * `needs-judgment` by construction: there is no code path in goflag that
 * can set it to anything else, which is the guarantee the whole design
 * rests on.
 */
export function collectAdvisories(
  extraction: Extraction,
  rules: ReadonlyArray<ProseRule>,
): AdvisoryFinding[] {
  return rules
    .filter((rule) => rule.appliesTo?.(extraction) ?? true)
    .map((rule) => ({
      ruleId: rule.id,
      kind: "prose",
      prose: rule.prose,
      rigor: rule.rigor,
      sources: rule.sources,
      evidence: evidenceFor(extraction, rule.reads),
      verdict: "needs-judgment",
    }));
}
