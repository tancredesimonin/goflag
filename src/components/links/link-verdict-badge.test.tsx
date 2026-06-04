import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkVerdictBadge, VERDICT_META, VERDICT_ORDER } from "./link-verdict-badge";

describe("<LinkVerdictBadge />", () => {
  it("renders the label and exposes the verdict via data attribute", () => {
    render(<LinkVerdictBadge verdict="broken" />);
    const badge = screen.getByTestId("link-verdict-badge");
    expect(badge.dataset.verdict).toBe("broken");
    expect(badge.textContent).toBe(VERDICT_META.broken.label);
  });

  it("covers every verdict in the order list", () => {
    expect(VERDICT_ORDER).toHaveLength(Object.keys(VERDICT_META).length);
    for (const verdict of VERDICT_ORDER) {
      expect(VERDICT_META[verdict].label).toBeTruthy();
    }
  });
});
