import { describe, expect, it } from "vitest";

import { selectByStructure } from "./coverage";

const LOCALES = ["en", "fr"];

function urls(...paths: string[]): string[] {
  return paths.map((p) => `https://example.com${p}`);
}

/** `n` URLs under one prefix, enough to look dynamic. */
function many(prefix: string, n: number): string[] {
  return urls(
    ...Array.from({ length: n }, (_, i) => `${prefix}/item-${String(i).padStart(3, "0")}`),
  );
}

describe("selecting by structure", () => {
  it("keeps everything on a site too small to have families", () => {
    const input = urls("/en", "/en/blog", "/en/about", "/fr", "/fr/blog", "/fr/about");

    const selection = selectByStructure(input, { locales: LOCALES });

    expect(selection.urls).toEqual(input);
    expect(selection.families).toEqual([]);
  });

  it("samples a family and says so", () => {
    const input = [...urls("/en", "/en/blog"), ...many("/en/blog", 100)];

    const selection = selectByStructure(input, { locales: LOCALES });

    // The two shallow pages, plus three of the hundred.
    expect(selection.urls).toHaveLength(5);
    expect(selection.families).toEqual([{ pattern: "/{locale}/blog/{2}", size: 100, sampled: 3 }]);
  });

  it("never samples the root or a first segment", () => {
    // Twelve top-level sections is enough children to look dynamic, and they
    // are twelve different templates. Collapsing them would audit one.
    const sections = Array.from({ length: 12 }, (_, i) => `/en/section-${i}`);
    const input = urls("/en", ...sections);

    const selection = selectByStructure(input, { locales: LOCALES });

    expect(selection.urls).toEqual(input);
    expect(selection.families).toEqual([]);
  });

  it("samples each locale separately, because the copy differs", () => {
    // `title.length` judges words, and the words are what a translation
    // changes. One sample across all locales would audit one language.
    const input = [...many("/en/blog", 50), ...many("/fr/blog", 50)];

    const selection = selectByStructure(input, { locales: LOCALES });

    const picked = selection.urls;
    expect(picked.filter((u) => u.includes("/en/"))).toHaveLength(3);
    expect(picked.filter((u) => u.includes("/fr/"))).toHaveLength(3);
    expect(selection.families).toEqual([{ pattern: "/{locale}/blog/{2}", size: 100, sampled: 6 }]);
  });

  it("is deterministic", () => {
    // The property the whole gate rests on: two runs of the same site must be
    // diffable. A random sample would report the difference between two
    // samples as a change in the site.
    const input = many("/en/blog", 200);

    const a = selectByStructure(input, { locales: LOCALES });
    const b = selectByStructure([...input].reverse(), { locales: LOCALES });

    expect(new Set(a.urls)).toEqual(new Set(b.urls));
  });

  it("spreads its picks rather than taking the first three", () => {
    const input = many("/en/blog", 100);

    const selection = selectByStructure(input, { locales: LOCALES });

    expect(selection.urls).toEqual(
      urls("/en/blog/item-000", "/en/blog/item-050", "/en/blog/item-099"),
    );
  });

  it("keeps a group that sits under the threshold whole", () => {
    // Seven versions is a menu, not an explosion. Sampling three of seven
    // costs the guarantee on four and saves four fetches.
    const input = urls(...Array.from({ length: 7 }, (_, i) => `/en/docs/v1.${i}`));

    const selection = selectByStructure(input, { locales: LOCALES });

    expect(selection.urls).toHaveLength(7);
  });

  it("finds families nested under a literal segment", () => {
    const input = [...many("/en/docs/v1/pages", 40), ...many("/en/docs/v2/pages", 40)];

    const selection = selectByStructure(input, { locales: LOCALES });

    expect(selection.families.map((f) => f.pattern).sort()).toEqual([
      "/{locale}/docs/v1/pages/{4}",
      "/{locale}/docs/v2/pages/{4}",
    ]);
    expect(selection.urls).toHaveLength(6);
  });

  it("honours perFamily", () => {
    const input = many("/en/blog", 100);

    expect(selectByStructure(input, { locales: LOCALES, perFamily: 1 }).urls).toHaveLength(1);
    expect(selectByStructure(input, { locales: LOCALES, perFamily: 5 }).urls).toHaveLength(5);
  });

  it("survives a site with no locale prefix", () => {
    const input = [...urls("/", "/blog"), ...many("/blog", 40)];

    const selection = selectByStructure(input);

    expect(selection.urls.length).toBeLessThan(input.length);
    expect(selection.urls).toContain("https://example.com/blog");
  });
});
