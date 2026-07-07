import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startDemoServer, type DemoServer } from "../demo-server";

/**
 * The flagship end-to-end test.
 *
 * Runs the whole audit pipeline against the plain-HTML demo site in
 * `fixtures/sites/demo/` (served by `demo-server.ts`) and asserts every
 * section of the `GoflagReport`. The demo site is engineered so that each
 * check has something to find:
 *
 *   - broken links:  /en/ghost (404), /x/server-error (500),
 *                    /x/forbidden (403, blocked), /x/soft (soft-404 warning)
 *   - translations:  /blog missing `de`; /pricing missing `de` + `fr`;
 *                    a de->fr hreflang reciprocity gap on /fr/about
 *   - SEO metadata:  /bad-seo (7 findings incl. robots conflict),
 *                    /relative-canonical (relative canonical), /good (clean)
 *
 * `/x/**` and `/en/ghost` are excluded from the *crawl* so they don't get
 * linted as pages — but the link auditor still re-scans the pages that link
 * to them and probes every target, so the broken-link assertions hold.
 *
 * Static mode (`static: true`) keeps the run hermetic and fast: no Chromium.
 */
describe("demo site — full audit report", () => {
  let server: DemoServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startDemoServer();
    report = await runAudit(`${server.url}/en`, {
      depth: 2,
      static: true,
      exclude: ["/x/**", "/en/ghost"],
    });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  const abs = (path: string) => `${server.url}${path}`;

  it("crawls the whole 3-locale site over http", () => {
    expect(report.diagnostics.pagesCrawled).toBe(12);
    expect(report.diagnostics.pagesScanned).toBe(12);
    expect(report.diagnostics.pagesFailed).toBe(0);
    expect(report.diagnostics.truncated).toBe(false);
    expect(report.pages.every((p) => p.status === 200)).toBe(true);

    const urls = report.pages.map((p) => p.url).sort();
    expect(urls).toEqual(
      [
        "/en",
        "/en/about",
        "/en/blog",
        "/en/pricing",
        "/fr",
        "/fr/about",
        "/fr/blog",
        "/de",
        "/de/about",
        "/good",
        "/relative-canonical",
        "/bad-seo",
      ]
        .map(abs)
        .sort(),
    );
  });

  it("infers locales from the path (null when unprefixed)", () => {
    const byUrl = new Map(report.pages.map((p) => [p.url, p.locale]));
    expect(byUrl.get(abs("/en"))).toBe("en");
    expect(byUrl.get(abs("/fr/about"))).toBe("fr");
    expect(byUrl.get(abs("/de"))).toBe("de");
    // Root-level utility pages carry no locale segment.
    expect(byUrl.get(abs("/good"))).toBeNull();
    expect(byUrl.get(abs("/bad-seo"))).toBeNull();
  });

  it("verdict is red because of broken links and SEO errors", () => {
    expect(report.summary.verdict).toBe("red");
  });

  describe("broken links", () => {
    it("summary counts only hard-broken (4xx/5xx/network) targets", () => {
      expect(report.summary.brokenLinks).toBe(2);
    });

    it("reports every non-ok link on the page that references it", () => {
      // All the deliberately-bad links live on the English home page.
      expect(report.brokenLinks.every((b) => b.pageUrl === abs("/en"))).toBe(true);

      const byHref = new Map(report.brokenLinks.map((b) => [b.href, b]));

      const ghost = byHref.get(abs("/en/ghost"));
      expect(ghost?.verdict).toBe("broken");
      expect(ghost?.status).toBe(404);

      const serverError = byHref.get(abs("/x/server-error"));
      expect(serverError?.verdict).toBe("broken");
      expect(serverError?.status).toBe(500);

      const forbidden = byHref.get(abs("/x/forbidden"));
      expect(forbidden?.verdict).toBe("blocked");
      expect(forbidden?.status).toBe(403);

      const soft404 = byHref.get(abs("/x/soft"));
      expect(soft404?.verdict).toBe("warning");

      // 4 entries total: 2 broken + 1 blocked + 1 soft-404 warning.
      expect(report.brokenLinks).toHaveLength(4);
    });

    it("does not flag good links, redirects, mailto, or fragments", () => {
      const hrefs = report.brokenLinks.map((b) => b.href);
      expect(hrefs).not.toContain(abs("/en/about")); // ok
      expect(hrefs).not.toContain(abs("/x/redirect")); // 302 -> 200, resolves
      expect(hrefs.some((h) => h.startsWith("mailto:"))).toBe(false);
    });
  });

  describe("missing translations", () => {
    it("finds routes present in some locales but not others", () => {
      const holes = report.missingTranslations.holes;
      expect(holes).toHaveLength(2);

      const blog = holes.find((h) => h.route === "/blog");
      expect(blog).toMatchObject({
        route: "/blog",
        presentLocales: ["en", "fr"],
        missingLocales: ["de"],
      });
      expect(blog?.id).toMatch(/^i18n-[0-9a-f]{10}$/);

      const pricing = holes.find((h) => h.route === "/pricing");
      expect(pricing).toMatchObject({
        route: "/pricing",
        presentLocales: ["en"],
        missingLocales: ["de", "fr"],
      });
    });

    it("does not flag fully-translated routes (/, /about)", () => {
      const routes = report.missingTranslations.holes.map((h) => h.route);
      expect(routes).not.toContain("/");
      expect(routes).not.toContain("/about");
    });

    it("detects the de->fr hreflang reciprocity gap", () => {
      const recip = report.missingTranslations.reciprocity;
      expect(recip).toHaveLength(1);
      expect(recip[0]).toMatchObject({
        code: "missing-back-link",
        url: abs("/fr/about"),
        peerUrl: abs("/de/about"),
        locale: "de",
      });
    });

    it("summary = holes + reciprocity", () => {
      expect(report.summary.missingTranslations).toBe(3);
    });
  });

  describe("SEO issues", () => {
    it("flags every problem on the bad-seo page", () => {
      const ids = report.seoIssues
        .filter((i) => i.pageUrl === abs("/bad-seo"))
        .map((i) => i.ruleId)
        .sort();
      expect(ids).toEqual(
        [
          "canonical.missing",
          "description.missing",
          "og.image.missing",
          "og.title.missing",
          "robots.conflict",
          "title.missing",
          "viewport.missing",
        ].sort(),
      );
    });

    it("flags the relative canonical as an error, and only that", () => {
      const relIssues = report.seoIssues.filter((i) => i.pageUrl === abs("/relative-canonical"));
      expect(relIssues).toHaveLength(1);
      expect(relIssues[0]?.ruleId).toBe("canonical.absolute");
      expect(relIssues[0]?.severity).toBe("error");
    });

    it("finds nothing wrong with the good page", () => {
      expect(report.seoIssues.some((i) => i.pageUrl === abs("/good"))).toBe(false);
    });

    it("does not invent SEO issues on the clean localized pages", () => {
      for (const clean of ["/en", "/fr", "/de", "/en/about", "/en/blog", "/en/pricing"]) {
        expect(report.seoIssues.some((i) => i.pageUrl === abs(clean))).toBe(false);
      }
    });

    it("total count matches the sum of the two flawed pages", () => {
      expect(report.summary.seoIssues).toBe(8);
      expect(report.seoIssues).toHaveLength(8);
    });
  });

  it("is fully JSON-serializable (the report is the source of truth)", () => {
    const roundTripped = JSON.parse(JSON.stringify(report));
    expect(roundTripped).toEqual(report);
    expect(typeof report.finishedAt).toBe("string");
    expect(new Date(report.finishedAt).toString()).not.toBe("Invalid Date");
  });

  describe("unreachable pages (non-2xx are not linted as SEO)", () => {
    let errServer: DemoServer;
    let errReport: GoflagReport;

    beforeAll(async () => {
      errServer = await startDemoServer();
      // Entry point itself returns 500: it must surface as an unreachable
      // page, NOT as six phantom "missing title/description/…" SEO findings.
      errReport = await runAudit(`${errServer.url}/x/server-error`, { depth: 0, static: true });
    }, 30_000);

    afterAll(async () => {
      await errServer.stop();
    });

    it("reports the 500 as an unreachable page", () => {
      expect(errReport.unreachablePages).toHaveLength(1);
      expect(errReport.unreachablePages[0]?.status).toBe(500);
      expect(errReport.unreachablePages[0]?.id).toMatch(/^page-[0-9a-f]{10}$/);
      expect(errReport.summary.unreachablePages).toBe(1);
    });

    it("does not emit phantom SEO findings for the error page", () => {
      expect(errReport.seoIssues).toHaveLength(0);
    });

    it("flags the run red (an errored page is a hard failure)", () => {
      expect(errReport.summary.verdict).toBe("red");
    });
  });

  describe("finding fingerprints", () => {
    it("stamps every finding with a stable, category-prefixed id", () => {
      for (const link of report.brokenLinks) expect(link.id).toMatch(/^link-[0-9a-f]{10}$/);
      for (const hole of report.missingTranslations.holes) {
        expect(hole.id).toMatch(/^i18n-[0-9a-f]{10}$/);
      }
      for (const r of report.missingTranslations.reciprocity) {
        expect(r.id).toMatch(/^i18n-[0-9a-f]{10}$/);
      }
      for (const issue of report.seoIssues) expect(issue.id).toMatch(/^seo-[0-9a-f]{10}$/);
    });

    it("ids are unique across all findings", () => {
      const ids = [
        ...report.brokenLinks.map((b) => b.id),
        ...report.missingTranslations.holes.map((h) => h.id),
        ...report.missingTranslations.reciprocity.map((r) => r.id),
        ...report.seoIssues.map((i) => i.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("is deterministic: re-auditing the same site yields the same ids", async () => {
      const again = await runAudit(`${server.url}/en`, {
        depth: 2,
        static: true,
        exclude: ["/x/**", "/en/ghost"],
      });
      expect(again.seoIssues.map((i) => i.id).sort()).toEqual(
        report.seoIssues.map((i) => i.id).sort(),
      );
      expect(again.brokenLinks.map((b) => b.id).sort()).toEqual(
        report.brokenLinks.map((b) => b.id).sort(),
      );
    }, 60_000);
  });

  describe("actionable metadata (why / fix)", () => {
    it("threads the rule summary through as `why`", () => {
      const titleMissing = report.seoIssues.find(
        (i) => i.pageUrl === abs("/bad-seo") && i.ruleId === "title.missing",
      );
      expect(titleMissing?.why).toContain("<title>");
    });

    it("surfaces a copy-pasteable fix snippet when the rule offers one", () => {
      const ogImage = report.seoIssues.find(
        (i) => i.pageUrl === abs("/bad-seo") && i.ruleId === "og.image.missing",
      );
      expect(ogImage?.fix).toContain('property="og:image"');
    });

    it("leaves `fix` undefined for length-style rules with no snippet", () => {
      const relCanonical = report.seoIssues.find((i) => i.ruleId === "canonical.absolute");
      expect(relCanonical?.why).toBeTruthy();
      expect(relCanonical?.fix).toBeUndefined();
    });
  });
});
