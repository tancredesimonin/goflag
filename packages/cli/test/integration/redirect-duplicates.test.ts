import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import { totalFindings } from "@/report/diff";
import type { GoflagReport } from "@/report/types";

/**
 * One document, reached twice.
 *
 * Every site audited by this tool redirects `/` to its default locale, and
 * lists that locale root in its sitemap. So the crawl asks for two URLs and is
 * given the same page twice — and used to keep both.
 *
 * The symptom is not a longer page list. It is that the page is linted twice,
 * so every finding on it is emitted twice **under the same id**: the
 * fingerprint is built from the final URL, and the occurrence counter is
 * per-page, so both copies number their findings from zero.
 *
 * That breaks two things at once. `--max-debt` counts the copies, so the
 * ceiling is set above the real number and drifts further with every
 * redirecting route — measured on the live sites: 32 for 31 findings on
 * tancredo, 42 for 40 on stereo-house, 753 pages crawled to cover 748 on
 * openfinanceguide. And `diffReports` keys findings by id, so a pair collapses
 * to one entry: one of the two can disappear and the regression gate sees
 * nothing at all.
 */

interface Fixture {
  url: string;
  stop: () => Promise<void>;
}

const page = (title: string, body = "") =>
  new Response(
    `<!doctype html><html lang="en"><head><title>${title}</title>` +
      `</head><body><h1>${title}</h1>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

/**
 * `/` redirects to `/en`, and `/en` is also in the sitemap. Neither page
 * declares a description, so both carry a finding worth counting.
 */
async function startSite(): Promise<Fixture> {
  const app = new Hono();
  let origin = "";

  app.get("/robots.txt", (c) =>
    c.text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`),
  );
  app.get("/sitemap.xml", (c) =>
    c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
        [`/en`, `/en/about`].map((p) => `<url><loc>${origin}${p}</loc></url>`).join("") +
        `</urlset>`,
      200,
      { "content-type": "application/xml; charset=utf-8" },
    ),
  );
  app.get("/", (c) => c.redirect("/en", 302));
  app.get("/en", () => page("home", `<a href="/en/about">about</a>`));
  app.get("/en/about", () => page("about"));

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;

  return {
    url: origin,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe("a page the entry redirects onto, which the sitemap also lists", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await startSite();
    report = await runAudit(site.url, { depth: 2, static: true, checkExternal: false });
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("appears once in the page list", () => {
    const home = report.pages.filter((p) => p.url.endsWith("/en"));
    expect(home).toHaveLength(1);
  });

  it("is audited — the deduplication keeps a copy, it does not drop the page", () => {
    expect(report.pages.some((p) => p.url.endsWith("/en"))).toBe(true);
    expect(report.pages.some((p) => p.url.endsWith("/en/about"))).toBe(true);
  });

  it("emits each of its findings once", () => {
    const ids = report.seoIssues.filter((i) => i.pageUrl.endsWith("/en")).map((i) => i.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts each finding once towards --max-debt", () => {
    // `totalFindings` is the list length, not the number of distinct ids —
    // deliberately, since two real findings may share neither. A duplicate page
    // made the two diverge, and this is where the ceiling was being inflated.
    const all = [
      ...report.seoIssues,
      ...report.siteIssues,
      ...report.brokenLinks,
      ...report.unreachablePages,
      ...report.missingTranslations.holes,
      ...report.missingTranslations.reciprocity,
    ];
    expect(totalFindings(report)).toBe(new Set(all.map((f) => f.id)).size);
  });

  it("still follows the links of the page it reached through the redirect", () => {
    // The duplicate is dropped after the kept copy has been expanded. Dropping
    // it earlier would take the subtree with it.
    expect(report.pages.some((p) => p.url.endsWith("/en/about"))).toBe(true);
  });
});
