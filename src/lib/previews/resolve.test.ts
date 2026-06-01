import { describe, expect, it } from "vitest";
import { PREVIEW_PLATFORMS, resolvePreview, type PreviewPlatform } from "./index";
import { tancredeFull, minimalPage, missingImagePage } from "./fixtures";

describe("resolvePreview", () => {
  it.each(PREVIEW_PLATFORMS.map((p) => p.id))(
    "%s: returns deterministic data on the full fixture",
    (platform) => {
      const data = resolvePreview(platform, tancredeFull);
      expect(data.platform).toBe(platform);
      expect(data.title.value).toBeTruthy();
      expect(data.url.value).toBe("https://tancrede.dev/");
      // Every platform consumes _something_.
      expect(data.consumed.length).toBeGreaterThan(0);
    },
  );

  describe("Google SERP", () => {
    it("prefers <title> over og:title and meta description over og:description", () => {
      const data = resolvePreview("google-serp-desktop", tancredeFull);
      expect(data.title.source?.key).toBe("title");
      expect(data.description.source?.key).toBe("meta:name=description");
      // No image on SERP.
      expect(data.image.value).toBeUndefined();
    });

    it("falls back to og:title when <title> is suppressed", () => {
      const removed = new Set(["title"]);
      const data = resolvePreview("google-serp-desktop", tancredeFull, { removed });
      expect(data.title.source?.key).toBe("meta:property=og:title");
      // Fallback chain records the skipped step.
      expect(data.title.fallbackChain[0]?.value).toBeUndefined();
      expect(data.title.fallbackChain[0]?.source.key).toBe("title");
    });

    it("mobile variant truncates differently from desktop (uses up to 70 chars)", () => {
      const desktop = resolvePreview("google-serp-desktop", tancredeFull);
      const mobile = resolvePreview("google-serp-mobile", tancredeFull);
      expect(mobile.title.value).toBe(desktop.title.value); // raw value identical
    });

    it("uses the canonical URL when available, otherwise og:url, otherwise the final URL", () => {
      const data = resolvePreview("google-serp-desktop", tancredeFull);
      expect(data.url.source?.key).toBe("link:rel=canonical");

      const noCanonical = resolvePreview("google-serp-desktop", tancredeFull, {
        removed: new Set(["link:rel=canonical"]),
      });
      expect(noCanonical.url.source?.key).toBe("meta:property=og:url");

      const noCanonicalNoOg = resolvePreview("google-serp-desktop", tancredeFull, {
        removed: new Set(["link:rel=canonical", "meta:property=og:url"]),
      });
      expect(noCanonicalNoOg.url.source?.key).toBe("computed:final-url");
    });
  });

  describe("X cards", () => {
    it("twitter:title beats og:title beats <title>", () => {
      const data = resolvePreview("x-card-summary-large", tancredeFull);
      expect(data.title.source?.key).toBe("meta:name=twitter:title");
      const noTw = resolvePreview("x-card-summary-large", tancredeFull, {
        removed: new Set(["meta:name=twitter:title"]),
      });
      expect(noTw.title.source?.key).toBe("meta:property=og:title");
      const onlyDoc = resolvePreview("x-card-summary-large", tancredeFull, {
        removed: new Set(["meta:name=twitter:title", "meta:property=og:title"]),
      });
      expect(onlyDoc.title.source?.key).toBe("title");
    });

    it("uses twitter:image when present, falls back to og:image", () => {
      const data = resolvePreview("x-card-summary-large", tancredeFull);
      expect(data.image.source?.key).toBe("meta:name=twitter:image");
      const noTw = resolvePreview("x-card-summary-large", tancredeFull, {
        removed: new Set(["meta:name=twitter:image"]),
      });
      expect(noTw.image.source?.key).toBe("meta:property=og:image");
    });

    it("dropping og:image also drops og:image:width/height/alt (sibling family)", () => {
      const data = resolvePreview("facebook", tancredeFull);
      expect(data.image.value?.width).toBe(1200);
      const dropped = resolvePreview("facebook", tancredeFull, {
        removed: new Set(["meta:property=og:image"]),
      });
      expect(dropped.image.value).toBeUndefined();
    });

    it("exposes twitter:card / site / creator extras", () => {
      const data = resolvePreview("x-card-summary-large", tancredeFull);
      expect(data.extras.twitterCard).toBe("summary_large_image");
      expect(data.extras.twitterSite).toBe("@tancredesim");
      expect(data.extras.twitterCreator).toBe("@tancredesim");
    });
  });

  describe("OG consumers", () => {
    it("Facebook / LinkedIn / Slack / Discord / Pinterest / WhatsApp prefer og:title over <title>", () => {
      for (const id of [
        "facebook",
        "linkedin",
        "slack",
        "discord",
        "pinterest",
        "whatsapp",
      ] as const satisfies readonly PreviewPlatform[]) {
        const data = resolvePreview(id, tancredeFull);
        expect(data.title.source?.key).toBe("meta:property=og:title");
      }
    });

    it("description chain: og:description → meta description", () => {
      const data = resolvePreview("facebook", tancredeFull);
      expect(data.description.source?.key).toBe("meta:property=og:description");
      const dropped = resolvePreview("facebook", tancredeFull, {
        removed: new Set(["meta:property=og:description"]),
      });
      expect(dropped.description.source?.key).toBe("meta:name=description");
    });

    it("Discord exposes theme-color extra", () => {
      const data = resolvePreview("discord", tancredeFull);
      expect(data.extras.themeColor).toBe("#0b1020");
    });
  });

  describe("iMessage favicon fallback", () => {
    it("falls back to favicon when og:image is missing", () => {
      const data = resolvePreview("imessage", missingImagePage);
      expect(data.image.value?.url).toBe(data.favicon.value);
    });

    it("uses the og:image when one is declared", () => {
      const data = resolvePreview("imessage", tancredeFull);
      expect(data.image.value?.url).toBe("https://tancrede.dev/og.png");
    });
  });

  describe("Minimal fixture (no OG, no Twitter)", () => {
    it("Google SERP renders title + description from <title> + meta description only", () => {
      const data = resolvePreview("google-serp-desktop", minimalPage);
      expect(data.title.value).toBe("Cheap coffee mugs — Example");
      expect(data.description.source?.key).toBe("meta:name=description");
    });

    it("Facebook lands on <title> after og:title falls through", () => {
      const data = resolvePreview("facebook", minimalPage);
      expect(data.title.source?.key).toBe("title");
      expect(data.image.value).toBeUndefined();
    });

    it("X card falls all the way to <title> for the title field", () => {
      const data = resolvePreview("x-card-summary-large", minimalPage);
      expect(data.title.source?.key).toBe("title");
    });
  });

  describe("Favicon picking", () => {
    it("apple-touch-icon wins over plain icon when present", () => {
      const data = resolvePreview("google-serp-desktop", tancredeFull);
      expect(data.favicon.source?.key).toBe("link:rel=apple-touch-icon");
    });

    it("falls back to the largest <link rel=icon> when apple-touch-icon is suppressed", () => {
      const data = resolvePreview("google-serp-desktop", tancredeFull, {
        removed: new Set(["link:rel=apple-touch-icon"]),
      });
      expect(data.favicon.source?.key).toBe("link:rel=icon");
    });

    it("falls back to /favicon.ico convention when no link tags survive", () => {
      const data = resolvePreview("google-serp-desktop", tancredeFull, {
        removed: new Set(["link:rel=apple-touch-icon", "link:rel=icon"]),
      });
      expect(data.favicon.value).toContain("/favicon.ico");
      expect(data.favicon.source?.key).toBe("computed:favicon-fallback");
    });

    it("resolves a relative apple-touch-icon href against the final URL", () => {
      // tancredeFull declares href="/apple-touch-icon.png" with finalUrl
      // https://tancrede.dev/. The preview <img> must point at the inspected
      // origin, not the headlint app, so the URL has to be absolute.
      const data = resolvePreview("google-serp-desktop", tancredeFull);
      expect(data.favicon.value).toBe("https://tancrede.dev/apple-touch-icon.png");
    });

    it("resolves a relative <link rel=icon> href against the final URL", () => {
      const data = resolvePreview("google-serp-desktop", tancredeFull, {
        removed: new Set(["link:rel=apple-touch-icon"]),
      });
      expect(data.favicon.value).toBe("https://tancrede.dev/favicon.ico");
    });
  });
});
