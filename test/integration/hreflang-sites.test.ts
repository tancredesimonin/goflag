import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * End-to-end coverage for the cross-page hreflang rules, against purpose-built
 * fake sites served over real HTTP.
 *
 * Each fixture encodes exactly one production failure we actually observed, so
 * a regression reads as "the bug came back" rather than "an assertion moved":
 *
 *   - `silent-multilingual` — four locales served, all eight URLs in the
 *     sitemap, and not one `hreflang` tag. This is the shape that made goflag
 *     report "0 missing translations" on a thoroughly broken site: with no
 *     alternates to follow, the crawler never left `/en`, so the locale axis
 *     collapsed to one column and there was nothing to compare. The audit must
 *     now reach all four locales and flag every page.
 *
 *   - `sitemap-mismatch` — the same article in four locales, listed four times
 *     in the sitemap, but every `<head>` advertises only `en` and `fr`. Two
 *     declarations of one intent, drifting apart silently.
 *
 *   - `monolingual` — a single-locale site with no hreflang, which is correct
 *     and must stay green. This is the guard rail that matters most: a rule
 *     that fires on *absence* is one bad gate away from flagging every
 *     monolingual site on earth.
 *
 * All three run in `static` mode so no Chromium boots and the suite stays fast
 * and hermetic.
 */

function siteIssuesFor(report: GoflagReport, ruleId: string) {
  return report.siteIssues.filter((issue) => issue.ruleId === ruleId);
}

describe("silent multilingual site — four locales, zero hreflang", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/silent-multilingual" });
    report = await runAudit(`${server.url}/en`, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("escapes the entry locale by seeding the crawl from the sitemap", () => {
    // The regression that matters: without sitemap seeding the crawl sees 2
    // pages (/en and /en/about, reachable by anchor), never the other three
    // locales — and every hreflang check is then vacuously satisfied.
    expect(report.diagnostics.pagesCrawled).toBe(8);
    const locales = new Set(report.pages.map((p) => p.locale));
    expect([...locales].sort()).toEqual(["en", "es", "fr", "pt-br"]);
  });

  it("derives the locale axis from the sitemap, not from the missing tags", () => {
    expect(report.localeAxis.locales).toEqual(["en", "es", "fr", "pt-br"]);
    expect(report.localeAxis.multilingual).toBe(true);
    expect(report.localeAxis.source).toBe("sitemap");
  });

  it("flags every page for declaring no alternates", () => {
    const found = siteIssuesFor(report, "hreflang.missing");
    expect(found).toHaveLength(8);
    expect(found.every((i) => i.severity === "error")).toBe(true);
  });

  it("names the locales the site actually serves in the finding", () => {
    const [first] = siteIssuesFor(report, "hreflang.missing");
    expect(first?.message).toContain("4 locales");
    expect(first?.message).toContain("en, es, fr, pt-br");
    expect(first?.message).toContain("sitemap");
  });

  it("offers a Next.js fix, not a raw <link> tag", () => {
    const [first] = siteIssuesFor(report, "hreflang.missing");
    expect(first?.fix).toContain("generateMetadata");
    expect(first?.fix).toContain("x-default");
  });

  it("does not double-report the same defect as a sitemap mismatch", () => {
    expect(siteIssuesFor(report, "hreflang.sitemap-mismatch")).toHaveLength(0);
  });

  it("turns the verdict red — this site must not pass a CI gate", () => {
    expect(report.summary.siteIssues).toBe(8);
    expect(report.summary.verdict).toBe("red");
  });

  it("reproduces the original false negative when discovery is disabled", async () => {
    // Pinning the bug itself, so nobody "simplifies" the seeding away later.
    // With `--no-sitemap` the crawler is back to following links only: no
    // alternates exist to point at /fr, /es or /pt-br, so it never leaves the
    // entry locale, the site looks monolingual, and every hreflang rule is
    // gated off. Zero findings on a site with four locales and no hreflang —
    // the reassuring kind of wrong.
    const blind = await runAudit(`${server.url}/en`, {
      depth: 2,
      static: true,
      noSitemap: true,
    });

    expect(blind.diagnostics.pagesCrawled).toBe(2);
    expect(blind.localeAxis.multilingual).toBe(false);
    expect(blind.siteIssues).toEqual([]);
    expect(blind.summary.missingTranslations).toBe(0);
  }, 60_000);
});

describe("sitemap mismatch site — head declares fewer locales than the sitemap", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/sitemap-mismatch" });
    report = await runAudit(`${server.url}/en/post`, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("flags each page whose <head> under-declares the sitemap's locales", () => {
    const onPost = siteIssuesFor(report, "hreflang.sitemap-mismatch").filter((i) =>
      i.pageUrl.endsWith("/post"),
    );
    expect(onPost).toHaveLength(4);
    expect(onPost.every((i) => i.severity === "warning")).toBe(true);
  });

  it("names the route and the specific locales that are missing", () => {
    const [first] = siteIssuesFor(report, "hreflang.sitemap-mismatch").filter((i) =>
      i.pageUrl.endsWith("/post"),
    );
    expect(first?.message).toContain("`/post`");
    expect(first?.message).toContain("es, pt-br");
    expect(first?.message).toContain("the sitemap lists");
  });

  it("also catches the opposite drift: a <head> advertising locales the sitemap lacks", () => {
    // `/solo` exists in four locales and says so, but only `/en/solo` is in the
    // sitemap. Google treats alternates pointing at URLs the site itself does
    // not list as a broken cluster, so this direction matters as much as the
    // under-declaring one.
    const onSolo = siteIssuesFor(report, "hreflang.sitemap-mismatch").filter((i) =>
      i.pageUrl.endsWith("/solo"),
    );
    expect(onSolo).toHaveLength(4);
    expect(onSolo[0]?.message).toContain("`/solo`");
    expect(onSolo[0]?.message).toContain("the `<head>` advertises es, fr, pt-br");
    expect(onSolo[0]?.message).toContain("the sitemap has no entry");
  });

  it("stays silent on hreflang.missing — these pages do declare alternates", () => {
    expect(siteIssuesFor(report, "hreflang.missing")).toHaveLength(0);
  });

  it("is yellow, not red: an incomplete cluster is weaker than none at all", () => {
    expect(report.summary.verdict).toBe("yellow");
  });
});

describe("monolingual site — no hreflang, and none required", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/monolingual" });
    report = await runAudit(server.url, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("does not consider the site multilingual", () => {
    expect(report.localeAxis.multilingual).toBe(false);
    expect(report.localeAxis.locales).toEqual([]);
  });

  it("emits no hreflang findings whatsoever", () => {
    expect(report.siteIssues).toEqual([]);
    expect(report.summary.siteIssues).toBe(0);
  });

  it("reports no translation holes", () => {
    expect(report.missingTranslations.holes).toEqual([]);
    expect(report.summary.missingTranslations).toBe(0);
  });
});

describe("--locales declares a locale the site does not serve yet", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/silent-multilingual" });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("adds the locale to the axis and turns every route into a hole", async () => {
    // Being told is the strongest signal there is: the site serves four
    // locales and the sitemap agrees, but the operator knows `de` is meant to
    // exist. Forcing it onto the axis is what makes the gap visible — an
    // absent column cannot be inferred from a site that never mentions it.
    const report = await runAudit(`${server.url}/en`, {
      depth: 2,
      static: true,
      locales: ["en", "fr", "es", "pt-br", "de"],
    });

    expect(report.localeAxis.source).toBe("explicit");
    expect(report.localeAxis.locales).toEqual(["de", "en", "es", "fr", "pt-br"]);

    // Both routes (`/` and `/about`) exist in four locales and lack `de`.
    const holes = report.missingTranslations.holes;
    expect(holes).toHaveLength(2);
    for (const hole of holes) {
      expect(hole.missingLocales).toEqual(["de"]);
      expect(hole.presentLocales.sort()).toEqual(["en", "es", "fr", "pt-br"]);
    }
  }, 60_000);
});
