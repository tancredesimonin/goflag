import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { runLinkAudit } from "./audit";
import type { SiteDiscovery } from "../sitemap/types";

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
  stop: () => Promise<void>;
}

async function startProbe(links: string[] = [], delayMs = 40): Promise<ConcurrencyProbe> {
  let inFlight = 0;
  let peak = 0;

  const server: Server = createServer((req, res) => {
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
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function discoveryFor(origin: string): SiteDiscovery {
  return {
    origin,
    baseUrl: origin,
    source: "crawl",
    urls: [{ loc: `${origin}/` }],
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
