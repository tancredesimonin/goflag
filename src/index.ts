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
export { Logger, type LogMode, type LoggerOptions } from "./report/logger";
export type {
  GoflagReport,
  Verdict,
  ReportPage,
  BrokenLink,
  TranslationHole,
  SeoIssue,
} from "./report/types";
