/**
 * Per-platform render tests. The grid is intentionally exhaustive — Phase
 * 4.16 of PLAN.md requires _every_ preview to render with three fixture
 * inputs (full / minimal / missing-image) and surface its fallback
 * decision through the footer.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  FIXTURE_NAMES,
  FIXTURE_PAGES,
  PREVIEW_COMPONENTS,
  PREVIEW_PLATFORMS,
  resolvePreview,
  type FixtureName,
  type PreviewPlatform,
} from "./index";

const cases: Array<{ platform: PreviewPlatform; name: string; fixture: FixtureName }> =
  PREVIEW_PLATFORMS.flatMap((p) =>
    FIXTURE_NAMES.map((fixture) => ({
      platform: p.id,
      name: p.name,
      fixture,
    })),
  );

describe("preview components × fixtures", () => {
  it.each(cases)("$name renders against the $fixture fixture", ({ platform, fixture }) => {
    const Comp = PREVIEW_COMPONENTS[platform];
    const page = FIXTURE_PAGES[fixture];
    const data = resolvePreview(platform, page);

    const { container } = render(<Comp data={data} page={page} />);

    // Card chrome must be present.
    const card = container.querySelector('[data-testid="preview-card"]');
    expect(card, `card chrome for ${platform}/${fixture}`).not.toBeNull();

    // Footer must be present and readable.
    expect(screen.getByTestId("preview-footer")).toBeInTheDocument();

    // Either a title is rendered (full / minimal) or the placeholder shows.
    if (data.title.value) {
      expect(card?.textContent ?? "").toContain(data.title.value.slice(0, 10));
    }

    // Image-bearing platforms either render an <img> or the fallback tile.
    if (
      platform !== "google-serp-desktop" &&
      platform !== "google-serp-mobile" &&
      data.image.value
    ) {
      // Query by tag rather than role: decorative <img alt=""> (e.g. the
      // iMessage favicon bubble) gets role="presentation" per ARIA.
      const imgs = (card as HTMLElement).querySelectorAll("img");
      expect(imgs.length).toBeGreaterThan(0);
    }
  });

  it("LinkedIn warns when the image isn't 1.91:1", () => {
    const page = FIXTURE_PAGES.full;
    const data = resolvePreview("linkedin", page);
    // Force a non-conforming ratio.
    const munged = {
      ...data,
      image: {
        ...data.image,
        value: data.image.value
          ? { ...data.image.value, width: 100, height: 100, ratio: 1 }
          : undefined,
      },
    };
    const Comp = PREVIEW_COMPONENTS.linkedin;
    render(<Comp data={munged} page={page} />);
    expect(screen.getByTestId("linkedin-warn-ratio")).toBeInTheDocument();
  });

  it("iMessage shows the compact (favicon) bubble when og:image is missing", () => {
    const page = FIXTURE_PAGES["missing-image"];
    const data = resolvePreview("imessage", page);
    const Comp = PREVIEW_COMPONENTS.imessage;
    const { container } = render(<Comp data={data} page={page} />);
    // Image source equals favicon source — that's how the resolver flags it.
    expect(data.image.value?.url).toBe(data.favicon.value);
    // Compact bubble has the <img> sibling to the title row.
    expect(container.querySelector('[data-testid="imessage-title"]')).not.toBeNull();
  });

  it("Discord uses the theme-color as the accent stripe", () => {
    const page = FIXTURE_PAGES.full;
    const data = resolvePreview("discord", page);
    const Comp = PREVIEW_COMPONENTS.discord;
    render(<Comp data={data} page={page} />);
    const accent = screen.getByTestId("discord-accent") as HTMLDivElement;
    expect(accent.style.background).toBe("rgb(11, 16, 32)");
  });
});
