/**
 * Preview renderer tests.
 *
 * `renderPreview` is a pure function of a `GoflagReport`, so we feed it
 * hand-built reports and assert on the emitted HTML. The interesting cases are
 * the ones where the page is *wrong* — an image that does not answer, a
 * relative URL, a title carrying markup — because that is what the preview
 * exists to show and what an unescaped renderer would get away with.
 */

import { describe, expect, it } from "vitest";

import { renderPreview } from "./render-preview";
import { EXTRACTION_VERSION } from "../lib/rules/extraction/types";
import type { Extraction, ExtractionAsset } from "../lib/rules/extraction/types";
import type { GoflagReport, SeoIssue } from "./types";

const meta = (value: string, property: string) => ({
  value,
  origin: { kind: "meta" as const, property },
});
const named = (value: string, name: string) => ({
  value,
  origin: { kind: "meta" as const, name },
});
const title = (value: string) => ({ value, origin: { kind: "title" as const } });

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  const base: Extraction = {
    extractionVersion: EXTRACTION_VERSION,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    http: {
      requestedUrl: "https://example.com/fr",
      finalUrl: "https://example.com/fr",
      status: 200,
      headers: {},
      redirects: 0,
      contentType: "text/html",
    },
    rendering: { mode: "static", escalated: false },
    document: { title: title("Example — the page") },
    meta: { description: named("One sentence about the page.", "description") },
    openGraph: {
      title: meta("Example — the card", "og:title"),
      description: meta("A description written for the unfurl.", "og:description"),
      localeAlternates: [],
      images: [
        {
          url: meta("https://cdn.example.com/og.png", "og:image"),
          width: { value: 1200, origin: { kind: "meta", property: "og:image:width" } },
          height: { value: 630, origin: { kind: "meta", property: "og:image:height" } },
          alt: meta("The card", "og:image:alt"),
        },
      ],
      other: [],
    },
    twitter: {},
    links: { hreflang: [], icons: [], feeds: [] },
    jsonLd: [],
    assets: {
      "https://cdn.example.com/og.png": { status: 200, ok: true, contentType: "image/png" },
    },
  };
  return { ...base, ...overrides };
}

function report(overrides: Partial<GoflagReport> = {}): GoflagReport {
  const base: GoflagReport = {
    url: "https://example.com/",
    finishedAt: "2026-01-01T00:00:00.000Z",
    profile: "default",
    summary: {
      brokenLinks: 0,
      missingTranslations: 0,
      seoIssues: 0,
      siteIssues: 0,
      unreachablePages: 0,
      verdict: "green",
    },
    localeAxis: { locales: [], source: "none", multilingual: false },
    pages: [{ url: "https://example.com/fr", status: 200, locale: "fr" }],
    unreachablePages: [],
    brokenLinks: [],
    missingTranslations: { holes: [], reciprocity: [] },
    seoIssues: [],
    siteIssues: [],
    extractions: [extraction()],
    diagnostics: {
      pagesCrawled: 1,
      pagesScanned: 1,
      pagesFailed: 0,
      truncated: false,
      warnings: [],
    },
  };
  return { ...base, ...overrides };
}

function issue(overrides: Partial<SeoIssue> = {}): SeoIssue {
  return {
    id: "seo-0123456789",
    pageUrl: "https://example.com/fr",
    ruleId: "og.image.alt",
    severity: "warning",
    message: "No og:image:alt on this page.",
    ...overrides,
  };
}

describe("renderPreview — the document", () => {
  it("emits one standalone HTML document with no external stylesheet", () => {
    const out = renderPreview(report());
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain("<style>");
    expect(out).not.toContain('<link rel="stylesheet"');
    expect(out).not.toContain("<script");
  });

  it("tells the browser not to index it — the file names a localhost origin", () => {
    expect(renderPreview(report())).toContain('<meta name="robots" content="noindex">');
  });

  it("names the seven surfaces, each with the rigor of its own source", () => {
    const out = renderPreview(report());
    for (const surface of [
      "Google",
      "Open Graph",
      "X —",
      "LinkedIn",
      "Slack",
      "Discord",
      "WhatsApp",
    ]) {
      expect(out).toContain(surface);
    }
    expect(out).toContain("vendor-spec");
    expect(out).toContain("guideline");
    expect(out).toContain("heuristic");
    expect(out).toContain("unsourced");
  });

  it("says so, rather than rendering an empty page, when the report carries no extractions", () => {
    const out = renderPreview(report({ extractions: undefined }));
    expect(out).toContain("carries no extractions");
    expect(out).not.toContain("Open Graph — the source card");
  });

  it("lists the pages when there is more than one, and does not when there is one", () => {
    expect(renderPreview(report())).not.toContain('class="nav"');
    const two = report({
      extractions: [
        extraction(),
        extraction({
          http: {
            requestedUrl: "https://example.com/en",
            finalUrl: "https://example.com/en",
            status: 200,
            headers: {},
            redirects: 0,
          },
        }),
      ],
    });
    const out = renderPreview(two);
    expect(out).toContain('class="nav"');
    expect(out).toContain('href="#page-1"');
  });
});

describe("renderPreview — what the page declared", () => {
  it("names the tag each value came from, so a fallback reads as a fallback", () => {
    const out = renderPreview(report());
    expect(out).toContain("og:title");
    const fallback = renderPreview(
      report({
        extractions: [extraction({ openGraph: { ...extraction().openGraph, title: undefined } })],
      }),
    );
    // The card still has a title — it is the document's, and it says so.
    expect(fallback).toContain("Example — the page");
    expect(fallback).toContain("&lt;title&gt;");
  });

  it("shows the X card with no description, because X has not rendered one since 2023", () => {
    const out = renderPreview(report());
    const card = out.slice(out.indexOf("X — link card"), out.indexOf("LinkedIn"));
    expect(card).not.toContain("A description written for the unfurl.");
    expect(card).toContain("4 October 2023");
  });

  it("reads the ratio off the declared size and places it against the 1.91:1 band", () => {
    expect(renderPreview(report())).toContain("1.90:1 declared");
  });

  it("calls a square image renderable but cropped, and a strip outside anything", () => {
    const square = extraction();
    square.openGraph.images[0]!.width = {
      value: 800,
      origin: { kind: "meta", property: "og:image:width" },
    };
    square.openGraph.images[0]!.height = {
      value: 800,
      origin: { kind: "meta", property: "og:image:height" },
    };
    expect(renderPreview(report({ extractions: [square] }))).toContain("cropped away from 1.91:1");

    const strip = extraction();
    strip.openGraph.images[0]!.height = {
      value: 100,
      origin: { kind: "meta", property: "og:image:height" },
    };
    expect(renderPreview(report({ extractions: [strip] }))).toContain(
      "outside anything a card renders whole",
    );
  });

  it("falls back to the size decoded from the file when the page declares none", () => {
    const undeclared = extraction();
    undeclared.openGraph.images[0]!.width = undefined;
    undeclared.openGraph.images[0]!.height = undefined;
    undeclared.assets = {
      "https://cdn.example.com/og.png": {
        status: 200,
        ok: true,
        contentType: "image/png",
        sizes: [{ width: 1200, height: 630 }],
      },
    };
    expect(renderPreview(report({ extractions: [undeclared] }))).toContain(
      "1.90:1 decoded from the file",
    );
  });
});

describe("renderPreview — when the page is wrong", () => {
  it("draws the broken state, with the status, when the image does not answer", () => {
    const broken: ExtractionAsset = { status: 404, ok: false };
    const out = renderPreview(
      report({
        extractions: [extraction({ assets: { "https://cdn.example.com/og.png": broken } })],
      }),
    );
    expect(out).toContain("the image does not answer");
    expect(out).toContain("answered 404, which is not an image");
    expect(out).not.toContain('<img src="https://cdn.example.com/og.png"');
  });

  it("distinguishes a failed request from a bad status", () => {
    const dead: ExtractionAsset = { status: 0, ok: false };
    expect(
      renderPreview(
        report({
          extractions: [extraction({ assets: { "https://cdn.example.com/og.png": dead } })],
        }),
      ),
    ).toContain("the request failed");
  });

  it("says an image was not probed rather than inventing a verdict about it", () => {
    expect(renderPreview(report({ extractions: [extraction({ assets: undefined })] }))).toContain(
      "not probed on this run",
    );
  });

  it("never turns a relative og:image into an src — that is a finding, not a thing to resolve", () => {
    const relative = extraction();
    relative.openGraph.images[0]!.url = meta("/og.png", "og:image");
    relative.assets = undefined;
    const out = renderPreview(report({ extractions: [relative] }));
    expect(out).toContain("not an absolute http(s) URL");
    expect(out).not.toContain('<img src="/og.png"');
  });

  it("renders the empty state when there is no image at all", () => {
    const none = extraction();
    none.openGraph.images = [];
    expect(renderPreview(report({ extractions: [none] }))).toContain("no <code>og:image</code>");
  });

  it("warns on LinkedIn when the declared width is under the documented 401px cutoff", () => {
    const small = extraction();
    small.openGraph.images[0]!.width = {
      value: 320,
      origin: { kind: "meta", property: "og:image:width" },
    };
    const out = renderPreview(report({ extractions: [small] }));
    expect(out).toContain("320px wide, under LinkedIn");
    expect(renderPreview(report())).not.toContain("under LinkedIn");
  });
});

describe("renderPreview — the input is a site, so it is untrusted", () => {
  it("escapes markup in a title instead of emitting it", () => {
    const hostile = extraction();
    hostile.openGraph.title = meta("</h4><script>alert(1)</script>", "og:title");
    const out = renderPreview(report({ extractions: [hostile] }));
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes a quote in an alt so it cannot close the attribute", () => {
    const hostile = extraction();
    hostile.openGraph.images[0]!.alt = meta('" onerror="alert(1)', "og:image:alt");
    const out = renderPreview(report({ extractions: [hostile] }));
    expect(out).not.toContain('onerror="alert(1)"');
    expect(out).toContain("&quot; onerror=&quot;alert(1)");
  });

  it("refuses a javascript: URL as a favicon", () => {
    const hostile = extraction();
    hostile.links.icons = [{ rel: "icon", href: "javascript:alert(1)", parsedSizes: [] }];
    const out = renderPreview(report({ extractions: [hostile] }));
    expect(out).not.toContain("javascript:alert(1)");
  });

  it("only accepts a theme-color that looks like one", () => {
    const hostile = extraction();
    hostile.meta.themeColor = named("red;background:url(x)", "theme-color");
    expect(renderPreview(report({ extractions: [hostile] }))).not.toContain("background:url(x)");
    const real = extraction();
    real.meta.themeColor = named("#00d492", "theme-color");
    expect(renderPreview(report({ extractions: [real] }))).toContain("border-left-color:#00d492");
  });
});

describe("renderPreview — the findings rail", () => {
  it("pins the head findings on the page and counts the rest out", () => {
    const out = renderPreview(
      report({
        seoIssues: [
          issue(),
          issue({ id: "seo-1", ruleId: "robots.conflict", message: "robots and meta disagree." }),
        ],
      }),
    );
    expect(out).toContain("og.image.alt");
    expect(out).not.toContain("robots.conflict");
    expect(out).toContain("1 other finding on this page");
  });

  it("does not claim a clean head means a good card", () => {
    const out = renderPreview(report());
    // Authored copy is not run through `esc` — only what the site said is.
    expect(out).toContain("Nothing the catalogue judges about this page's head");
  });

  it("honours the backticks a rule message marks code with, where the terminal strips them", () => {
    const out = renderPreview(
      report({
        seoIssues: [issue({ message: "Page is missing a `<title>` element." })],
      }),
    );
    expect(out).toContain("<code>&lt;title&gt;</code>");
  });

  it("does not turn backticks in a page's own title into markup", () => {
    const backticked = extraction();
    backticked.openGraph.title = meta("Using `npm install` in CI", "og:title");
    const out = renderPreview(report({ extractions: [backticked] }));
    expect(out).toContain("Using `npm install` in CI");
  });

  it("ignores findings belonging to another page", () => {
    const out = renderPreview(
      report({ seoIssues: [issue({ pageUrl: "https://example.com/en" })] }),
    );
    expect(out).not.toContain("og.image.alt");
  });
});

describe("renderPreview — the JSON-LD panel", () => {
  it("says nothing is there, and that no rule can hold it against the page", () => {
    const out = renderPreview(report());
    expect(out).toContain("No <code>application/ld+json</code> block");
    expect(out).toContain("no rule in the catalogue reads");
  });

  it("chips every block by its types, and names a parse error as one", () => {
    const withBlocks = extraction({
      jsonLd: [
        { index: 0, types: ["Article"], data: { "@type": "Article" }, raw: "{}" },
        { index: 1, types: [], data: null, parseError: "Unexpected token", raw: "{oops" },
      ],
    });
    const out = renderPreview(report({ extractions: [withBlocks] }));
    expect(out).toContain("#0 Article");
    expect(out).toContain("#1 Unexpected token");
    expect(out).toContain("&quot;@type&quot;: &quot;Article&quot;");
  });

  it("shows the raw block when every block failed to parse", () => {
    const broken = extraction({
      jsonLd: [{ index: 0, types: [], data: null, parseError: "empty", raw: "  " }],
    });
    expect(renderPreview(report({ extractions: [broken] }))).toContain("#0 empty");
  });
});

describe("renderPreview — how the page was read", () => {
  it("says a static read is what a non-JS crawler sees", () => {
    expect(renderPreview(report())).toContain("what a crawler that runs no JavaScript sees");
  });

  it("names the escalation reason when the static head looked empty", () => {
    const hydrated = extraction({
      rendering: { mode: "headless", escalated: true, escalationReason: "no JSON-LD" },
    });
    const out = renderPreview(report({ extractions: [hydrated] }));
    expect(out).toContain("after the static head looked empty");
    expect(out).toContain("no JSON-LD");
  });
});
