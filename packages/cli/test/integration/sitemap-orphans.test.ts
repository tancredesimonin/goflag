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
    app.get("/sitemap.xml", () => urlset(origin(), ["/", "/listed", "/moved", "/copied"]));
    app.get("/", () =>
      page("home", "", links(["/listed", "/forgotten", "/hidden", "/syndicated", "/landed"])),
    );
    app.get("/listed", () => page("listed"));
    app.get("/forgotten", () => page("forgotten"));
    app.get("/hidden", () => page("hidden", `<meta name="robots" content="noindex">`));
    app.get("/syndicated", () =>
      page("syndicated", `<link rel="canonical" href="https://publisher.example/original">`),
    );
    app.get("/copied", () =>
      page("copied", `<link rel="canonical" href="https://publisher.example/copied">`),
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

/** `robots.txt` declares two sitemaps, and discovery reads the first that parses. */
function twoDeclared() {
  return start((app, origin) => {
    app.get("/robots.txt", (c) =>
      c.text(
        `User-agent: *\nAllow: /\nSitemap: ${origin()}/pages.xml\nSitemap: ${origin()}/posts.xml\n`,
      ),
    );
    app.get("/pages.xml", () => urlset(origin(), ["/", "/about"]));
    app.get("/posts.xml", () => urlset(origin(), ["/posts/hello"]));
    app.get("/", () => page("home", "", links(["/about", "/posts/hello", "/forgotten"])));
    app.get("/about", () => page("about"));
    app.get("/posts/hello", () => page("hello"));
    app.get("/forgotten", () => page("forgotten"));
  });
}

/** The one declared sitemap is gone, and discovery falls back to the well-known path. */
function declaredGone() {
  return start((app, origin) => {
    app.get("/robots.txt", (c) =>
      c.text(`User-agent: *\nAllow: /\nSitemap: ${origin()}/gone.xml\n`),
    );
    app.get("/gone.xml", (c) => c.text("not found", 404));
    app.get("/sitemap.xml", () => urlset(origin(), ["/", "/about"]));
    app.get("/", () => page("home", "", links(["/about", "/forgotten"])));
    app.get("/about", () => page("about"));
    app.get("/forgotten", () => page("forgotten"));
  });
}

/** An index and one of its children, both declared: redundant, not partial. */
function indexAndChildDeclared() {
  return start((app, origin) => {
    app.get("/robots.txt", (c) =>
      c.text(
        `User-agent: *\nAllow: /\nSitemap: ${origin()}/sitemap_index.xml\nSitemap: ${origin()}/pages.xml\n`,
      ),
    );
    app.get("/sitemap_index.xml", () =>
      xml(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          `<sitemap><loc>${origin()}/pages.xml</loc></sitemap>` +
          `</sitemapindex>`,
      ),
    );
    app.get("/pages.xml", () => urlset(origin(), ["/", "/about"]));
    app.get("/", () => page("home", "", links(["/about", "/forgotten"])));
    app.get("/about", () => page("about"));
    app.get("/forgotten", () => page("forgotten"));
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
    expect(paths).toEqual([
      "/",
      "/copied",
      "/forgotten",
      "/hidden",
      "/landed",
      "/listed",
      "/syndicated",
    ]);
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

  it("flags the listed page whose canonical names another origin, and only that one", () => {
    const found = issuesFor(report, "sitemap.entry.non-canonical");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`${site.url}/copied → https://publisher.example/copied`);
    expect(issuesFor(report, "sitemap.orphans")[0]!.message).not.toContain("/copied");
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

describe("sitemap.orphans when robots.txt declares two sitemaps", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await twoDeclared();
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("reads only the first — the gap the rule has to stand back from", () => {
    expect(report.diagnostics.sitemap?.sitemapUrl).toBe(`${site.url}/pages.xml`);
  });

  it("crawls the page only the second one lists", () => {
    expect(report.pages.some((p) => p.url === `${site.url}/posts/hello`)).toBe(true);
  });

  it("renders no verdict, rather than call that page absent", () => {
    expect(issuesFor(report, "sitemap.orphans")).toEqual([]);
  });
});

describe("sitemap.orphans when the declared sitemap is gone", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await declaredGone();
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("falls back to the well-known sitemap", () => {
    expect(report.diagnostics.sitemap?.sitemapUrl).toBe(`${site.url}/sitemap.xml`);
  });

  it("renders no verdict: the declared one may be where the page is listed", () => {
    expect(issuesFor(report, "sitemap.orphans")).toEqual([]);
  });
});

describe("sitemap.orphans when an index and its child are both declared", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await indexAndChildDeclared();
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("still judges, since discovery read every declared file, and counts the forgotten page", () => {
    const found = issuesFor(report, "sitemap.orphans");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1 crawled page asks to be indexed");
    expect(found[0]!.message).toContain(`${site.url}/forgotten`);
  });
});

/**
 * What a listed URL serves, and what a page asks, in the forms the rules used to
 * miss: a listed variant of a crawled page, `none`, a header addressed to one
 * crawler, and a canonical that names a URL nothing links to.
 */
function variantsAndDirectives() {
  return start((app, origin) => {
    app.get("/robots.txt", (c) =>
      c.text(`User-agent: *\nAllow: /\nSitemap: ${origin()}/sitemap.xml\n`),
    );
    app.get("/sitemap.xml", () => urlset(origin(), ["/", "/a", "/a?ref=x", "/scoped"]));
    app.get("/", () => page("home", "", links(["/a", "/none", "/guide?tab=api", "/scoped"])));
    app.get("/a", (c) =>
      c.req.query("ref")
        ? page("a, shared", `<link rel="canonical" href="${origin()}/a">`)
        : page("a"),
    );
    app.get(
      "/scoped",
      () =>
        new Response(`<!doctype html><html lang="en"><head><title>scoped</title></head></html>`, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-robots-tag": "googlebot: noindex",
          },
        }),
    );
    app.get("/none", () => page("none", `<meta name="robots" content="none">`));
    app.get("/guide", (c) =>
      c.req.query("tab")
        ? page("guide, one tab", `<link rel="canonical" href="${origin()}/guide">`)
        : page("guide"),
    );
  });
}

describe("the sitemap rules on variants, directives and canonical targets", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await variantsAndDirectives();
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("crawls the variant and leaves the canonical target unfetched, as the cases below need", () => {
    const urls = report.pages.map((p) => p.url);
    expect(urls).toContain(`${site.url}/a?ref=x`);
    expect(urls).toContain(`${site.url}/guide?tab=api`);
    expect(urls).not.toContain(`${site.url}/guide`);
    // The variant is still set aside as a duplicate: seeing it is not judging it.
    expect(report.diagnostics.duplicatePages).toBe(1);
  });

  it("flags the listed variant whose canonical names a crawled page — the rule's own example", () => {
    const found = issuesFor(report, "sitemap.entry.non-canonical");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(
      "1 sitemap entry names a page whose canonical points elsewhere",
    );
    expect(found[0]!.message).toContain(`${site.url}/a?ref=x → ${site.url}/a`);
  });

  it("flags the listed page whose header tells googlebot noindex", () => {
    const found = issuesFor(report, "sitemap.entry.noindex");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`${site.url}/scoped`);
  });

  it("counts the canonical nothing audited, and not the page that says none", () => {
    const found = issuesFor(report, "sitemap.orphans");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe(
      `1 URL that crawled pages name as their canonical is absent from the sitemap, and was not audited: \`${site.url}/guide (canonical of ${site.url}/guide?tab=api)\`. A consumer that reads the sitemap rather than following links will never see it.`,
    );
  });
});
