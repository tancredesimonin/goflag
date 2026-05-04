import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InspectSkeleton } from "./inspect-skeleton";

describe("<InspectSkeleton />", () => {
  it("renders a skeleton scaffold matching the inspect view shape", () => {
    render(<InspectSkeleton />);
    const root = screen.getByTestId("inspect-skeleton");
    expect(root).toBeInTheDocument();
    // 8 list-item skeletons + the header bits + the tabs bar = at least 14 placeholders.
    const placeholders = root.querySelectorAll(
      "[data-slot='skeleton'], .animate-pulse, [class*='skeleton']",
    );
    expect(placeholders.length).toBeGreaterThan(8);
  });
});
