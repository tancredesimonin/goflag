import { describe, expect, it } from "vitest";
import { extractLinks } from "./extract";

const BASE = "https://site.example/page";

describe("extractLinks", () => {
  it("extracts <a href> links with anchor text, kind, and source by default", () => {
    const html = `
      <a href="/about">About us</a>
      <a href="https://other.example/x">Off site</a>
    `;
    const refs = extractLinks(html, { baseUrl: BASE });

    expect(refs).toHaveLength(2);
    const internal = refs.find((r) => r.url === "https://site.example/about");
    expect(internal).toMatchObject({
      kind: "internal",
      source: "a",
      anchorText: "About us",
      rawHref: "/about",
    });
    const external = refs.find((r) => r.url === "https://other.example/x");
    expect(external?.kind).toBe("external");
  });

  it("parses rel tokens lower-cased", () => {
    const html = `<a href="/x" rel="NoFollow Sponsored">x</a>`;
    const [ref] = extractLinks(html, { baseUrl: BASE });
    expect(ref?.rel).toEqual(["nofollow", "sponsored"]);
  });

  it("keeps the fragment separately and dedupes by canonical base URL", () => {
    const html = `
      <a href="/docs#intro">Intro</a>
      <a href="/docs#setup">Setup</a>
    `;
    const refs = extractLinks(html, { baseUrl: BASE });
    // Same canonical /docs → deduped to one occurrence for <a>.
    expect(refs).toHaveLength(1);
    expect(refs[0]?.url).toBe("https://site.example/docs");
    expect(refs[0]?.fragment).toBe("#intro");
  });

  it("ignores assets unless includeAssets is set", () => {
    const html = `
      <a href="/a">a</a>
      <img src="/img.png" />
      <script src="/app.js"></script>
      <link rel="stylesheet" href="/style.css" />
      <iframe src="/frame"></iframe>
    `;
    expect(extractLinks(html, { baseUrl: BASE })).toHaveLength(1);

    const withAssets = extractLinks(html, { baseUrl: BASE, includeAssets: true });
    const sources = withAssets.map((r) => r.source).sort();
    expect(sources).toEqual(["a", "iframe", "img", "link", "script"]);
    const linkEl = withAssets.find((r) => r.source === "link");
    expect(linkEl?.rel).toEqual(["stylesheet"]);
  });

  it("preserves un-canonicalisable links (mailto/tel/#) as external with rawHref", () => {
    const html = `
      <a href="mailto:hi@example.com">Mail</a>
      <a href="tel:+15551234">Call</a>
      <a href="javascript:void(0)">JS</a>
    `;
    const refs = extractLinks(html, { baseUrl: BASE });
    const mailto = refs.find((r) => r.rawHref === "mailto:hi@example.com");
    expect(mailto).toBeDefined();
    expect(mailto?.url).toBe("mailto:hi@example.com");
    expect(mailto?.kind).toBe("external");
    expect(refs).toHaveLength(3);
  });

  it("resolves relative links against a <base href>", () => {
    const html = `
      <head><base href="https://cdn.example/app/" /></head>
      <body><a href="docs">Docs</a></body>
    `;
    const [ref] = extractLinks(html, { baseUrl: BASE });
    expect(ref?.url).toBe("https://cdn.example/app/docs");
    expect(ref?.kind).toBe("external");
  });

  it("falls back to the page URL when <base href> is malformed", () => {
    const html = `<head><base href="http://" /></head><body><a href="/x">x</a></body>`;
    const [ref] = extractLinks(html, { baseUrl: BASE });
    expect(ref?.url).toBe("https://site.example/x");
  });

  it("treats links as external when the audited base URL is not a URL", () => {
    const html = `<a href="https://x.example/a">a</a>`;
    const [ref] = extractLinks(html, { baseUrl: "not-a-url" });
    expect(ref?.url).toBe("https://x.example/a");
    expect(ref?.kind).toBe("external");
  });

  it("skips empty and whitespace-only hrefs", () => {
    const html = `<a href="">empty</a><a href="   ">spaces</a><a href="/ok">ok</a>`;
    const refs = extractLinks(html, { baseUrl: BASE });
    expect(refs).toHaveLength(1);
    expect(refs[0]?.url).toBe("https://site.example/ok");
  });
});

describe("extractLinks — trailing slashes", () => {
  it("probes the URL as authored, slash included", () => {
    // EUR-Lex, the case that caught us: `/legal-content/FR/TXT/?uri=…` returns
    // 200 and the slashless form returns 404. Collapsing the slash turned 159
    // healthy citations on openfinanceguide into phantom broken links —
    // goflag reporting a URL it had invented itself.
    const html = `<a href="https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32015L2366">PSD2</a>`;
    const [ref] = extractLinks(html, { baseUrl: BASE });
    expect(ref?.url).toBe("https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32015L2366");
  });

  it("keeps a trailing slash on a plain path too", () => {
    const [ref] = extractLinks(`<a href="/docs/">Docs</a>`, { baseUrl: BASE });
    expect(ref?.url).toBe("https://site.example/docs/");
  });

  it("leaves a slashless URL alone", () => {
    const [ref] = extractLinks(`<a href="/docs">Docs</a>`, { baseUrl: BASE });
    expect(ref?.url).toBe("https://site.example/docs");
  });

  it("still strips the fragment", () => {
    const [ref] = extractLinks(`<a href="/docs/#intro">Docs</a>`, { baseUrl: BASE });
    expect(ref?.url).toBe("https://site.example/docs/");
    expect(ref?.fragment).toBe("#intro");
  });
});
