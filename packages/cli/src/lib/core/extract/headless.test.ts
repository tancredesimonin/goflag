import { describe, expect, it, vi } from "vitest";
import {
  defaultLauncher,
  extractHeadless,
  HeadlessUnavailableError,
  type HeadlessLauncher,
} from "./headless";

function fakeLauncher(opts: {
  html: string;
  status?: number;
  finalUrl?: string;
  headers?: Record<string, string>;
  onLaunch?: () => void;
  onClose?: () => void;
}): HeadlessLauncher {
  const close = vi.fn();
  return {
    async launch() {
      opts.onLaunch?.();
      return {
        async newPage() {
          return {
            async goto() {
              return {
                status: opts.status ?? 200,
                statusText: "OK",
                finalUrl: opts.finalUrl ?? "http://localhost:3000/",
                headers: opts.headers ?? { "content-type": "text/html; charset=utf-8" },
              };
            },
            async content() {
              return opts.html;
            },
            async close() {
              opts.onClose?.();
            },
          };
        },
        async close() {
          close();
        },
      };
    },
  };
}

describe("extractHeadless (with injected launcher)", () => {
  it("returns the rendered HTML and synthesises a FetchMeta", async () => {
    const launcher = fakeLauncher({
      html: "<html><head><title>Rendered</title></head><body></body></html>",
    });
    const result = await extractHeadless("http://localhost:3000/", { launcher });
    expect(result.renderedHtml).toContain("Rendered");
    expect(result.fetch.requestedUrl).toBe("http://localhost:3000/");
    expect(result.fetch.finalUrl).toBe("http://localhost:3000/");
    expect(result.fetch.status).toBe(200);
    expect(result.fetch.bodyBytes).toBeGreaterThan(0);
    expect(result.fetch.contentType).toBe("text/html");
    expect(result.fetch.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("aborts immediately when the caller signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const launchSpy = vi.fn();
    const launcher = fakeLauncher({ html: "<html></html>", onLaunch: launchSpy });
    await expect(
      extractHeadless("http://localhost:3000/", { launcher, signal: ac.signal }),
    ).rejects.toBeInstanceOf(HeadlessUnavailableError);
    expect(launchSpy).not.toHaveBeenCalled();
  });

  it("closes the page and the browser even on success", async () => {
    const onClose = vi.fn();
    const launcher = fakeLauncher({ html: "<html></html>", onClose });
    await extractHeadless("http://localhost:3000/", { launcher });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("propagates content-type without parameters", async () => {
    const launcher = fakeLauncher({
      html: "<html></html>",
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const r = await extractHeadless("http://localhost:3000/", { launcher });
    expect(r.fetch.contentType).toBe("text/html");
  });

  it("handles missing content-type gracefully", async () => {
    const launcher = fakeLauncher({ html: "<html></html>", headers: {} });
    const r = await extractHeadless("http://localhost:3000/", { launcher });
    expect(r.fetch.contentType).toBeUndefined();
  });
});

describe("defaultLauncher (lazy playwright loader)", () => {
  it("returns a launcher object with a .launch() method", () => {
    const launcher = defaultLauncher();
    expect(typeof launcher.launch).toBe("function");
  });

  it("wraps an import failure in HeadlessUnavailableError with an install hint", async () => {
    const launcher = defaultLauncher(async () => {
      throw new Error("Cannot find module 'playwright'");
    });
    await expect(launcher.launch({})).rejects.toMatchObject({
      name: "HeadlessUnavailableError",
      message: expect.stringContaining("playwright"),
    });
  });

  it("wraps a chromium.launch failure in HeadlessUnavailableError with a binary hint", async () => {
    // Loader resolves to a chromium that throws on .launch — simulates the
    // "package installed but binary missing" case.
    const fakeChromium = {
      launch: () => {
        throw new Error("Executable doesn't exist at /tmp/nope");
      },
    };
    const launcher = defaultLauncher(
      async () => ({ chromium: fakeChromium }) as unknown as typeof import("playwright"),
    );
    await expect(launcher.launch({ allowInsecureTls: true })).rejects.toMatchObject({
      name: "HeadlessUnavailableError",
      message: expect.stringContaining("Chromium"),
    });
  });
});
