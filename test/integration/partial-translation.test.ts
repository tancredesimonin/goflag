import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * Routes that are deliberately not translated everywhere.
 *
 * `deriveTranslationHoles` treats every (route, locale) gap as a finding. That
 * is right when a translation was forgotten and wrong when it was never
 * intended — and from outside the two are indistinguishable, because a site has
 * no markup for "this page does not exist here on purpose". A jurisdiction-
 * specific legal notice, a locale-specific landing page, a post written for one
 * market: all legitimate, all reported as defects today.
 *
 * That matters more than a cosmetic false positive. A report that can never
 * reach zero teaches its reader to ignore it, which is exactly how a CI gate
 * dies. So intent has to be declarable — and the only party who knows it is the
 * operator.
 *
 * The fixture is honest in every observable way: `/legal` exists in `en` and
 * `fr`, both pages advertise exactly those two locales plus `x-default`, and
 * the sitemap lists exactly those two URLs. Nothing contradicts anything. The
 * only reason to call it a hole is that the tool assumed full parity.
 */
describe("partial translation — declared consistently, absent on purpose", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/partial-translation" });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  const audit = (options = {}): Promise<GoflagReport> =>
    runAudit(`${server.url}/en`, { depth: 2, static: true, ...options });

  it("finds nothing contradictory: the site declares its coverage correctly", async () => {
    const report = await audit();

    // No missing alternates, no head/sitemap disagreement — the site is
    // internally consistent. Any finding here is the tool's own assumption.
    expect(report.siteIssues).toEqual([]);
    expect(report.missingTranslations.reciprocity).toEqual([]);
  }, 60_000);

  it("still reports the gap by default — a forgotten translation looks the same", async () => {
    const report = await audit();

    const legal = report.missingTranslations.holes.find((h) => h.route === "/legal");
    expect(legal?.presentLocales.sort()).toEqual(["en", "fr"]);
    expect(legal?.missingLocales.sort()).toEqual(["es", "pt-br"]);

    // The fully-translated control route must never be a hole.
    expect(report.missingTranslations.holes.map((h) => h.route)).toEqual(["/legal"]);
  }, 60_000);

  it("drops the gap when the operator declares the route intentionally partial", async () => {
    const report = await audit({ ignoreHoles: ["/legal"] });

    expect(report.missingTranslations.holes).toEqual([]);
    expect(report.summary.missingTranslations).toBe(0);
    expect(report.summary.verdict).toBe("green");
  }, 60_000);

  it("accepts a glob so a whole family can be excluded at once", async () => {
    const report = await audit({ ignoreHoles: ["/legal/**", "/legal"] });
    expect(report.missingTranslations.holes).toEqual([]);
  }, 60_000);

  it("does not let the exclusion hide a real contradiction", async () => {
    // Suppressing a hole says "this route is deliberately partial". It must not
    // also suppress hreflang findings on that route — those describe a site
    // contradicting itself, which is never intentional.
    const report = await audit({ ignoreHoles: ["/**"] });
    expect(report.missingTranslations.holes).toEqual([]);
    expect(report.localeAxis.locales).toEqual(["en", "es", "fr", "pt-br"]);
  }, 60_000);
});
