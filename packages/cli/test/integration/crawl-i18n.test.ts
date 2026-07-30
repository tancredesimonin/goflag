import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crawl } from "@/lib/core/crawl";
import { buildI18nMatrix, reciprocityIssues } from "@/lib/core/i18n";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * Phase 7 integration: real fetch path against the i18n-grid fixture.
 *
 * The fixture is 4 locales × 3 routes = 12 pages (plus the root
 * index). Every page declares the full hreflang grid except for one
 * deliberate gap on `/de/blog/post` (no back link to `/fr/blog/post`)
 * which exercises the reciprocity rule.
 */
describe("crawl + i18n matrix integration", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/i18n-grid"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("captures all 12 (locale × route) pages from a depth-2 crawl on /en", async () => {
    const result = await crawl({
      entryUrl: `${server.url}/en`,
      depth: 2,
      inspectOptions: { probes: false },
    });
    expect(result.errors).toEqual([]);

    const paths = new Set(result.pages.map((p) => new URL(p.fetch.finalUrl).pathname));
    const expected = ["en", "fr", "de", "es"].flatMap((l) => [
      `/${l}`,
      `/${l}/blog`,
      `/${l}/blog/post`,
    ]);
    for (const p of expected) expect(paths.has(p), `missing ${p}`).toBe(true);
  }, 30_000);

  it("respects --include filters by pathname (only blog posts)", async () => {
    const result = await crawl({
      entryUrl: `${server.url}/en`,
      depth: 2,
      include: ["**/blog/post"],
      inspectOptions: { probes: false },
    });
    const nonHreflangPages = result.pages.filter(
      (p) => !new URL(p.fetch.finalUrl).pathname.match(/^\/(en|fr|de|es)$/),
    );
    // Either the 4 post variants alone (when hreflang follows them
    // directly) or the entry + the 4 posts. We just assert the
    // include filter is honoured: nothing under /<locale>/blog (the
    // index page) sneaks in.
    for (const page of nonHreflangPages) {
      const path = new URL(page.fetch.finalUrl).pathname;
      const isPost = /\/(en|fr|de|es)\/blog\/post$/.test(path);
      const isLocaleHome = /^\/(en|fr|de|es)$/.test(path);
      expect(isPost || isLocaleHome, `unexpected ${path}`).toBe(true);
    }
  }, 30_000);

  it("builds a full 3×5 matrix (3 routes × 4 locales + x-default)", async () => {
    const result = await crawl({
      entryUrl: `${server.url}/en`,
      depth: 2,
      inspectOptions: { probes: false },
    });
    const matrix = buildI18nMatrix(result.pages);
    expect(matrix.routes.sort()).toEqual(["/", "/blog", "/blog/post"]);
    expect(matrix.locales).toEqual(["x-default", "de", "en", "es", "fr"]);
    for (const route of matrix.routes) {
      for (const locale of ["en", "fr", "de", "es"]) {
        expect(matrix.cells[route]?.[locale]?.url).toBeTruthy();
      }
    }
  }, 30_000);

  it("flags the de→fr missing back-link as a reciprocity error", async () => {
    const result = await crawl({
      entryUrl: `${server.url}/en`,
      depth: 2,
      inspectOptions: { probes: false },
    });
    const issues = reciprocityIssues(result.pages);
    const missing = issues.filter((i) => i.code === "missing-back-link");
    // Every other page declares /de/blog/post but /de/blog/post does
    // NOT advertise /fr/blog/post — so the reciprocity check finds
    // exactly the one /fr/blog/post → /de/blog/post pair.
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(
      missing.some(
        (i) => i.url === `${server.url}/fr/blog/post` && i.peerUrl === `${server.url}/de/blog/post`,
      ),
      `expected /fr/blog/post → /de/blog/post in ${JSON.stringify(missing)}`,
    ).toBe(true);
  }, 30_000);
});
