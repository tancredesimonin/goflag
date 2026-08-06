import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROSE_RULES } from "@/lib/rules/prose";
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

  it("honors --profile end-to-end: records it, and spec-only drops heuristics", async () => {
    const options = { depth: 1, static: true, checkExternal: false } as const;
    const [byDefault, specOnly, strict] = await Promise.all([
      runAudit(`${server.url}/en`, options),
      runAudit(`${server.url}/en`, { ...options, profile: "spec-only" }),
      runAudit(`${server.url}/en`, { ...options, profile: "strict" }),
    ]);

    // The report says which policy judged it — a baseline captured under one
    // profile is not comparable to one captured under another.
    expect(byDefault.profile).toBe("default");
    expect(specOnly.profile).toBe("spec-only");

    // Heuristic rules are absent from the spec-only run, not merely quieter.
    const heuristicIds = ["title.length", "description.length"];
    expect(specOnly.seoIssues.filter((i) => heuristicIds.includes(i.ruleId))).toEqual([]);

    // Same observations either way: strict only re-labels severity, so it can
    // never surface a finding `default` did not also see.
    expect(strict.seoIssues.map((i) => `${i.pageUrl} ${i.ruleId}`).sort()).toEqual(
      byDefault.seoIssues.map((i) => `${i.pageUrl} ${i.ruleId}`).sort(),
    );
    expect(strict.seoIssues.some((i) => i.severity === "error")).toBe(true);

    // A non-default profile is named in the terminal output; the default is not.
    expect(renderTerminal(specOnly, { color: false })).toContain("profile spec-only");
    expect(renderTerminal(byDefault, { color: false })).not.toContain("profile");
  }, 60_000);

  it("emits conformance and advisories only when asked, and neither touches the gate", async () => {
    const options = { depth: 1, static: true, checkExternal: false } as const;
    const [plain, full] = await Promise.all([
      runAudit(`${server.url}/en`, options),
      runAudit(`${server.url}/en`, { ...options, conformance: true, advisories: true }),
    ]);

    // Absent, not empty: an empty array would claim goflag had looked and
    // found nothing to ask about.
    expect(plain.conformance).toBeUndefined();
    expect(plain.advisories).toBeUndefined();

    // The matrix covers the *linted* pages, which is a subset of the crawled
    // ones — unreachable pages and non-HTML resources never reach the rule
    // layer. `pages.length` is the denominator, and it must be the only one.
    const judged = full.conformance!.pages.length;
    expect(judged).toBeGreaterThan(0);
    expect(judged).toBeLessThanOrEqual(full.pages.length);
    const healthy = new Set(full.pages.filter((p) => p.status === 200).map((p) => p.url));
    for (const page of full.conformance!.pages) {
      expect(healthy.has(page.url), `${page.url} was judged but is not a healthy page`).toBe(true);
      // Every rule answers on every judged page, passing ones included.
      expect(Object.keys(page.statuses).length).toBe(full.conformance!.rules.length);
    }
    for (const rule of full.conformance!.rules) {
      const { pass, fail, warn, na, crashed } = rule.totals;
      expect(pass + fail + warn + na + crashed, rule.ruleId).toBe(judged);
    }
    // A rule that passes everywhere is visible here and absent from seoIssues.
    const clean = full.conformance!.rules.filter((r) => r.totals.pass === judged);
    expect(clean.length).toBeGreaterThan(0);
    expect(full.seoIssues.map((i) => i.ruleId)).not.toContain(clean[0]!.ruleId);

    // Advisories are asked only where the subject exists. Every fixture page
    // has a title and a lang; none has a description or an og:image, and
    // those gaps are already deterministic findings — so exactly two of the
    // four prose rules apply, on every page.
    const askedPerPage = new Map<string, string[]>();
    for (const advisory of full.advisories!) {
      askedPerPage.set(advisory.pageUrl, [
        ...(askedPerPage.get(advisory.pageUrl) ?? []),
        advisory.ruleId,
      ]);
    }
    expect(askedPerPage.size).toBe(judged);
    for (const [, asked] of askedPerPage) {
      expect(asked.sort()).toEqual(["lang.matches-content", "title.descriptive"]);
    }
    expect(full.advisories!.length).toBeLessThan(PROSE_RULES.length * judged);

    for (const advisory of full.advisories!) {
      expect(advisory.verdict).toBe("needs-judgment");
      expect(advisory.id).toMatch(/^advisory-[0-9a-f]+$/);
      expect(Object.keys(advisory.evidence).length).toBeGreaterThan(0);
    }
    // Distinct per (rule, page), so a judgment can be recorded against one.
    expect(new Set(full.advisories!.map((a) => a.id)).size).toBe(full.advisories!.length);

    // Neither section changes what the run concluded or how it exits.
    expect(full.summary).toEqual(plain.summary);
    expect(exitCode(full)).toBe(exitCode(plain));
  }, 60_000);

  it("rejects an unknown profile before crawling", async () => {
    await expect(runAudit(`${server.url}/en`, { profile: "stcirt" })).rejects.toThrow(
      /unknown profile/,
    );
  });
});
