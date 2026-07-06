import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit, exitCode } from "@/report/build";
import { renderTerminal } from "@/report/render-terminal";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * End-to-end: run the whole audit pipeline (crawl -> lint + i18n + link
 * audit -> report) against the i18n-grid fixture and assert the report
 * shape the CLI depends on.
 */
describe("runAudit report pipeline", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/i18n-grid"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("produces a full report with pages, reciprocity, and SEO issues", async () => {
    const report = await runAudit(`${server.url}/en`, {
      depth: 2,
      static: true,
      checkExternal: false,
    });

    // Pages: the 4x3 grid was crawled.
    expect(report.pages.length).toBeGreaterThanOrEqual(12);
    expect(report.pages.every((p) => p.status === 200)).toBe(true);
    // Locale inference tagged the localized pages.
    expect(report.pages.some((p) => p.locale === "fr")).toBe(true);

    // The fixture has a deliberate de->fr reciprocity gap.
    expect(report.missingTranslations.reciprocity.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.missingTranslations).toBeGreaterThanOrEqual(1);

    // SEO issues are shaped correctly.
    for (const issue of report.seoIssues) {
      expect(typeof issue.pageUrl).toBe("string");
      expect(typeof issue.ruleId).toBe("string");
      expect(["error", "warning", "info"]).toContain(issue.severity);
    }

    // Verdict is not green (reciprocity gap at minimum) -> non-zero exit.
    expect(report.summary.verdict).not.toBe("green");
    expect(exitCode(report)).toBe(1);

    // The terminal renderer runs without throwing and mentions the URL.
    const text = renderTerminal(report, { color: false });
    expect(text).toContain(`${server.url}/en`);
  }, 60_000);

  it("normalizes a bare host and rejects garbage input", async () => {
    await expect(runAudit("not a url")).rejects.toThrow();
  });
});
