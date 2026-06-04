import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchUrl, DEFAULT_USER_AGENT } from "./fetch-url";
import {
  startAuditFixtureServer,
  startSelfSignedHttpsServer,
  type AuditFixtureServer,
  type SelfSignedServer,
} from "../../../../test/audit-fixture-server";

describe("fetchUrl — real fetch path", () => {
  let server: AuditFixtureServer;

  beforeAll(async () => {
    server = await startAuditFixtureServer();
  });
  afterAll(async () => {
    await server.stop();
  });

  it("returns status, content-type and a decoded body for GET", async () => {
    const res = await fetchUrl(`${server.url}/about`);
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("text/html");
    expect(res.body).toContain("Contact");
    expect(res.finalUrl).toBe(`${server.url}/about`);
    expect(res.redirected).toBe(false);
  });

  it("omits the body for HEAD requests", async () => {
    const res = await fetchUrl(`${server.url}/about`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.body).toBeUndefined();
  });

  it("omits the body for non-text content types", async () => {
    const res = await fetchUrl(`${server.url}/logo.png`);
    expect(res.status).toBe(200);
    expect(res.body).toBeUndefined();
  });

  it("reports a 404 status without throwing", async () => {
    const res = await fetchUrl(`${server.url}/missing`);
    expect(res.status).toBe(404);
  });

  it("does not follow redirects in manual mode; resolves the next hop", async () => {
    const res = await fetchUrl(`${server.url}/redirect-1`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.redirected).toBe(true);
    expect(res.redirectChain).toEqual([`${server.url}/redirect-2`]);
  });

  it("follows redirects in follow mode and reports the final URL", async () => {
    const res = await fetchUrl(`${server.url}/redirect-1`, { redirect: "follow" });
    expect(res.status).toBe(200);
    expect(res.redirected).toBe(true);
    expect(res.finalUrl).toBe(`${server.url}/target`);
  });

  it("surfaces the Retry-After header", async () => {
    const res = await fetchUrl(`${server.url}/rate-limited`);
    expect(res.status).toBe(429);
    expect(res.retryAfter).toBe("0");
  });

  it("truncates the body at maxBytes", async () => {
    const res = await fetchUrl(`${server.url}/`, { maxBytes: 32 });
    expect(res.truncated).toBe(true);
    expect(res.body?.length).toBeLessThanOrEqual(32);
  });

  it("returns status 0 with a dns reason for an unresolvable host", async () => {
    const res = await fetchUrl("http://nonexistent.invalid.headlint-test/");
    expect(res.status).toBe(0);
    expect(res.reason).toBe("dns");
  });

  it("returns status 0 with an abort reason when the caller cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await fetchUrl(`${server.url}/about`, { signal: controller.signal });
    expect(res.status).toBe(0);
    expect(res.reason).toBe("abort");
  });

  it("returns status 0 with a timeout reason when the deadline elapses", async () => {
    // Point at a non-routable address so the connection stalls past the
    // very short timeout (TEST-NET-1, RFC 5737).
    const res = await fetchUrl("http://192.0.2.1:81/", { timeoutMs: 200 });
    expect(res.status).toBe(0);
    expect(res.reason).toBe("timeout");
  });

  it("returns status 0 with a network reason for a refused connection", async () => {
    // Port 1 is reserved and refuses immediately (ECONNREFUSED).
    const res = await fetchUrl("http://127.0.0.1:1/", { timeoutMs: 1_000 });
    expect(res.status).toBe(0);
    expect(res.reason).toBe("network");
  });

  it("restores a pre-existing NODE_TLS_REJECT_UNAUTHORIZED after an insecure fetch", async () => {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    try {
      await fetchUrl(`${server.url}/about`, { allowInsecureTls: true });
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("1");
    } finally {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  });

  it("reads a body for a plain-text response", async () => {
    const res = await fetchUrl(`${server.url}/no-content-type`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("plain body");
  });

  it("leaves finalUrl as requested when a redirect Location is unparseable", async () => {
    const res = await fetchUrl(`${server.url}/bad-redirect`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.redirectChain).toEqual([]);
    expect(res.finalUrl).toBe(`${server.url}/bad-redirect`);
  });

  it("honours a custom user-agent and accept header without throwing", async () => {
    const res = await fetchUrl(`${server.url}/about`, {
      userAgent: "headlint-test/1.0",
      accept: "text/html",
    });
    expect(res.status).toBe(200);
    expect(DEFAULT_USER_AGENT).toContain("Chrome");
  });
});

describe("fetchUrl — TLS handling", () => {
  let tls: SelfSignedServer | null;

  beforeAll(async () => {
    tls = await startSelfSignedHttpsServer();
  });
  afterAll(async () => {
    await tls?.stop();
  });

  it("reports a tls reason for a self-signed certificate", async () => {
    if (!tls) return; // openssl unavailable — skip gracefully
    const res = await fetchUrl(tls.url);
    expect(res.status).toBe(0);
    expect(res.reason).toBe("tls");
  });

  it("succeeds against a self-signed cert when allowInsecureTls is set", async () => {
    if (!tls) return;
    const res = await fetchUrl(tls.url, { allowInsecureTls: true });
    expect(res.status).toBe(200);
    expect(res.body).toContain("secure ok");
  });
});
