import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkAuditSummary } from "./link-audit-summary";
import { emptyVerdictSummary, type LinkAuditReport } from "@/lib/core/links/types";

function report(overrides: Partial<LinkAuditReport> = {}): LinkAuditReport {
  return {
    origin: "https://site.example",
    baseUrl: "https://site.example",
    pagesScanned: 5,
    occurrences: [],
    checks: {},
    summary: { ...emptyVerdictSummary(), ok: 10, broken: 3, redirect: 1 },
    brokenByPage: [],
    truncated: false,
    diagnostics: { pagesFailed: 0, warnings: [] },
    ...overrides,
  };
}

describe("<LinkAuditSummary />", () => {
  it("renders a count chip per verdict with the right numbers", () => {
    render(<LinkAuditSummary report={report()} />);
    const counts = screen.getAllByTestId("verdict-count");
    const broken = counts.find((el) => el.dataset.verdict === "broken");
    expect(broken?.textContent).toContain("3");
    const ok = counts.find((el) => el.dataset.verdict === "ok");
    expect(ok?.textContent).toContain("10");
  });

  it("surfaces failed pages and warnings", () => {
    render(
      <LinkAuditSummary
        report={report({
          diagnostics: { pagesFailed: 2, warnings: ["Truncated at cap"] },
          truncated: true,
        })}
      />,
    );
    expect(screen.getByText(/2 pages could not be scanned/)).toBeInTheDocument();
    expect(screen.getByTestId("link-audit-warnings").textContent).toContain("Truncated at cap");
  });
});
