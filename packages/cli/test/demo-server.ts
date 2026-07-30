import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The demo-site server used by the end-to-end audit + CLI tests.
 *
 * It serves the plain-HTML fake site in `fixtures/sites/demo/` over real
 * HTTP, and overlays a handful of programmable routes under `/x/*` that a
 * static file server cannot express (redirects, redirect loops, 5xx,
 * soft-404, 403). The demo pages link to these so the link auditor sees the
 * full outcome matrix.
 *
 * Routes:
 *   GET  /                    -> 302 redirect to /en (site entry)
 *   GET  /x/redirect          -> 302 -> /en/about (resolves 200)
 *   GET  /x/redirect-loop-a   -> 302 -> /x/redirect-loop-b (loop)
 *   GET  /x/redirect-loop-b   -> 302 -> /x/redirect-loop-a (loop)
 *   GET  /x/server-error      -> 500
 *   GET  /x/soft              -> 200 with a "not found" body (soft-404)
 *   GET  /x/forbidden         -> 403 (anti-bot / blocked)
 *   GET  *                    -> static file from the demo root (404 if absent)
 *
 * Everything is hermetic: no request ever leaves localhost.
 */

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface DemoServer {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

export async function startDemoServer(port = 0): Promise<DemoServer> {
  const root = resolve(__dirname, "..", "fixtures", "sites", "demo");
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Demo site root not found: ${root}`);
  }

  // The demo site now ships a sitemap, and a sitemap must carry absolute
  // URLs — but the port is only known at bind time. Same `BASE` token as
  // `fixture-server.ts`, so both servers behave alike.
  let origin = "";

  const app = new Hono();

  // --- Programmable link-outcome routes ----------------------------------
  app.get("/", (c) => c.redirect("/en", 302));
  app.get("/x/redirect", (c) => c.redirect("/en/about", 302));
  app.get("/x/redirect-loop-a", (c) => c.redirect("/x/redirect-loop-b", 302));
  app.get("/x/redirect-loop-b", (c) => c.redirect("/x/redirect-loop-a", 302));
  app.get("/x/server-error", (c) => c.text("Internal Server Error", 500));
  app.get("/x/forbidden", (c) => c.text("Forbidden", 403));
  app.get(
    "/x/soft",
    () =>
      new Response("<!doctype html><html><body><h1>Page not found</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  );

  // --- Static demo files -------------------------------------------------
  app.get("*", async (c) => {
    const requested = decodeURIComponent(new URL(c.req.url).pathname);
    let target = normalize(join(root, requested));
    if (target !== root && !target.startsWith(root + sep)) {
      return c.text("Forbidden", 403);
    }
    if (existsSync(target) && statSync(target).isDirectory()) {
      target = join(target, "index.html");
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      return c.text("Not Found", 404);
    }
    const ext = extname(target).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    if (ext === ".xml" || ext === ".txt") {
      const text = (await readFile(target, "utf8")).split("BASE").join(origin);
      return new Response(text, { headers: { "content-type": mime } });
    }
    const body = await readFile(target);
    return new Response(body, { headers: { "content-type": mime } });
  });

  const server: ServerType = await new Promise((resolveBound, rejectBound) => {
    try {
      const s = serve({ fetch: app.fetch, port }, () => resolveBound(s));
    } catch (err) {
      rejectBound(err);
    }
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Demo server failed to bind to a TCP port");
  }
  const boundPort = address.port;
  origin = `http://127.0.0.1:${boundPort}`;

  return {
    url: `http://127.0.0.1:${boundPort}`,
    port: boundPort,
    stop: () =>
      new Promise<void>((resolveClosed, rejectClosed) =>
        server.close((err) => (err ? rejectClosed(err) : resolveClosed())),
      ),
  };
}
