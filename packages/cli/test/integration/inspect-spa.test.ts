import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { inspect } from "../../src/lib/core/inspect";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * Real-Chromium integration tests for Phase 2.
 *
 * These confirm the headless extractor + auto-escalation actually work
 * end-to-end against a fixture SPA whose <head> is built at runtime by JS.
 *
 * The tests need the Chromium binary that ships with Playwright. Locally
 * they auto-skip when the binary is absent (so contributors don't have to
 * download ~150 MB to run unit tests). In CI they run inside the Playwright
 * image where Chromium is preinstalled (see .gitlab-ci.yml `test:integration`
 * job).
 */
const chromiumAvailable = (() => {
  try {
    const path = chromium.executablePath();
    return typeof path === "string" && path.length > 0 && existsSync(path);
  } catch {
    return false;
  }
})();

const itIfChromium = chromiumAvailable ? it : it.skip;

describe("inspect against an SPA fixture (real Chromium)", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/spa"),
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("static-only mode sees the unhydrated SPA shell", async () => {
    const page = await inspect(`${server.url}/`, { mode: "static", probes: false });
    expect(page.extractor.mode).toBe("static");
    expect(page.extractor.escalated).toBe(false);
    // Placeholder title from the bundle, no description, no OG, no JSON-LD.
    expect(page.raw.title?.toLowerCase()).toBe("react app");
    expect(page.meta.description).toBeUndefined();
    expect(page.openGraph.title).toBeUndefined();
    expect(page.jsonLd).toHaveLength(0);
    expect(page.links.alternates).toHaveLength(0);
  });

  itIfChromium(
    "auto mode boots Chromium and captures the hydrated metadata",
    async () => {
      const page = await inspect(`${server.url}/`, { probes: false });
      expect(page.extractor.mode).toBe("headless");
      expect(page.extractor.escalated).toBe(true);
      expect(page.extractor.escalationReason).toMatch(/placeholder title|no og:\*/);

      // Hydrated DOM is now reflected in the parsed views.
      expect(page.raw.title).toBe("Tancrede SPA — Hydrated");
      expect(page.raw.htmlLang).toBe("fr");
      expect(page.meta.description?.value).toContain("built at runtime");
      expect(page.openGraph.title?.value).toContain("Hydrated");
      expect(page.openGraph.images).toHaveLength(1);
      expect(page.openGraph.images[0]?.url.value).toBe("https://example.test/og.png");
      expect(page.twitter.card?.value).toBe("summary_large_image");
      expect(page.links.alternates.map((a) => a.hreflang).sort()).toEqual([
        "en",
        "fr",
        "x-default",
      ]);
      expect(page.jsonLd).toHaveLength(1);
      expect(page.jsonLd[0]?.types).toContain("WebSite");

      // Both HTML strings are kept on the Page for downstream tooling.
      expect(page.html.static).toContain("React App");
      expect(page.html.rendered).toContain("Tancrede SPA — Hydrated");
    },
    60_000,
  );

  itIfChromium(
    "hydration delta marks injected meta tags as client-rendered",
    async () => {
      const page = await inspect(`${server.url}/`, { probes: false });
      expect(page.hydration).toBeDefined();
      const delta = page.hydration!;
      expect(delta.titleChanged).toBe(true);
      expect(delta.htmlLangChanged).toBe(true);
      expect(delta.jsonLdBlocksAdded).toBe(1);
      const injectedProperties = delta.clientInjectedMetas
        .map((m) => m.property ?? m.name ?? "")
        .filter(Boolean);
      expect(injectedProperties).toContain("og:title");
      expect(injectedProperties).toContain("og:image");
      expect(injectedProperties).toContain("twitter:card");
      const injectedRels = delta.clientInjectedLinks.map((l) => l.rel);
      expect(injectedRels).toContain("canonical");
      expect(injectedRels.filter((r) => r === "alternate").length).toBeGreaterThanOrEqual(2);
    },
    60_000,
  );

  itIfChromium(
    "forced --headless mode skips the static fetch entirely (html.static is empty)",
    async () => {
      const page = await inspect(`${server.url}/`, { mode: "headless", probes: false });
      expect(page.extractor.mode).toBe("headless");
      expect(page.extractor.escalated).toBe(false);
      expect(page.html.static).toBe("");
      expect(page.html.rendered).toContain("Tancrede SPA — Hydrated");
      // No hydration delta: there was no static pass to compare against.
      expect(page.hydration).toBeUndefined();
    },
    60_000,
  );
});
