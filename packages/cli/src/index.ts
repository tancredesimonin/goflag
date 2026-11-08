/**
 * Programmatic API for goflag.
 *
 *   import { runAudit } from "@goflag/cli";
 *   const report = await runAudit("https://example.com");
 *
 * `runAudit` returns a `GoflagReport` — the same JSON the CLI emits.
 */

export {
  runAudit,
  deriveTranslationHoles,
  exitCode,
  type AuditOptions,
  type AuditPhase,
  type ProgressEvent,
} from "./report/build";
export { renderTerminal } from "./report/render-terminal";
export { renderSummaryTerminal } from "./report/render-summary";
export { renderPreview, type RenderPreviewOptions } from "./report/render-preview";
export { renderHtmlReport, type RenderHtmlReportOptions } from "./report/render-html";
export { renderJunitReport, type RenderJunitOptions } from "./report/render-junit";
export type { GateDecision } from "./report/gate-verdict";
export {
  summarize,
  SAMPLE_LIMIT,
  type GoflagSummary,
  type RollupLink,
  type RollupSeo,
  type RollupReciprocity,
} from "./report/summarize";
export { fingerprint, routeKey, targetKey } from "./report/fingerprint";
/**
 * How a `--header` argument is read and judged: the first colon splits name
 * from value, a reserved or malformed name is refused, and errors name the
 * header without quoting its value. Exported so that `@goflag/mcp` reads
 * `GOFLAG_HEADERS` by the same rules rather than a copy of them.
 */
export { parseHeaderArg } from "./lib/core/net/scoped-headers";
// What `@goflag/mcp` needs and nothing it does not: the comparison the gate makes
// against a baseline, and the catalogue `goflag rules` prints. A consumer that
// re-derived either would be the hand-written mirror this package keeps refusing.
export {
  diffReports,
  diffExitCode,
  totalFindings,
  type DiffEntry,
  type FindingKind,
  type ReportDiff,
} from "./report/diff";
export {
  buildRuleCatalog,
  type CatalogRule,
  type RuleCatalog,
  type RuleScope,
  type SourceDoc,
} from "./lib/rules/catalog";
export { Logger, type LogMode, type LoggerOptions } from "./report/logger";
export type {
  GoflagReport,
  Verdict,
  ReportPage,
  BrokenLink,
  TranslationHole,
  ReportReciprocityIssue,
  SeoIssue,
  SiteIssue,
  UnreachablePage,
} from "./report/types";
