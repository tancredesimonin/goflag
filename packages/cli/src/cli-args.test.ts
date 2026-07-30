/**
 * Unit tests for CLI argument parsing. Pure and fast — no process spawn.
 */

import { describe, expect, it } from "vitest";

import { parseArgs, HELP } from "./cli-args";

describe("parseArgs", () => {
  it("captures the URL as the sole positional argument", () => {
    expect(parseArgs(["https://example.com"]).url).toBe("https://example.com");
  });

  it("defaults: no json, no summary, no report, findings-only options empty", () => {
    const a = parseArgs(["https://example.com"]);
    expect(a.json).toBe(false);
    expect(a.summary).toBe(false);
    expect(a.report).toBeUndefined();
    expect(a.help).toBe(false);
    expect(a.version).toBe(false);
    expect(a.options.include).toEqual([]);
    expect(a.options.exclude).toEqual([]);
  });

  it("parses --summary / -s", () => {
    expect(parseArgs(["u", "--summary"]).summary).toBe(true);
    expect(parseArgs(["u", "-s"]).summary).toBe(true);
    expect(parseArgs(["u"]).summary).toBe(false);
  });

  it("parses boolean flags", () => {
    const a = parseArgs(["u", "--json", "--static", "--allow-insecure-tls", "--no-external"]);
    expect(a.json).toBe(true);
    expect(a.options.static).toBe(true);
    expect(a.options.allowInsecureTls).toBe(true);
    expect(a.options.checkExternal).toBe(false);
  });

  it("--no-color turns color off", () => {
    expect(parseArgs(["u", "--no-color"]).color).toBe(false);
  });

  it("defaults to compact progress and toggles verbose / quiet", () => {
    expect(parseArgs(["u"]).logMode).toBe("compact");
    expect(parseArgs(["u", "--verbose"]).logMode).toBe("verbose");
    expect(parseArgs(["u", "-V"]).logMode).toBe("verbose");
    expect(parseArgs(["u", "--quiet"]).logMode).toBe("quiet");
    expect(parseArgs(["u", "-q"]).logMode).toBe("quiet");
  });

  it("parses integer options", () => {
    const a = parseArgs(["u", "--depth", "3", "--max-pages", "50", "--timeout", "1000"]);
    expect(a.options.depth).toBe(3);
    expect(a.options.maxPages).toBe(50);
    expect(a.options.timeoutMs).toBe(1000);
  });

  it("rejects non-integer / negative integer options", () => {
    expect(() => parseArgs(["u", "--depth", "abc"])).toThrow(/non-negative integer/);
    expect(() => parseArgs(["u", "--depth", "-1"])).toThrow(/non-negative integer/);
    expect(() => parseArgs(["u", "--max-pages", "1.5"])).toThrow(/non-negative integer/);
  });

  it("collects repeatable include / exclude globs", () => {
    const a = parseArgs(["u", "--include", "/en/**", "--exclude", "/x/**", "--exclude", "/admin"]);
    expect(a.options.include).toEqual(["/en/**"]);
    expect(a.options.exclude).toEqual(["/x/**", "/admin"]);
  });

  it("captures --report <file>", () => {
    expect(parseArgs(["u", "--report", "out.json"]).report).toBe("out.json");
  });

  it("recognizes help and version flags", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
    expect(parseArgs(["--version"]).version).toBe(true);
  });

  it("throws on a value-less option", () => {
    expect(() => parseArgs(["u", "--depth"])).toThrow(/requires a value/);
    expect(() => parseArgs(["u", "--report"])).toThrow(/requires a value/);
  });

  it("throws on unknown options", () => {
    expect(() => parseArgs(["u", "--nope"])).toThrow(/unknown option: --nope/);
  });

  it("throws on a second positional argument", () => {
    expect(() => parseArgs(["one", "two"])).toThrow(/unexpected argument: two/);
  });

  it("HELP mentions the usage and every documented flag", () => {
    expect(HELP).toContain("goflag <url> [options]");
    for (const flag of [
      "--json",
      "--summary",
      "--report",
      "--depth",
      "--include",
      "--static",
      "--verbose",
      "--quiet",
      "--no-color",
    ]) {
      expect(HELP).toContain(flag);
    }
  });
});
