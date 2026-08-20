import { describe, expect, it } from "vitest";

import { PREVIEW_EXAMPLE, PREVIEW_EXAMPLE_BYTES } from "./preview-example";

/**
 * `packages/cli` already compares this file to the renderer byte for byte.
 * What it cannot check is the thing that only matters on this side: that what
 * gets *published* is a document with cards in it. Invariant I3 runs both
 * ways — nothing over there knows this route exists.
 */
describe("the preview example the site serves", () => {
  it("is a whole HTML document", () => {
    // Case-insensitive: the renderer emits the lowercase form, and which
    // one it picks is not the thing worth pinning here.
    expect(PREVIEW_EXAMPLE.slice(0, 15).toLowerCase()).toBe("<!doctype html>");
    expect(PREVIEW_EXAMPLE.trimEnd().endsWith("</html>")).toBe(true);
    expect(PREVIEW_EXAMPLE_BYTES).toBeGreaterThan(20_000);
  });

  it("is not the empty state, which deploys and serves just as well", () => {
    // `renderPreview` does not throw on a report with no extractions; it
    // writes a page saying there is nothing to draw. That page would pass a
    // route test, a build and a deploy, and the documentation would link to it
    // under a sentence promising an eye.
    expect(PREVIEW_EXAMPLE).not.toContain("carries no extractions");
    expect(PREVIEW_EXAMPLE).not.toContain("reached no HTML page");
    expect(PREVIEW_EXAMPLE.match(/<img/g)?.length ?? 0).toBeGreaterThan(20);
  });

  it("serves no image the browser cannot fetch", () => {
    // The cards draw the images the audited pages declare. A relative source
    // would resolve against goflag.tech and 404 — the seven surfaces would
    // become seven broken icons on the page that exists to be looked at.
    const sources = [...PREVIEW_EXAMPLE.matchAll(/<img[^>]+src="([^"]*)"/g)].map((m) => m[1]!);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter((src) => !/^https?:\/\//.test(src))).toEqual([]);
  });

  it("keeps its own content-security-policy, since the site sets none", () => {
    // The document is self-contained and declares its own policy. If that meta
    // ever left the renderer, the images would still load — but the page would
    // be relying on the absence of a header rather than on a stated rule.
    expect(PREVIEW_EXAMPLE).toContain("Content-Security-Policy");
  });
});
