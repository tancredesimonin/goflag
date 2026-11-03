import { existsSync } from "node:fs";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultLauncher, extractHeadless } from "@/lib/core/extract/headless";
import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";

/**
 * `--header`, through `runAudit` and through Chromium.
 *
 * Two origins. `preview` answers nothing without the token, the way a Vercel
 * preview behind `x-vercel-protection-bypass` or a staging host behind basic
 * auth does. `elsewhere` stands for everything the audit touches that is not
 * the preview: a CDN serving the share image, an external link, the host a
 * redirect lands on. It records every header it is sent.
 *
 * The property under test is not that the audit gets in — that is the easy
 * half. It is that the token reaches `elsewhere` by no path at all: not as a
 * probe, not as a link check, not as the next hop of a redirect, not as a
 * sub-resource Chromium loads.
 */

const SECRET = "tok_preview_1b9c0e7a";
const TOKEN_HEADER = "x-preview-token";

interface Recorder {
  url: string;
  seen: { path: string; token: string | undefined; cookie?: string }[];
  stop: () => Promise<void>;
}

async function start(build: (app: Hono, recorder: Recorder) => void): Promise<Recorder> {
  const app = new Hono();
  const recorder: Recorder = { url: "", seen: [], stop: async () => undefined };
  app.use("*", async (c, next) => {
    recorder.seen.push({
      path: new URL(c.req.url).pathname,
      token: c.req.header(TOKEN_HEADER),
      cookie: c.req.header("cookie"),
    });
    await next();
  });
  build(app, recorder);

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  recorder.url = `http://127.0.0.1:${port}`;
  recorder.stop = () => new Promise((resolve) => server.close(() => resolve()));
  return recorder;
}

const html = (title: string, head: string, body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><title>${title}</title>` +
      `<meta name="description" content="A page of the protected preview, long enough to pass.">` +
      `${head}</head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

let elsewhere: Recorder;
let preview: Recorder;

beforeAll(async () => {
  elsewhere = await start((app) => {
    app.get("/og.png", (c) => c.body(null, 200, { "content-type": "image/png" }));
    app.get("*", (c) => c.html("<!doctype html><title>elsewhere</title>"));
  });

  preview = await start((app, self) => {
    // The token as a header, or — the other shape a preview protects itself
    // with — as a session cookie.
    app.use("*", async (c, next) => {
      const cookie = c.req.header("cookie") ?? "";
      const allowed =
        c.req.header(TOKEN_HEADER) === SECRET || cookie.includes(`preview_session=${SECRET}`);
      if (!allowed) return c.text("protected", 401);
      await next();
    });
    app.get("/robots.txt", () => new Response(`User-agent: *\nAllow: /\n`));
    app.get(
      "/sitemap.xml",
      () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?>` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
            `<url><loc>${self.url}/</loc></url><url><loc>${self.url}/about</loc></url>` +
            `</urlset>`,
          { headers: { "content-type": "application/xml" } },
        ),
    );
    app.get("/", () =>
      html(
        "Home",
        `<link rel="canonical" href="${self.url}/">` +
          `<meta property="og:image" content="${elsewhere.url}/og.png">`,
        `<a href="/about">About</a> <a href="/old">Old</a> <a href="/cross">Cross</a>` +
          ` <a href="${elsewhere.url}/external">External</a>`,
      ),
    );
    app.get("/about", () => html("About", `<link rel="canonical" href="${self.url}/about">`, ""));
    app.get("/old", (c) => c.redirect("/about", 301));
    app.get("/cross", (c) => c.redirect(`${elsewhere.url}/landing`, 302));
    // Every way a rendered page reaches the network: a third-party pixel and
    // script call, a local image, a local API behind a redirect (`/api-moved`,
    // the trailing-slash or versioning 307 a real API answers), and a local image
    // that redirects off the origin (a CDN rewrite).
    app.get("/rendered", () =>
      html(
        "Rendered",
        "",
        `<img src="${elsewhere.url}/pixel.png"><img src="/local.png"><img src="/img-to-cdn">` +
          `<script>fetch("${elsewhere.url}/api").catch(() => {});` +
          ` fetch("/api-moved").then((r) => r.text()).then((t) => { document.title += " " + t; });</script>`,
      ),
    );
    app.get("/api-moved", (c) => c.redirect("/api", 307));
    app.get("/api", (c) => c.text("api-ok"));
    app.get("/img-to-cdn", (c) => c.redirect(`${elsewhere.url}/cdn.png`, 302));
    // Sets a cookie of the site's own, the way a locale or consent cookie does,
    // then calls an API: both cookies must arrive together.
    app.get(
      "/cookie-page",
      () =>
        new Response(
          `<!doctype html><title>Cookies</title><script>fetch("/api").catch(() => {});</script>`,
          { headers: { "content-type": "text/html", "set-cookie": "site_locale=fr; Path=/" } },
        ),
    );
    app.get("*", (c) => c.text("not found", 404));
  });
});

afterAll(async () => {
  await preview?.stop();
  await elsewhere?.stop();
});

const FLAGS = { static: true, depth: 1, checkExternal: true } as const;

describe("a preview that answers nothing without its token", () => {
  let withToken: GoflagReport;

  beforeAll(async () => {
    preview.seen.length = 0;
    elsewhere.seen.length = 0;
    withToken = await runAudit(preview.url, { ...FLAGS, headers: { [TOKEN_HEADER]: SECRET } });
  }, 60_000);

  it("is audited, not judged as a login page", () => {
    expect(withToken.unreachablePages).toEqual([]);
    expect(withToken.diagnostics.pagesCrawled).toBeGreaterThanOrEqual(2);
  });

  it("sent the token on every request to the preview, probes and redirects included", () => {
    const paths = new Set(preview.seen.map((s) => s.path));
    for (const path of ["/robots.txt", "/sitemap.xml", "/", "/about", "/old", "/cross"]) {
      expect(paths).toContain(path);
    }
    expect(preview.seen.filter((s) => s.token !== SECRET)).toEqual([]);
  });

  it("sent it to no other origin: not the share image, the external link, nor a redirect's target", () => {
    const paths = new Set(elsewhere.seen.map((s) => s.path));
    expect(paths).toContain("/og.png");
    expect(paths).toContain("/external");
    expect(paths).toContain("/landing");
    expect(elsewhere.seen.filter((s) => s.token !== undefined)).toEqual([]);
  });

  it("names the header in the report and never carries its value", () => {
    expect(withToken.diagnostics.requestHeaders).toEqual([TOKEN_HEADER]);
    expect(JSON.stringify(withToken)).not.toContain(SECRET);
  });

  it("is a login page without it, which is why the flag exists", async () => {
    const without = await runAudit(preview.url, { ...FLAGS, depth: 0 });
    expect(without.unreachablePages.map((p) => p.status)).toContain(401);
    expect(without.diagnostics.requestHeaders).toBeUndefined();
  }, 60_000);
});

const chromiumAvailable = (() => {
  try {
    const path = chromium.executablePath();
    return typeof path === "string" && path.length > 0 && existsSync(path);
  } catch {
    return false;
  }
})();

// Same rule as inspect-spa.test.ts: a contributor without the browser skips,
// CI never does — there, a missing binary is a drifted pin.
if (!chromiumAvailable && process.env.CI) {
  throw new Error("Chromium is not installed in CI: the Playwright pin and the image drifted.");
}
const itIfChromium = chromiumAvailable ? it : it.skip;

describe("the same preview rendered in Chromium", () => {
  const scope = (headers: Record<string, string> = { [TOKEN_HEADER]: SECRET }) => ({
    origin: new URL(preview.url).origin,
    headers,
  });
  const render = (path: string, headers?: Record<string, string>) =>
    extractHeadless(`${preview.url}${path}`, {
      launcher: defaultLauncher(),
      scopedHeaders: scope(headers),
      waitUntil: "networkidle",
    });

  itIfChromium(
    "sends the token on every same-origin request, redirect hops included, and none to a third party",
    async () => {
      preview.seen.length = 0;
      elsewhere.seen.length = 0;
      const result = await render("/rendered");

      expect(result.fetch.status).toBe(200);
      // The title only gains "api-ok" if the redirected API call got through.
      expect(result.renderedHtml).toContain("<title>Rendered api-ok</title>");
      const local = new Set(preview.seen.map((s) => s.path));
      for (const path of ["/rendered", "/local.png", "/api-moved", "/api", "/img-to-cdn"]) {
        expect(local).toContain(path);
      }
      expect(preview.seen.filter((s) => s.token !== SECRET)).toEqual([]);

      const third = new Set(elsewhere.seen.map((s) => s.path));
      for (const path of ["/pixel.png", "/api", "/cdn.png"]) expect(third).toContain(path);
      expect(elsewhere.seen.filter((s) => s.token !== undefined)).toEqual([]);
    },
    60_000,
  );

  itIfChromium(
    "follows a redirect within the origin with the token, and leaves it behind at the origin's edge",
    async () => {
      elsewhere.seen.length = 0;
      const within = await render("/old");
      expect(within.fetch.status).toBe(200);
      expect(within.fetch.finalUrl).toBe(`${preview.url}/about`);

      const across = await render("/cross");
      expect(across.fetch.finalUrl).toBe(`${elsewhere.url}/landing`);
      expect(elsewhere.seen.map((s) => s.path)).toContain("/landing");
      expect(elsewhere.seen.filter((s) => s.token !== undefined)).toEqual([]);
    },
    60_000,
  );

  itIfChromium(
    "adds a session cookie to the site's own cookies instead of replacing them",
    async () => {
      preview.seen.length = 0;
      const session = `preview_session=${SECRET}`;
      const result = await render("/cookie-page", { Cookie: session });

      expect(result.fetch.status).toBe(200);
      const api = preview.seen.find((s) => s.path === "/api");
      expect(api?.cookie).toContain("site_locale=fr");
      expect(api?.cookie).toContain(session);
    },
    60_000,
  );
});
