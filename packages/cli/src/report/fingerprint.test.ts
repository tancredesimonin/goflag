import { describe, expect, it } from "vitest";

import { fingerprint, routeKey, targetKey } from "./fingerprint";

describe("routeKey", () => {
  it("drops the origin so ids are stable across environments", () => {
    expect(routeKey("http://localhost:3000/en/about")).toBe("/en/about");
    expect(routeKey("https://site.com/en/about")).toBe("/en/about");
    expect(routeKey("http://localhost:3000/en/about")).toBe(routeKey("https://prod.io/en/about"));
  });

  it("collapses a trailing slash but keeps the root", () => {
    expect(routeKey("https://x.com/blog/")).toBe("/blog");
    expect(routeKey("https://x.com/")).toBe("/");
    expect(routeKey("https://x.com")).toBe("/");
  });

  it("keeps the query string", () => {
    expect(routeKey("https://x.com/search?q=hi")).toBe("/search?q=hi");
  });

  it("returns the input unchanged when it cannot be parsed as a URL", () => {
    expect(routeKey("not a url")).toBe("not a url");
  });
});

describe("targetKey", () => {
  it("keeps the origin so distinct hosts do not collide", () => {
    expect(targetKey("https://a.com/x")).not.toBe(targetKey("https://b.com/x"));
    expect(targetKey("https://a.com/x/")).toBe("https://a.com/x");
  });
});

describe("fingerprint", () => {
  it("is deterministic and category-prefixed", () => {
    const id = fingerprint("seo", "title.missing", "/en");
    expect(id).toMatch(/^seo-[0-9a-f]{10}$/);
    expect(fingerprint("seo", "title.missing", "/en")).toBe(id);
  });

  it("changes when any part changes", () => {
    expect(fingerprint("seo", "a", "/en")).not.toBe(fingerprint("seo", "a", "/fr"));
    expect(fingerprint("seo", "a", "/en")).not.toBe(fingerprint("seo", "b", "/en"));
  });

  it("does not collide on part boundaries (NUL separator)", () => {
    // Without a separator, ["ab","c"] and ["a","bc"] would hash the same.
    expect(fingerprint("x", "ab", "c")).not.toBe(fingerprint("x", "a", "bc"));
  });
});
