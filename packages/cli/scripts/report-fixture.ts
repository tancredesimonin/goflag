/**
 * The HTML report the documentation can show, from the frozen report and diff
 * the gate transcript already uses (`transcripts.ts`).
 *
 * Same standing as `preview-fixture.ts`: pure, written by
 * `generate-transcripts.ts` into `test/fixtures/transcripts/`, and compared
 * byte for byte by `test/unit/report-fixture.test.ts`.
 *
 * It renders a protected preview on purpose — `--expect-indexing no`, one
 * `--header` — so the committed file is also the proof that the footer prints
 * the header's name and never its value.
 */
import { redactCommand } from "../src/cli-args";
import { diffExitCode, totalFindings } from "../src/report/diff";
import { renderHtmlReport } from "../src/report/render-html";
import type { GoflagReport } from "../src/report/types";
import { DEMO_DIFF, DEMO_REPORT, FROZEN_NOW } from "./transcripts";

/** What the fixture's command passes as the header value. Never in the output. */
export const FIXTURE_SECRET = "bypass-secret-never-printed";

const MAX_DEBT = 14;

export const FIXTURE_ARGV = [
  DEMO_REPORT.url,
  "--expect-indexing",
  "no",
  "--header",
  `x-vercel-protection-bypass: ${FIXTURE_SECRET}`,
  "--baseline",
  ".goflag/baseline.json",
  "--max-debt",
  String(MAX_DEBT),
  "--html",
  "report.html",
];

/**
 * The demo report, plus the one finding the demo diff calls new: the gate
 * transcript only needs the diff, but the HTML report marks the rule a new
 * finding belongs to, and a fixture without it would never show the mark.
 */
export function buildReportFixture(): GoflagReport {
  const added = DEMO_DIFF.added[0]!;
  return {
    ...DEMO_REPORT,
    expectIndexing: "no",
    summary: { ...DEMO_REPORT.summary, seoIssues: DEMO_REPORT.summary.seoIssues + 1 },
    seoIssues: [
      ...DEMO_REPORT.seoIssues,
      {
        id: added.id,
        pageUrl: added.pageUrl!,
        ruleId: "canonical.absolute",
        severity: "error",
        message: '`rel="canonical"` is `/pricing`, a relative URL.',
        why: '`rel="canonical"` must be an absolute, fully-qualified URL',
        rigor: "vendor-spec",
      },
    ],
    diff: DEMO_DIFF,
    diagnostics: { ...DEMO_REPORT.diagnostics, requestHeaders: ["x-vercel-protection-bypass"] },
  };
}

export function renderReportFixture(): string {
  const report = buildReportFixture();
  return renderHtmlReport(report, {
    now: FROZEN_NOW,
    version: "0.0.0",
    command: redactCommand(FIXTURE_ARGV),
    gate: {
      exitCode: diffExitCode(DEMO_DIFF, "warning", {
        total: totalFindings(report),
        max: MAX_DEBT,
      }),
      failOn: "warning",
      maxDebt: MAX_DEBT,
    },
  });
}
