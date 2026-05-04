import { describe, expect, it } from "vitest";
import { renderPageSummary } from "./render-page";
import { PAGE_SCHEMA_VERSION, type Page } from "../core/types";

function basePage(overrides: Partial<Page> = {}): Page {
  return {
    schemaVersion: PAGE_SCHEMA_VERSION,
    fetchedAt: new Date(0).toISOString(),
    fetch: {
      requestedUrl: "http://x.test/",
      finalUrl: "http://x.test/",
      status: 200,
      statusText: "OK",
      headers: {},
      redirectCount: 0,
      durationMs: 12,
      bodyBytes: 256,
      contentType: "text/html",
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
    ...overrides,
  };
}

describe("renderPageSummary", () => {
  it("renders a minimal page without crashing and includes section headers", () => {
    const out = renderPageSummary(basePage());
    expect(out).toContain("Headlint inspect");
    expect(out).toContain("Open Graph");
    expect(out).toContain("Twitter / X");
    expect(out).toContain("Links");
    expect(out).toContain("(none)");
  });

  it("notes the redirect count when finalUrl differs from requestedUrl", () => {
    const out = renderPageSummary(
      basePage({
        fetch: {
          ...basePage().fetch,
          finalUrl: "http://x.test/final",
          redirectCount: 2,
        },
      }),
    );
    expect(out).toMatch(/Final URL.*after 2 redirect/);
  });

  it("renders the extractor mode line for a static page", () => {
    const out = renderPageSummary(basePage());
    expect(out).toContain("Extractor        static");
  });

  it("renders the headless escalation reason and hydration delta", () => {
    const out = renderPageSummary(
      basePage({
        extractor: {
          mode: "headless",
          escalated: true,
          escalationReason: "title missing, no og:*",
        },
        html: { static: "<html></html>", rendered: "<html><head><title>Hi</title></head></html>" },
        hydration: {
          fromMode: "static",
          toMode: "headless",
          titleChanged: true,
          htmlLangChanged: false,
          clientInjectedMetas: [{ property: "og:title", content: "Hi" }],
          clientRemovedMetas: [],
          clientInjectedLinks: [],
          clientRemovedLinks: [],
          jsonLdBlocksAdded: 1,
        },
      }),
    );
    expect(out).toContain("Extractor        headless (escalated: title missing, no og:*)");
    expect(out).toContain("Hydration        +1 / -0 tags, title changed, +1 JSON-LD block(s)");
  });

  it("renders forced-headless without an escalation reason", () => {
    const out = renderPageSummary(
      basePage({
        extractor: { mode: "headless", escalated: false },
        html: { static: "", rendered: "<html></html>" },
      }),
    );
    expect(out).toContain("Extractor        headless (forced)");
  });

  it("formats large bodies in KiB / MiB", () => {
    const small = renderPageSummary(basePage({ fetch: { ...basePage().fetch, bodyBytes: 500 } }));
    expect(small).toContain("500 B");
    const med = renderPageSummary(
      basePage({ fetch: { ...basePage().fetch, bodyBytes: 3 * 1024 } }),
    );
    expect(med).toContain("3.0 KiB");
    const big = renderPageSummary(
      basePage({ fetch: { ...basePage().fetch, bodyBytes: 5 * 1024 * 1024 } }),
    );
    expect(big).toContain("5.00 MiB");
  });
});
