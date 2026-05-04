import { describe, expect, it } from "vitest";
import { PAGE_SCHEMA_VERSION, type Page } from "./types";

describe("Page schema", () => {
  it("pins PAGE_SCHEMA_VERSION to a small positive integer", () => {
    expect(PAGE_SCHEMA_VERSION).toBe(1);
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
  });
});
