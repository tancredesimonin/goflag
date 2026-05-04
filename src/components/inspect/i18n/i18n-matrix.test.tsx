import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { I18nMatrixGrid } from "./i18n-matrix";
import type { I18nMatrix } from "@/lib/core/i18n";

const FULL_GRID: I18nMatrix = {
  locales: ["x-default", "en", "fr"],
  routes: ["/about", "/blog"],
  cells: {
    "/about": {
      "x-default": { url: "https://x.com/about", inspected: true },
      en: { url: "https://x.com/en/about", inspected: true },
      fr: { url: "https://x.com/fr/about", inspected: true },
    },
    "/blog": {
      "x-default": { url: "https://x.com/blog", inspected: true },
      en: { url: "https://x.com/en/blog", inspected: false },
      fr: { url: null, inspected: false },
    },
  },
};

describe("<I18nMatrixGrid />", () => {
  it("renders one row per route + one column per locale", () => {
    render(<I18nMatrixGrid matrix={FULL_GRID} />);
    expect(screen.getAllByTestId("i18n-matrix-row")).toHaveLength(2);
    expect(screen.getAllByTestId("i18n-matrix-locale")).toHaveLength(3);
  });

  it("marks inspected cells green and missing cells as `—`", () => {
    render(<I18nMatrixGrid matrix={FULL_GRID} />);
    const cells = screen.getAllByTestId("i18n-matrix-cell");
    const states = cells.map((c) => c.getAttribute("data-state"));
    expect(states).toContain("inspected");
    expect(states).toContain("declared");
    expect(states).toContain("missing");
  });

  it("flags broken pairs (missing back-link) with state=broken", () => {
    render(<I18nMatrixGrid matrix={FULL_GRID} brokenPairs={new Set(["/about|fr"])} />);
    const broken = screen
      .getAllByTestId("i18n-matrix-cell")
      .filter((c) => c.getAttribute("data-state") === "broken");
    expect(broken).toHaveLength(1);
  });

  it("falls back to an empty-state copy when the matrix is empty", () => {
    render(<I18nMatrixGrid matrix={{ locales: [], routes: [], cells: {} }} />);
    expect(screen.getByTestId("i18n-matrix-empty")).toBeInTheDocument();
  });
});
