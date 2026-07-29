import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * What goflag does when nothing declares the site's locales.
 *
 * Phase 1 taught the axis to come from the sitemap so a site declaring no
 * `hreflang` could still be judged. The fallback — "any leading path segment
 * shaped like a language tag" — then went too far the other way: on
 * tancrede.eu, `/cv` (a CV page, served in French) became a locale and produced
 * 31 phantom translation holes. `cv` is a registered ISO 639-1 code (Chuvash),
 * so no registry check can separate it from a real Chuvash edition; only the
 * `<html lang>` the pages actually declare can.
 *
 * The resolution is to stop guessing. With neither `--locales` nor a usable
 * sitemap, goflag reports *candidates* with their evidence and leaves the axis
 * empty — which gates every hreflang rule and every translation hole off. A
 * tool that invents a locale is worse than one that admits it does not know.
 */
describe("no declared locale axis", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    // `no-sitemap` mirrors tancrede.eu: locale-prefixed pages, a route segment
    // that looks like a locale, and no sitemap to settle the question.
    server = await startFixtureServer({ root: "fixtures/sites/no-sitemap" });
    report = await runAudit(`${server.url}/fr`, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("refuses to infer an axis and says so", () => {
    expect(report.localeAxis.source).toBe("none");
    expect(report.localeAxis.locales).toEqual([]);
    expect(report.localeAxis.multilingual).toBe(false);
  });

  it("emits no hreflang findings and no translation holes", () => {
    // Both are claims about locale coverage. Having just declined to say what
    // the locales are, making those claims anyway would contradict it.
    expect(report.siteIssues).toEqual([]);
    expect(report.missingTranslations.holes).toEqual([]);
    expect(report.summary.missingTranslations).toBe(0);
  });

  it("reports the candidates it saw, with their evidence", () => {
    const byTag = new Map(report.localeAxis.candidates?.map((c) => [c.tag, c]));

    expect(byTag.get("fr")?.isKnownLanguage).toBe(true);
    expect(byTag.get("fr")?.htmlLangAgrees).toBe(true);
    expect(byTag.get("en")?.htmlLangAgrees).toBe(true);

    // The whole point: `cv` passes the shape test and the ISO registry, and is
    // caught only by the language its pages declare.
    const cv = byTag.get("cv");
    expect(cv?.isKnownLanguage).toBe(true);
    expect(cv?.htmlLangAgrees).toBe(false);
    expect(cv?.observedLangs).toEqual(["fr"]);
  });

  it("tells the operator exactly what to pass to --locales", () => {
    const warning = report.diagnostics.warnings.find((w) => w.includes("--locales"));
    expect(warning).toBeDefined();
    expect(warning).toContain("--locales en,fr");
    expect(warning).not.toContain("cv");
  });

  it("does the job once the operator declares the axis", async () => {
    const declared = await runAudit(`${server.url}/fr`, {
      depth: 2,
      static: true,
      locales: ["en", "fr"],
    });

    expect(declared.localeAxis.source).toBe("explicit");
    expect(declared.localeAxis.multilingual).toBe(true);
    // `/cv` is no phantom locale now, so no route claims to be missing it.
    for (const hole of declared.missingTranslations.holes) {
      expect(hole.missingLocales).not.toContain("cv");
    }
  }, 60_000);
});

describe("resources that are not HTML pages", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/no-sitemap" });
    report = await runAudit(`${server.url}/fr`, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("does not lint a linked PDF as if it were a page", () => {
    // A crawl follows links, and links point at PDFs as readily as at pages.
    // Linting one yields a full set of phantom findings — no title, no
    // canonical, no viewport — and on tancrede.eu a single linked CV was the
    // only error-severity finding in the run, which is the difference between
    // a red and a yellow CI gate.
    const onPdf = report.seoIssues.filter((i) => i.pageUrl.endsWith(".pdf"));
    expect(onPdf).toEqual([]);
  });

  it("still crawls it, so the link audit can vouch for the target", () => {
    expect(report.pages.some((p) => p.url.endsWith(".pdf"))).toBe(true);
  });
});
