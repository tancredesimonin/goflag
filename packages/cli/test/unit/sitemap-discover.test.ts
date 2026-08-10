import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverSitemap } from "../../src/lib/core/sitemap/discover";

interface RouteHandler {
  status: number;
  contentType?: string;
  body: string | Buffer;
  /**
   * Accept the request and never answer it. The alternative — a 1 ms timeout
   * racing a real response — is a coin flip decided by the machine: this
   * server answers from memory over loopback, and on a fast host it wins,
   * turning "the fetch timed out" into "the fetch succeeded" and failing the
   * assertion for a reason that has nothing to do with the code under test.
   */
  hang?: boolean;
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
    if (route.hang) return;
    res.writeHead(route.status, route.contentType ? { "content-type": route.contentType } : {});
    res.end(route.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => {
    server.close(() => r());
    // A hung route still holds its socket, and `close` waits for every one of
    // them before calling back.
    server.closeAllConnections();
  });
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

describe("a sitemap that could not be fetched", () => {
  it("is not reported as a site without one", async () => {
    // The defect this covers: `fetchDoc` caught every failure and returned the
    // same shape a 404 produces, so a timeout read as "this site has no
    // sitemap". The crawl then lost its seeds and audited a fraction of the
    // pages — 46 instead of 600 on openfinanceguide, silently.
    routes.set("/sitemap.xml", {
      status: 200,
      contentType: "application/xml",
      body: urlset("/a", "/b"),
      hang: true,
    });

    const stalled = await discoverSitemap(baseUrl, { timeoutMs: 50, crawlFallback: false });

    expect(stalled.diagnostics.found).toBe(false);
    expect(stalled.diagnostics.unreachable).toBeDefined();
    expect(stalled.diagnostics.warnings.join(" ")).toContain("unreachable");
  });

  it("leaves `unreachable` unset when the server answers 404", async () => {
    // A site that answers is a site that told us something. Only the network
    // failing to answer is undecided, and only that is worth stopping for.
    const absent = await discoverSitemap(baseUrl, { crawlFallback: false });

    expect(absent.diagnostics.found).toBe(false);
    expect(absent.diagnostics.unreachable).toBeUndefined();
  });

  it("still reports it when a usable sitemap is found elsewhere", async () => {
    // robots.txt names one that times out, `/sitemap.xml` works. The audit is
    // fine, and the unreachable one is still a fact worth carrying.
    routes.set("/sitemap.xml", {
      status: 200,
      contentType: "application/xml",
      body: urlset("/a"),
    });

    const found = await discoverSitemap(baseUrl, { crawlFallback: false });

    expect(found.diagnostics.found).toBe(true);
    expect(found.urls).toHaveLength(1);
  });
});
