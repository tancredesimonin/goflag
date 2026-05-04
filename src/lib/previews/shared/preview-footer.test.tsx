import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PreviewFooter } from "./preview-footer";
import { resolvePreview } from "../resolve";
import { tancredeFull, minimalPage } from "../fixtures";

describe("PreviewFooter", () => {
  it("lists the consumed tags as small chips", () => {
    const data = resolvePreview("facebook", tancredeFull);
    render(<PreviewFooter data={data} />);
    const chips = screen.getAllByTestId("preview-footer-tag");
    // og:title, og:description, og:image, og:site_name, canonical, favicon at minimum.
    expect(chips.length).toBeGreaterThanOrEqual(4);
    expect(chips.some((c) => /og:title/.test(c.textContent ?? ""))).toBe(true);
  });

  it("explains fallbacks when the preferred source was missing", () => {
    // Suppress og:title so the footer surfaces the fallback chain.
    const data = resolvePreview("facebook", tancredeFull, {
      removed: new Set(["meta:property=og:title"]),
    });
    render(<PreviewFooter data={data} />);
    fireEvent.click(screen.getByTestId("preview-footer-toggle"));
    const details = screen.getByTestId("preview-footer-details");
    expect(details.textContent).toMatch(/og:title/);
    expect(details.textContent).toMatch(/fell back to/i);
  });

  it("warns when a critical field is missing entirely", () => {
    const data = resolvePreview("facebook", minimalPage);
    render(<PreviewFooter data={data} />);
    expect(screen.getByTestId("preview-footer-toggle")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("preview-footer-toggle"));
    expect(screen.getByTestId("preview-footer-details").textContent).toMatch(/no image declared/i);
  });

  it("renders an empty-state when nothing was consumed", () => {
    render(
      <PreviewFooter
        data={{
          platform: "facebook",
          title: { value: undefined, fallbackChain: [] },
          description: { value: undefined, fallbackChain: [] },
          image: { value: undefined, fallbackChain: [] },
          siteName: { value: undefined, fallbackChain: [] },
          url: { value: undefined, fallbackChain: [] },
          favicon: { value: undefined, fallbackChain: [] },
          extras: {},
          consumed: [],
        }}
      />,
    );
    expect(screen.getByTestId("preview-footer-empty")).toBeInTheDocument();
  });
});
