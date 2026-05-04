import { describe, expect, it } from "vitest";

import { applyFrameworkSnippets } from "./framework-snippets";
import type { Issue } from "@/lib/core/types";

const ISSUE: Issue = {
  ruleId: "og.image.missing",
  severity: "warning",
  message: "missing",
  docs: "/x",
  fix: {
    title: "Add an og:image",
    snippet: `<meta property="og:image" content="…">`,
    language: "html",
  },
};

describe("applyFrameworkSnippets", () => {
  it("returns issues unchanged when framework is unknown or undefined", () => {
    expect(applyFrameworkSnippets([ISSUE], undefined)).toEqual([ISSUE]);
    expect(applyFrameworkSnippets([ISSUE], "unknown")).toEqual([ISSUE]);
  });

  it("rewrites og.image.missing for Next to a Metadata-API snippet", () => {
    const out = applyFrameworkSnippets([ISSUE], "next");
    expect(out[0]!.fix?.snippet).toContain("metadata");
    expect(out[0]!.fix?.snippet).toContain("openGraph");
    expect(out[0]!.fix?.language).toBe("ts");
  });

  it("rewrites og.image.missing for Astro to a layout snippet", () => {
    const out = applyFrameworkSnippets([ISSUE], "astro");
    expect(out[0]!.fix?.snippet).toContain("Layout.astro");
  });

  it("leaves other rules untouched even when a snippet table exists", () => {
    const other: Issue = { ...ISSUE, ruleId: "title.length", fix: ISSUE.fix };
    const out = applyFrameworkSnippets([other], "next");
    expect(out[0]).toBe(other);
  });

  it("does not synthesise a fix when the original issue had none", () => {
    const noFix: Issue = { ...ISSUE, fix: undefined };
    const out = applyFrameworkSnippets([noFix], "next");
    expect(out[0]!.fix).toBeUndefined();
  });
});
