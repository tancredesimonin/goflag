import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverSitemap } from "../../src/lib/core/sitemap/discover";

interface RouteHandler {
  status: number;
  contentType?: string;
  body: string | Buffer;
}

let server: Server;
let baseUrl: string;
const routes = new Map<string, RouteHandler>();

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    const route = routes.get(path);
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(route.status, route.contentType ? { "content-type": route.contentType } : {});
    res.end(route.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => routes.clear());

function urlset(...paths: string[]): string {
  const entries = paths.map((p) => `<url><loc>${baseUrl}${p}</loc></url>`).join("");
  return `<?xml version="1.0"?><urlset>${entries}</urlset>`;
}

describe("discoverSitemap", () => {
  it("prefers the sitemap declared in robots.txt", async () => {
    routes.set("/robots.txt", {
      status: 200,
      body: `User-agent: *\nSitemap: ${baseUrl}/custom.xml\n`,
    });
    routes.set("/custom.xml", {
      status: 200,
      contentType: "application/xml",
      body: urlset("/", "/about"),
    });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.source).toBe("robots");
    expect(result.diagnostics.declaredInRobots).toBe(true);
    expect(result.diagnostics.found).toBe(true);
    expect(result.diagnostics.sitemapUrl).toBe(`${baseUrl}/custom.xml`);
    expect(result.urls.map((u) => u.loc)).toEqual([`${baseUrl}/`, `${baseUrl}/about`]);
  });

  it("falls back to /sitemap.xml when robots declares nothing", async () => {
    routes.set("/robots.txt", { status: 200, body: "User-agent: *\nDisallow:\n" });
    routes.set("/sitemap.xml", { status: 200, body: urlset("/a", "/b") });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.source).toBe("well-known");
    expect(result.diagnostics.atWellKnownPath).toBe(true);
    expect(result.diagnostics.declaredInRobots).toBe(false);
    expect(result.urls).toHaveLength(2);
  });

  it("follows a sitemap index into its children", async () => {
    routes.set("/sitemap.xml", {
      status: 200,
      body: `<sitemapindex><sitemap><loc>${baseUrl}/sm-1.xml</loc></sitemap><sitemap><loc>${baseUrl}/sm-2.xml</loc></sitemap></sitemapindex>`,
    });
    routes.set("/sm-1.xml", { status: 200, body: urlset("/p1", "/p2") });
    routes.set("/sm-2.xml", { status: 200, body: urlset("/p3") });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.diagnostics.isIndex).toBe(true);
    expect(result.diagnostics.childSitemapCount).toBe(2);
    expect(result.urls.map((u) => u.loc)).toEqual([
      `${baseUrl}/p1`,
      `${baseUrl}/p2`,
      `${baseUrl}/p3`,
    ]);
  });

  it("records child sitemap errors without throwing", async () => {
    routes.set("/sitemap.xml", {
      status: 200,
      body: `<sitemapindex><sitemap><loc>${baseUrl}/ok.xml</loc></sitemap><sitemap><loc>${baseUrl}/missing.xml</loc></sitemap></sitemapindex>`,
    });
    routes.set("/ok.xml", { status: 200, body: urlset("/x") });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.urls).toHaveLength(1);
    expect(result.diagnostics.childSitemapErrors).toBe(1);
    expect(result.diagnostics.warnings.some((w) => w.includes("missing.xml"))).toBe(true);
  });

  it("respects the maxUrls cap and flags truncation", async () => {
    routes.set("/sitemap.xml", { status: 200, body: urlset("/1", "/2", "/3", "/4") });
    const result = await discoverSitemap(baseUrl, { crawlFallback: false, maxUrls: 2 });
    expect(result.urls).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("inflates a gzipped sitemap", async () => {
    routes.set("/robots.txt", {
      status: 200,
      body: `Sitemap: ${baseUrl}/sitemap.xml.gz\n`,
    });
    routes.set("/sitemap.xml.gz", {
      status: 200,
      contentType: "application/gzip",
      body: gzipSync(Buffer.from(urlset("/g1", "/g2"))),
    });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.source).toBe("robots");
    expect(result.urls.map((u) => u.loc)).toEqual([`${baseUrl}/g1`, `${baseUrl}/g2`]);
  });

  it("crawls as a fallback when no sitemap exists", async () => {
    routes.set("/", {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><head><title>Home</title></head><body><a href="/a">a</a><a href="/b">b</a></body></html>`,
    });
    routes.set("/a", {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><head><title>A</title></head><body>a</body></html>`,
    });
    routes.set("/b", {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><head><title>B</title></head><body>b</body></html>`,
    });

    const result = await discoverSitemap(baseUrl, { crawlDepth: 1 });
    expect(result.source).toBe("crawl");
    expect(result.diagnostics.found).toBe(false);
    expect(result.urls.map((u) => u.loc).sort()).toEqual(
      [`${baseUrl}/`, `${baseUrl}/a`, `${baseUrl}/b`].sort(),
    );
  });

  it("crawls when the located sitemap is an empty urlset", async () => {
    routes.set("/sitemap.xml", { status: 200, body: `<urlset></urlset>` });
    routes.set("/", {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><head><title>Home</title></head><body><a href="/a">a</a></body></html>`,
    });
    routes.set("/a", {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<html><head><title>A</title></head><body>a</body></html>`,
    });

    const result = await discoverSitemap(baseUrl, { crawlDepth: 1 });
    expect(result.source).toBe("crawl");
    expect(result.diagnostics.found).toBe(true);
    expect(result.diagnostics.warnings.some((w) => w.includes("lists no URLs"))).toBe(true);
    expect(result.urls.length).toBeGreaterThan(0);
  });

  it("keeps the empty sitemap result when crawl is disabled", async () => {
    routes.set("/sitemap.xml", { status: 200, body: `<urlset></urlset>` });
    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.source).toBe("well-known");
    expect(result.diagnostics.found).toBe(true);
    expect(result.urls).toHaveLength(0);
  });

  it("returns an empty result when nothing is found and crawl is disabled", async () => {
    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.urls).toHaveLength(0);
    expect(result.diagnostics.found).toBe(false);
    expect(result.diagnostics.warnings).toContain("No sitemap found.");
  });

  it("skips a declared sitemap that 404s and uses the well-known path", async () => {
    routes.set("/robots.txt", { status: 200, body: `Sitemap: ${baseUrl}/declared.xml\n` });
    routes.set("/sitemap.xml", { status: 200, body: urlset("/a") });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.source).toBe("well-known");
    expect(result.diagnostics.found).toBe(true);
    expect(result.urls).toHaveLength(1);
  });

  it("warns on a malformed sitemap and keeps looking", async () => {
    routes.set("/sitemap.xml", { status: 200, body: `<html><body>not a sitemap</body></html>` });
    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.diagnostics.found).toBe(false);
    expect(result.diagnostics.warnings.some((w) => w.includes("Malformed"))).toBe(true);
  });

  it("caps the number of child sitemaps followed", async () => {
    routes.set("/sitemap.xml", {
      status: 200,
      body: `<sitemapindex><sitemap><loc>${baseUrl}/sm-1.xml</loc></sitemap><sitemap><loc>${baseUrl}/sm-2.xml</loc></sitemap></sitemapindex>`,
    });
    routes.set("/sm-1.xml", { status: 200, body: urlset("/p1") });
    routes.set("/sm-2.xml", { status: 200, body: urlset("/p2") });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false, maxSitemaps: 1 });
    expect(result.urls).toEqual([{ loc: `${baseUrl}/p1` }]);
    expect(result.truncated).toBe(true);
    expect(result.diagnostics.warnings.some((w) => w.includes("only the first 1"))).toBe(true);
  });

  it("stops collecting child URLs once maxUrls is reached", async () => {
    routes.set("/sitemap.xml", {
      status: 200,
      body: `<sitemapindex><sitemap><loc>${baseUrl}/sm-1.xml</loc></sitemap><sitemap><loc>${baseUrl}/sm-2.xml</loc></sitemap></sitemapindex>`,
    });
    routes.set("/sm-1.xml", { status: 200, body: urlset("/p1") });
    routes.set("/sm-2.xml", { status: 200, body: urlset("/p2") });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false, maxUrls: 1 });
    expect(result.urls).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("falls back to raw text when a .gz payload is not actually gzipped", async () => {
    routes.set("/robots.txt", { status: 200, body: `Sitemap: ${baseUrl}/sitemap.xml.gz\n` });
    routes.set("/sitemap.xml.gz", {
      status: 200,
      contentType: "application/gzip",
      body: urlset("/plain"), // declared .gz but served uncompressed
    });

    const result = await discoverSitemap(baseUrl, { crawlFallback: false });
    expect(result.urls).toEqual([{ loc: `${baseUrl}/plain` }]);
  });

  it("honours allowInsecureTls without affecting plain http", async () => {
    routes.set("/sitemap.xml", { status: 200, body: urlset("/a") });
    const result = await discoverSitemap(baseUrl, {
      crawlFallback: false,
      allowInsecureTls: true,
    });
    expect(result.urls).toHaveLength(1);
  });
});
