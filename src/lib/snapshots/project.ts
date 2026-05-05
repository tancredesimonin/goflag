/**
 * Public composer: `Page → Snapshot`.
 *
 * The CLI and the in-UI accept-changes server action both call
 * `buildSnapshot()`. Internally it chains projection (tags +
 * JSON-LD), rule-outcome collection, normalisation, and the digest
 * step in a single deterministic pipeline.
 *
 * This module owns the *order* of steps; everything it composes
 * lives in a peer file with its own focused tests.
 */

import type { Issue, Page, Severity } from "@/lib/core/types";
import type { Snapshot } from "./types";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import { projectTags } from "./tags";
import { projectJsonLd } from "./jsonld";
import { normalizeSnapshotBody, type NormalizeRule } from "./normalize";
import { digestSnapshot } from "./digest";
import { urlToRoute } from "./route";

export interface BuildSnapshotOptions {
  /** Issues produced by the rule runner (and any post-config
   *  filtering). The snapshot stores `ruleId → severity` only —
   *  message text is volatile and lives in the live `Issue[]`. */
  issues: Issue[];
  /** `config.normalize` rules. Defaults to `[]` (identity). */
  normalize?: ReadonlyArray<NormalizeRule>;
  /** Fixed timestamp, only used by tests so digests don't depend on
   *  wall-clock time. Production callers omit this. */
  capturedAt?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export function buildSnapshot(page: Page, opts: BuildSnapshotOptions): Snapshot {
  const route = urlToRoute(page.fetch.requestedUrl);
  const tags = projectTags(page);
  const jsonLd = projectJsonLd(page.jsonLd);
  const ruleOutcomes = collectRuleOutcomes(opts.issues);

  const body = normalizeSnapshotBody(
    {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      route,
      sampleUrl: page.fetch.requestedUrl,
      capturedAt: opts.capturedAt ?? new Date().toISOString(),
      tags,
      jsonLd,
      ruleOutcomes,
    },
    opts.normalize ?? [],
  );

  return { ...body, digest: digestSnapshot(body) };
}

/**
 * Collapse `Issue[]` to a `ruleId → severity` map, keeping the
 * *highest* severity when the same rule fires more than once.
 *
 * Exported for tests; the public surface is `buildSnapshot`.
 */
export function collectRuleOutcomes(issues: Issue[]): Record<string, Severity> {
  const out: Record<string, Severity> = {};
  for (const issue of issues) {
    const current = out[issue.ruleId];
    if (current === undefined || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[current]) {
      out[issue.ruleId] = issue.severity;
    }
  }
  return out;
}
