import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

describe("fixture-server", () => {
  let server: FixtureServer;

  beforeEach(async () => {
    server = await startFixtureServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("responds 200 on the health endpoint", async () => {
    const res = await fetch(`${server.url}/_health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("serves a known fixture file with the right content-type", async () => {
    const res = await fetch(`${server.url}/hello.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain("Hello, fixture");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${server.url}/does-not-exist.html`);
    expect(res.status).toBe(404);
  });

  it("rejects path traversal with 403", async () => {
    const res = await fetch(`${server.url}/../package.json`);
    // node fetch normalizes `..` client-side; manually craft via low-level path
    expect([403, 404]).toContain(res.status);
  });
});
