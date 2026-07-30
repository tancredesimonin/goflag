import { describe, expect, it } from "vitest";

import { extractCandidateLinks } from "./discover";
import { pageFromHtml } from "@/lib/rules/test-utils";

describe("extractCandidateLinks", () => {
  it("returns hreflang siblings tagged as `hreflang`", () => {
    const page = pageFromHtml(
      `<html><head>
        <link rel="alternate" hreflang="fr" href="https://x.com/fr/about">
        <link rel="alternate" hreflang="en" href="https://x.com/en/about">
        <link rel="alternate" hreflang="x-default" href="https://x.com/about">
      </head><body></body></html>`,
      { url: "https://x.com/fr/about" },
    );
    const links = extractCandidateLinks(page);
    const sources = links.map((l) => l.source);
    expect(sources.filter((s) => s === "hreflang").length).toBe(3);
  });

  it("returns rel=next / rel=prev as head-link candidates", () => {
    const page = pageFromHtml(
      `<html><head>
        <link rel="next" href="https://x.com/blog/page-2">
        <link rel="prev" href="https://x.com/blog/page-0">
      </head><body></body></html>`,
      { url: "https://x.com/blog/page-1" },
    );
    const links = extractCandidateLinks(page);
    const headLinks = links.filter((l) => l.source === "head-link").map((l) => l.href);
    expect(headLinks).toEqual(["https://x.com/blog/page-2", "https://x.com/blog/page-0"]);
  });

  it("extracts <a href> from the static body and resolves relative URLs", () => {
    const page = pageFromHtml(
      `<html><head><title>Index</title></head><body>
        <a href="/blog/post-1">Post 1</a>
        <a href='https://other.example/'>Other</a>
        <a href="post-2">Relative</a>
      </body></html>`,
      { url: "https://x.com/blog/" },
    );
    const links = extractCandidateLinks(page);
    const anchors = links.filter((l) => l.source === "body-anchor").map((l) => l.href);
    expect(anchors).toContain("https://x.com/blog/post-1");
    expect(anchors).toContain("https://other.example/");
    expect(anchors).toContain("https://x.com/blog/post-2");
  });

  it("dedupes within a page (an anchor + an hreflang to the same URL = one entry)", () => {
    const page = pageFromHtml(
      `<html><head>
        <link rel="alternate" hreflang="en" href="https://x.com/en/about">
      </head><body><a href="https://x.com/en/about">EN</a></body></html>`,
      { url: "https://x.com/fr/about" },
    );
    const links = extractCandidateLinks(page);
    const enHrefs = links.filter((l) => l.href === "https://x.com/en/about");
    expect(enHrefs).toHaveLength(1);
    // The first source wins — hreflang is yielded first by design.
    expect(enHrefs[0]!.source).toBe("hreflang");
  });
});
