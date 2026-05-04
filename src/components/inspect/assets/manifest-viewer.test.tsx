import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManifestViewer } from "./manifest-viewer";

describe("<ManifestViewer />", () => {
  it("renders an empty-state when no manifest probe is present", () => {
    render(<ManifestViewer />);
    expect(screen.getByText("declared.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText('<link rel="manifest">')).toBeInTheDocument();
  });

  it("pretty-prints parsed manifest JSON", () => {
    render(
      <ManifestViewer
        probe={{
          url: "https://example.com/manifest.webmanifest",
          status: 200,
          found: true,
          data: { name: "Example", short_name: "ex", start_url: "/" },
        }}
      />,
    );
    expect(screen.getByTestId("manifest-status")).toHaveTextContent("200");
    expect(screen.getByTestId("manifest-json").textContent).toContain('"name": "Example"');
  });

  it("surfaces a parse error when the manifest body is malformed", () => {
    render(
      <ManifestViewer
        probe={{
          url: "https://example.com/manifest.webmanifest",
          status: 200,
          found: true,
          raw: "{ not json",
          parseError: "Unexpected token",
        }}
      />,
    );
    expect(screen.getByTestId("manifest-error")).toHaveTextContent("Unexpected token");
  });

  it("falls back to raw text when only raw was returned", () => {
    render(
      <ManifestViewer
        probe={{
          url: "https://example.com/manifest.webmanifest",
          status: 200,
          found: true,
          raw: "raw text",
        }}
      />,
    );
    expect(screen.getByText("raw text")).toBeInTheDocument();
  });

  it("flags 4xx manifest responses with a destructive badge", () => {
    render(
      <ManifestViewer
        probe={{
          url: "https://example.com/manifest.webmanifest",
          status: 404,
          found: false,
        }}
      />,
    );
    expect(screen.getByTestId("manifest-status")).toHaveTextContent("404");
    expect(screen.getByText(/Manifest fetch returned no body/)).toBeInTheDocument();
  });
});
