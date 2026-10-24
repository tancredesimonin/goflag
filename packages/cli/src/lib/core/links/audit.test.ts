import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { runLinkAudit } from "./audit";
import type { SiteDiscovery } from "../sitemap/types";
import type { LinkRef } from "./types";

/**
 * A server that reports the most requests it ever had in flight at once.
 *
 * Every response is delayed, because concurrency is only observable while
 * something is waiting: served instantly, twenty requests can pass through one
 * at a time and still look like twenty in parallel.
 */
interface ConcurrencyProbe {
  url: string;
  host: string;
  peak: () => number;
  /** `<method> <path>` of every request the server received, in order. */
  requests: string[];
  stop: () => Promise<void>;
}

async function startProbe(links: string[] = [], delayMs = 40): Promise<ConcurrencyProbe> {
  let inFlight = 0;
  let peak = 0;
  const requests: string[] = [];

  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => {
      inFlight -= 1;
      if (req.url === "/") {
        const body = links.map((href) => `<a href="${href}">x</a>`).join("");
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<html><head><title>t</title></head><body>${body}</body></html>`);
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><head><title>t</title></head><body>ok</body></html>");
    }, delayMs);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    host: `127.0.0.1:${port}`,
    peak: () => peak,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function discoveryFor(origin: string): SiteDiscovery {
  return {
    origin,
    baseUrl: origin,
    source: "crawl",
    urls: [{ loc: `${origin}/` }],
    documents: [],
    // Spelled out rather than cast: `runLinkAudit` reads none of it, but a
    // cast here would go stale silently the day the interface grows a field
    // this test ought to have thought about.
    diagnostics: {
      found: false,
      status: 0,
      declaredInRobots: false,
      robotsFound: false,
      atWellKnownPath: false,
      wellFormed: false,
      isIndex: false,
      childSitemapCount: 0,
      childSitemapErrors: 0,
      urlCount: 1,
      warnings: [],
    },
    truncated: false,
  };
}

describe("runLinkAudit — who the per-host cap is for", () => {
  const running: ConcurrencyProbe[] = [];
  afterEach(async () => {
    await Promise.all(running.splice(0).map((p) => p.stop()));
  });

  it("checks the origin above the per-host cap, because the origin is the site under audit", async () => {
    // One server in both roles: it serves the page and everything the page
    // links to, so every check is same-origin.
    const page = await startProbe(Array.from({ length: 24 }, (_, i) => `/l${i}`));
    running.push(page);

    await runLinkAudit(discoveryFor(page.url), {
      checkExternal: false,
      maxPerHost: 3,
      checkConcurrency: 8,
    });

    // Above the cap: the exemption applied.
    expect(page.peak()).toBeGreaterThan(3);
    // And still under the global ceiling, which is what actually bounds it.
    expect(page.peak()).toBeLessThanOrEqual(8);
  });

  it("keeps the per-host cap on a host that is not the origin", async () => {
    const third = await startProbe();
    running.push(third);

    const page = await startProbe(Array.from({ length: 24 }, (_, i) => `${third.url}/l${i}`));
    running.push(page);

    await runLinkAudit(discoveryFor(page.url), {
      checkExternal: true,
      maxPerHost: 3,
      checkConcurrency: 8,
    });

    // Politeness is owed here, and is still paid.
    expect(third.peak()).toBeLessThanOrEqual(3);
  });
});

describe("runLinkAudit — pages handed over", () => {
  const running: ConcurrencyProbe[] = [];
  afterEach(async () => {
    await Promise.all(running.splice(0).map((p) => p.stop()));
  });

  const ref = (url: string): LinkRef => ({
    rawHref: url,
    url,
    kind: "internal",
    source: "a",
    rel: [],
  });

  it("takes the links it was handed, without fetching or parsing the page", async () => {
    // Three readings of `/` disagree on purpose: the server links to `/served`,
    // the HTML handed over to `/parsed`, the links handed over to `/handed`.
    // The one the audit reports says which it used.
    const site = await startProbe(["/served"], 0);
    running.push(site);

    const report = await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      pages: new Map([
        [`${site.url}/`, { html: '<a href="/parsed">x</a>', links: [ref(`${site.url}/handed`)] }],
      ]),
    });

    expect(report.pagesScanned).toBe(1);
    expect(report.occurrences.map((o) => o.ref.url)).toEqual([`${site.url}/handed`]);
    expect(site.requests.filter((r) => r.endsWith(" /"))).toEqual([]);
  });

  it("parses the HTML it was handed when it has no links for the page", async () => {
    const site = await startProbe(["/served"], 0);
    running.push(site);

    const report = await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      pages: new Map([[`${site.url}/`, { html: '<a href="/parsed">x</a>' }]]),
    });

    expect(report.occurrences.map((o) => o.ref.url)).toEqual([`${site.url}/parsed`]);
    expect(site.requests.filter((r) => r.endsWith(" /"))).toEqual([]);
  });

  it("parses the HTML instead of the handed links when assets are wanted too", async () => {
    const site = await startProbe([], 0);
    running.push(site);

    const report = await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      includeAssets: true,
      pages: new Map([
        [`${site.url}/`, { html: '<img src="/logo.png">', links: [ref(`${site.url}/handed`)] }],
      ]),
    });

    expect(report.occurrences.map((o) => o.ref.url)).toEqual([`${site.url}/logo.png`]);
  });

  it("reads no further into a long page than a fetch of it would have", async () => {
    const site = await startProbe([], 0);
    running.push(site);

    const head = '<html><body><a href="/early">x</a>';
    const html = `${head}${" ".repeat(64)}<a href="/late">x</a></body></html>`;
    const report = await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      maxScanBytes: head.length + 8,
      // The handed links cover the whole page, so they are not what a fetch cut
      // at `maxScanBytes` would have read; the HTML is cut and parsed instead.
      pages: new Map([
        [`${site.url}/`, { html, links: [ref(`${site.url}/early`), ref(`${site.url}/late`)] }],
      ]),
    });

    expect(report.occurrences.map((o) => o.ref.url)).toEqual([`${site.url}/early`]);
  });

  it("fetches a page it was not handed, as it always did", async () => {
    const site = await startProbe(["/served"], 0);
    running.push(site);

    const report = await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      pages: new Map([[`${site.url}/elsewhere`, { html: '<a href="/handed">x</a>' }]]),
    });

    expect(report.occurrences.map((o) => o.ref.url)).toEqual([`${site.url}/served`]);
    expect(site.requests).toContain("GET /");
  });

  it("fetches what it must before reading what it was handed", async () => {
    // Reading a handed page never yields. Done while a request is in flight,
    // ten bulky pages outlast its timeout before the response can be taken.
    // The page to fetch comes first in the list, as it would in a pool.
    const site = await startProbe(["/served"], 0);
    running.push(site);

    const bulky = `<html><body>${'<p><a href="/x">x</a></p>'.repeat(20_000)}</body></html>`;
    const handed = Array.from({ length: 10 }, (_, i) => `${site.url}/h${i}`);
    const discovery = discoveryFor(site.url);
    discovery.urls = [{ loc: `${site.url}/` }, ...handed.map((loc) => ({ loc }))];

    const report = await runLinkAudit(discovery, {
      checkExternal: false,
      timeoutMs: 150,
      pages: new Map(handed.map((url) => [url, { html: bulky }])),
    });

    expect(report.diagnostics.pagesFailed).toBe(0);
    expect(report.pagesScanned).toBe(11);
  });
});

describe("runLinkAudit — answers in hand", () => {
  const running: ConcurrencyProbe[] = [];
  afterEach(async () => {
    await Promise.all(running.splice(0).map((p) => p.stop()));
  });

  const answer = (status: number) => ({
    status,
    body: "<html><body>a page</body></html>",
    checkedAt: "2026-10-24T00:00:00.000Z",
    durationMs: 3,
  });

  it("judges a link from a 2xx it already has, without probing it", async () => {
    const site = await startProbe(["/known", "/unknown"], 0);
    running.push(site);

    const report = await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      answers: new Map([[`${site.url}/known`, answer(200)]]),
    });

    expect(report.checks[`${site.url}/known`]).toMatchObject({ verdict: "ok", method: "GET" });
    expect(site.requests.filter((r) => r.endsWith(" /known"))).toEqual([]);
    expect(site.requests).toContain("HEAD /unknown");
  });

  it("probes a link whose answer was not a 2xx", async () => {
    const site = await startProbe(["/known"], 0);
    running.push(site);

    await runLinkAudit(discoveryFor(site.url), {
      checkExternal: false,
      answers: new Map([[`${site.url}/known`, answer(503)]]),
    });

    expect(site.requests).toContain("HEAD /known");
  });
});
