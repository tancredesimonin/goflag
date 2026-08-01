import { describe, expect, it } from "vitest";

import { exitCode, type FailOn } from "./build";
import type { GoflagReport, Verdict } from "./types";

/** Minimal report — `exitCode` only ever reads the verdict. */
function reportWith(verdict: Verdict): GoflagReport {
  return {
    url: "https://x.test",
    finishedAt: "2026-01-01T00:00:00.000Z",
    summary: {
      brokenLinks: 0,
      missingTranslations: 0,
      seoIssues: 0,
      siteIssues: 0,
      unreachablePages: 0,
      verdict,
    },
    localeAxis: { locales: [], source: "none", multilingual: false },
    pages: [],
    unreachablePages: [],
    brokenLinks: [],
    missingTranslations: { holes: [], reciprocity: [] },
    seoIssues: [],
    siteIssues: [],
    diagnostics: {
      pagesCrawled: 0,
      pagesScanned: 0,
      pagesFailed: 0,
      truncated: false,
      warnings: [],
    },
  };
}

const CASES: Array<[FailOn | undefined, Verdict, number]> = [
  // Default: any finding fails — the historical behaviour.
  [undefined, "green", 0],
  [undefined, "yellow", 1],
  [undefined, "red", 1],
  // `warning` is the default spelled out.
  ["warning", "green", 0],
  ["warning", "yellow", 1],
  ["warning", "red", 1],
  // `error` lets a team adopt goflag on a site that is not clean yet:
  // warnings stay visible in the report but only hard errors block a merge.
  ["error", "green", 0],
  ["error", "yellow", 0],
  ["error", "red", 1],
  // `never` reports without ever failing — exploratory runs, or a baseline
  // capture that must not abort the pipeline.
  ["never", "green", 0],
  ["never", "yellow", 0],
  ["never", "red", 0],
];

describe("exitCode --fail-on", () => {
  it.each(CASES)("failOn=%s verdict=%s exits %i", (failOn, verdict, expected) => {
    expect(exitCode(reportWith(verdict), failOn)).toBe(expected);
  });

  it("still fails on red under --fail-on error even with zero rule findings", () => {
    // A red verdict also covers broken links, unreachable pages and a blind
    // link scan — states where "no findings" would be a lie, not a pass.
    const report = reportWith("red");
    expect(report.summary.seoIssues).toBe(0);
    expect(exitCode(report, "error")).toBe(1);
  });
});
