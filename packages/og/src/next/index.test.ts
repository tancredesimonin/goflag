import { describe, expect, it, vi } from "vitest";

import { defineOg } from "../card.js";
import { ogCatchAllRoute, ogIcon, ogImage } from "./index.js";

/**
 * The binding, and the one thing only the binding can prove.
 *
 * Most of what is asserted here is decision rather than rendering: that the
 * loader is read once per export, that the alt reaches the metadata, that a
 * slug nobody declared gets a 404 rather than a card carrying someone else's
 * text. But `renders a real PNG` is the claim `docs/og-plan.md` §4.2 makes for
 * the whole design — a card goes through satori **in vitest, with no Next build
 * anywhere**, which is what makes per-locale snapshots possible at all. If the
 * core ever emitted a tree satori will not take, this is where it shows.
 */

const og = defineOg({
  name: "goflag",
  tokens: {
    bg: "#121416",
    fg: "#d8dbde",
    dim: "#7d8185",
    border: "#26292d",
    accent: "#00d492",
  },
  fit: { steps: [{ upTo: 32, fontSize: 72 }], smallest: 44 },
});

describe("ogImage", () => {
  it("carries the loader's alt into the one metadata entry", async () => {
    const image = ogImage(og, async ({ params }: { params: Promise<{ locale: string }> }) => {
      const { locale } = await params;

      return { title: "Changelog", alt: `Une carte goflag, en ${locale}` };
    });

    await expect(
      image.generateImageMetadata({ params: Promise.resolve({ locale: "fr" }) }),
    ).resolves.toEqual([
      {
        id: "og",
        size: { width: 1200, height: 630 },
        contentType: "image/png",
        alt: "Une carte goflag, en fr",
      },
    ]);
  });

  it("builds no card for the metadata — the sentence is all it wanted", () => {
    // A route renders twice per build as it is (once per export). Rendering the
    // tree a third time, to read a field the loader already returned, is the
    // waste this is written against.
    const card = vi.spyOn(og, "card");
    const image = ogImage(og, () => ({ title: "Changelog", alt: "…" }));

    void image.generateImageMetadata({ params: Promise.resolve({}) });

    expect(card).not.toHaveBeenCalled();
    card.mockRestore();
  });

  it("leaves `alt` undefined when the site supplied none, rather than inventing one", async () => {
    const image = ogImage(og, () => ({ title: "Changelog" }));
    const [entry] = await image.generateImageMetadata({ params: Promise.resolve({}) });

    expect(entry?.alt).toBeUndefined();
  });

  it("renders a real PNG, in vitest, with no Next build anywhere", async () => {
    const image = ogImage(og, () => ({
      title: "Votre page est parfaite. Google ne la voit plus.",
      subtitle: "Une carte, quatre locales, aucun build de framework.",
      label: "changelog",
    }));

    const response = await image.render({ params: Promise.resolve({}) });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toBe("image/png");
    // The PNG signature. Anything else means satori refused the tree.
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 30_000);
});

describe("ogIcon", () => {
  it("declares the square Next expects, and renders it", async () => {
    const icon = ogIcon(og, 180);

    expect(icon.size).toEqual({ width: 180, height: 180 });
    expect(icon.contentType).toBe("image/png");
    expect(icon.render().headers.get("content-type")).toBe("image/png");
  });
});

describe("ogCatchAllRoute", () => {
  const entries = [{ slug: "ci/baseline" }, { slug: "quickstart" }];
  const route = ogCatchAllRoute(og, {
    entries,
    slugOf: (entry) => entry.slug,
    card: (entry) => ({ title: entry.slug }),
  });

  it("splits each slug into the segments the catch-all expects", () => {
    expect(route.generateStaticParams()).toEqual([
      { slug: ["ci", "baseline"] },
      { slug: ["quickstart"] },
    ]);
  });

  it("404s on a slug the collection does not hold", async () => {
    // The reason the slug is looked up rather than read off the request: this
    // must not become a renderer for arbitrary text on the site's own card.
    const response = await route.GET(new Request("https://goflag.tech/og/docs/nope"), {
      params: Promise.resolve({ slug: ["nope"] }),
    });

    expect(response.status).toBe(404);
  });
});
