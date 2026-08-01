import { describe, expect, it } from "vitest";
import { blocksAllUserAgents, extractSitemaps } from "./robots";

describe("extractSitemaps", () => {
  it("returns an empty array when there are no Sitemap declarations", () => {
    expect(extractSitemaps("User-agent: *\nAllow: /\n")).toEqual([]);
  });

  it("captures one or more Sitemap: lines, case-insensitively", () => {
    expect(
      extractSitemaps(
        "User-agent: *\nSitemap: https://x.com/sitemap.xml\nsitemap: https://x.com/news.xml\n",
      ),
    ).toEqual(["https://x.com/sitemap.xml", "https://x.com/news.xml"]);
  });
});

describe("blocksAllUserAgents", () => {
  it("returns true when User-agent: * has Disallow: /", () => {
    expect(blocksAllUserAgents("User-agent: *\nDisallow: /\n")).toBe(true);
  });

  it("returns false when only specific paths are disallowed", () => {
    expect(blocksAllUserAgents("User-agent: *\nDisallow: /admin/\n")).toBe(false);
  });

  it("only counts Disallow: / when inside User-agent: * group", () => {
    expect(blocksAllUserAgents("User-agent: Bot\nDisallow: /\nUser-agent: *\nAllow: /")).toBe(
      false,
    );
  });

  it("ignores comments and blank lines", () => {
    expect(blocksAllUserAgents("# block all\nUser-agent: *\n\nDisallow: / # nope\n")).toBe(true);
  });
});
