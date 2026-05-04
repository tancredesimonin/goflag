import { describe, expect, it } from "vitest";
import { countEntries } from "./sitemap";

describe("countEntries", () => {
  it("counts <url> entries in a urlset", () => {
    const body = `<?xml version="1.0"?><urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>`;
    expect(countEntries(body)).toBe(2);
  });

  it("counts <sitemap> entries in a sitemapindex", () => {
    const body = `<sitemapindex><sitemap><loc>a</loc></sitemap><sitemap><loc>b</loc></sitemap><sitemap><loc>c</loc></sitemap></sitemapindex>`;
    expect(countEntries(body)).toBe(3);
  });

  it("returns 0 for an empty body", () => {
    expect(countEntries("")).toBe(0);
  });
});
