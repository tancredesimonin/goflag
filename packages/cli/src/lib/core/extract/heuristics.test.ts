import { describe, expect, it } from "vitest";
import { extractStatic } from "./static";
import { looksClientRendered } from "./heuristics";

const BASE = { baseUrl: "http://localhost:3000/" };

function parse(html: string) {
  return extractStatic(html, BASE);
}

describe("looksClientRendered", () => {
  it("flags a textbook unhydrated SPA shell", () => {
    const page = parse(
      `<!doctype html><html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width">
      </head><body><div id="root"></div></body></html>`,
    );
    const sig = looksClientRendered(page);
    expect(sig.likely).toBe(true);
    expect(sig.reason).toContain("title missing");
    expect(sig.reason).toContain("no og:*");
  });

  it("flags an SPA shell with only a placeholder title", () => {
    const page = parse(
      `<!doctype html><html><head>
        <meta charset="utf-8">
        <title>React App</title>
      </head><body><div id="root"></div></body></html>`,
    );
    const sig = looksClientRendered(page);
    expect(sig.likely).toBe(true);
    expect(sig.reason).toContain("placeholder title");
  });

  it("does not flag a page with a real title plus a description", () => {
    const page = parse(
      `<!doctype html><html><head>
        <title>Tancrede Simonin — Engineer</title>
        <meta name="description" content="Independent engineer">
      </head><body></body></html>`,
    );
    expect(looksClientRendered(page).likely).toBe(false);
  });

  it("does not flag a page that has at least one og:* tag", () => {
    const page = parse(
      `<!doctype html><html><head>
        <meta property="og:image" content="https://example.test/img.png">
      </head><body></body></html>`,
    );
    expect(looksClientRendered(page).likely).toBe(false);
  });

  it("does not flag a page that ships JSON-LD", () => {
    const page = parse(
      `<!doctype html><html><head>
        <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
      </head><body></body></html>`,
    );
    expect(looksClientRendered(page).likely).toBe(false);
  });

  it("does not flag a page with hreflang alternates", () => {
    const page = parse(
      `<!doctype html><html><head>
        <link rel="alternate" hreflang="en" href="https://example.test/en/">
        <link rel="alternate" hreflang="fr" href="https://example.test/fr/">
      </head><body></body></html>`,
    );
    expect(looksClientRendered(page).likely).toBe(false);
  });

  it("does not flag a page with a canonical link", () => {
    const page = parse(
      `<!doctype html><html><head>
        <link rel="canonical" href="https://example.test/x">
      </head><body></body></html>`,
    );
    expect(looksClientRendered(page).likely).toBe(false);
  });

  it("returns 'all metadata present' when nothing is missing", () => {
    const page = parse(
      `<!doctype html><html><head>
        <title>Tancrede</title>
        <meta name="description" content="Engineer">
        <link rel="canonical" href="https://example.test/">
        <meta property="og:title" content="Tancrede">
        <meta name="twitter:card" content="summary_large_image">
        <link rel="alternate" hreflang="en" href="https://example.test/en/">
        <script type="application/ld+json">{"@type":"Person","name":"x"}</script>
      </head><body></body></html>`,
    );
    const sig = looksClientRendered(page);
    expect(sig.likely).toBe(false);
    expect(sig.reason).toBe("all metadata present");
  });
});
