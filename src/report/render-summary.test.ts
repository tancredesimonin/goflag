import { describe, expect, it } from "vitest";

import { renderSummaryTerminal } from "./render-summary";
import type { GoflagSummary } from "./summarize";

type SummaryOverrides = Partial<Omit<GoflagSummary, "totals">> & {
  totals?: Partial<GoflagSummary["totals"]>;
};

function baseSummary(overrides: SummaryOverrides = {}): GoflagSummary {
  const base: GoflagSummary = {
    url: "https://example.com/",
    finishedAt: "2026-01-01T00:00:00.000Z",
    verdict: "green",
    totals: {
      brokenLinks: 0,
      missingTranslations: 0,
      seoIssues: 0,
      unreachablePages: 0,
      pagesCrawled: 2,
      pagesScanned: 2,
      pagesFailed: 0,
    },
    unreachablePages: [],
    brokenLinks: [],
    translations: { holes: [], reciprocity: [] },
    seoIssues: [],
    truncated: false,
    warnings: [],
  };
  return { ...base, ...overrides, totals: { ...base.totals, ...(overrides.totals ?? {}) } };
}

describe("renderSummaryTerminal", () => {
  it("shows a GREEN FLAG and all-clear line when clean", () => {
    const out = renderSummaryTerminal(baseSummary(), { color: false });
    expect(out).toContain("GREEN FLAG");
    expect(out).toContain("(summary)");
    expect(out).toContain("No problems found.");
  });

  it("renders a broken link once with a count and sample pages", () => {
    const out = renderSummaryTerminal(
      baseSummary({
        verdict: "red",
        totals: {
          brokenLinks: 3,
          missingTranslations: 0,
          seoIssues: 0,
          pagesCrawled: 3,
          pagesScanned: 3,
          pagesFailed: 0,
        },
        brokenLinks: [
          {
            href: "https://example.com/dead",
            verdict: "broken",
            status: 404,
            count: 3,
            pages: ["https://example.com/a", "https://example.com/b"],
            morePages: 1,
          },
        ],
      }),
      { color: false },
    );
    expect(out).toContain("[404]");
    expect(out).toContain("https://example.com/dead");
    expect(out).toContain("×3");
    expect(out).toContain("(+1 more)");
  });

  it("renders SEO rollups with why and fix lines", () => {
    const out = renderSummaryTerminal(
      baseSummary({
        verdict: "red",
        totals: {
          brokenLinks: 0,
          missingTranslations: 0,
          seoIssues: 2,
          pagesCrawled: 2,
          pagesScanned: 2,
          pagesFailed: 0,
        },
        seoIssues: [
          {
            ruleId: "title.missing",
            severity: "error",
            why: "Every page needs a `<title>`",
            fix: "<title>Name — Site</title>",
            sample: "missing title",
            count: 2,
            pages: ["https://example.com/a", "https://example.com/b"],
            morePages: 0,
          },
        ],
      }),
      { color: false },
    );
    expect(out).toContain("title.missing");
    expect(out).toContain("×2");
    expect(out).toContain("Every page needs a <title>");
    expect(out).toContain("fix:");
    expect(out).toContain("<title>Name — Site</title>");
    expect(out).not.toContain("`");
  });

  it("emits ANSI only when color is enabled", () => {
    const s = baseSummary({ verdict: "red" });
    expect(renderSummaryTerminal(s, { color: false })).not.toContain("\x1b[");
    expect(renderSummaryTerminal(s, { color: true })).toContain("\x1b[");
  });
});
