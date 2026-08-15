import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeRobots } from "../../src/lib/core/probes/robots";
import { probeSitemap } from "../../src/lib/core/probes/sitemap";
import { probeManifest } from "../../src/lib/core/probes/manifest";

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
    const route = routes.get(req.url ?? "/");
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

describe("probeRobots", () => {
  it("returns found:true with sitemaps and blocksAll for a real robots.txt", async () => {
    routes.set("/robots.txt", {
      status: 200,
      body: "User-agent: *\nDisallow: /\nSitemap: https://x.com/sitemap.xml\n",
    });
    const probe = await probeRobots(baseUrl);
    expect(probe.found).toBe(true);
    expect(probe.status).toBe(200);
    expect(probe.sitemaps).toEqual([{ value: "https://x.com/sitemap.xml", line: 3 }]);
    expect(probe.groups[0]?.rules).toEqual([{ kind: "disallow", pattern: "/", line: 2 }]);
    expect(probe.byteLength).toBeGreaterThan(0);
  });

  it("returns found:false on 404", async () => {
    routes.delete("/robots.txt");
    const probe = await probeRobots(baseUrl);
    expect(probe.found).toBe(false);
    expect(probe.status).toBe(404);
    expect(probe.sitemaps).toEqual([]);
    expect(probe.groups).toEqual([]);
  });

  it("returns found:false on a network error (closed port)", async () => {
    const probe = await probeRobots("http://127.0.0.1:1");
    expect(probe.found).toBe(false);
  });
});

describe("probeSitemap", () => {
  it("detects a sitemapindex with multiple entries", async () => {
    routes.set("/sitemap.xml", {
      status: 200,
      contentType: "application/xml",
      body: `<sitemapindex><sitemap><loc>a</loc></sitemap><sitemap><loc>b</loc></sitemap></sitemapindex>`,
    });
    const probe = await probeSitemap(baseUrl);
    expect(probe.found).toBe(true);
    expect(probe.isIndex).toBe(true);
    expect(probe.entryCount).toBe(2);
  });

  it("detects a flat urlset and counts entries", async () => {
    routes.set("/sitemap.xml", {
      status: 200,
      contentType: "application/xml",
      body: `<urlset><url><loc>a</loc></url><url><loc>b</loc></url><url><loc>c</loc></url></urlset>`,
    });
    const probe = await probeSitemap(baseUrl);
    expect(probe.found).toBe(true);
    expect(probe.isIndex).toBe(false);
    expect(probe.entryCount).toBe(3);
  });

  it("returns found:false on 404", async () => {
    routes.delete("/sitemap.xml");
    const probe = await probeSitemap(baseUrl);
    expect(probe.found).toBe(false);
  });

  it("returns found:false on a network error", async () => {
    const probe = await probeSitemap("http://127.0.0.1:1");
    expect(probe.found).toBe(false);
  });
});

describe("probeManifest", () => {
  it("parses a valid manifest JSON body", async () => {
    routes.set("/site.webmanifest", {
      status: 200,
      contentType: "application/manifest+json",
      body: JSON.stringify({ name: "X", short_name: "X" }),
    });
    const probe = await probeManifest(`${baseUrl}/site.webmanifest`);
    expect(probe.found).toBe(true);
    expect(probe.parseError).toBeUndefined();
    expect((probe.data as { name: string }).name).toBe("X");
  });

  it("records parseError for invalid JSON without throwing", async () => {
    routes.set("/site.webmanifest", { status: 200, body: "{ not json" });
    const probe = await probeManifest(`${baseUrl}/site.webmanifest`);
    expect(probe.found).toBe(true);
    expect(probe.parseError).toBeDefined();
    expect(probe.data).toBeUndefined();
  });

  it("returns found:false on 404", async () => {
    routes.delete("/site.webmanifest");
    const probe = await probeManifest(`${baseUrl}/site.webmanifest`);
    expect(probe.found).toBe(false);
  });

  it("returns found:false on a network error", async () => {
    const probe = await probeManifest("http://127.0.0.1:1/site.webmanifest");
    expect(probe.found).toBe(false);
  });
});

describe("probe abort plumbing", () => {
  it("manifest probe respects a caller-driven AbortSignal", async () => {
    const ac = new AbortController();
    ac.abort();
    const probe = await probeManifest(`${baseUrl}/site.webmanifest`, { signal: ac.signal });
    expect(probe.found).toBe(false);
  });

  it("robots probe respects a caller-driven AbortSignal", async () => {
    const ac = new AbortController();
    ac.abort();
    const probe = await probeRobots(baseUrl, { signal: ac.signal });
    expect(probe.found).toBe(false);
  });

  it("sitemap probe respects a caller-driven AbortSignal", async () => {
    const ac = new AbortController();
    ac.abort();
    const probe = await probeSitemap(baseUrl, { signal: ac.signal });
    expect(probe.found).toBe(false);
  });
});
