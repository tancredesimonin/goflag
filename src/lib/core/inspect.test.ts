import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { inspect } from "./inspect";
import { startFixtureServer, type FixtureServer } from "../../../test/fixture-server";

describe("inspect orchestrator", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../../fixtures/sites/tancrede"),
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("with probes enabled, populates robots, sitemap, and (no) manifest", async () => {
    const page = await inspect(`${server.url}/fr`);
    expect(page.probes.robots?.found).toBe(true);
    expect(page.probes.robots?.sitemaps.length).toBeGreaterThanOrEqual(0);
    expect(page.probes.sitemap?.found).toBe(true);
    expect(page.probes.sitemap?.entryCount).toBeGreaterThan(0);
    // Tancrede serves a manifest at runtime but the static fixture set doesn't
    // include one — proving the orchestrator only probes when the link exists.
    expect(page.probes.manifest).toBeUndefined();
  });

  it("with probes disabled, leaves the probes object empty", async () => {
    const page = await inspect(`${server.url}/fr`, { probes: false });
    expect(page.probes).toEqual({});
  });

  it("populates fetchedAt as an ISO timestamp", async () => {
    const before = Date.now();
    const page = await inspect(`${server.url}/fr`, { probes: false });
    const after = Date.now();
    const t = Date.parse(page.fetchedAt);
    expect(t).toBeGreaterThanOrEqual(before - 1);
    expect(t).toBeLessThanOrEqual(after + 1);
  });
});
