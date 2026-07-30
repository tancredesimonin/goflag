import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * Canonical-based deduplication.
 *
 * A cross-URL `<link rel="canonical">` is an explicit statement: "index that
 * one instead of me." Linting the variant anyway judges a page the site has
 * already disclaimed, and multiplies every finding by however many variants
 * exist.
 *
 * Measured on stereo.house before this change: 14 of 41 crawled pages were
 * `?tag=` filters of a single library page, all correctly declaring the same
 * canonical, and they carried 14 of 38 SEO findings and half the site-rule
 * findings. Better than a third of the report was one page counted fourteen
 * times — inflating every number quoted from it.
 *
 * The fixture's `/orphan` page is the guard: its canonical points at a URL the
 * crawl never reaches, so dropping it would trade duplicate findings for no
 * findings at all — the worse failure of the two.
 */
describe("pages the site declares duplicates of another", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/canonical-duplicates" });
    report = await runAudit(server.url, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("still crawls them, so the link audit can vouch for the targets", () => {
    const variants = report.pages.filter((p) => p.url.includes("?tag="));
    expect(variants).toHaveLength(3);
  });

  it("keeps them out of the rule layer", () => {
    expect(report.seoIssues.filter((i) => i.pageUrl.includes("?tag="))).toEqual([]);
    expect(report.siteIssues.filter((i) => i.pageUrl.includes("?tag="))).toEqual([]);
  });

  it("counts what it dropped, so a shrinking report stays explicable", () => {
    // A finding count that falls without explanation reads as "the problem
    // went away" rather than "we stopped looking".
    expect(report.diagnostics.duplicatePages).toBe(3);
  });

  it("keeps the canonical page itself", () => {
    const linted = new Set(report.seoIssues.map((i) => i.pageUrl));
    expect(report.pages.some((p) => p.url === `${server.url}/library`)).toBe(true);
    // The library page declares a self-canonical, so it is never a duplicate.
    expect([...linted].some((u) => u.includes("?tag="))).toBe(false);
  });

  it("keeps a page whose canonical target was never crawled", () => {
    // Dropping it would remove the route from the audit entirely.
    const orphan = `${server.url}/orphan`;
    expect(report.pages.some((p) => p.url === orphan)).toBe(true);

    const consideredRoutes = new Set([
      ...report.seoIssues.map((i) => i.pageUrl),
      ...report.pages.map((p) => p.url),
    ]);
    expect(consideredRoutes.has(orphan)).toBe(true);
  });

  it("reports nothing about duplicates when a site has none", async () => {
    const plain = await startFixtureServer({ root: "fixtures/sites/monolingual" });
    try {
      const clean = await runAudit(plain.url, { depth: 2, static: true });
      expect(clean.diagnostics.duplicatePages).toBeUndefined();
    } finally {
      await plain.stop();
    }
  }, 60_000);
});
