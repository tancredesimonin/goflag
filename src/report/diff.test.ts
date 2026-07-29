import { describe, expect, it } from "vitest";

import { collectFindings, diffExitCode, diffReports } from "./diff";
import type { GoflagReport } from "./types";

function report(overrides: Partial<GoflagReport> = {}): GoflagReport {
  return {
    url: "https://x.test",
    finishedAt: "2026-01-01T00:00:00.000Z",
    summary: {
      brokenLinks: 0,
      missingTranslations: 0,
      seoIssues: 0,
      siteIssues: 0,
      unreachablePages: 0,
      verdict: "green",
    },
    localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
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
    ...overrides,
  };
}

const seo = (id: string, severity: "error" | "warning" | "info" = "warning") => ({
  id,
  pageUrl: "https://x.test/a",
  ruleId: "title.length",
  severity,
  message: "m",
});

describe("collectFindings", () => {
  it("flattens every report section into one comparable list", () => {
    const r = report({
      brokenLinks: [
        {
          id: "link-1",
          pageUrl: "https://x.test/a",
          href: "https://y.test/gone",
          status: 404,
          verdict: "broken",
        },
      ],
      unreachablePages: [{ id: "page-1", url: "https://x.test/b", status: 500 }],
      missingTranslations: {
        holes: [{ id: "hole-1", route: "/a", presentLocales: ["en"], missingLocales: ["fr"] }],
        reciprocity: [
          { id: "recip-1", code: "x-default-missing", url: "https://x.test/a", message: "m" },
        ],
      },
      seoIssues: [seo("seo-1")],
      siteIssues: [
        {
          id: "site-1",
          pageUrl: "https://x.test/a",
          ruleId: "hreflang.missing",
          severity: "error",
          message: "m",
        },
      ],
    });

    expect(
      collectFindings(r)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(["brokenLink", "reciprocity", "seo", "site", "translationHole", "unreachablePage"]);
  });

  it("maps non-rule findings onto the severity the verdict logic already uses", () => {
    const r = report({
      brokenLinks: [
        {
          id: "link-1",
          pageUrl: "https://x.test/a",
          href: "https://y.test/gone",
          status: 404,
          verdict: "broken",
        },
      ],
      missingTranslations: {
        holes: [{ id: "hole-1", route: "/a", presentLocales: ["en"], missingLocales: ["fr"] }],
        reciprocity: [],
      },
    });
    const bySeverity = Object.fromEntries(collectFindings(r).map((e) => [e.kind, e.severity]));
    expect(bySeverity).toEqual({ brokenLink: "error", translationHole: "warning" });
  });
});

describe("diffReports", () => {
  it("splits findings into added, resolved and unchanged", () => {
    const baseline = report({ seoIssues: [seo("seo-keep"), seo("seo-gone")] });
    const current = report({ seoIssues: [seo("seo-keep"), seo("seo-new")] });

    const diff = diffReports(baseline, current);
    expect(diff.added.map((e) => e.id)).toEqual(["seo-new"]);
    expect(diff.resolved.map((e) => e.id)).toEqual(["seo-gone"]);
    expect(diff.unchanged).toBe(1);
  });

  it("matches by fingerprint across environments", () => {
    // The point of origin-independent route keys: a baseline captured against
    // production must compare cleanly with a run against localhost.
    const baseline = report({ url: "https://x.test", seoIssues: [seo("seo-same")] });
    const current = report({ url: "http://localhost:3000", seoIssues: [seo("seo-same")] });

    const diff = diffReports(baseline, current);
    expect(diff.added).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });

  it("echoes where and when the baseline was taken", () => {
    const baseline = report({ url: "https://prod.test", finishedAt: "2026-05-05T00:00:00.000Z" });
    const diff = diffReports(baseline, report());
    expect(diff.baseline).toEqual({
      url: "https://prod.test",
      finishedAt: "2026-05-05T00:00:00.000Z",
    });
  });

  it("orders added findings by severity, then kind, then summary", () => {
    const current = report({
      seoIssues: [seo("a", "info"), seo("b", "error"), seo("c", "warning")],
    });
    const diff = diffReports(report(), current);
    expect(diff.added.map((e) => e.severity)).toEqual(["error", "warning", "info"]);
  });

  it("reports an empty diff when nothing moved", () => {
    const r = report({ seoIssues: [seo("seo-1")] });
    const diff = diffReports(r, r);
    expect(diff.added).toEqual([]);
    expect(diff.resolved).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });
});

describe("diffExitCode", () => {
  it("passes a site with a hundred known problems and no new ones", () => {
    // The whole reason the baseline exists: a backlog must not block a merge
    // that does not add to it.
    const baseline = report({ seoIssues: Array.from({ length: 100 }, (_, i) => seo(`old-${i}`)) });
    const current = report({ seoIssues: Array.from({ length: 100 }, (_, i) => seo(`old-${i}`)) });
    expect(diffExitCode(diffReports(baseline, current), "warning")).toBe(0);
  });

  it("fails on a single new warning by default", () => {
    const diff = diffReports(report(), report({ seoIssues: [seo("new-1", "warning")] }));
    expect(diffExitCode(diff, "warning")).toBe(1);
  });

  it("lets --fail-on error ignore a new warning but not a new error", () => {
    const warned = diffReports(report(), report({ seoIssues: [seo("new-1", "warning")] }));
    expect(diffExitCode(warned, "error")).toBe(0);

    const errored = diffReports(report(), report({ seoIssues: [seo("new-2", "error")] }));
    expect(diffExitCode(errored, "error")).toBe(1);
  });

  it("never fails under --fail-on never", () => {
    const diff = diffReports(report(), report({ seoIssues: [seo("new-1", "error")] }));
    expect(diffExitCode(diff, "never")).toBe(0);
  });

  it("does not fail merely because findings were resolved", () => {
    const diff = diffReports(report({ seoIssues: [seo("gone")] }), report());
    expect(diff.resolved).toHaveLength(1);
    expect(diffExitCode(diff, "warning")).toBe(0);
  });
});
