import { describe, expect, it } from "vitest";
import { FetchError, fetchStatic } from "./static";

describe("fetchStatic — input validation", () => {
  it("rejects an unparseable URL with FetchError", async () => {
    await expect(fetchStatic("::nonsense::")).rejects.toBeInstanceOf(FetchError);
    await expect(fetchStatic("::nonsense::")).rejects.toMatchObject({
      message: expect.stringContaining("Invalid URL"),
    });
  });

  it("rejects unsupported protocols", async () => {
    await expect(fetchStatic("ftp://example.com/")).rejects.toMatchObject({
      message: expect.stringContaining("Unsupported protocol"),
    });
  });
});

describe("fetchStatic — network behavior", () => {
  it("times out and throws FetchError for a port with no listener", async () => {
    await expect(fetchStatic("http://127.0.0.1:1/", { timeoutMs: 800 })).rejects.toBeInstanceOf(
      FetchError,
    );
  });

  it("captures status, headers, body, content-type, durationMs, bodyBytes", async () => {
    // Spin up a tiny in-process server with redirect support.
    const { createServer } = await import("node:http");
    const server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "x-test": "yes",
      });
      res.end("<html><head><title>ok</title></head></html>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;

    try {
      const direct = await fetchStatic(`http://127.0.0.1:${port}/`);
      expect(direct.meta.status).toBe(200);
      expect(direct.meta.contentType).toBe("text/html");
      expect(direct.meta.headers["x-test"]).toBe("yes");
      expect(direct.meta.bodyBytes).toBeGreaterThan(10);
      expect(direct.meta.redirectCount).toBe(0);
      expect(direct.meta.durationMs).toBeGreaterThanOrEqual(0);
      expect(direct.body).toContain("<title>ok</title>");

      const followed = await fetchStatic(`http://127.0.0.1:${port}/redirect`);
      expect(followed.meta.redirectCount).toBe(1);
      expect(followed.meta.finalUrl).toBe(`http://127.0.0.1:${port}/final`);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 10_000);

  it("aborts after maxRedirects", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((req, res) => {
      // Always redirect, never resolve.
      res.writeHead(302, { location: req.url! });
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        fetchStatic(`http://127.0.0.1:${port}/`, { maxRedirects: 2 }),
      ).rejects.toMatchObject({ message: expect.stringContaining("redirects") });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 10_000);
});
