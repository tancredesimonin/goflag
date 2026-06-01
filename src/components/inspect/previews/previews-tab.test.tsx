import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreviewsTab } from "./previews-tab";
import { tancredeFull, missingImagePage, PREVIEW_PLATFORMS } from "@/lib/previews";

describe("PreviewsTab", () => {
  it("renders one tile per platform, stacked one per row", () => {
    render(<PreviewsTab page={tancredeFull} />);
    const tiles = screen.getAllByTestId("preview-tile");
    expect(tiles).toHaveLength(PREVIEW_PLATFORMS.length);
    // Every platform id has its own tile.
    for (const p of PREVIEW_PLATFORMS) {
      expect(
        tiles.some((t) => t.getAttribute("data-platform") === p.id),
        `tile for ${p.id} must exist`,
      ).toBe(true);
    }
  });

  it("renders a scroll-linked sidebar with one nav link per platform", () => {
    render(<PreviewsTab page={tancredeFull} />);
    const links = screen.getAllByTestId("previews-nav-link");
    expect(links).toHaveLength(PREVIEW_PLATFORMS.length);
    for (const p of PREVIEW_PLATFORMS) {
      expect(
        links.some((l) => l.getAttribute("data-platform") === p.id),
        `nav link for ${p.id} must exist`,
      ).toBe(true);
    }
  });

  it("'What if?' suppression of og:image visibly removes images from X / Facebook / LinkedIn", async () => {
    const user = userEvent.setup();
    render(<PreviewsTab page={tancredeFull} />);

    // Find <img> in tile by tag (decorative imgs don't carry role=img).
    const findImgIn = (platform: string): HTMLImageElement | null => {
      const tile = screen
        .getAllByTestId("preview-tile")
        .find((t) => t.getAttribute("data-platform") === platform)!;
      return tile.querySelector("img");
    };
    expect(findImgIn("facebook")).not.toBeNull();
    expect(findImgIn("linkedin")).not.toBeNull();
    expect(findImgIn("x-card-summary-large")).not.toBeNull();

    // Open the toggle drawer and flip off og:image.
    await user.click(screen.getByTestId("whatif-trigger"));
    const ogImageRow = (await screen.findAllByTestId("whatif-row")).find(
      (r) => r.getAttribute("data-key") === "meta:property=og:image",
    )!;
    await user.click(within(ogImageRow).getByTestId("whatif-toggle"));

    // X falls back to twitter:image (still has it), so it keeps an image.
    // Facebook and LinkedIn lose the image entirely.
    expect(findImgIn("facebook")).toBeNull();
    expect(findImgIn("linkedin")).toBeNull();
    expect(screen.getByTestId("previews-removed-count")).toHaveTextContent("1 suppressed");
  });

  it("Reset clears the suppression set", async () => {
    const user = userEvent.setup();
    render(<PreviewsTab page={tancredeFull} />);
    await user.click(screen.getByTestId("whatif-trigger"));
    const row = (await screen.findAllByTestId("whatif-row")).find(
      (r) => r.getAttribute("data-key") === "meta:property=og:image",
    )!;
    await user.click(within(row).getByTestId("whatif-toggle"));
    expect(screen.getByTestId("previews-removed-count")).toBeInTheDocument();

    await user.click(screen.getByTestId("previews-reset"));
    expect(screen.queryByTestId("previews-removed-count")).not.toBeInTheDocument();
  });

  it("missing-image fixture renders all tiles without crashing", () => {
    render(<PreviewsTab page={missingImagePage} />);
    expect(screen.getAllByTestId("preview-tile")).toHaveLength(PREVIEW_PLATFORMS.length);
  });
});
