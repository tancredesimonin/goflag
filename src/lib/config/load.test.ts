import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./load";

const FIXTURES = resolve(__dirname, "../../../test/fixtures/config");

describe("loadConfig", () => {
  it("returns the default empty config when no headlint.config file is found", async () => {
    const result = await loadConfig({ cwd: resolve(FIXTURES, "../no-such-dir-no-config") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("default");
      expect(result.config.crawl?.depth).toBe(1);
      expect(result.config.snapshot?.dir).toBe(".headlint/snapshots");
    }
  });

  it("loads a `.ts` config and applies defaults", async () => {
    const result = await loadConfig({ cwd: resolve(FIXTURES, "ts") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("file");
      expect(result.filepath?.endsWith("headlint.config.ts")).toBe(true);
      expect(result.config.baseUrl).toBe("https://ts.example.com");
      expect(result.config.framework).toBe("next");
      expect(result.config.rules?.["title.length"]).toBe("off");
      expect(result.config.crawl?.concurrency).toBe(4);
    }
  });

  it("loads an `.mjs` config", async () => {
    const result = await loadConfig({ cwd: resolve(FIXTURES, "mjs") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.framework).toBe("astro");
    }
  });

  it("loads a CommonJS `.js` config", async () => {
    const result = await loadConfig({ cwd: resolve(FIXTURES, "js") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.framework).toBe("nuxt");
    }
  });

  it("walks up from a nested cwd to find the config", async () => {
    const deep = resolve(FIXTURES, "nested/deep/sub");
    const result = await loadConfig({ cwd: deep });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.baseUrl).toBe("https://nested.example.com");
    }
  });

  it("returns ok:false with formatted zod errors for an invalid config", async () => {
    const result = await loadConfig({ cwd: resolve(FIXTURES, "broken") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("Invalid Headlint config");
      expect(result.errors.some((e) => e.includes("baseUrl"))).toBe(true);
    }
  });

  it("returns ok:false when the module exports no default", async () => {
    const result = await loadConfig({ cwd: resolve(FIXTURES, "no-default") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/must export a default object/);
    }
  });

  it("loads the explicit `file` path even when cwd has no config", async () => {
    const result = await loadConfig({
      cwd: "/tmp",
      file: resolve(FIXTURES, "ts/headlint.config.ts"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("file");
      expect(result.config.baseUrl).toBe("https://ts.example.com");
    }
  });
});
