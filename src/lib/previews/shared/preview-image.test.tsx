import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PreviewImage } from "./preview-image";

describe("PreviewImage", () => {
  it("renders an <img> when src is provided", () => {
    render(<PreviewImage src="https://example.com/x.png" alt="hi" data-testid="img" />);
    const img = screen.getByAltText("hi") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.src).toBe("https://example.com/x.png");
  });

  it("renders the placeholder when src is missing", () => {
    render(<PreviewImage data-testid="img" />);
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    expect(screen.getByTestId("img").getAttribute("data-broken")).toBe("true");
  });

  it("falls back to the placeholder when the image errors", () => {
    render(<PreviewImage src="https://example.com/missing.png" alt="hi" data-testid="img" />);
    const img = screen.getByAltText("hi") as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
  });

  it("can render the alt text instead of the 'no image' label", () => {
    render(<PreviewImage alt="Logo of Acme" showAltOnFallback />);
    expect(screen.getByText("Logo of Acme")).toBeInTheDocument();
  });
});
