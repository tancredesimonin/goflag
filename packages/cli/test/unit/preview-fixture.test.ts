import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildPreviewReport, renderPreviewFixture } from "../../scripts/preview-fixture";

const here = dirname(fileURLToPath(import.meta.url));
const committed = readFileSync(join(here, "..", "fixtures", "transcripts", "preview.html"), "utf8");
const packageFile = (name: string) => readFileSync(join(here, "..", "..", name), "utf8");

const report = buildPreviewReport();

describe("the committed preview", () => {
  it("matches the renderer, byte for byte", () => {
    expect(committed).toBe(renderPreviewFixture());
  });

  it("actually drew something", () => {
    // The failure mode this whole step can die of, silently. `renderPreview`
    // does not throw on a report with no extractions: it writes ~11 800 bytes
    // saying "This report carries no extractions, so there is nothing to
    // draw", and that file deploys, serves and links perfectly. Every other
    // check in this file would pass over it.
    expect(committed).not.toContain("carries no extractions");
    expect(committed).not.toContain("reached no HTML page");
    expect(report.extractions?.length).toBe(report.pages.length);
    expect(committed.match(/<img/g)?.length ?? 0).toBeGreaterThan(20);
  });

  it("points every image at an absolute http(s) URL", () => {
    // "The og:image must resolve" turned into something checkable from here.
    // `safeUrl` (render-preview.ts:121) clips anything else, so a relative or
    // `data:` source would silently become an empty card rather than an error.
    const sources = [...committed.matchAll(/<img[^>]+src="([^"]*)"/g)].map((m) => m[1]!);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter((src) => !/^https?:\/\//.test(src))).toEqual([]);
  });

  it("draws the two panels that need more than one page", () => {
    // The translation matrix needs two extractions sharing a locale-stripped
    // route, and the route tree needs more than one page. A corpus trimmed to
    // one page would lose both at once and still pass everything above.
    const routes = new Set(
      report.pages.map((page) => new URL(page.url).pathname.replace(/^\/[a-z-]+/i, "") || "/"),
    );
    expect(report.pages.length).toBeGreaterThan(routes.size);
    expect(new Set(report.pages.map((page) => page.locale)).size).toBeGreaterThan(1);
  });
});

describe("the frozen corpus", () => {
  it("counts its findings the way `build.ts` does", () => {
    expect(report.summary.seoIssues).toBe(report.seoIssues.length);
    expect(report.summary.brokenLinks).toBe(report.brokenLinks.length);
    expect(report.summary.siteIssues).toBe(report.siteIssues.length);
    expect(report.summary.unreachablePages).toBe(report.unreachablePages.length);
  });

  it("earns the verdict it prints", () => {
    const errors = report.seoIssues.filter((issue) => issue.severity === "error").length;
    expect(report.summary.verdict).toBe(errors > 0 ? "red" : "yellow");
  });

  it("cites only rules the catalogue still has", () => {
    const catalogue = JSON.parse(packageFile("rules.json")) as { rules: Array<{ id: string }> };
    const known = new Set(catalogue.rules.map((rule) => rule.id));
    const cited = report.seoIssues.map((issue) => issue.ruleId);
    expect(cited.length).toBeGreaterThan(0);
    expect([...new Set(cited)].filter((id) => !known.has(id))).toEqual([]);
  });

  it("gives every finding a distinct fingerprint", () => {
    const ids = report.seoIssues.map((issue) => issue.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts graphemes the same way whichever counter runs", () => {
    // `render-preview.ts:623` measures titles with `Intl.Segmenter` and falls
    // back to spreading the string. The two disagree on emoji and on combining
    // sequences, so a corpus carrying either would render differently under a
    // different ICU build — and the byte-for-byte check above would fail on a
    // machine nobody changed. Accented Latin in NFC is safe, which is why this
    // asserts the property rather than banning non-ASCII from a French site.
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    for (const extraction of report.extractions ?? []) {
      for (const value of [
        extraction.document.title?.value,
        extraction.openGraph.title?.value,
        extraction.meta.description?.value,
      ]) {
        if (!value) continue;
        expect(value.normalize("NFC")).toBe(value);
        expect([...segmenter.segment(value)].length).toBe([...value].length);
      }
    }
  });
});
