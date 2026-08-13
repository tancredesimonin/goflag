/**
 * The rule catalogue, as data somebody else can read.
 *
 * Phase 3.3 of `docs/spec-and-lib-plan.md`, and it has a consumer that the
 * plan did not anticipate. `apps/website` renders the catalogue on
 * `/docs/rules`, and it cannot import this package — invariant I3 forbids
 * `apps/**` from reaching into `packages/**`, because the site must not depend
 * on either package's build. So it carries a hand-written mirror, and a mirror
 * drifts: the documentation audit of 2026-08-13 found a rule message wrong
 * since 0.2.2, a reciprocity code advertised that no branch can emit, and a
 * flag absent from the reference entirely. Exporting the catalogue removes the
 * class rather than correcting it once more.
 *
 * What this deliberately does **not** carry:
 *
 * - **the message a finding prints.** It is built at evaluation time from what
 *   the page actually says (`Conflicting robots directives: ${conflicts}`), so
 *   a static copy is a sample, not a fact. A consumer that wants one runs the
 *   rule.
 * - **editorial prose.** The registry's `why` is the rationale a rule carries;
 *   what a mistake *costs a reader* is writing, and belongs to whoever writes.
 *   A consumer keys its own text by rule id and derives everything else.
 *
 * `rigor: null` on the cross-page rules is not an omission — `SiteRule` has no
 * `rigor` field yet (phase G). Emitting the gap is how it stops being
 * invisible.
 */

import { RULES } from "./index";
import { PROSE_RULES } from "./prose";
import { SITE_RULES } from "./site-rules";
import { getSource } from "./sources";
import type { Band, Rigor } from "./types";
import type { Severity } from "../core/types";

/** Where a rule runs, which decides what it can see and what it may claim. */
export type RuleScope = "page" | "site" | "prose";

export interface CatalogFix {
  title: string;
  snippet: string;
  language: string;
}

export interface CatalogRule {
  id: string;
  scope: RuleScope;
  /** Grouping key (`document`, `opengraph`, …). Absent on cross-page rules. */
  category?: string;
  /**
   * `null` on prose rules: they produce no verdict, so there is nothing for a
   * severity to describe, and inventing one would make a question look like a
   * finding.
   */
  severity: Severity | null;
  /** How the rule is evaluated. `prose` never evaluates at all. */
  kind: "boolean" | "scored" | "prose";
  /** One-line statement of the policy. */
  summary: string;
  /** Why honouring it matters, in the registry's own words. */
  why?: string;
  /** `null` on the cross-page rules, which have no rigor field yet. */
  rigor: Rigor | null;
  /** Ids into `sources`. Empty only where `rigor` is null, for the same reason. */
  sources: string[];
  /** Dotted paths into the observation model the rule reads. */
  reads?: string[];
  relates?: string[];
  /** What a passing page looks like, in one phrase. */
  expected?: string;
  fix?: CatalogFix;
  /** Scored rules only: the window each band covers. */
  bands?: Partial<Record<Band, [number, number]>>;
  /**
   * Scored rules only: the severity a finding takes per band.
   *
   * `severity` above carries the `acceptable` one, because that is the case a
   * page actually lands in when it misses the ideal window by a little — and a
   * catalogue that answered `null` there would make a real gating rule look
   * like it has no teeth.
   */
  severityByBand?: Record<"acceptable" | "poor", Severity>;
  /** Prose rules only: the question an agent is asked to judge. */
  prose?: string;
}

export interface SourceDoc {
  id: string;
  publisher: string;
  title: string;
  rigor: string;
  url: string;
}

export interface RuleCatalog {
  /**
   * The `@goflag/cli` version, stamped by the command that prints it.
   *
   * Absent from the committed `rules.json` on purpose: a file carrying the
   * version changes on every release, so the generated artefact would go stale
   * during `pnpm release` itself and turn the release commit red. The file
   * answers "what does goflag check"; the version answers "which goflag", and
   * only the caller knows that.
   */
  version?: string;
  counts: { page: number; site: number; prose: number };
  /** Only the documents the shipped rules cite, keyed by id. */
  sources: Record<string, SourceDoc>;
  rules: CatalogRule[];
}

function fixOf(fix: { title: string; snippet: string; language?: string } | undefined) {
  if (!fix) return undefined;
  return { title: fix.title, snippet: fix.snippet, language: fix.language ?? "ts" };
}

/**
 * Build the catalogue. Pure, deterministic, and ordered by id so a consumer
 * can diff two versions of it without sorting first — a generated file that
 * reorders itself is a generated file nobody will commit.
 */
export function buildRuleCatalog(version?: string): RuleCatalog {
  const rules: CatalogRule[] = [];

  for (const rule of RULES) {
    rules.push({
      id: rule.id,
      scope: "page",
      category: rule.category,
      severity: rule.kind === "boolean" ? rule.severity : rule.severityByBand.acceptable,
      kind: rule.kind,
      summary: rule.title,
      why: rule.why,
      rigor: rule.rigor,
      sources: [...rule.sources],
      reads: [...rule.reads],
      ...(rule.relates ? { relates: [...rule.relates] } : {}),
      ...(rule.expected ? { expected: rule.expected } : {}),
      ...(fixOf(rule.fix) ? { fix: fixOf(rule.fix) } : {}),
      ...(rule.kind === "scored"
        ? { bands: { ...rule.bands }, severityByBand: { ...rule.severityByBand } }
        : {}),
    });
  }

  for (const rule of SITE_RULES) {
    rules.push({
      id: rule.id,
      scope: "site",
      severity: rule.severity,
      kind: "boolean",
      summary: rule.summary,
      rigor: null,
      sources: [],
    });
  }

  for (const rule of PROSE_RULES) {
    rules.push({
      id: rule.id,
      scope: "prose",
      category: rule.category,
      severity: null,
      kind: "prose",
      summary: rule.title,
      why: rule.why,
      rigor: rule.rigor,
      sources: [...rule.sources],
      reads: [...rule.reads],
      prose: rule.prose,
    });
  }

  rules.sort((a, b) => a.id.localeCompare(b.id));

  // Only what the shipped rules cite. The source catalogue carries more,
  // seeded for rules that do not exist yet, and exporting those would advertise
  // coverage goflag does not have.
  const cited = new Set(rules.flatMap((r) => r.sources));
  const sources: Record<string, SourceDoc> = {};
  for (const id of [...cited].sort()) {
    const doc = getSource(id);
    if (doc) {
      sources[id] = {
        id: doc.id,
        publisher: doc.publisher,
        title: doc.title,
        rigor: doc.rigor,
        url: doc.url,
      };
    }
  }

  return {
    ...(version ? { version } : {}),
    counts: {
      page: RULES.length,
      site: SITE_RULES.length,
      prose: PROSE_RULES.length,
    },
    sources,
    rules,
  };
}

/** The exact bytes `rules.json` must contain, so a comparison is a string one. */
export function serialiseCatalog(catalog: RuleCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
