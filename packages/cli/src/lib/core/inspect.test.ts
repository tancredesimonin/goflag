import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { inspect } from "./inspect";
import { HeadlessUnavailableError, type HeadlessLauncher } from "./extract/headless";
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

  it("default mode marks a fully-rendered tancrede page as static, not escalated", async () => {
    const page = await inspect(`${server.url}/fr`, { probes: false });
    expect(page.extractor.mode).toBe("static");
    expect(page.extractor.escalated).toBe(false);
    expect(page.html.static.length).toBeGreaterThan(0);
    expect(page.html.rendered).toBeUndefined();
    expect(page.hydration).toBeUndefined();
  });

  it("when the page links a manifest, the manifest probe runs alongside robots+sitemap", async () => {
    // Fixture server serving the synthetic kitchen-sink, which ships a
    // <link rel="manifest" href="/site.webmanifest"> — the probe will fetch
    // that URL (404 from the fixture server, since we don't ship a manifest
    // file). 404 still exercises the manifest-fetch branch we need covered.
    const synthetic = await startFixtureServer({
      root: resolve(__dirname, "../../../fixtures/sites/synthetic"),
    });
    try {
      const page = await inspect(`${synthetic.url}/kitchen-sink`);
      expect(page.probes.manifest).toBeDefined();
      expect(page.probes.manifest?.found).toBe(false);
      expect(page.probes.manifest?.status).toBe(404);
    } finally {
      await synthetic.stop();
    }
  });

  it("--static mode never boots the browser even if asked to escalate", async () => {
    const launchSpy = vi.fn();
    const launcher: HeadlessLauncher = {
      async launch() {
        launchSpy();
        throw new HeadlessUnavailableError("should not be called");
      },
    };
    const page = await inspect(`${server.url}/fr`, {
      probes: false,
      mode: "static",
      headless: { launcher },
    });
    expect(page.extractor.mode).toBe("static");
    expect(launchSpy).not.toHaveBeenCalled();
  });
});

describe("inspect — mode plumbing with injected headless launcher", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../../fixtures/sites/spa"),
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  function rendererLauncher(html: string): HeadlessLauncher {
    return {
      async launch() {
        return {
          async newPage() {
            return {
              async goto() {
                return {
                  status: 200,
                  statusText: "OK",
                  finalUrl: `${server.url}/`,
                  headers: { "content-type": "text/html" },
                };
              },
              async content() {
                return html;
              },
              async close() {},
            };
          },
          async close() {},
        };
      },
    };
  }

  it("auto-escalates on an SPA shell and tags the result as escalated headless", async () => {
    const launcher = rendererLauncher(
      `<!doctype html><html lang="en"><head>
        <title>App After Hydration</title>
        <meta name="description" content="Now there's a description">
        <meta property="og:title" content="App After Hydration">
        <link rel="canonical" href="${server.url}/">
      </head><body><div id="root">hi</div></body></html>`,
    );
    const page = await inspect(`${server.url}/`, {
      probes: false,
      headless: { launcher },
    });
    expect(page.extractor.mode).toBe("headless");
    expect(page.extractor.escalated).toBe(true);
    expect(page.extractor.escalationReason).toBeTruthy();
    expect(page.html.rendered).toContain("App After Hydration");
    expect(page.meta.title?.value).toContain("App After Hydration");
    expect(page.openGraph.title?.value).toContain("App After Hydration");
    expect(page.hydration).toBeDefined();
    expect(page.hydration?.titleChanged).toBe(true);
    expect(page.hydration?.clientInjectedMetas.length).toBeGreaterThan(0);
  });

  it("forced --headless mode skips the static fetch entirely", async () => {
    const launcher = rendererLauncher(
      `<html><head><title>Forced</title></head><body></body></html>`,
    );
    const page = await inspect(`${server.url}/`, {
      probes: false,
      mode: "headless",
      headless: { launcher },
    });
    expect(page.extractor.mode).toBe("headless");
    expect(page.extractor.escalated).toBe(false);
    expect(page.html.static).toBe("");
    expect(page.html.rendered).toContain("Forced");
    expect(page.hydration).toBeUndefined();
  });

  it("falls back to the static result when headless is unavailable", async () => {
    const launcher: HeadlessLauncher = {
      async launch() {
        throw new HeadlessUnavailableError("Chromium not installed");
      },
    };
    const page = await inspect(`${server.url}/`, {
      probes: false,
      headless: { launcher },
    });
    expect(page.extractor.mode).toBe("static");
    expect(page.extractor.escalated).toBe(false);
    // The trigger and the obstacle are two facts, and the report needs the
    // second one on its own: it is what turns a column of phantom findings
    // into a diagnostics warning instead of a silent lie.
    expect(page.extractor.escalationReason).toBeTruthy();
    expect(page.extractor.escalationBlocked).toContain("Chromium not installed");
    expect(page.html.rendered).toBeUndefined();
  });

  it("re-throws non-HeadlessUnavailableError errors from the launcher", async () => {
    const launcher: HeadlessLauncher = {
      async launch() {
        throw new Error("page navigation crashed");
      },
    };
    await expect(
      inspect(`${server.url}/`, { probes: false, headless: { launcher } }),
    ).rejects.toThrow(/page navigation crashed/);
  });
});
