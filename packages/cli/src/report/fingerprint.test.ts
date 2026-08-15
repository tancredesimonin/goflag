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

describe("fingerprint stability", () => {
  /**
   * Pinned, and the pin is the point.
   *
   * A committed baseline matches findings by id and nothing else
   * (`./diff.ts`), so the day a fingerprint changes is the day every baseline
   * in every repository reports its whole contents as new. The inputs are
   * deliberately few — the rule, the route, the occurrence — so that enriching
   * a finding cannot move it. Phase F added four fields to `SeoIssue`; these
   * values are what they were before.
   *
   * If this test fails, the question is not "what is the new hash" but "why is
   * a finding's identity being changed", and the answer had better be in a
   * major version.
   */
  it("does not move when a finding carries more than it used to", () => {
    expect(fingerprint("seo", "title.missing", "/en/about", "0")).toBe("seo-c4d8e02d89");
    expect(fingerprint("site", "hreflang.missing", "/en/about", "0")).toBe("site-fed358bb71");
  });

  it("separates occurrences of one rule on one page", () => {
    const first = fingerprint("seo", "og.image.alt", "/en", "0");
    const second = fingerprint("seo", "og.image.alt", "/en", "1");

    expect(first).not.toBe(second);
  });
});
