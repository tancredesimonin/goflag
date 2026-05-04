import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionBadge } from "./version-badge";

describe("<VersionBadge />", () => {
  it("renders a pre-alpha label for 0.x versions", () => {
    render(<VersionBadge version="0.0.0" />);
    expect(screen.getByTestId("version-badge")).toHaveTextContent("pre-alpha · v0.0.0");
  });

  it("renders a stable label for 1.x versions", () => {
    render(<VersionBadge version="1.2.3" />);
    expect(screen.getByTestId("version-badge")).toHaveTextContent("v1.2.3");
  });
});
