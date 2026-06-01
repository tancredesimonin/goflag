import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SitemapAnalysis } from "./sitemap-analysis";
import type { SiteDiscovery } from "@/lib/core/sitemap/types";

function discovery(overrides: Partial<SiteDiscovery> = {}): SiteDiscovery {
  return {
    origin: "https://example.com",
    baseUrl: "https://example.com",
    source: "robots",
    urls: [{ loc: "https://example.com/" }],
    truncated: false,
    diagnostics: {
      found: true,
      sitemapUrl: "https://example.com/sitemap.xml",
      status: 200,
      declaredInRobots: true,
      robotsFound: true,
      atWellKnownPath: true,
      wellFormed: true,
      isIndex: false,
      childSitemapCount: 0,
      childSitemapErrors: 0,
      urlCount: 1,
      warnings: [],
    },
    ...overrides,
  };
}

describe("<SitemapAnalysis />", () => {
  it("shows the sitemap URL, status and source", () => {
    render(<SitemapAnalysis discovery={discovery()} />);
    expect(screen.getByText("https://example.com/sitemap.xml")).toBeInTheDocument();
    expect(screen.getByTestId("sitemap-status")).toHaveTextContent("200");
    expect(screen.getByText(/via robots\.txt/)).toBeInTheDocument();
  });

  it("renders pass/fail markers for each health check", () => {
    render(
      <SitemapAnalysis
        discovery={discovery({
          diagnostics: { ...discovery().diagnostics, declaredInRobots: false },
        })}
      />,
    );
    const checks = screen.getAllByTestId("sitemap-check");
    const declared = checks.find((c) => c.textContent?.includes("Declared in robots.txt"));
    expect(declared?.dataset.ok).toBe("false");
  });

  it("surfaces warnings", () => {
    render(
      <SitemapAnalysis
        discovery={discovery({
          diagnostics: { ...discovery().diagnostics, warnings: ["Child sitemap unreachable: x"] },
        })}
      />,
    );
    expect(screen.getByTestId("sitemap-warnings")).toHaveTextContent("Child sitemap unreachable");
  });

  it("marks an index with its child count", () => {
    render(
      <SitemapAnalysis
        discovery={discovery({
          diagnostics: { ...discovery().diagnostics, isIndex: true, childSitemapCount: 3 },
        })}
      />,
    );
    expect(screen.getByText(/Index · 3/)).toBeInTheDocument();
  });
});
