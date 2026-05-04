import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IssuesTab } from "./issues-tab";
import type { Issue } from "@/lib/core/types";

function makeIssue(
  overrides: Partial<Issue> & { ruleId: string; severity: Issue["severity"] },
): Issue {
  return {
    message: `mock message for ${overrides.ruleId}`,
    docs: `/rules/${overrides.ruleId}`,
    ...overrides,
  };
}

describe("<IssuesTab />", () => {
  it("renders the empty state when there are no issues", () => {
    render(<IssuesTab issues={[]} />);
    expect(screen.getByText(/No issues detected/i)).toBeInTheDocument();
  });

  it("groups issues by severity in error → warning → info order", () => {
    const issues: Issue[] = [
      makeIssue({ ruleId: "z.last.error", severity: "error" }),
      makeIssue({ ruleId: "a.first.warning", severity: "warning" }),
      makeIssue({ ruleId: "m.info", severity: "info" }),
      makeIssue({ ruleId: "a.first.error", severity: "error" }),
    ];
    render(<IssuesTab issues={issues} />);

    const errorSection = screen.getByTestId("issues-section-error");
    const warningSection = screen.getByTestId("issues-section-warning");
    const infoSection = screen.getByTestId("issues-section-info");
    expect(errorSection.compareDocumentPosition(warningSection)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(warningSection.compareDocumentPosition(infoSection)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const errorIds = within(errorSection)
      .getAllByTestId("issue-card")
      .map((el) => el.getAttribute("data-rule-id"));
    expect(errorIds).toEqual(["z.last.error", "a.first.error"]);
  });

  it("renders the rule id, message, and learn-more link on each card", () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: "title.missing",
        severity: "error",
        message: "Page is missing a `<title>` element.",
        docs: "/rules/title.missing",
      }),
    ];
    render(<IssuesTab issues={issues} />);

    const card = screen.getByTestId("issue-card");
    expect(within(card).getByText("title.missing")).toBeInTheDocument();
    expect(within(card).getByText(/Page is missing a `<title>` element/)).toBeInTheDocument();
    const link = within(card).getByTestId("issue-docs-link");
    expect(link).toHaveAttribute("href", "/rules/title.missing");
  });

  it("renders the fix snippet when a fix is provided", () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: "title.missing",
        severity: "error",
        fix: {
          title: "Add a <title> to <head>",
          snippet: `<title>Page name — Site name</title>`,
          language: "html",
        },
      }),
    ];
    render(<IssuesTab issues={issues} />);
    const fix = screen.getByTestId("issue-fix-snippet");
    expect(fix).toHaveAttribute("data-language", "html");
    expect(fix).toHaveTextContent("<title>Page name — Site name</title>");
  });

  it("dispatches a jump-to-tag event with the origin key when 'Jump to tag' is clicked", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const issues: Issue[] = [
      makeIssue({
        ruleId: "og.image.missing",
        severity: "warning",
        origin: { kind: "meta", property: "og:image" },
      }),
    ];
    render(<IssuesTab issues={issues} onJump={onJump} />);
    await user.click(screen.getByTestId("issue-jump-button"));
    expect(onJump).toHaveBeenCalledWith("meta:property:og:image");
  });

  it("falls back to dispatching a CustomEvent on document when no onJump is provided", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    document.addEventListener("headlint:jump-to-origin", handler as EventListener);
    try {
      const issues: Issue[] = [
        makeIssue({
          ruleId: "lang.missing",
          severity: "warning",
          origin: { kind: "html", attribute: "lang" },
        }),
      ];
      render(<IssuesTab issues={issues} />);
      await user.click(screen.getByTestId("issue-jump-button"));
      expect(handler).toHaveBeenCalled();
      const evt = handler.mock.calls[0]![0] as CustomEvent<string>;
      expect(evt.detail).toBe("html:lang");
    } finally {
      document.removeEventListener("headlint:jump-to-origin", handler as EventListener);
    }
  });

  it("renders the severity summary chips with counts", () => {
    const issues: Issue[] = [
      makeIssue({ ruleId: "e1", severity: "error" }),
      makeIssue({ ruleId: "e2", severity: "error" }),
      makeIssue({ ruleId: "w1", severity: "warning" }),
    ];
    render(<IssuesTab issues={issues} />);
    expect(screen.getByTestId("issues-count-error")).toHaveTextContent("2 errors");
    expect(screen.getByTestId("issues-count-warning")).toHaveTextContent("1 warnings");
    expect(screen.getByTestId("issues-count-info")).toHaveTextContent("0 info");
  });
});
