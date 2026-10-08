/**
 * The two origin probes behind `http.not-found` and the `llmstxt.*` rules,
 * against a real HTTP server on loopback — the same arrangement as
 * `probes-network.test.ts`, with a handler per case so a test can make the
 * server lie about `HEAD`, crash on a dotted path, or answer every unknown
 * path with its home page.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { probeLlmsTxt } from "../../src/lib/core/probes/llms-txt";
import { probeNotFound } from "../../src/lib/core/probes/not-found";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let handler: Handler = (_req, res) => res.writeHead(404).end("not found");

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const HOME = '<!DOCTYPE html><html lang="llms.txt"><head><title>Home</title></head></html>';

describe("probeNotFound", () => {
  it("asks for a bare and a dotted path, both carrying the nonce", async () => {
    const seen: string[] = [];
    handler = (req, res) => {
      seen.push(req.url ?? "");
      res.writeHead(404).end();
    };
    const probes = await probeNotFound(baseUrl, { nonce: "abc" });

    expect(probes.map((p) => [p.shape, p.status])).toEqual([
      ["bare", 404],
      ["dotted", 404],
    ]);
    expect(probes[0]!.url).toBe(`${baseUrl}/goflag-probe-abc`);
    expect(probes[1]!.url).toBe(`${baseUrl}/goflag-probe-abc.txt`);
    // HEAD only: a site that answers correctly costs two requests and no body.
    expect(seen.sort()).toEqual(["/goflag-probe-abc", "/goflag-probe-abc.txt"]);
  });

  it("draws a fresh, unguessable nonce when none is given", async () => {
    handler = (_req, res) => res.writeHead(404).end();
    const [a] = await probeNotFound(baseUrl);
    const [b] = await probeNotFound(baseUrl);
    expect(a!.url).toMatch(/\/goflag-probe-[0-9a-f]{32}$/);
    expect(a!.url).not.toBe(b!.url);
  });

  it("records the catch-all: a dotted path served as a page", async () => {
    // openfinanceguide.com on 2026-10-05: the middleware matcher skips dotted
    // paths, so `/anything.txt` reaches the `[locale]` page route.
    handler = (req, res) => {
      if (req.url?.includes("."))
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      else res.writeHead(404);
      res.end(req.method === "HEAD" ? undefined : HOME);
    };
    const [bare, dotted] = await probeNotFound(baseUrl, { nonce: "n" });
    expect(bare!.status).toBe(404);
    expect(dotted).toMatchObject({ status: 200, contentType: "text/html" });
  });

  it("follows redirects and reports where they landed", async () => {
    handler = (req, res) => {
      if (req.url === "/goflag-probe-n") res.writeHead(307, { location: "/en/goflag-probe-n" });
      else res.writeHead(404);
      res.end();
    };
    const [bare] = await probeNotFound(baseUrl, { nonce: "n" });
    expect(bare).toMatchObject({ status: 404, finalUrl: `${baseUrl}/en/goflag-probe-n` });
  });

  it("believes GET over a HEAD that answered without consulting the route", async () => {
    // The answer that becomes an `error` is asked twice. A proxy that says 200
    // to every HEAD is not the site's catch-all.
    handler = (req, res) => res.writeHead(req.method === "HEAD" ? 200 : 404).end();
    const probes = await probeNotFound(baseUrl, { nonce: "n" });
    expect(probes.map((p) => p.status)).toEqual([404, 404]);
  });

  it("falls back to GET when HEAD is refused", async () => {
    handler = (req, res) => res.writeHead(req.method === "HEAD" ? 405 : 500).end("boom");
    const probes = await probeNotFound(baseUrl, { nonce: "n" });
    expect(probes.map((p) => p.status)).toEqual([500, 500]);
  });

  it("records no answer as status 0, never as a verdict", async () => {
    const probes = await probeNotFound("http://127.0.0.1:1", { nonce: "n" });
    expect(probes.map((p) => p.status)).toEqual([0, 0]);
  });
});

describe("probeLlmsTxt", () => {
  it("reads a served file: status, type, H1 and links", async () => {
    handler = (req, res) => {
      if (req.url !== "/llms.txt") return res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
      res.end("# Site\n\n> Summary\n\n## Docs\n\n- [Guide](/raw/guide.md): the guide\n");
    };
    const probe = await probeLlmsTxt(baseUrl);
    expect(probe).toMatchObject({
      found: true,
      html: false,
      status: 200,
      contentType: "text/markdown",
      h1: { text: "Site", line: 1 },
    });
    expect(probe.links).toEqual([{ name: "Guide", url: `${baseUrl}/raw/guide.md`, line: 7 }]);
  });

  it("treats a 404 as absent, which is allowed", async () => {
    handler = (_req, res) => res.writeHead(404).end("not found");
    expect(await probeLlmsTxt(baseUrl)).toMatchObject({ found: false, status: 404, links: [] });
  });

  it("keeps a server error's status, so it is not mistaken for an absence", async () => {
    handler = (_req, res) => res.writeHead(500, { "content-type": "text/plain" }).end("boom");
    expect(await probeLlmsTxt(baseUrl)).toMatchObject({ found: false, status: 500 });
  });

  it("does not parse a home page as markdown", async () => {
    // Parsing it would report a missing H1 and every navigation link as an
    // entry, about a file that does not exist.
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`${HOME}<a href="/about">About</a> [x](/y)`);
    };
    const probe = await probeLlmsTxt(baseUrl);
    expect(probe).toMatchObject({ found: true, html: true, contentType: "text/html", links: [] });
    expect(probe.h1).toBeUndefined();
  });

  it("records no answer as status 0", async () => {
    expect(await probeLlmsTxt("http://127.0.0.1:1")).toMatchObject({ found: false, status: 0 });
  });
});
