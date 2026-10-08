import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit, type AuditOptions } from "@/report/build";
import type { GoflagReport } from "@/report/types";

/**
 * `hreflang.sitemap-mismatch` asks whether the sitemap is missing a translation
 * the `<head>` advertises. That is a question about an absence, so it has the
 * blind spot `sitemap.orphans` has: a translation listed in a sitemap goflag
 * could not read would be asked about as missing.
 *
 * Two sites, identical but for one thing. On the first, the French entry is
 * simply not in the sitemap, and the question is asked — which is what proves
 * the second silence is the gate and not a fixture that could never ask. On
 * the second, the French entries sit in a child sitemap that answers 404.
 */

interface Fixture {
  url: string;
  stop: () => Promise<void>;
}

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

async function start(sitemap: "omits-french" | "french-child-gone"): Promise<Fixture> {
  const app = new Hono();
  let origin = "";

  const page = (lang: string, path: string) =>
    new Response(
      `<!doctype html><html lang="${lang}"><head><title>${lang} about</title>` +
        `<link rel="alternate" hreflang="en" href="${origin}/en/about">` +
        `<link rel="alternate" hreflang="fr" href="${origin}/fr/about">` +
        `</head><body><a href="/en/about">en</a> <a href="/fr/about">fr</a> ${path}</body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );

  app.get("/robots.txt", (c) =>
    c.text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`),
  );
  if (sitemap === "omits-french") {
    app.get("/sitemap.xml", () => urlset(origin, ["/en/about"]));
  } else {
    app.get("/sitemap.xml", () =>
      xml(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          `<sitemap><loc>${origin}/en.xml</loc></sitemap>` +
          `<sitemap><loc>${origin}/fr.xml</loc></sitemap>` +
          `</sitemapindex>`,
      ),
    );
    app.get("/en.xml", () => urlset(origin, ["/en/about"]));
    app.get("/fr.xml", (c) => c.text("not found", 404));
  }
  app.get("/", (c) => c.redirect("/en/about", 302));
  app.get("/en/about", () => page("en", "/en/about"));
  app.get("/fr/about", () => page("fr", "/fr/about"));

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

const AUDIT: AuditOptions = {
  depth: 2,
  static: true,
  checkExternal: false,
  coverage: "all",
  locales: ["en", "fr"],
  advisories: true,
};

function questions(report: GoflagReport) {
  return (report.advisories ?? []).filter((a) => a.ruleId === "hreflang.sitemap-mismatch");
}

describe("hreflang.sitemap-mismatch on a sitemap read in full that omits the French page", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await start("omits-french");
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("asks about the English page, whose head advertises a translation the sitemap lacks", () => {
    const asked = questions(report);

    expect(asked.map((a) => a.pageUrl)).toContain(`${site.url}/en/about`);
    const english = asked.find((a) => a.pageUrl === `${site.url}/en/about`);
    expect(english?.evidence).toMatchObject({ advertisedButUnlisted: ["fr"] });
    expect(english?.verdict).toBe("needs-judgment");
  });
});

describe("hreflang.sitemap-mismatch when the child listing the French page is gone", () => {
  let site: Fixture;
  let report: GoflagReport;

  beforeAll(async () => {
    site = await start("french-child-gone");
    report = await runAudit(site.url, AUDIT);
  }, 60_000);

  afterAll(async () => {
    await site.stop();
  });

  it("crawls both translations, so the silence below is a decision", () => {
    const urls = report.pages.map((p) => p.url);
    expect(urls).toContain(`${site.url}/en/about`);
    expect(urls).toContain(`${site.url}/fr/about`);
  });

  it("asks nothing: the French entry may be in the child it could not read", () => {
    expect(questions(report)).toEqual([]);
  });

  it("reports the unreadable child, which is the defect it can be sure of", () => {
    const found = report.siteIssues.filter((i) => i.ruleId === "sitemap.index.child-error");
    expect(found).toHaveLength(1);
  });
});
