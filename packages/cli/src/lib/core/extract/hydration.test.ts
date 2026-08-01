import { describe, expect, it } from "vitest";
import { extractStatic } from "./static";
import { computeHydrationDelta } from "./hydration";

const BASE = { baseUrl: "http://localhost:3000/" };

describe("computeHydrationDelta", () => {
  it("reports identical passes as a no-op delta", () => {
    const html = `<!doctype html><html lang="en"><head>
      <title>Hi</title>
      <meta name="description" content="d">
    </head><body></body></html>`;
    const a = extractStatic(html, BASE);
    const b = extractStatic(html, BASE);
    const d = computeHydrationDelta(a, b);
    expect(d.fromMode).toBe("static");
    expect(d.toMode).toBe("headless");
    expect(d.titleChanged).toBe(false);
    expect(d.htmlLangChanged).toBe(false);
    expect(d.clientInjectedMetas).toEqual([]);
    expect(d.clientRemovedMetas).toEqual([]);
    expect(d.clientInjectedLinks).toEqual([]);
    expect(d.clientRemovedLinks).toEqual([]);
    expect(d.jsonLdBlocksAdded).toBe(0);
  });

  it("flags client-injected meta tags", () => {
    const before = extractStatic(`<html><head></head><body></body></html>`, BASE);
    const after = extractStatic(
      `<html><head>
        <meta property="og:title" content="Hi">
        <meta name="twitter:card" content="summary">
      </head><body></body></html>`,
      BASE,
    );
    const d = computeHydrationDelta(before, after);
    expect(d.clientInjectedMetas).toHaveLength(2);
    expect(d.clientInjectedMetas).toContainEqual({ property: "og:title", content: "Hi" });
    expect(d.clientInjectedMetas).toContainEqual({ name: "twitter:card", content: "summary" });
  });

  it("flags client-removed meta tags", () => {
    const before = extractStatic(
      `<html><head><meta name="robots" content="noindex"></head><body></body></html>`,
      BASE,
    );
    const after = extractStatic(`<html><head></head><body></body></html>`, BASE);
    const d = computeHydrationDelta(before, after);
    expect(d.clientRemovedMetas).toEqual([{ name: "robots", content: "noindex" }]);
  });

  it("flags injected and removed link tags", () => {
    const before = extractStatic(
      `<html><head>
        <link rel="canonical" href="/old">
      </head></html>`,
      BASE,
    );
    const after = extractStatic(
      `<html><head>
        <link rel="canonical" href="/new">
        <link rel="alternate" hreflang="fr" href="/fr/">
      </head></html>`,
      BASE,
    );
    const d = computeHydrationDelta(before, after);
    expect(d.clientInjectedLinks).toContainEqual({ rel: "canonical", href: "/new" });
    expect(d.clientInjectedLinks).toContainEqual({
      rel: "alternate",
      href: "/fr/",
      hreflang: "fr",
    });
    expect(d.clientRemovedLinks).toEqual([{ rel: "canonical", href: "/old" }]);
  });

  it("detects title and html-lang changes", () => {
    const before = extractStatic(`<html lang="en"><head><title>A</title></head></html>`, BASE);
    const after = extractStatic(`<html lang="fr"><head><title>B</title></head></html>`, BASE);
    const d = computeHydrationDelta(before, after);
    expect(d.titleChanged).toBe(true);
    expect(d.htmlLangChanged).toBe(true);
  });

  it("preserves http-equiv on injected meta summaries", () => {
    const before = extractStatic(`<html><head></head></html>`, BASE);
    const after = extractStatic(
      `<html><head><meta http-equiv="refresh" content="5"></head></html>`,
      BASE,
    );
    const d = computeHydrationDelta(before, after);
    expect(d.clientInjectedMetas).toEqual([{ httpEquiv: "refresh", content: "5" }]);
  });

  it("handles links with neither rel nor href when bucketing", () => {
    // A pathological <link> with no useful attributes — we still bucket it
    // by its (empty) key without crashing.
    const before = extractStatic(`<html><head><link></head></html>`, BASE);
    const after = extractStatic(`<html><head></head></html>`, BASE);
    const d = computeHydrationDelta(before, after);
    expect(d.clientRemovedLinks).toEqual([{ rel: "" }]);
  });

  it("counts only newly added JSON-LD blocks (never negative)", () => {
    const before = extractStatic(
      `<html><head>
        <script type="application/ld+json">{"@type":"X"}</script>
      </head></html>`,
      BASE,
    );
    const after = extractStatic(
      `<html><head>
        <script type="application/ld+json">{"@type":"X"}</script>
        <script type="application/ld+json">{"@type":"Y"}</script>
        <script type="application/ld+json">{"@type":"Z"}</script>
      </head></html>`,
      BASE,
    );
    expect(computeHydrationDelta(before, after).jsonLdBlocksAdded).toBe(2);

    // Reverse case: removing blocks does not produce negative counts.
    expect(computeHydrationDelta(after, before).jsonLdBlocksAdded).toBe(0);
  });
});
