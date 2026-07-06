/**
 * Programmatic API for goflag.
 *
 *   import { runAudit } from "goflag";
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
export {
  summarize,
  SAMPLE_LIMIT,
  type GoflagSummary,
  type RollupLink,
  type RollupSeo,
  type RollupReciprocity,
} from "./report/summarize";
export { fingerprint, routeKey, targetKey } from "./report/fingerprint";
export { Logger, type LogMode, type LoggerOptions } from "./report/logger";
export type {
  GoflagReport,
  Verdict,
  ReportPage,
  BrokenLink,
  TranslationHole,
  ReportReciprocityIssue,
  SeoIssue,
} from "./report/types";
