import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serve, type ServerType } from "@hono/node-server";
import { buildRuleCatalog, runAudit } from "@goflag/cli";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGoflagServer, readConfiguredHeaders } from "./server";

/**
 * The server, driven the way an agent drives it: a real MCP client over an
 * in-memory transport, against a bilingual site on loopback.
 *
 * The site serves `/en/pricing` and, while `complete` holds, `/fr/pricing`.
 * Switching it off is the change an agent makes by accident — a translation
 * that stops existing — and the one the tools have to name.
 */

let site: { url: string; complete: boolean; stop: () => Promise<void> };

/** A page of the fixture, declaring the translations that exist right now. */
const page = (origin: string, locale: "en" | "fr", path: "/" | "/pricing", complete: boolean) => {
  const locales = path === "/pricing" && !complete ? ["en"] : ["en", "fr"];
  const alternates = locales
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${origin}/${l}${path}">`)
    .join("");
  const title = { "/": { en: "Home", fr: "Accueil" }, "/pricing": { en: "Pricing", fr: "Tarifs" } };
  return `<!doctype html><html lang="${locale}"><head>
<title>${title[path][locale]} of the bilingual fixture</title>
<meta name="description" content="A bilingual fixture page, written long enough to pass the length rule.">
<link rel="canonical" href="${origin}/${locale}${path}">
${alternates}<link rel="alternate" hreflang="x-default" href="${origin}/en${path}">
</head><body><a href="/${locale}/">home</a> <a href="/${locale}/pricing">pricing</a></body></html>`;
};

beforeAll(async () => {
  const app = new Hono();
  const state = { url: "", complete: true };
  app.get("/robots.txt", (c) =>
    c.text(`User-agent: *\nAllow: /\nSitemap: ${state.url}/sitemap.xml\n`),
  );
  app.get("/sitemap.xml", (c) => {
    const paths = ["/en/", "/fr/", "/en/pricing", ...(state.complete ? ["/fr/pricing"] : [])];
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
        .map((p) => `<url><loc>${state.url}${p}</loc></url>`)
        .join("")}</urlset>`,
      200,
      { "content-type": "application/xml" },
    );
  });
  app.get("/", (c) => c.redirect("/en/", 308));
  app.get("/en/", (c) => c.html(page(state.url, "en", "/", state.complete)));
  app.get("/fr/", (c) => c.html(page(state.url, "fr", "/", state.complete)));
  app.get("/en/pricing", (c) => c.html(page(state.url, "en", "/pricing", state.complete)));
  app.get("/fr/pricing", (c) =>
    state.complete ? c.html(page(state.url, "fr", "/pricing", true)) : c.text("not found", 404),
  );
  app.get("*", (c) => c.text("not found", 404));

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
  });
  const address = server.address();
  state.url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  site = {
    get url() {
      return state.url;
    },
    get complete() {
      return state.complete;
    },
    set complete(value: boolean) {
      state.complete = value;
    },
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
});

afterAll(async () => {
  await site?.stop();
});

async function connect(options?: Parameters<typeof createGoflagServer>[0]): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createGoflagServer(options).connect(serverSide);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

const structured = (result: unknown) =>
  (result as CallToolResult).structuredContent as Record<string, unknown>;
const text = (result: unknown) =>
  ((result as CallToolResult).content[0] as { type: "text"; text: string }).text;

describe("the goflag MCP server", () => {
  it("offers four read-only tools, each with a title, and instructions for the agent", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "audit_site",
      "compare_to_baseline",
      "explain_rule",
      "list_rules",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.title).toBeTruthy();
      expect(tool.name.length).toBeLessThanOrEqual(64);
    }
    expect(client.getInstructions()).toContain("audit_site");
  });

  it("audit_site finds the translation the site lost, as the CLI would", async () => {
    const client = await connect();
    site.complete = false;
    try {
      const result = await client.callTool({
        name: "audit_site",
        arguments: { url: `${site.url}/en/`, static: true },
      });
      expect(result.isError).toBeFalsy();
      const out = structured(result);
      const summary = out.summary as {
        translations: { holes: { route: string; missingLocales: string[] }[] };
      };
      expect(summary.translations.holes).toContainEqual(
        expect.objectContaining({ route: "/pricing", missingLocales: ["fr"] }),
      );
      expect(out.exitCode).toBe(1);
      expect(text(result)).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/en\/: (yellow|red) flag/);
    } finally {
      site.complete = true;
    }
  });

  it("reports progress to a client that asks for it", async () => {
    const client = await connect();
    const seen: number[] = [];
    await client.callTool(
      { name: "audit_site", arguments: { url: `${site.url}/en/`, static: true } },
      undefined,
      { onprogress: (p) => seen.push(p.progress) },
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("compare_to_baseline names what a change broke against a report saved by the CLI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goflag-mcp-"));
    try {
      const baseline = await runAudit(`${site.url}/en/`, { static: true, checkExternal: false });
      const path = join(dir, "baseline.json");
      writeFileSync(path, JSON.stringify(baseline));

      site.complete = false;
      const client = await connect();
      const result = await client.callTool({
        name: "compare_to_baseline",
        arguments: { url: `${site.url}/en/`, static: true, baseline: path },
      });
      expect(result.isError).toBeFalsy();
      const out = structured(result);
      expect(out.added).toContainEqual(expect.objectContaining({ kind: "translationHole" }));
      expect(out.exitCode).toBe(1);
    } finally {
      site.complete = true;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a baseline that is not a goflag report, without quoting the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goflag-mcp-"));
    try {
      const secret = "-----BEGIN OPENSSH PRIVATE KEY----- not-a-report";
      const notJson = join(dir, "id_ed25519");
      const json = join(dir, "other.json");
      writeFileSync(notJson, secret);
      writeFileSync(json, `{"broken": ${JSON.stringify(secret)}`);
      const client = await connect();
      for (const path of [notJson, json, join(dir, "missing.json")]) {
        const result = await client.callTool({
          name: "compare_to_baseline",
          arguments: { url: `${site.url}/en/`, static: true, baseline: path },
        });
        expect(result.isError).toBe(true);
        expect(text(result)).not.toContain("OPENSSH");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("explain_rule returns the catalogue's entry, its sources resolved, and its page", async () => {
    const client = await connect();
    const catalog = buildRuleCatalog();
    const entry = catalog.rules.find((rule) => rule.id === "hreflang.cluster-incomplete")!;
    const out = structured(
      await client.callTool({ name: "explain_rule", arguments: { id: entry.id } }),
    );
    expect(out.summary).toBe(entry.summary);
    expect(out.rigor).toBe(entry.rigor);
    expect(out.docs).toBe("https://goflag.tech/docs/rules/hreflang.cluster-incomplete");
    expect((out.sources as { id: string; url?: string }[]).map((s) => s.id)).toEqual(entry.sources);
    expect((out.sources as { url?: string }[]).every((s) => typeof s.url === "string")).toBe(true);
  });

  it("explain_rule points an unknown id at its neighbours and at list_rules", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "explain_rule",
      arguments: { id: "hreflang.nope" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("hreflang.missing");
    expect(text(result)).toContain("list_rules");
  });

  it("list_rules returns the whole catalogue, or one scope of it", async () => {
    const client = await connect();
    const catalog = buildRuleCatalog();
    const all = structured(await client.callTool({ name: "list_rules", arguments: {} }));
    expect((all.rules as unknown[]).length).toBe(catalog.rules.length);
    const site = structured(
      await client.callTool({ name: "list_rules", arguments: { scope: "site" } }),
    );
    expect((site.rules as unknown[]).length).toBe(catalog.counts.site);
  });

  it("answers an invalid URL with a tool error, not a crash", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "audit_site", arguments: { url: "not a url" } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not a valid http(s) URL");
  });
});

/**
 * A protected preview, and a second origin that records what it was sent: the
 * configured header has to open the first and never reach the second, whatever
 * URL the agent asks for.
 */
describe("headers from the server's configuration", () => {
  const secret = "preview-secret-never-printed";
  let preview: { url: string; stop: () => Promise<void> };
  let elsewhere: { url: string; seen: (string | undefined)[]; stop: () => Promise<void> };

  async function listen(app: Hono): Promise<{ url: string; stop: () => Promise<void> }> {
    const server: ServerType = await new Promise((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
    });
    const address = server.address();
    return {
      url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      stop: () => new Promise((resolve) => server.close(() => resolve())),
    };
  }

  const html = (title: string) =>
    `<!doctype html><html lang="en"><head><title>${title}, a page long enough to pass</title><meta name="description" content="A page behind a preview token, written long enough to pass the length rule."></head><body>ok</body></html>`;

  beforeAll(async () => {
    const guarded = new Hono();
    guarded.use("*", async (c, next) => {
      if (c.req.header("x-preview-token") !== secret) return c.text("unauthorised", 401);
      await next();
    });
    guarded.get("/", (c) => c.html(html("Preview home")));
    guarded.get("*", (c) => c.text("not found", 404));
    preview = await listen(guarded);

    const seen: (string | undefined)[] = [];
    const recorder = new Hono();
    recorder.use("*", async (c, next) => {
      seen.push(c.req.header("x-preview-token"));
      await next();
    });
    recorder.get("/", (c) => c.html(html("Elsewhere")));
    recorder.get("*", (c) => c.text("not found", 404));
    elsewhere = { ...(await listen(recorder)), seen };
  });

  afterAll(async () => {
    await preview?.stop();
    await elsewhere?.stop();
  });

  const env = () => ({
    GOFLAG_HEADERS: `X-Preview-Token: ${secret}`,
    GOFLAG_HEADERS_ORIGIN: preview.url,
  });

  it("opens the configured origin, and says so in its instructions without the value", async () => {
    const client = await connect({ env: env() });
    expect(client.getInstructions()).toContain(`(X-Preview-Token) for ${preview.url}`);
    expect(client.getInstructions()).not.toContain(secret);

    const result = await client.callTool({
      name: "audit_site",
      arguments: { url: `${preview.url}/`, static: true, maxPages: 3 },
    });
    expect((result as CallToolResult).isError).toBeFalsy();
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("unauthorised");
    expect(text(result)).toMatch(/[1-9]\d* pages? audited/);
  });

  it("sends nothing to another origin, whatever the agent asks", async () => {
    const client = await connect({ env: env() });
    await client.callTool({
      name: "audit_site",
      arguments: { url: `${elsewhere.url}/`, static: true, maxPages: 3 },
    });
    expect(elsewhere.seen.length).toBeGreaterThan(0);
    expect(elsewhere.seen.every((value) => value === undefined)).toBe(true);
  });

  it("without configuration, a protected preview stays closed", async () => {
    const client = await connect({ env: {} });
    const result = await client.callTool({
      name: "audit_site",
      arguments: { url: `${preview.url}/`, static: true, maxPages: 3 },
    });
    expect(JSON.stringify(result)).toContain("401");
  });
});

describe("readConfiguredHeaders", () => {
  it("reads one header per line, for the origins named", () => {
    const configured = readConfiguredHeaders({
      GOFLAG_HEADERS: "X-A: one\r\n\nCookie: session=two; theme=dark",
      GOFLAG_HEADERS_ORIGIN: "https://Preview.Example.com/, http://localhost:3000",
    });
    expect(configured?.headers).toEqual({ "X-A": "one", Cookie: "session=two; theme=dark" });
    expect([...(configured?.origins ?? [])]).toEqual([
      "https://preview.example.com",
      "http://localhost:3000",
    ]);
  });

  it("is absent when nothing is configured", () => {
    expect(readConfiguredHeaders({})).toBeUndefined();
    expect(readConfiguredHeaders({ GOFLAG_HEADERS: "  " })).toBeUndefined();
  });

  it.each([
    [{ GOFLAG_HEADERS: "X-A: s3cr3t" }, /GOFLAG_HEADERS_ORIGIN/],
    [
      { GOFLAG_HEADERS: "X-A: s3cr3t", GOFLAG_HEADERS_ORIGIN: "preview.example.com" },
      /not an origin/,
    ],
    [
      { GOFLAG_HEADERS: "X-A: s3cr3t", GOFLAG_HEADERS_ORIGIN: "https://preview.example.com/path" },
      /not an origin/,
    ],
    [
      { GOFLAG_HEADERS: "User-Agent: s3cr3t", GOFLAG_HEADERS_ORIGIN: "https://a.test" },
      /line 1: User-Agent is set by goflag/,
    ],
    [{ GOFLAG_HEADERS: "X-A s3cr3t", GOFLAG_HEADERS_ORIGIN: "https://a.test" }, /line 1/],
  ])("refuses %o, and never quotes the value", (env, message) => {
    expect(() => readConfiguredHeaders(env)).toThrow(message);
    try {
      readConfiguredHeaders(env);
    } catch (err) {
      expect((err as Error).message).not.toContain("s3cr3t");
    }
  });

  it("stops the server from starting rather than running without them", () => {
    expect(() => createGoflagServer({ env: { GOFLAG_HEADERS: "X-A: b" } })).toThrow(
      /GOFLAG_HEADERS_ORIGIN/,
    );
  });
});
