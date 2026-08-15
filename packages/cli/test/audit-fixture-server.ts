import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFavicon } from "./favicon-route";

/**
 * Programmable fixture server for the link-checker and strengthened
 * sitemap engine tests. Unlike the static `fixture-server.ts`, this app
 * serves dynamic responses so the engine's real fetch path can be
 * exercised against the full matrix of link outcomes:
 *
 *   - a small site of pages with internal + external links,
 *   - 404 / 500 endpoints,
 *   - a redirect chain that resolves and a redirect loop,
 *   - a HEAD-rejecting (405) endpoint that answers GET,
 *   - a 429 endpoint with Retry-After (always, and once-then-200),
 *   - a soft-404 (200 body saying "not found"),
 *   - a sitemap that lists a dead URL + an orphan page.
 *
 * Per PLAN.md testing standards: engine tests hit this real server, never
 * mocks.
 */

export interface AuditFixtureServer {
  url: string;
  port: number;
  stop: () => Promise<void>;
  /** Reset per-request counters (e.g. the rate-limit-once endpoint). */
  reset: () => void;
}

export interface AuditFixtureOptions {
  port?: number;
  /**
   * Origin used for the "external" links the home/about pages render.
   * Defaults to a non-local example host; tests that probe external links
   * pass a second fixture server's URL here to stay hermetic.
   */
  externalOrigin?: string;
}

export async function startAuditFixtureServer(
  options: AuditFixtureOptions | number = {},
): Promise<AuditFixtureServer> {
  const opts = typeof options === "number" ? { port: options } : options;
  const port = opts.port ?? 0;
  const externalOrigin = opts.externalOrigin ?? "https://example.com";
  const app = new Hono();
  serveFavicon(app);

  // Mutable state for endpoints that change behaviour across requests.
  const state = { rateLimitOnceHits: 0 };

  const html = (body: string) =>
    new Response(
      `<!doctype html><html><head><title>fixture</title></head><body>${body}</body></html>`,
      {
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );

  app.get("/_health", (c) => c.json({ ok: true }));

  // --- Site pages --------------------------------------------------------
  app.get("/", () =>
    html(`
      <a href="/about">About</a>
      <a href="/blog">Blog</a>
      <a href="/missing">Dead internal link</a>
      <a href="/server-error">Boom</a>
      <a href="${externalOrigin}/">External example</a>
      <a href="mailto:hi@example.com">Email</a>
      <img src="/logo.png" alt="logo" />
    `),
  );

  app.get("/about", () =>
    html(`
      <a href="/">Home</a>
      <a href="/contact">Contact</a>
      <a href="/redirect-1">Redirected link</a>
      <a href="${externalOrigin}/">External example</a>
    `),
  );

  app.get("/contact", () =>
    html(`
      <a href="/">Home</a>
      <a href="tel:+15551234">Call</a>
      <a href="/soft-404">Soft 404 link</a>
      <a href="#top">Jump to top</a>
    `),
  );

  app.get("/blog", () =>
    html(`
      <a href="/">Home</a>
      <a href="/blog/post-1">Post one</a>
      <a href="/blog/post-2">Post two</a>
      <a href="/missing">Dead internal link</a>
    `),
  );

  app.get("/blog/post-1", () => html(`<a href="/blog">Back</a>`));
  app.get("/blog/post-2", () => html(`<a href="/blog">Back</a>`));

  // An orphan page: reachable by crawl from /about? No — only linked here,
  // and deliberately omitted from the sitemap so the sitemap orphan check
  // can diff it. It links nowhere new.
  app.get("/orphan", () => html(`<a href="/">Home</a>`));

  app.get("/logo.png", (c) => c.body(null, 200, { "content-type": "image/png" }));

  // A 200 response with no content-type header at all.
  app.get("/no-content-type", () => new Response("plain body, no content-type", { status: 200 }));

  // A redirect whose Location header is unparseable even as a relative URL.
  app.get("/bad-redirect", (c) => c.body(null, 302, { location: "http://" }));

  // --- Status endpoints --------------------------------------------------
  app.get("/missing", (c) => c.text("Not Found", 404));
  app.get("/server-error", (c) => c.text("Internal Server Error", 500));
  app.get("/forbidden", (c) => c.text("Forbidden", 403));
  app.get("/target", () => html(`<a href="/">Home</a>`));

  // --- Redirects ---------------------------------------------------------
  app.get("/redirect-1", (c) => c.redirect("/redirect-2", 302));
  app.get("/redirect-2", (c) => c.redirect("/target", 302));
  app.get("/loop-a", (c) => c.redirect("/loop-b", 302));
  app.get("/loop-b", (c) => c.redirect("/loop-a", 302));

  // --- HEAD-rejecting endpoint -------------------------------------------
  app.on("HEAD", "/head-405", (c) => c.body(null, 405));
  app.get("/head-405", () => html(`ok via GET`));

  // --- Rate limiting -----------------------------------------------------
  app.all("/rate-limited", (c) => c.text("Too Many Requests", 429, { "retry-after": "0" }));
  app.all("/rate-limited-once", (c) => {
    state.rateLimitOnceHits += 1;
    if (state.rateLimitOnceHits === 1) {
      return c.text("Too Many Requests", 429, { "retry-after": "0" });
    }
    return c.text("ok", 200);
  });
  // Same, but advertises Retry-After as an HTTP-date in the past.
  app.all("/rate-limited-once-date", (c) => {
    state.rateLimitOnceHits += 1;
    if (state.rateLimitOnceHits === 1) {
      return c.text("Too Many Requests", 429, { "retry-after": "Wed, 01 Jan 2020 00:00:00 GMT" });
    }
    return c.text("ok", 200);
  });

  // --- Soft 404 ----------------------------------------------------------
  app.get(
    "/soft-404",
    () =>
      new Response("<!doctype html><html><body><h1>Page not found</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  );

  // --- robots + sitemap --------------------------------------------------
  app.get("/robots.txt", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.text(`User-agent: *\nDisallow: /private\nSitemap: ${origin}/sitemap.xml\n`);
  });

  app.get("/sitemap.xml", (c) => {
    const origin = new URL(c.req.url).origin;
    const locs = [
      "/",
      "/about",
      "/contact",
      "/blog",
      "/blog/post-1",
      "/blog/post-2",
      "/missing",
      "/private/secret",
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs
  .map((loc) => `  <url><loc>${origin}${loc}</loc><lastmod>2024-01-01</lastmod></url>`)
  .join("\n")}
  <url><loc>${origin}/future</loc><lastmod>2999-01-01</lastmod></url>
  <url><loc>${origin}/badmod</loc><lastmod>not-a-date</lastmod></url>
</urlset>`;
    return c.body(body, 200, { "content-type": "application/xml; charset=utf-8" });
  });

  app.get("/future", () => html(`<a href="/">Home</a>`));
  app.get("/badmod", () => html(`<a href="/">Home</a>`));
  app.get("/private/secret", () => html(`<a href="/">Home</a>`));

  const server: ServerType = await new Promise((resolveBound, rejectBound) => {
    try {
      const s = serve({ fetch: app.fetch, port }, () => resolveBound(s));
    } catch (err) {
      rejectBound(err);
    }
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Audit fixture server failed to bind to a TCP port");
  }
  const boundPort = address.port;

  return {
    url: `http://127.0.0.1:${boundPort}`,
    port: boundPort,
    reset: () => {
      state.rateLimitOnceHits = 0;
    },
    stop: () =>
      new Promise<void>((resolveClosed, rejectClosed) =>
        server.close((err) => (err ? rejectClosed(err) : resolveClosed())),
      ),
  };
}

export interface SelfSignedServer {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Boot an HTTPS server with a freshly-generated self-signed certificate.
 * Used to exercise `fetchUrl`'s `allowInsecureTls` toggle and the `tls`
 * failure classification through the real TLS stack. Returns `null` if
 * `openssl` is unavailable so the caller can skip gracefully.
 */
export async function startSelfSignedHttpsServer(): Promise<SelfSignedServer | null> {
  let dir: string;
  let key: Buffer;
  let cert: Buffer;
  try {
    dir = mkdtempSync(join(tmpdir(), "goflag-tls-"));
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ]);
    key = readFileSync(keyPath);
    cert = readFileSync(certPath);
    rmSync(dir, { recursive: true, force: true });
  } catch {
    return null;
  }

  const server: HttpsServer = createHttpsServer({ key, cert }, (_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><body>secure ok</body></html>");
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", () => resolveListen()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("HTTPS fixture server failed to bind");
  }

  return {
    url: `https://localhost:${address.port}`,
    stop: () =>
      new Promise<void>((resolveClosed, rejectClosed) =>
        server.close((err) => (err ? rejectClosed(err) : resolveClosed())),
      ),
  };
}
