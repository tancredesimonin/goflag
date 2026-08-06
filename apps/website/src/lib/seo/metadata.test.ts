import { describe, expect, it } from "vitest";

import { buildMetadata, clampDescription, rootRobots } from "./metadata";
import { localizedRoute, monolingualRoute } from "./routes";
import type { SiteConfig } from "./site";

const config: SiteConfig = {
  baseUrl: "https://goflag.tech",
  name: "goflag",
  locales: ["en", "fr", "es", "pt-br"],
  defaultLocale: "en",
  indexable: true,
};

const home = localizedRoute({ path: "", locales: ["en", "fr", "es", "pt-br"] });
const doc = monolingualRoute({ path: "/docs/install", locale: "en", ogType: "article" });

const content = { title: "Install goflag", description: "Two ways in, and when to pick each." };

describe("buildMetadata — localized pages", () => {
  const meta = buildMetadata(config, home, content, "fr");

  it("canonicalises to the page's own URL", () => {
    expect(meta.alternates?.canonical).toBe("https://goflag.tech/fr");
  });

  it("carries the route's cluster into alternates", () => {
    expect(meta.alternates?.languages).toMatchObject({
      fr: "https://goflag.tech/fr",
      "x-default": "https://goflag.tech/en",
    });
  });

  it("translates the app locale into the tag Open Graph wants", () => {
    // `fr`, not `fr_FR`, is what the site calls this locale; ogp.me wants the
    // other one, and the two tables are the reason `locale.invalid` exists.
    expect(meta.openGraph).toMatchObject({ locale: "fr_FR", url: "https://goflag.tech/fr" });
  });

  it("is a website unless the route says otherwise", () => {
    expect(meta.openGraph).toMatchObject({ type: "website", siteName: "goflag" });
  });

  it("sets metadataBase so relative assets resolve against the right origin", () => {
    expect(meta.metadataBase?.toString()).toBe("https://goflag.tech/");
  });

  it("leaves og:image alone — the file convention already emitted one", () => {
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(meta.twitter).not.toHaveProperty("images");
  });

  it("refuses a locale the route does not serve", () => {
    const partial = localizedRoute({ path: "/cookies", locales: ["fr"] });

    expect(() => buildMetadata(config, partial, content, "es")).toThrow(/not served in/);
  });
});

describe("buildMetadata — titles", () => {
  it("lets the root layout's template append the product name", () => {
    expect(buildMetadata(config, home, content, "en").title).toBe("Install goflag");
  });

  it("opts out of the template when the title already names the product", () => {
    const meta = buildMetadata(config, home, { ...content, absoluteTitle: true }, "en");

    expect(meta.title).toEqual({ absolute: "Install goflag" });
  });
});

describe("buildMetadata — monolingual pages", () => {
  const meta = buildMetadata(config, doc, { ...content, image: "/og/docs/install" });

  it("takes its language from the route, with no locale to be handed", () => {
    expect(meta.openGraph).toMatchObject({ locale: "en_US", type: "article" });
  });

  it("declares its own self-referential cluster", () => {
    expect(meta.alternates?.languages).toEqual({
      en: "https://goflag.tech/docs/install",
      "x-default": "https://goflag.tech/docs/install",
    });
  });

  it("names its card absolutely, since it cannot use the file convention", () => {
    const expected = [
      {
        url: "https://goflag.tech/og/docs/install",
        width: 1200,
        height: 630,
        alt: "Install goflag",
      },
    ];

    expect(meta.openGraph).toMatchObject({ images: expected });
    expect(meta.twitter).toMatchObject({ images: expected });
  });
});

describe("buildMetadata — article times", () => {
  it("carries them on an article", () => {
    const meta = buildMetadata(config, doc, { ...content, og: { modifiedTime: "2026-08-01" } });

    expect(meta.openGraph).toMatchObject({ modifiedTime: "2026-08-01" });
  });

  it("drops them on a website, which has no vocabulary for them", () => {
    const meta = buildMetadata(
      config,
      home,
      { ...content, og: { modifiedTime: "2026-08-01" } },
      "en",
    );

    expect(meta.openGraph).not.toHaveProperty("modifiedTime");
  });

  it("lets the content override the route's type, times included", () => {
    const meta = buildMetadata(
      config,
      home,
      { ...content, og: { type: "article", publishedTime: "2026-07-01" } },
      "en",
    );

    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-07-01" });
  });
});

describe("buildMetadata — the social copy", () => {
  it("falls back to the page's own title and description", () => {
    const meta = buildMetadata(config, home, content, "en");

    expect(meta.openGraph).toMatchObject({
      title: content.title,
      description: content.description,
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: content.title,
      description: content.description,
    });
  });

  it("takes an override for the unfurl without touching the page title", () => {
    const meta = buildMetadata(
      config,
      home,
      { ...content, og: { title: "Shorter, for a card" } },
      "en",
    );

    expect(meta.title).toBe(content.title);
    expect(meta.openGraph).toMatchObject({ title: "Shorter, for a card" });
  });
});

describe("rootRobots", () => {
  it("asks to be indexed only where the deployment says so", () => {
    expect(rootRobots(config)).toEqual({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
    expect(rootRobots({ ...config, indexable: false })).toEqual({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });
});

describe("clampDescription", () => {
  it("leaves text inside the window alone", () => {
    expect(clampDescription("short enough")).toBe("short enough");
  });

  it("cuts at a word boundary and marks the cut", () => {
    const clamped = clampDescription(`${"word ".repeat(40)}end`);

    expect(clamped.length).toBeLessThanOrEqual(160);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped).not.toMatch(/\s…$/);
  });

  it("cuts mid-word rather than throwing most of the text away", () => {
    // A single long token has no space past the 60 % mark; falling back to the
    // word boundary would return almost nothing.
    const clamped = clampDescription(`${"x".repeat(200)}`);

    expect(clamped).toHaveLength(160);
  });

  it("does not leave a dangling separator before the ellipsis", () => {
    expect(clampDescription(`${"a".repeat(150)} words,x`, 156)).not.toMatch(/,…$/);
  });
});
