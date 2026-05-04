import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

export interface FixtureServerOptions {
  /**
   * Absolute or repo-relative path to the directory containing fixture files.
   * Defaults to `<repo>/fixtures`.
   */
  root?: string;
  /**
   * Port to bind. `0` (default) lets the OS pick a free port.
   */
  port?: number;
}

export interface FixtureServer {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

/**
 * Boot a tiny Hono HTTP server that serves files from `<root>` over real HTTP.
 *
 * The engine and CLI tests exercise the real fetch path against this server —
 * never mocked. See `Testing standards` in PLAN.md for the reasoning.
 *
 * If a request resolves to a directory, `index.html` is served when present.
 * Path traversal (`..`) outside `root` returns 403.
 */
export async function startFixtureServer(
  options: FixtureServerOptions = {},
): Promise<FixtureServer> {
  const root = options.root ? resolve(options.root) : resolve(__dirname, "..", "fixtures");

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Fixture root does not exist or is not a directory: ${root}`);
  }

  const app = new Hono();
  app.get("/_health", (c) => c.json({ ok: true, root }));

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

    const body = await readFile(target);
    const mime = MIME[extname(target).toLowerCase()] ?? "application/octet-stream";
    return new Response(body, { headers: { "content-type": mime } });
  });

  const server: ServerType = await new Promise((resolveBound, rejectBound) => {
    try {
      const s = serve({ fetch: app.fetch, port: options.port ?? 0 }, () => resolveBound(s));
    } catch (err) {
      rejectBound(err);
    }
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server failed to bind to a TCP port");
  }
  const port = address.port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    stop: () =>
      new Promise<void>((resolveClosed, rejectClosed) =>
        server.close((err) => (err ? rejectClosed(err) : resolveClosed())),
      ),
  };
}
