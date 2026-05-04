import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RobotsViewer } from "./robots-viewer";

describe("<RobotsViewer />", () => {
  it("explains when the probe was disabled", () => {
    render(<RobotsViewer />);
    expect(screen.getByText(/probe was disabled/i)).toBeInTheDocument();
  });

  it("renders the raw body and declared sitemaps", () => {
    render(
      <RobotsViewer
        probe={{
          url: "https://example.com/robots.txt",
          status: 200,
          found: true,
          blocksAll: false,
          raw: "User-agent: *\nAllow: /",
          sitemaps: ["https://example.com/sitemap.xml"],
        }}
      />,
    );
    expect(screen.getByTestId("robots-body").textContent).toContain("User-agent: *");
    expect(screen.getByTestId("robots-sitemaps")).toHaveTextContent(
      "https://example.com/sitemap.xml",
    );
  });

  it("flags Disallow: / robots files with a destructive badge", () => {
    render(
      <RobotsViewer
        probe={{
          url: "https://example.com/robots.txt",
          status: 200,
          found: true,
          blocksAll: true,
          raw: "User-agent: *\nDisallow: /",
          sitemaps: [],
        }}
      />,
    );
    expect(screen.getByText("Disallow: /")).toBeInTheDocument();
  });

  it("handles missing robots.txt gracefully", () => {
    render(
      <RobotsViewer
        probe={{
          url: "https://example.com/robots.txt",
          status: 404,
          found: false,
          blocksAll: false,
          sitemaps: [],
        }}
      />,
    );
    expect(screen.getByTestId("robots-status")).toHaveTextContent("404");
    expect(screen.getByText(/No robots\.txt body/)).toBeInTheDocument();
  });
});
