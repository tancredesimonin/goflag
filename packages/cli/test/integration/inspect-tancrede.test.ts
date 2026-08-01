import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspect } from "../../src/lib/core/inspect";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * Real-world snapshot tests: pull tancrede pages over HTTP from the fixture
 * server (no mocks) and assert the engine produces a Page with the expected
 * shape. Mirrors the DoD bullet from PLAN.md Phase 1.
 */
describe("inspect — tancrede fixtures", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/tancrede"),
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("extracts canonical, OG, Twitter, hreflang, and icons from /fr", async () => {
    const page = await inspect(`${server.url}/fr`, { probes: false });

    expect(page.fetch.status).toBe(200);
    expect(page.fetch.contentType).toBe("text/html");
    expect(page.raw.htmlLang).toBe("fr");

    expect(page.meta.title?.value).toContain("Tancrède Simonin");
    expect(page.meta.description?.value).toBeDefined();
    expect(page.meta.canonical?.value).toBeDefined();

    expect(page.openGraph.title?.value).toContain("Tancrède Simonin");
    expect(page.openGraph.locale?.value).toBe("fr_FR");
    expect(page.openGraph.images.length).toBeGreaterThanOrEqual(1);
    const firstImage = page.openGraph.images[0];
    expect(firstImage?.width?.value).toBe(1200);
    expect(firstImage?.height?.value).toBe(630);
    expect(firstImage?.alt?.value).toBeTruthy();

    expect(page.twitter.card?.value).toBe("summary_large_image");
    expect(page.twitter.title?.value).toBeTruthy();

    const hreflangs = page.links.alternates.map((a) => a.hreflang).sort();
    expect(hreflangs).toEqual(["en", "es", "fr", "pt-br", "x-default"]);
    expect(page.links.alternates.some((a) => a.isXDefault)).toBe(true);

    expect(page.links.icons.length).toBeGreaterThanOrEqual(3);
    expect(page.links.icons.map((i) => i.rel)).toContain("icon");
  });

  it("extracts the same shape from /en (locale-equivalent route)", async () => {
    const page = await inspect(`${server.url}/en`, { probes: false });
    expect(page.openGraph.locale?.value).toBe("en_US");
    expect(page.raw.htmlLang).toBe("en");
    expect(page.links.alternates.length).toBeGreaterThanOrEqual(4);
  });

  it("inspects a real tancrede blog post and surfaces it as a Page", async () => {
    const page = await inspect(`${server.url}/blog/architecture-api-dsp2`, { probes: false });
    expect(page.fetch.status).toBe(200);
    expect(page.meta.title?.value).toBeTruthy();
    expect(page.openGraph.images.length).toBeGreaterThanOrEqual(1);
    // The frozen fixture now embeds a single Article JSON-LD block so the
    // Phase 6 structured-data tab + suggestion engine have something to
    // exercise end-to-end. The contract here only checks shape and that
    // the Article block is present — content is asserted by the
    // validator's own unit tests.
    expect(Array.isArray(page.jsonLd)).toBe(true);
    expect(page.jsonLd.flatMap((b) => b.types)).toContain("Article");
  });

  it("returns the full Page through the synthetic kitchen-sink fixture (JSON-LD path)", async () => {
    const synthetic = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/synthetic"),
    });
    try {
      const page = await inspect(`${synthetic.url}/kitchen-sink`, { probes: false });
      // Two valid + one malformed + one empty = 4 blocks total.
      expect(page.jsonLd).toHaveLength(4);
      const okBlocks = page.jsonLd.filter((b) => !b.parseError);
      expect(okBlocks).toHaveLength(2);
      const allTypes = page.jsonLd.flatMap((b) => b.types).sort();
      expect(allTypes).toEqual(["Article", "Organization", "Person", "WebSite"]);
    } finally {
      await synthetic.stop();
    }
  });

  it("surfaces 404s through fetch.status without throwing", async () => {
    const page = await inspect(`${server.url}/does-not-exist`, { probes: false });
    expect(page.fetch.status).toBe(404);
  });
});
