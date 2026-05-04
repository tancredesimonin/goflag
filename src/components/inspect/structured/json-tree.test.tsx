import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JsonTree } from "./json-tree";
import type { JsonLdValidationIssue } from "@/lib/structured/types";

describe("<JsonTree />", () => {
  it("renders a top-level @type as a badge", () => {
    render(
      <JsonTree value={{ "@context": "https://schema.org", "@type": "Article", headline: "Hi" }} />,
    );
    const badges = screen.getAllByTestId("json-tree-type-badge");
    expect(badges.some((b) => b.textContent === "Article")).toBe(true);
  });

  it("renders @graph children with their own type badges", () => {
    render(
      <JsonTree
        value={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", name: "Acme" },
            { "@type": "WebSite", url: "https://acme.com/" },
          ],
        }}
      />,
    );
    const badges = screen.getAllByTestId("json-tree-type-badge").map((b) => b.textContent);
    expect(badges).toContain("Organization");
    expect(badges).toContain("WebSite");
  });

  it("renders inline validation issues attached to the matching node", () => {
    const issues: JsonLdValidationIssue[] = [
      {
        blockIndex: 0,
        path: "headline",
        severity: "error",
        code: "missing-required",
        message: "`Article` is missing required `headline`.",
        type: "Article",
      },
    ];
    render(
      <JsonTree
        value={{ "@context": "https://schema.org", "@type": "Article", headline: "" }}
        issues={issues}
      />,
    );
    const issuesList = screen.getByTestId("json-tree-issues");
    expect(issuesList).toHaveTextContent(/missing required `headline`/);
  });

  it("collapses nodes deeper than initiallyCollapsedAt", async () => {
    render(
      <JsonTree
        initiallyCollapsedAt={1}
        value={{
          "@context": "https://schema.org",
          "@type": "Organization",
          contactPoint: { "@type": "ContactPoint", telephone: "+1" },
        }}
      />,
    );
    expect(screen.queryByText(/telephone/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    const toggles = screen.getAllByTestId("json-tree-toggle");
    await user.click(toggles[toggles.length - 1]!);
    expect(await screen.findByText(/telephone/)).toBeInTheDocument();
  });
});
