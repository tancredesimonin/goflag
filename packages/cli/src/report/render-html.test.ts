import { describe, expect, it } from "vitest";

import { DEMO_DIFF, DEMO_REPORT, FROZEN_NOW } from "../../scripts/transcripts";
import { renderHtmlReport } from "./render-html";
import type { GoflagReport, SeoIssue } from "./types";

const base = { now: FROZEN_NOW, version: "9.9.9" };

function withIssues(issues: SeoIssue[]): GoflagReport {
  return { ...DEMO_REPORT, seoIssues: issues, siteIssues: [] };
}

const issue = (path: string, overrides: Partial<SeoIssue> = {}): SeoIssue => ({
  id: `id-${path}`,
  pageUrl: `https://example.com${path}`,
  ruleId: "title.missing",
  severity: "error",
  message: "Page has no `<title>`.",
  ...overrides,
});

describe("renderHtmlReport", () => {
  it("escapes what the site said, and marks code spans only after escaping", () => {
    const html = renderHtmlReport(
      withIssues([issue("/x", { message: 'Title is `<script>alert("x")</script>`.' })]),
      base,
    );
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("<code>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</code>");
  });

  it("shows the report's own verdict, and says so, when no gate was given", () => {
    const html = renderHtmlReport(DEMO_REPORT, base);
    expect(html).toContain("<b>red flag</b>");
    expect(html).toContain("which this render was not given");
  });

  it("puts the debt budget first, as the gate does", () => {
    const html = renderHtmlReport(DEMO_REPORT, {
      ...base,
      gate: { exitCode: 1, failOn: "warning", maxDebt: 2 },
    });
    expect(html).toContain("Failed · exit code 1");
    expect(html).toMatch(/\d+ findings exceed the --max-debt budget of 2\./);
  });

  it("passes a run with nothing new, and says what it carries", () => {
    const html = renderHtmlReport(
      { ...DEMO_REPORT, diff: { ...DEMO_DIFF, added: [] } },
      { ...base, gate: { exitCode: 0, failOn: "warning" } },
    );
    expect(html).toContain("Passed · exit code 0");
    expect(html).toContain(
      "Nothing new at warning or error since the baseline; 13 known findings carried.",
    );
  });

  it("says a captured baseline accepted the findings, not that the site passed", () => {
    const html = renderHtmlReport(DEMO_REPORT, {
      ...base,
      gate: { exitCode: 0, failOn: "warning", capturedBaseline: true },
    });
    expect(html).toContain("Baseline captured · exit code 0");
    expect(html).toContain("accepted as known");
  });

  it("measures the baseline's age against the clock it is given", () => {
    const report = { ...DEMO_REPORT, diff: DEMO_DIFF };
    expect(renderHtmlReport(report, base)).toContain("14 days old");
    expect(renderHtmlReport(report, { ...base, now: FROZEN_NOW + 86_400_000 })).toContain(
      "15 days old",
    );
  });

  it("lists twenty pages per rule and counts the rest", () => {
    const many = Array.from({ length: 23 }, (_, i) => issue(`/p${i}`));
    const html = renderHtmlReport(withIssues(many), base);
    expect(html).toContain("23 pages");
    expect(html).toContain("/p19");
    expect(html).not.toContain("/p20<");
    expect(html).toContain("and 3 more in the JSON report");
  });

  it("links every rule to its page on goflag.tech", () => {
    const html = renderHtmlReport(DEMO_REPORT, base);
    expect(html).toContain('href="https://goflag.tech/docs/rules/robots.conflict"');
  });

  it("marks the rules a new finding belongs to", () => {
    const fresh = issue("/pricing", { id: "fresh", ruleId: "canonical.absolute" });
    const report: GoflagReport = {
      ...withIssues([fresh, issue("/old")]),
      diff: { ...DEMO_DIFF, added: [{ ...DEMO_DIFF.added[0]!, id: "fresh" }] },
    };
    const html = renderHtmlReport(report, base);
    expect(html).toContain('<details class="rule has-new">');
    expect(html).toContain('<li class="is-new">');
  });

  it("orders rules by severity, then by how many pages they hit", () => {
    const html = renderHtmlReport(
      withIssues([
        issue("/a", { ruleId: "description.length", severity: "warning" }),
        issue("/b", { ruleId: "og.image.missing", severity: "warning" }),
        issue("/c", { ruleId: "og.image.missing", severity: "warning" }),
        issue("/d", { ruleId: "robots.conflict", severity: "error" }),
      ]),
      base,
    );
    const order = ["robots.conflict", "og.image.missing", "description.length"].map((id) =>
      html.indexOf(`rules/${id}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
