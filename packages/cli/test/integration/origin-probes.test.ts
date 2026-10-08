import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";

/**
 * `http.not-found` and the `llmstxt.*` rules, through `runAudit`.
 *
 * The unit tests prove each rule reads its probe; this proves the probes run,
 * reach the rules, and run under the flags the sites' pipelines use
 * (`--static --no-external`). A rule nothing feeds is the "written, tested,
 * called by nobody" failure this repository has recorded six times.
 *
 * The two sites are the two cases measured on 2026-10-05:
 *
 *   catch-all   openfinanceguide.com — every unknown dotted path, `/llms.txt`
 *               included, answers 200 with the home page; bare paths 404.
 *   llms        a correct origin publishing an llms.txt that lists a dead
 *               mirror and one under `Disallow: /raw/` — the contradiction
 *               openfinanceguide was about to ship.
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

  it("leaves /llms.txt to that finding instead of reading the home page as one", () => {
    expect(report.siteIssues.filter((i) => i.ruleId.startsWith("llmstxt."))).toEqual([]);
  });
});

describe("an origin that publishes an llms.txt", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await start((app, origin) => {
      app.get("/robots.txt", (c) => c.text("User-agent: *\nAllow: /\nDisallow: /raw/\n"));
      app.get("/", () => page("home"));
      app.get("/llms.txt", (c) =>
        c.text(
          [
            "# Fixture",
            "",
            "> A site that lists what agents should read.",
            "",
            "## Docs",
            "",
            `- [Home](${origin()}/): the landing page`,
            "- [Guide](/raw/guide.md): the markdown mirror",
            "- [Gone](/missing.md): a mirror that was never built",
            "- [Elsewhere](https://example.invalid/page): not this site's business",
          ].join("\n"),
        ),
      );
      app.get("/raw/guide.md", (c) => c.text("# Guide\n"));
      app.get("*", (c) => c.text("Not Found", 404));
    });
    report = await runAudit(site.url, FLAGS);
  }, 60_000);

  afterAll(() => site.stop());

  const ids = () => report.siteIssues.map((i) => i.ruleId);

  it("finds the origin's not-found handling correct", () => {
    expect(ids()).not.toContain("http.not-found");
  });

  it("finds the file well-formed and served as text", () => {
    expect(ids()).not.toContain("llmstxt.content-type");
    expect(ids()).not.toContain("llmstxt.h1.missing");
  });

  it("reports the dead same-origin entry, and only that one", () => {
    const [found] = report.siteIssues.filter((i) => i.ruleId === "llmstxt.link.unreachable");
    expect(found?.pageUrl).toBe(`${site.url}/llms.txt`);
    expect(found?.message).toContain(`${site.url}/missing.md (HTTP 404)`);
    expect(found?.message).toContain("1 URL");
    expect(found?.message).not.toContain("example.invalid");
  });

  it("reports the entry robots.txt forbids an agent to fetch", () => {
    const [found] = report.siteIssues.filter((i) => i.ruleId === "llmstxt.link.blocked-by-robots");
    expect(found?.message).toContain(`${site.url}/raw/guide.md (line 3: Disallow: /raw/)`);
    expect(found?.severity).toBe("warning");
  });
});
