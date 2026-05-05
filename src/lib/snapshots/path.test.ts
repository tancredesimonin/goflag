import { describe, expect, it } from "vitest";
import { compilePattern, matchesPath } from "./path";

describe("matchesPath", () => {
  it("matches exact literals", () => {
    expect(matchesPath("meta:description", "meta:description")).toBe(true);
    expect(matchesPath("meta:description", "meta:keywords")).toBe(false);
  });

  it("matches case-sensitively", () => {
    expect(matchesPath("Meta:Description", "meta:description")).toBe(false);
  });

  it("expands `*` to a single non-separator segment", () => {
    expect(matchesPath("meta:og:*", "meta:og:title")).toBe(true);
    expect(matchesPath("meta:og:*", "meta:og:image")).toBe(true);
    // `*` cannot cross a `:` segment delimiter
    expect(matchesPath("meta:og:*", "meta:og:image:width")).toBe(false);
    // nor a `[` array opener
    expect(matchesPath("meta:og:*", "meta:og:image[0]")).toBe(false);
  });

  it("expands `**` to any number of segments including zero", () => {
    expect(matchesPath("meta:**", "meta:description")).toBe(true);
    expect(matchesPath("meta:**", "meta:og:image[0]:width")).toBe(true);
    expect(matchesPath("meta:**", "meta:")).toBe(true);
    expect(matchesPath("**", "anything-here:goes")).toBe(true);
  });

  it("expands `[*]` to any non-empty array index", () => {
    expect(matchesPath("meta:og:image[*]", "meta:og:image[0]")).toBe(true);
    expect(matchesPath("meta:og:image[*]", "meta:og:image[42]")).toBe(true);
    expect(matchesPath("meta:og:image[*]", "meta:og:image")).toBe(false);
    // brackets are required even with `[*]`
    expect(matchesPath("meta:og:image[*]", "meta:og:image[")).toBe(false);
  });

  it("escapes regex metacharacters in literals", () => {
    // `.` and `+` would otherwise be regex specials
    expect(matchesPath("a.b+c", "a.b+c")).toBe(true);
    expect(matchesPath("a.b+c", "axbxc")).toBe(false);
  });

  it("compiles the same pattern deterministically", () => {
    const a = compilePattern("meta:og:image[*]:width");
    const b = compilePattern("meta:og:image[*]:width");
    expect(a.source).toBe(b.source);
  });
});
