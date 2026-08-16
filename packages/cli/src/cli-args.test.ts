/**
 * Unit tests for CLI argument parsing. Pure and fast — no process spawn.
 */

import { describe, expect, it } from "vitest";

import { parseArgs, HELP } from "./cli-args";
import { PROFILE_NAMES } from "./lib/rules/profiles";

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

  it("parses --profile and defaults to none (runAudit applies `default`)", () => {
    expect(parseArgs(["u", "--profile", "strict"]).options.profile).toBe("strict");
    expect(parseArgs(["u", "--profile", "spec-only"]).options.profile).toBe("spec-only");
    expect(parseArgs(["u"]).options.profile).toBeUndefined();
  });

  it("rejects an unknown --profile before anything is crawled", () => {
    expect(() => parseArgs(["u", "--profile", "stcirt"])).toThrow(/--profile expects one of/);
    // The list of real names is what makes the error actionable.
    expect(() => parseArgs(["u", "--profile", "stcirt"])).toThrow(/marketing/);
    expect(() => parseArgs(["u", "--profile"])).toThrow(/requires a value/);
  });

  it("parses --conformance and --advisories, both off by default", () => {
    const a = parseArgs(["u", "--conformance", "--advisories"]);
    expect(a.options.conformance).toBe(true);
    expect(a.options.advisories).toBe(true);
    const b = parseArgs(["u"]);
    expect(b.options.conformance).toBeUndefined();
    expect(b.options.advisories).toBeUndefined();
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

  it("refuses --summary in baseline mode rather than accepting and ignoring it", () => {
    // Both name what the run prints, and the diff wins: the CLI rendered it and
    // returned, so --summary parsed and then vanished. Under --json it was
    // worse than ignored — a rollup of the whole site, with no diff in it, next
    // to an exit code decided by the findings it did not name.
    const gated = ["u", "--baseline", "b.json", "--regressions-only", "--summary"];
    expect(() => parseArgs(gated)).toThrow(/--summary cannot summarise a diff/);
    // Capturing a baseline swallows it just as silently, and for the same
    // reason: that path writes the file and returns before any view is chosen.
    const capture = ["u", "--baseline", "b.json", "--update-baseline", "-s"];
    expect(() => parseArgs(capture)).toThrow(/--summary cannot summarise a diff/);
    // Outside baseline mode the flag is untouched, and --report is the way to
    // keep the full report either way.
    expect(parseArgs(["u", "--summary", "--report", "r.json"]).summary).toBe(true);
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
      "--profile",
      "--conformance",
      "--advisories",
    ]) {
      expect(HELP).toContain(flag);
    }
  });

  it("HELP lists every profile, so the flag documents itself", () => {
    for (const name of PROFILE_NAMES) expect(HELP).toContain(name);
  });
});

describe("parseArgs — subcommands", () => {
  it("reads a command word in first position", () => {
    expect(parseArgs(["rules"]).command).toBe("rules");
    expect(parseArgs(["flags"]).command).toBe("flags");
    expect(parseArgs(["preview"]).command).toBe("preview");
  });

  it("takes the positional after a command as its argument", () => {
    const a = parseArgs(["preview", "https://example.com"]);
    expect(a.command).toBe("preview");
    expect(a.url).toBe("https://example.com");
  });

  it("keeps flags working around a command and its URL", () => {
    const a = parseArgs(["preview", "https://example.com", "--static", "--locales", "fr,en"]);
    expect(a.command).toBe("preview");
    expect(a.url).toBe("https://example.com");
    expect(a.options.static).toBe(true);
    expect(a.options.locales).toEqual(["fr", "en"]);
  });

  it("rejects a command word that trails the URL instead of silently ignoring it", () => {
    // The existing first-position rule, now that a command can take an
    // argument: `goflag https://x.test preview` is a typo, and it fails loudly
    // rather than auditing while looking like it previewed.
    expect(() => parseArgs(["https://x.test", "preview"])).toThrow(/unexpected argument: preview/);
    expect(() => parseArgs(["preview", "https://x.test", "https://y.test"])).toThrow(
      /unexpected argument/,
    );
  });

  it("does not read a command word that follows a flag", () => {
    expect(parseArgs(["--json", "preview"]).command).toBeUndefined();
    expect(parseArgs(["--json", "preview"]).url).toBe("preview");
  });

  it("refuses a view flag on preview rather than accepting and ignoring it", () => {
    expect(() => parseArgs(["preview", "https://x.test", "--json"])).toThrow(
      /--json and --summary/,
    );
    expect(() => parseArgs(["preview", "https://x.test", "-s"])).toThrow(/--json and --summary/);
    // A file is not a view: the JSON is still available beside the HTML.
    expect(() => parseArgs(["preview", "https://x.test", "--report", "out.json"])).not.toThrow();
  });

  it("HELP shows preview with its argument, not as a bare word", () => {
    expect(HELP).toContain("goflag preview <url>");
  });
});
