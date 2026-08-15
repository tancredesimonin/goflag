/**
 * The parse keeps what it could not understand.
 *
 * That is the whole difference from the two helpers this replaces — a regex
 * for `Sitemap:` and a line-walk for `Disallow: /`. Both answered one question
 * and dropped the file. A rule that wants to say "line 14 is a typo" needs
 * line 14.
 */

import { describe, expect, it } from "vitest";

import { parseRobots } from "./parse";

describe("parseRobots", () => {
  it("groups rules under the agents that precede them", () => {
    const parsed = parseRobots(`
User-agent: *
Disallow: /admin
Allow: /admin/public

User-agent: Googlebot
Disallow: /private
`);

    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]?.userAgents.map((a) => a.value)).toEqual(["*"]);
    expect(parsed.groups[0]?.rules.map((r) => `${r.kind} ${r.pattern}`)).toEqual([
      "disallow /admin",
      "allow /admin/public",
    ]);
    expect(parsed.groups[1]?.userAgents.map((a) => a.value)).toEqual(["googlebot"]);
  });

  it("lets consecutive agents share one group, per §2.2.1", () => {
    const parsed = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x");

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.userAgents.map((a) => a.value)).toEqual(["a", "b"]);
  });

  it("opens a new group when an agent follows a rule", () => {
    const parsed = parseRobots("User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y");

    expect(parsed.groups).toHaveLength(2);
  });

  it("keeps `Sitemap:` out of the groups entirely, per §2.2.4", () => {
    // Written inside a group on purpose: it does not belong to it, and it must
    // not close it either.
    const parsed = parseRobots(
      "User-agent: *\nSitemap: https://x.com/sitemap.xml\nDisallow: /admin",
    );

    expect(parsed.sitemaps).toEqual([{ value: "https://x.com/sitemap.xml", line: 2 }]);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.rules).toHaveLength(1);
  });

  it("records a typo as an invalid line, with its number and the line itself", () => {
    const parsed = parseRobots("User-agent: *\nDisalow: /admin");

    expect(parsed.invalidLines).toEqual([
      { line: 2, raw: "Disalow: /admin", reason: "unknown directive `disalow`" },
    ]);
  });

  it("records a rule written before any group — it governs nobody", () => {
    const parsed = parseRobots("Disallow: /admin\nUser-agent: *\nAllow: /");

    expect(parsed.invalidLines[0]).toMatchObject({ line: 1 });
    expect(parsed.invalidLines[0]?.reason).toContain("before any");
    expect(parsed.groups[0]?.rules).toHaveLength(1);
  });

  it("tells a non-standard directive from a typo", () => {
    // `Crawl-delay` is ignored by Google but understood by others; `Disalow`
    // is understood by nobody. Reporting them the same way would be wrong.
    const parsed = parseRobots("User-agent: *\nCrawl-delay: 10\nHost: example.com");

    expect(parsed.unknownDirectives).toEqual([
      { name: "crawl-delay", line: 2 },
      { name: "host", line: 3 },
    ]);
    expect(parsed.invalidLines).toEqual([]);
  });

  it("reads directive names case-insensitively", () => {
    // Coverage carried over from the `extractSitemaps` test this replaces: a
    // lowercase `sitemap:` is as valid as the capitalised spelling.
    const parsed = parseRobots("USER-AGENT: *\nsitemap: https://x.com/a.xml\nDISALLOW: /x");

    expect(parsed.sitemaps.map((s) => s.value)).toEqual(["https://x.com/a.xml"]);
    expect(parsed.groups[0]?.rules[0]?.kind).toBe("disallow");
  });

  it("strips comments wherever they sit", () => {
    const parsed = parseRobots("# leading\nUser-agent: * # trailing\nDisallow: /a # here too");

    expect(parsed.groups[0]?.userAgents[0]?.value).toBe("*");
    expect(parsed.groups[0]?.rules[0]?.pattern).toBe("/a");
    expect(parsed.invalidLines).toEqual([]);
  });

  it("keeps an empty `Disallow:` as a rule — it is valid and means allow all", () => {
    const parsed = parseRobots("User-agent: *\nDisallow:");

    expect(parsed.groups[0]?.rules).toEqual([{ kind: "disallow", pattern: "", line: 2 }]);
    expect(parsed.invalidLines).toEqual([]);
  });

  it("survives CRLF, a BOM-less blank file, and junk", () => {
    expect(parseRobots("").groups).toEqual([]);
    expect(parseRobots("User-agent: *\r\nDisallow: /x\r\n").groups[0]?.rules).toHaveLength(1);
    expect(parseRobots("just some words").invalidLines[0]?.reason).toContain("separator");
  });
});
