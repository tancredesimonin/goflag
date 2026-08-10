import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";

/**
 * What a run says about the pages it meant to audit and did not.
 *
 * Both cases here were found the same way, on openfinanceguide 2026-08-09: a
 * baseline captured against the deployed `develop`, and a merge request that
 * failed the regression gate the next minute without touching a page. Neither
 * was a regression. Both were the audit misreporting its own coverage.
 */

interface Fixture {
  url: string;
  stop: () => Promise<void>;
}

const page = (title: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><title>${title}</title>` +
      `<meta name="description" content="A description comfortably inside the recommended window for this fixture page.">` +
      `</head><body><h1>${title}</h1></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

/**
 * One page per path in `paths`, plus a sitemap listing exactly those. Any path
 * in `hang` accepts the connection and never answers, which is the shape of the
 * timeout that started this: not a 500, not a 404 — no reply at all.
 */
async function startSite(paths: string[], hang: string[] = []): Promise<Fixture> {
  const app = new Hono();
  let origin = "";
  const hangs = new Set(hang);

  app.get("/robots.txt", (c) =>
    c.text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`),
  );
  app.get("/sitemap.xml", (c) =>
    c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
        paths.map((p) => `<url><loc>${origin}${p}</loc></url>`).join("") +
        `</urlset>`,
      200,
      { "content-type": "application/xml; charset=utf-8" },
    ),
  );
  app.get("/", () => page("home"));
  app.get("*", async (c) => {
    const path = new URL(c.req.url).pathname;
    if (hangs.has(path)) return new Promise<Response>(() => {});
    return page(path);
  });

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;

  return {
    url: origin,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        // A hung request holds its socket open and `close` waits for it, so
        // the handle has to be dropped or the suite never exits. Only the
        // HTTP/1 server type declares this; `ServerType` is the union.
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
      }),
  };
}

describe("a page the crawl could not fetch at all", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await startSite(["/", "/reachable", "/slow"], ["/slow"]);
    report = await runAudit(site.url, { depth: 1, static: true, timeoutMs: 300 });
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("reports it as unreachable, with the status the schema reserves for a network error", () => {
    const unreached = report.unreachablePages.find((p) => p.url.endsWith("/slow"));
    expect(unreached).toBeDefined();
    expect(unreached?.status).toBe(0);
  });

  it("counts it, so the summary cannot read as a complete audit", () => {
    expect(report.summary.unreachablePages).toBe(1);
  });

  it("is never green — a hole is not a clean bill of health", () => {
    // This is the whole point. Before, the only trace was a warning line, and
    // warnings do not gate: the report was green, complete-looking, and
    // committable as a baseline. The next run reached the page, found what had
    // always been on it, and the gate called it a regression.
    expect(report.summary.verdict).toBe("red");
  });

  it("still audits the pages it did reach", () => {
    expect(report.pages.some((p) => p.url.endsWith("/reachable"))).toBe(true);
  });
});

describe("a selection larger than the default page cap", () => {
  let site: Fixture;
  let report: GoflagReport;

  // Each path is its own first segment, so every one of them is a singleton the
  // selection always keeps — 210 selected, against a default cap of 200. A
  // family would have been sampled down to three and never reached the cap,
  // which is why this fixture is shaped the way it is.
  const paths = ["/", ...Array.from({ length: 210 }, (_, i) => `/page-${i}`)];

  beforeAll(async () => {
    site = await startSite(paths);
    report = await runAudit(site.url, { depth: 1, static: true, checkExternal: false });
  }, 120_000);

  afterAll(async () => {
    await site.stop();
  });

  it("crawls the whole selection", () => {
    expect(report.diagnostics.coverage?.selected).toBe(paths.length);
    expect(report.pages.length).toBeGreaterThanOrEqual(paths.length);
  });

  it("scans links on the whole selection, not on the first 200 of it", () => {
    // The bug: the crawl was told the selection is the answer to "how many"
    // and the link pass was still told 200. `0 broken links` then meant 200
    // pages on a report that said 748.
    expect(report.diagnostics.pagesScanned).toBeGreaterThanOrEqual(paths.length);
  });

  it("does not claim to have truncated what it audited in full", () => {
    expect(report.diagnostics.truncated).toBe(false);
    expect(report.diagnostics.warnings.filter((w) => w.includes("only the first"))).toEqual([]);
  });
});
