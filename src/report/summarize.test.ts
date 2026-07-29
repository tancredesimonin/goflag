import { describe, expect, it } from "vitest";

import { SAMPLE_LIMIT, summarize } from "./summarize";
import type { GoflagReport } from "./types";

type ReportOverrides = Partial<Omit<GoflagReport, "summary">> & {
  summary?: Partial<GoflagReport["summary"]>;
};

function baseReport(overrides: ReportOverrides = {}): GoflagReport {
  const base: GoflagReport = {
    url: "https://example.com/",
    finishedAt: "2026-01-01T00:00:00.000Z",
    summary: {
      brokenLinks: 0,
      missingTranslations: 0,
      seoIssues: 0,
      siteIssues: 0,
      unreachablePages: 0,
      verdict: "green",
    },
    localeAxis: { locales: [], source: "crawl", multilingual: false },
    pages: [],
    unreachablePages: [],
    brokenLinks: [],
    missingTranslations: { holes: [], reciprocity: [] },
    seoIssues: [],
    siteIssues: [],
    diagnostics: {
      pagesCrawled: 3,
      pagesScanned: 3,
      pagesFailed: 0,
      truncated: false,
      warnings: [],
    },
  };
  return { ...base, ...overrides, summary: { ...base.summary, ...(overrides.summary ?? {}) } };
}

describe("summarize — totals", () => {
  it("passes through the headline numbers and verdict", () => {
    const s = summarize(
      baseReport({
        summary: { brokenLinks: 2, missingTranslations: 1, seoIssues: 4, verdict: "red" },
      }),
    );
    expect(s.verdict).toBe("red");
    expect(s.totals).toMatchObject({
      brokenLinks: 2,
      missingTranslations: 1,
      seoIssues: 4,
      pagesCrawled: 3,
    });
  });
});

describe("summarize — unreachable pages", () => {
  it("passes unreachable pages and their count straight through", () => {
    const s = summarize(
      baseReport({
        summary: { verdict: "red", unreachablePages: 1 },
        unreachablePages: [{ id: "page-1", url: "https://example.com/down", status: 500 }],
      }),
    );
    expect(s.totals.unreachablePages).toBe(1);
    expect(s.unreachablePages).toEqual([
      { id: "page-1", url: "https://example.com/down", status: 500 },
    ]);
  });
});

describe("summarize — broken links rollup", () => {
  it("collapses the same broken target across many pages into one entry", () => {
    const s = summarize(
      baseReport({
        brokenLinks: [
          {
            id: "l1",
            pageUrl: "https://example.com/a",
            href: "https://example.com/dead",
            status: 404,
            verdict: "broken",
          },
          {
            id: "l2",
            pageUrl: "https://example.com/b",
            href: "https://example.com/dead",
            status: 404,
            verdict: "broken",
          },
          {
            id: "l3",
            pageUrl: "https://example.com/c",
            href: "https://example.com/other",
            status: 500,
            verdict: "broken",
          },
        ],
      }),
    );
    expect(s.brokenLinks).toHaveLength(2);
    const dead = s.brokenLinks.find((l) => l.href === "https://example.com/dead");
    expect(dead?.count).toBe(2);
    expect(dead?.pages).toEqual(["https://example.com/a", "https://example.com/b"]);
    // Highest count first.
    expect(s.brokenLinks[0]?.href).toBe("https://example.com/dead");
  });

  it("caps the page sample and reports the overflow count", () => {
    const links = Array.from({ length: SAMPLE_LIMIT + 3 }, (_, i) => ({
      id: `l${i}`,
      pageUrl: `https://example.com/p${i}`,
      href: "https://example.com/dead",
      status: 404,
      verdict: "broken" as const,
    }));
    const s = summarize(baseReport({ brokenLinks: links }));
    expect(s.brokenLinks[0]?.pages).toHaveLength(SAMPLE_LIMIT);
    expect(s.brokenLinks[0]?.morePages).toBe(3);
    expect(s.brokenLinks[0]?.count).toBe(SAMPLE_LIMIT + 3);
  });
});

describe("summarize — SEO rollup", () => {
  it("collapses one rule across pages, keeping why/fix once", () => {
    const s = summarize(
      baseReport({
        seoIssues: [
          {
            id: "s1",
            pageUrl: "https://example.com/a",
            ruleId: "title.missing",
            severity: "error",
            message: "no title",
            why: "Every page needs a title",
            fix: "<title>…</title>",
          },
          {
            id: "s2",
            pageUrl: "https://example.com/b",
            ruleId: "title.missing",
            severity: "error",
            message: "no title",
            why: "Every page needs a title",
            fix: "<title>…</title>",
          },
        ],
      }),
    );
    expect(s.seoIssues).toHaveLength(1);
    expect(s.seoIssues[0]).toMatchObject({
      ruleId: "title.missing",
      count: 2,
      why: "Every page needs a title",
      fix: "<title>…</title>",
    });
    expect(s.seoIssues[0]?.pages).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("orders rules by severity then id", () => {
    const s = summarize(
      baseReport({
        seoIssues: [
          { id: "s1", pageUrl: "p", ruleId: "og.title.missing", severity: "info", message: "" },
          { id: "s2", pageUrl: "p", ruleId: "title.missing", severity: "error", message: "" },
          {
            id: "s3",
            pageUrl: "p",
            ruleId: "description.missing",
            severity: "warning",
            message: "",
          },
        ],
      }),
    );
    expect(s.seoIssues.map((i) => i.ruleId)).toEqual([
      "title.missing",
      "description.missing",
      "og.title.missing",
    ]);
  });
});

describe("summarize — reciprocity rollup", () => {
  it("groups by code and keeps holes verbatim", () => {
    const s = summarize(
      baseReport({
        missingTranslations: {
          holes: [{ id: "h1", route: "/blog", presentLocales: ["en"], missingLocales: ["fr"] }],
          reciprocity: [
            { id: "r1", code: "missing-back-link", url: "https://example.com/a", message: "a" },
            { id: "r2", code: "missing-back-link", url: "https://example.com/b", message: "b" },
            { id: "r3", code: "x-default-missing", url: "https://example.com/c", message: "c" },
          ],
        },
      }),
    );
    expect(s.translations.holes).toHaveLength(1);
    const back = s.translations.reciprocity.find((r) => r.code === "missing-back-link");
    expect(back?.count).toBe(2);
    expect(s.translations.reciprocity).toHaveLength(2);
  });
});
