import { readdirSync } from "node:fs";
import path from "node:path";

import { allDocs, allLegals } from "content-collections";
import { describe, expect, it } from "vitest";

import { locales } from "@/i18n/config";

/**
 * Every MDX file on disk must become a document.
 *
 * This is not a formality. `content/docs/report.mdx` had an unquoted colon in
 * its YAML description; the frontmatter failed to parse, content-collections
 * dropped the file without failing the build, and the page 404'd in production
 * while `content/docs/index.mdx` linked to it. Nothing noticed until goflag
 * crawled the site and reported the broken link.
 *
 * A document can go missing for any number of reasons — bad YAML, a schema
 * field that moved, a rename. What they have in common is that the build stays
 * green and a page disappears. Counting files against documents catches all of
 * them at once, which is why this compares the directory rather than testing
 * the one bug that happened.
 */

const CONTENT = path.resolve(__dirname, "../../content");

function mdxFilesIn(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
}

describe("the docs collection", () => {
  const files = mdxFilesIn(path.join(CONTENT, "docs"));

  it("has a document for every file on disk", () => {
    const expected = files.map((file) => file.replace(/\.mdx$/, "")).sort();
    const collected = allDocs.map((doc) => doc.slug).sort();

    expect(collected).toEqual(expected);
  });

  it("finds documents at all — an empty collection would satisfy nothing else here", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("gives every document the fields the pages and the sitemap read", () => {
    for (const doc of allDocs) {
      expect(doc.title, `${doc.slug} has no title`).toBeTruthy();
      expect(doc.description, `${doc.slug} has no description`).toBeTruthy();
    }
  });
});

describe("the legal collection", () => {
  const files = mdxFilesIn(path.join(CONTENT, "legal"));

  it("has a document for every file on disk", () => {
    // `<locale>/<slug>.mdx` — the locale is the directory.
    const expected = files.map((file) => file.replace(/\.mdx$/, "")).sort();
    const collected = allLegals.map((doc) => `${doc.locale}/${doc.slug}`).sort();

    expect(collected).toEqual(expected);
  });

  it("declares only locales the site serves", () => {
    // A stray directory would otherwise become a language: the route registry
    // drops unknown tags, so the page would exist and never be advertised.
    for (const doc of allLegals) {
      expect(locales, `${doc.locale}/${doc.slug} is in an unserved locale`).toContain(doc.locale);
    }
  });
});
