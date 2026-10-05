import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";

/**
 * `http.not-found`, through `runAudit`.
 *
 * The unit tests prove each rule reads its probe; this proves the probes run,
 * reach the rules, and run under the flags the sites' pipelines use
 * (`--static --no-external`). A rule nothing feeds is the "written, tested,
 * called by nobody" failure this repository has recorded six times.
 *
 * The site is the case measured on openfinanceguide.com on 2026-10-05: every
 * unknown dotted path answers 200 with the home page; bare paths 404.
 */

interface Fixture {
  url: string;
  stop: () => Promise<void>;
}

const page = (title: string, body = "") =>
  new Response(
    `<!doctype html><html lang="en"><head><title>${title}</title></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

async function start(build: (app: Hono, origin: () => string) => void): Promise<Fixture> {
  const app = new Hono();
  let origin = "";
  build(app, () => origin);

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;

  return { url: origin, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

const FLAGS = { static: true, checkExternal: false, noSitemap: true, depth: 1 } as const;

describe("an origin that serves every unknown dotted path as its home page", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await start((app) => {
      app.get("/robots.txt", (c) => c.text("User-agent: *\nAllow: /\n"));
      app.get("/", () => page("home"));
      // The `[locale]` route nobody validated, reached because the middleware
      // matcher skips anything with a dot in it.
      app.get("*", (c) => (c.req.path.includes(".") ? page("home") : c.text("Not Found", 404)));
    });
    report = await runAudit(site.url, FLAGS);
  }, 60_000);

  afterAll(() => site.stop());

  it("reports http.not-found as an error on the origin", () => {
    const found = report.siteIssues.filter((i) => i.ruleId === "http.not-found");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "error", pageUrl: site.url, rigor: "vendor-spec" });
    expect(found[0]!.message).toMatch(
      /\/goflag-probe-[0-9a-f]{32}\.txt` answered 200 `text\/html`/,
    );
    expect(report.summary.verdict).toBe("red");
  });
});
