import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runLinkAudit } from "../../src/lib/core/links/audit";
import type { SiteDiscovery } from "../../src/lib/core/sitemap/types";
import { emptyVerdictSummary } from "../../src/lib/core/links/types";
import { startAuditFixtureServer, type AuditFixtureServer } from "../audit-fixture-server";

const noSleep = () => Promise.resolve();

/**
 * End-to-end link audit against the programmable fixture server (no
 * mocks). Two servers boot: `external` stands in for off-origin hosts so
 * external-link probes stay local and hermetic.
 */
describe("runLinkAudit — end to end", () => {
  let site: AuditFixtureServer;
  let external: AuditFixtureServer;

  beforeAll(async () => {
    external = await startAuditFixtureServer();
    site = await startAuditFixtureServer({ externalOrigin: external.url });
  });
  afterAll(async () => {
    await site.stop();
    await external.stop();
  });

  function discovery(paths: string[]): SiteDiscovery {
    return {
      origin: site.url,
      baseUrl: site.url,
      source: "crawl",
      urls: paths.map((p) => ({ loc: `${site.url}${p}` })),
      diagnostics: {
        found: false,
        status: 0,
        declaredInRobots: false,
        robotsFound: false,
        atWellKnownPath: false,
        wellFormed: false,
        isIndex: false,
        childSitemapCount: 0,
        childSitemapErrors: 0,
        urlCount: paths.length,
        warnings: [],
      },
      truncated: false,
    };
  }

  it("scans pages, dedupes link targets, and maps broken links back per page", async () => {
    const report = await runLinkAudit(discovery(["/", "/about", "/blog"]), { sleep: noSleep });

    expect(report.pagesScanned).toBe(3);

    // "/missing" is linked from both "/" and "/blog" but checked once.
    const missingUrl = `${site.url}/missing`;
    expect(report.checks[missingUrl]?.verdict).toBe("broken");
    const missingOccurrences = report.occurrences.filter((o) => o.ref.url === missingUrl);
    expect(missingOccurrences.length).toBeGreaterThanOrEqual(2);

    // External link resolved against the second (local) server → ok.
    expect(report.checks[`${external.url}/`]?.verdict).toBe("ok");

    // mailto is reported but skipped (no network).
    const mailto = Object.values(report.checks).find((c) => c.url.startsWith("mailto:"));
    expect(mailto?.verdict).toBe("skipped");

    // Summary tally is internally consistent.
    const recomputed = emptyVerdictSummary();
    for (const c of Object.values(report.checks)) recomputed[c.verdict] += 1;
    expect(report.summary).toEqual(recomputed);
    expect(report.summary.broken).toBeGreaterThanOrEqual(2); // /missing + /server-error

    // brokenByPage groups the dead links under the pages that link them.
    const homeRow = report.brokenByPage.find((r) => r.pageUrl === `${site.url}/`);
    expect(homeRow?.broken.some((c) => c.url === missingUrl)).toBe(true);
  });

  it("checks assets when includeAssets is set", async () => {
    const without = await runLinkAudit(discovery(["/"]), { sleep: noSleep });
    expect(without.checks[`${site.url}/logo.png`]).toBeUndefined();

    const withAssets = await runLinkAudit(discovery(["/"]), {
      includeAssets: true,
      sleep: noSleep,
    });
    expect(withAssets.checks[`${site.url}/logo.png`]?.verdict).toBe("ok");
  });

  it("skips external probes when checkExternal is false", async () => {
    const report = await runLinkAudit(discovery(["/"]), { checkExternal: false, sleep: noSleep });
    expect(report.checks[`${external.url}/`]).toBeUndefined();
    // Internal links are still checked.
    expect(report.checks[`${site.url}/about`]?.verdict).toBe("ok");
  });

  it("truncates when maxPages is exceeded", async () => {
    const report = await runLinkAudit(discovery(["/", "/about", "/blog", "/contact"]), {
      maxPages: 2,
      sleep: noSleep,
    });
    expect(report.pagesScanned).toBe(2);
    expect(report.truncated).toBe(true);
    expect(report.diagnostics.warnings.join(" ")).toMatch(/only the first 2/);
  });

  it("truncates when maxLinks is exceeded", async () => {
    const report = await runLinkAudit(discovery(["/", "/about", "/blog"]), {
      maxLinks: 2,
      sleep: noSleep,
    });
    expect(Object.keys(report.checks).length).toBeLessThanOrEqual(2);
    expect(report.truncated).toBe(true);
  });

  it("records page failures without aborting the audit", async () => {
    const report = await runLinkAudit(discovery(["/", "/missing"]), { sleep: noSleep });
    // "/missing" returns 404 → counted as a failed page, "/" still scanned.
    expect(report.diagnostics.pagesFailed).toBe(1);
    expect(report.pagesScanned).toBe(1);
  });

  it("honours an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const report = await runLinkAudit(discovery(["/", "/about", "/blog"]), {
      signal: controller.signal,
      sleep: noSleep,
    });
    expect(report.pagesScanned).toBe(0);
    expect(Object.keys(report.checks)).toHaveLength(0);
  });
});
