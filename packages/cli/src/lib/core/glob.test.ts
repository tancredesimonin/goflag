import { describe, expect, it } from "vitest";

import { compileGlob, matchesAny } from "./glob";

describe("compileGlob", () => {
  it.each([
    ["/blog/**", "/blog/post-1", true],
    ["/blog/**", "/blog/sub/post", true],
    ["/blog/**", "/news/post", false],
    ["/blog/*", "/blog/post-1", true],
    ["/blog/*", "/blog/sub/post", false],
    ["/articles/?", "/articles/x", true],
    ["/articles/?", "/articles/xx", false],
    ["/exact", "/exact", true],
    ["/exact", "/exact/", false],
    ["**/about", "/fr/about", true],
    ["**/about", "/about", true],
  ])("%s vs %s → %s", (pattern, value, expected) => {
    expect(compileGlob(pattern).test(value)).toBe(expected);
  });

  it("escapes regex metacharacters in literal segments", () => {
    expect(compileGlob("/foo.bar").test("/foo.bar")).toBe(true);
    expect(compileGlob("/foo.bar").test("/foozbar")).toBe(false);
  });

  it("matchesAny short-circuits on the first hit", () => {
    expect(matchesAny("/blog/post", ["/news/**", "/blog/**"])).toBe(true);
    expect(matchesAny("/contact", ["/news/**", "/blog/**"])).toBe(false);
    expect(matchesAny("/anything", [])).toBe(false);
  });
});
