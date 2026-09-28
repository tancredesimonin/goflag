import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";

/**
 * `sitemap.orphans`, against sites that give it every reason to be wrong.
 *
 * The rule says a crawled page that does not ask for `noindex` belongs in the
 * sitemap. That sentence is only true of a page that names itself as the one to
 * index, measured against a sitemap goflag read in full — and three pages below
 * are none of that:
 *
 *   /syndicated  canonical → the publisher it was copied from, on another origin.
 *             It asks for that URL to be indexed, not itself, and listing it is
 *             what `sitemap.entry.non-canonical` warns about — so counting it
 *             here left the site no answer that satisfied both rules. (A variant
 *             whose canonical names a page the crawl reached never gets this far:
 *             `dropCanonicalDuplicates` takes it out first.)
 *   /landed   the sitemap lists `/moved`, which redirects here. The defect is the
 *             redirect, and `sitemap.entry.redirects` reports it; counting the
 *             landing page as well reported one mistake twice.
 *   /two      listed by a child sitemap that answers 404. goflag never saw the
 *             entry, so it cannot say the page is absent — only that it could not
 *             read where it would be.
 *
 * `/forgotten` is the control: linked, indexable, self-canonical, listed nowhere.
 * It is the page the rule exists for, and it has to survive every fix.
 */

interface Fixture {
  url: string;
  stop: () => Promise<void>;
}

const page = (title: string, head = "", body = "") =>
  new Response(
    `<!doctype html><html lang="en"><head><title>${title}</title>${head}` +
      `</head><body><h1>${title}</h1>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });

const urlset = (origin: string, paths: string[]) =>
  xml(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      paths.map((p) => `<url><loc>${origin}${p}</loc></url>`).join("") +
      `</urlset>`,
  );

const links = (paths: string[]) => paths.map((p) => `<a href="${p}">${p}</a>`).join(" ");

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

  return {
    url: origin,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** One urlset, and every page the rule has to tell apart. */
function oneSitemap() {
  return start((app, origin) => {
    app.get("/robots.txt", (c) =>
      c.text(`User-agent: *\nAllow: /\nSitemap: ${origin()}/sitemap.xml\n`),
    );
    app.get("/sitemap.xml", () => urlset(origin(), ["/", "/listed", "/moved"]));
    app.get("/", () =>
      page("home", "", links(["/listed", "/forgotten", "/hidden", "/syndicated", "/landed"])),
    );
    app.get("/listed", () => page("listed"));
    app.get("/forgotten", () => page("forgotten"));
    app.get("/hidden", () => page("hidden", `<meta name="robots" content="noindex">`));
    app.get("/syndicated", () =>
      page("syndicated", `<link rel="canonical" href="https://publisher.example/original">`),
    );
    app.get("/moved", (c) => c.redirect("/landed", 301));
    app.get("/landed", () => page("landed"));
  });
}

/** An index whose second child is gone — the page it listed is linked anyway. */
function brokenChild() {
  return start((app, origin) => {
    app.get("/robots.txt", (c) =>
      c.text(`User-agent: *\nAllow: /\nSitemap: ${origin()}/sitemap.xml\n`),
    );
    app.get("/sitemap.xml", () =>
      xml(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          `<sitemap><loc>${origin()}/pages.xml</loc></sitemap>` +
          `<sitemap><loc>${origin()}/more.xml</loc></sitemap>` +
          `</sitemapindex>`,
      ),
    );
    app.get("/pages.xml", () => urlset(origin(), ["/", "/one"]));
    app.get("/more.xml", (c) => c.text("not found", 404));
    app.get("/", () => page("home", "", links(["/one", "/two"])));
    app.get("/one", () => page("one"));
    app.get("/two", () => page("two"));
  });
}

const AUDIT = { depth: 2, static: true, checkExternal: false, coverage: "all" } as const;

function issuesFor(report: GoflagReport, ruleId: string) {
  return report.siteIssues.filter((issue) => issue.ruleId === ruleId);
}

describe("sitemap.orphans on a sitemap goflag read in full", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await oneSitemap();
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("crawls every page the fixture links, so a silence below is a decision", () => {
    const paths = report.pages.map((p) => new URL(p.url).pathname).sort();
    expect(paths).toEqual(["/", "/forgotten", "/hidden", "/landed", "/listed", "/syndicated"]);
  });

  it("counts the page that is linked, indexable and listed nowhere — and only that one", () => {
    const found = issuesFor(report, "sitemap.orphans");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1 crawled page asks to be indexed");
    expect(found[0]!.message).toContain(`${site.url}/forgotten`);
  });

  it("leaves out the page whose canonical names another origin", () => {
    expect(issuesFor(report, "sitemap.orphans")[0]!.message).not.toContain("/syndicated");
  });

  it("leaves out the page a redirecting entry lands on, and lets the redirect be the finding", () => {
    expect(issuesFor(report, "sitemap.orphans")[0]!.message).not.toContain("/landed");

    const redirects = issuesFor(report, "sitemap.entry.redirects");
    expect(redirects).toHaveLength(1);
    expect(redirects[0]!.message).toContain(`${site.url}/moved → ${site.url}/landed`);
  });

  it("still leaves out the page that asks for noindex", () => {
    expect(issuesFor(report, "sitemap.orphans")[0]!.message).not.toContain("/hidden");
  });
});

describe("sitemap.orphans when a child sitemap could not be read", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await brokenChild();
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("crawls the page the unreadable child would have listed", () => {
    expect(report.pages.some((p) => p.url === `${site.url}/two`)).toBe(true);
  });

  it("renders no verdict on an inventory it only read part of", () => {
    expect(issuesFor(report, "sitemap.orphans")).toEqual([]);
  });

  it("reports the unreadable child instead, which is the defect that is certain", () => {
    const found = issuesFor(report, "sitemap.index.child-error");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1 of 2");
  });
});
