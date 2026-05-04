import { describe, expect, it } from "vitest";
import { PAGE_SCHEMA_VERSION, type Page } from "./types";

describe("Page schema", () => {
  it("pins PAGE_SCHEMA_VERSION to a small positive integer", () => {
    expect(PAGE_SCHEMA_VERSION).toBe(2);
  });

  it("accepts a minimal Page shape (compile-time + structural)", () => {
    const minimal: Page = {
      schemaVersion: PAGE_SCHEMA_VERSION,
      fetchedAt: new Date(0).toISOString(),
      fetch: {
        requestedUrl: "http://localhost:3000",
        finalUrl: "http://localhost:3000",
        status: 200,
        statusText: "OK",
        headers: {},
        redirectCount: 0,
        durationMs: 0,
        bodyBytes: 0,
      },
      extractor: { mode: "static", escalated: false },
      html: { static: "<!doctype html><html><head></head><body></body></html>" },
      raw: { metas: [], links: [], scripts: [] },
      meta: {},
      openGraph: { localeAlternates: [], images: [], unknown: [] },
      twitter: {},
      links: { alternates: [], icons: [], feeds: [], preconnects: [], dnsPrefetches: [] },
      jsonLd: [],
      probes: {},
    };

    expect(minimal.schemaVersion).toBe(PAGE_SCHEMA_VERSION);
    expect(minimal.fetch.status).toBe(200);
    expect(minimal.openGraph.images).toEqual([]);
    expect(minimal.extractor.mode).toBe("static");
    expect(minimal.html.rendered).toBeUndefined();
  });

  it("accepts a headless Page with hydration delta", () => {
    const page: Page = {
      schemaVersion: PAGE_SCHEMA_VERSION,
      fetchedAt: new Date(0).toISOString(),
      fetch: {
        requestedUrl: "http://localhost:3000",
        finalUrl: "http://localhost:3000",
        status: 200,
        statusText: "OK",
        headers: {},
        redirectCount: 0,
        durationMs: 0,
        bodyBytes: 0,
      },
      extractor: {
        mode: "headless",
        escalated: true,
        escalationReason: "title missing, no og:*, no canonical",
      },
      html: {
        static: '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
        rendered: "<!doctype html><html><head><title>Hi</title></head><body></body></html>",
      },
      raw: { title: "Hi", metas: [], links: [], scripts: [] },
      meta: {},
      openGraph: { localeAlternates: [], images: [], unknown: [] },
      twitter: {},
      links: { alternates: [], icons: [], feeds: [], preconnects: [], dnsPrefetches: [] },
      jsonLd: [],
      hydration: {
        fromMode: "static",
        toMode: "headless",
        titleChanged: true,
        htmlLangChanged: false,
        clientInjectedMetas: [],
        clientRemovedMetas: [],
        clientInjectedLinks: [],
        clientRemovedLinks: [],
        jsonLdBlocksAdded: 0,
      },
      probes: {},
    };

    expect(page.extractor.escalated).toBe(true);
    expect(page.hydration?.titleChanged).toBe(true);
    expect(page.html.rendered).toContain("<title>Hi</title>");
  });
});
