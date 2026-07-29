import { describe, expect, it } from "vitest";

import { parseArgs } from "./cli-args";

describe("parseArgs — phase 1 flags", () => {
  it("splits --locales on commas", () => {
    const args = parseArgs(["https://x.test", "--locales", "fr,en,pt-br"]);
    expect(args.options.locales).toEqual(["fr", "en", "pt-br"]);
  });

  it("trims whitespace and accumulates repeated --locales flags", () => {
    const args = parseArgs(["https://x.test", "--locales", " fr , en ", "--locales", "es"]);
    expect(args.options.locales).toEqual(["fr", "en", "es"]);
  });

  it("rejects an empty --locales value rather than silently ignoring it", () => {
    expect(() => parseArgs(["https://x.test", "--locales", " , "])).toThrow(/at least one locale/);
  });

  it("requires a value for --locales", () => {
    expect(() => parseArgs(["https://x.test", "--locales"])).toThrow(/requires a value/);
  });

  it("defaults --fail-on to warning", () => {
    expect(parseArgs(["https://x.test"]).failOn).toBe("warning");
  });

  it("accepts each --fail-on level", () => {
    for (const level of ["warning", "error", "never"] as const) {
      expect(parseArgs(["https://x.test", "--fail-on", level]).failOn).toBe(level);
    }
  });

  it("rejects an unknown --fail-on level, listing the valid ones", () => {
    expect(() => parseArgs(["https://x.test", "--fail-on", "loud"])).toThrow(
      /expects one of: warning, error, never/,
    );
  });

  it("turns sitemap discovery off with --no-sitemap, and leaves it on otherwise", () => {
    expect(parseArgs(["https://x.test", "--no-sitemap"]).options.noSitemap).toBe(true);
    expect(parseArgs(["https://x.test"]).options.noSitemap).toBeUndefined();
  });

  it("captures --start and its timeout", () => {
    const args = parseArgs([
      "http://localhost:3000",
      "--start",
      "pnpm start",
      "--start-timeout",
      "90000",
    ]);
    expect(args.start).toBe("pnpm start");
    expect(args.startTimeoutMs).toBe(90_000);
  });

  it("defaults the --start timeout to 60s", () => {
    expect(parseArgs(["https://x.test"]).startTimeoutMs).toBe(60_000);
  });
});

describe("parseArgs — --ignore-holes", () => {
  it("accumulates repeated globs", () => {
    const args = parseArgs([
      "https://x.test",
      "--ignore-holes",
      "/legal",
      "--ignore-holes",
      "/blog/**",
    ]);
    expect(args.options.ignoreHoles).toEqual(["/legal", "/blog/**"]);
  });

  it("is absent unless asked for — suppression must be opt-in", () => {
    expect(parseArgs(["https://x.test"]).options.ignoreHoles).toBeUndefined();
  });

  it("requires a value", () => {
    expect(() => parseArgs(["https://x.test", "--ignore-holes"])).toThrow(/requires a value/);
  });
});
