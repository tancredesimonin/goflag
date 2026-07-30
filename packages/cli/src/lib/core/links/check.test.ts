import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkLink } from "./check";
import {
  startAuditFixtureServer,
  type AuditFixtureServer,
} from "../../../../test/audit-fixture-server";

const noSleep = () => Promise.resolve();

describe("checkLink — real fetch path", () => {
  let server: AuditFixtureServer;

  beforeAll(async () => {
    server = await startAuditFixtureServer();
  });
  afterAll(async () => {
    await server.stop();
  });
  beforeEach(() => server.reset());

  it("skips non-http schemes without a network call", async () => {
    const check = await checkLink("mailto:hi@example.com");
    expect(check.verdict).toBe("skipped");
    expect(check.status).toBe(0);
  });

  it("skips an un-parseable URL", async () => {
    const check = await checkLink("::::not a url");
    expect(check.verdict).toBe("skipped");
    expect(check.reason).toBe("not a URL");
  });

  it("retries a transient 429 using the default timer (no injected sleep)", async () => {
    const check = await checkLink(`${server.url}/rate-limited-once`);
    expect(check.verdict).toBe("ok");
  });

  it("honours an HTTP-date Retry-After header", async () => {
    const check = await checkLink(`${server.url}/rate-limited-once-date`, { sleep: noSleep });
    expect(check.verdict).toBe("ok");
  });

  it("classifies a reachable page as ok", async () => {
    const check = await checkLink(`${server.url}/about`, { sleep: noSleep });
    expect(check.verdict).toBe("ok");
    expect(check.status).toBe(200);
  });

  it("classifies a 404 as broken", async () => {
    const check = await checkLink(`${server.url}/missing`, { sleep: noSleep });
    expect(check.verdict).toBe("broken");
    expect(check.status).toBe(404);
  });

  it("classifies a 500 as broken", async () => {
    const check = await checkLink(`${server.url}/server-error`, { sleep: noSleep });
    expect(check.verdict).toBe("broken");
    expect(check.status).toBe(500);
  });

  it("follows a redirect chain that resolves to 200 → redirect", async () => {
    const check = await checkLink(`${server.url}/redirect-1`, { sleep: noSleep });
    expect(check.verdict).toBe("redirect");
    expect(check.status).toBe(200);
    expect(check.finalUrl).toBe(`${server.url}/target`);
    expect(check.redirectChain).toEqual([`${server.url}/redirect-2`, `${server.url}/target`]);
  });

  it("detects a redirect loop → broken", async () => {
    const check = await checkLink(`${server.url}/loop-a`, { sleep: noSleep });
    expect(check.verdict).toBe("broken");
    expect(check.reason).toBe("redirect loop");
  });

  it("falls back to GET when the server rejects HEAD (405)", async () => {
    const check = await checkLink(`${server.url}/head-405`, { sleep: noSleep });
    expect(check.verdict).toBe("ok");
    expect(check.status).toBe(200);
    expect(check.method).toBe("GET");
  });

  it("classifies a 403 as blocked (likely anti-bot)", async () => {
    const check = await checkLink(`${server.url}/forbidden`, { sleep: noSleep });
    expect(check.verdict).toBe("blocked");
    expect(check.status).toBe(403);
  });

  it("classifies a persistent 429 as blocked after retry", async () => {
    const check = await checkLink(`${server.url}/rate-limited`, { sleep: noSleep });
    expect(check.verdict).toBe("blocked");
    expect(check.status).toBe(429);
    expect(check.reason).toBe("429 rate-limited");
  });

  it("retries a transient 429 and resolves to ok (honours Retry-After)", async () => {
    const check = await checkLink(`${server.url}/rate-limited-once`, { sleep: noSleep });
    expect(check.verdict).toBe("ok");
    expect(check.status).toBe(200);
  });

  it("flags a soft-404 (200 saying not found) as warning", async () => {
    const check = await checkLink(`${server.url}/soft-404`, { sleep: noSleep });
    expect(check.verdict).toBe("warning");
    expect(check.reason).toBe("soft-404");
  });

  it("classifies a dns failure as broken with the reason attached", async () => {
    const check = await checkLink("http://nonexistent.invalid.goflag-test/", { sleep: noSleep });
    expect(check.verdict).toBe("broken");
    expect(check.reason).toBe("dns");
  });
});
