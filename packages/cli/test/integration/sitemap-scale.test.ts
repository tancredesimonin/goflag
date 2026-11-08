/**
 * A million URLs in twenty children: the "done when" of T-3
 * (`docs/integrations-plan.md` §3).
 *
 * Discovery used to load each document whole into cheerio and stop at 5,000
 * URLs and 50 children. With those caps raised, the same index cost 1.29 GB of
 * heap at its peak and 11 s (measured 2026-11-08 on an M-series Mac); streamed,
 * 0.35 GB and 2 s. What it keeps is the same 0.25 GB either way — the entries
 * themselves — so the difference is the documents and their trees, which is
 * what the bound below would catch coming back.
 *
 * The site is generated here and served chunk by chunk, so the fixture itself
 * holds nothing: a committed file of this size would be 80 MB.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { discoverSitemap } from "../../src/lib/core/sitemap/discover";

const CHILDREN = 20;
const PER_CHILD = 50_000;
const LOCALES = ["en", "fr", "de", "es", "pt-br"];

/**
 * Heap the discovery may add at its peak. The entries alone are ~250 MB; the
 * old parser's peak was 1,289 MB. Twice what the stream needs, half of what
 * the trees cost.
 */
const PEAK_BUDGET = 640 * 1024 * 1024;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/sitemap.xml") {
      res.setHeader("content-type", "application/xml");
      let body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (let i = 0; i < CHILDREN; i++)
        body += `<sitemap><loc>${base}/sitemap-${i}.xml</loc></sitemap>\n`;
      res.end(`${body}</sitemapindex>\n`);
      return;
    }
    const match = /^\/sitemap-(\d+)\.xml$/.exec(req.url ?? "");
    if (!match) {
      res.writeHead(404).end();
      return;
    }
    const child = Number(match[1]);
    res.setHeader("content-type", "application/xml");
    res.write(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`,
    );
    let i = 0;
    const pump = () => {
      while (i < PER_CHILD) {
        const n = child * PER_CHILD + i++;
        const day = String((n % 28) + 1).padStart(2, "0");
        const more = res.write(
          `<url><loc>${base}/${LOCALES[n % LOCALES.length]}/products/item-${n}</loc><lastmod>2026-10-${day}</lastmod></url>\n`,
        );
        if (!more) {
          res.once("drain", pump);
          return;
        }
      }
      res.end("</urlset>\n");
    };
    pump();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("sitemap discovery at scale", () => {
  it("reads a million URLs in twenty children within a bounded heap", async () => {
    const before = process.memoryUsage().heapUsed;
    let peak = before;
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }, 10);

    const discovery = await discoverSitemap(`${base}/`, {
      crawlFallback: false,
      timeoutMs: 60_000,
    });

    clearInterval(sampler);
    peak = Math.max(peak, process.memoryUsage().heapUsed);

    expect(discovery.urls).toHaveLength(CHILDREN * PER_CHILD);
    // Exactly at the default cap of a million, and nothing was left out.
    expect(discovery.truncated).toBe(false);
    expect(discovery.documents).toHaveLength(1 + CHILDREN);
    expect(discovery.documents.slice(1).every((doc) => doc.urlCount === PER_CHILD)).toBe(true);
    expect(peak - before).toBeLessThan(PEAK_BUDGET);
  }, 120_000);
});
