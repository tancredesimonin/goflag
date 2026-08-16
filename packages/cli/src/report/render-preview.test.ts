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

  it("distinguishes a report never asked for extractions from a crawl that read nothing", () => {
    // Telling an operator who just ran `goflag preview` to run `goflag preview`
    // is the wrong half of the message.
    const out = renderPreview(report({ extractions: [] }));
    expect(out).toContain("no HTML page it could read");
    expect(out).not.toContain("carries no extractions");
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

describe("renderPreview — the route tree", () => {
  const at = (path: string) =>
    extraction({
      http: {
        requestedUrl: `https://example.com${path}`,
        finalUrl: `https://example.com${path}`,
        status: 200,
        headers: {},
        redirects: 0,
      },
    });
  /** The nav alone: the sections below carry paths too, and would match. */
  const tree = (paths: string[]) => {
    const out = renderPreview(report({ extractions: paths.map(at) }));
    return out.slice(out.indexOf('<nav class="nav"'), out.indexOf("</nav>"));
  };

  it("branches on path segments rather than listing every route flat", () => {
    const out = tree(["/fr", "/fr/blog", "/fr/blog/psd2", "/en", "/en/blog"]);
    expect(out).toContain("<details");
    expect(out).toContain("<summary>");
    expect(out).toContain(">/fr<");
    expect(out).toContain(">/blog<");
    // The deepest route is a leaf, and it carries only its own segment.
    expect(out).toContain('href="#page-2">/psd2</a>');
  });

  it("counts the pages under a folder, its own page included", () => {
    const out = tree(["/fr", "/fr/blog", "/fr/blog/psd2", "/en"]);
    expect(out).toContain('<span class="seg">/fr</span><span class="n">3</span>');
  });

  it("folds a chain that offers no choice into one row", () => {
    // Nothing was crawled at /fr/stet, and /fr/stet holds only 1.6.3 — two rows
    // to reach one decision is a level of indentation nobody chose.
    const out = tree(["/fr/stet/1.6.3", "/fr/stet/1.6.3/changelog", "/fr/contact"]);
    expect(out).toContain(">/stet/1.6.3<");
    expect(out).not.toContain(">/stet<");
  });

  it("keeps a folder that is a page of its own on its own row", () => {
    // Folding /fr into /fr/blog would fold away the only link to /fr.
    const out = tree(["/fr", "/fr/blog", "/fr/blog/psd2"]);
    expect(out).toContain('<span class="seg">/fr</span>');
    expect(out).not.toContain(">/fr/blog<");
  });

  it("gives a folder that is also a page a link beside the fold, not on it", () => {
    // The label toggles; the ↗ navigates. A summary whose whole label was a
    // link would fold nothing when clicked.
    const out = tree(["/fr", "/fr/blog", "/fr/blog/psd2"]);
    expect(out).toContain('<a class="go" href="#page-0"');
    expect(out).not.toContain("<summary><a");
  });

  it("opens a small tree and collapses a large one", () => {
    const few = tree(["/fr", "/fr/blog", "/en", "/en/blog"]);
    expect(few).toContain("<details open>");

    const many = tree(Array.from({ length: 24 }, (_, i) => `/fr/p${i}/leaf`));
    expect(many).toContain("<details>");
    expect(many).not.toContain("<details open>");
  });

  it("branches on the path, never on the query string", () => {
    const out = tree(["/search?q=a", "/search?q=b"]);
    expect(out).toContain("/search?q=a");
    expect(out).toContain("/search?q=b");
    // One row each, not a `?q=a` folder hanging off a `/search` that was
    // never crawled.
    expect(out).not.toContain(">/search<");
  });

  it("points a duplicated path at the first page that claimed it", () => {
    const out = tree(["/fr/x", "/fr/x", "/fr/y"]);
    expect(out).toContain('href="#page-0">/x</a>');
    expect(out).not.toContain('href="#page-1"');
  });

  it("escapes a row, since a final URL `new URL` cannot parse is printed verbatim", () => {
    // `pathOf` normalises through `new URL`, which percent-encodes markup out of
    // existence — but it hands back anything it fails to parse untouched, and
    // `finalUrl` is a string the crawl carried, not a parsed value.
    const hostile = extraction();
    hostile.http.finalUrl = "<script>alert(1)</script>";
    const out = renderPreview(report({ extractions: [hostile, at("/fr/ok")] }));
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
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

  it("bands the rounded ratio, so the caption cannot contradict og.image.ratio", () => {
    // The rule rounds to two decimals before banding; 1.69731 is 1.70, which
    // is inside the ideal band. A caption that called it cropped would put the
    // page in an argument with the finding printed below it.
    const near = extraction();
    near.openGraph.images[0]!.height = {
      value: 707,
      origin: { kind: "meta", property: "og:image:height" },
    };
    const out = renderPreview(report({ extractions: [near] }));
    expect(out).toContain("1.70:1 declared — inside the 1.91:1 band");
  });

  it("says how many images the page declared, since consumers take the first", () => {
    const several = extraction();
    several.openGraph.images = [
      ...several.openGraph.images,
      { url: meta("https://cdn.example.com/b.png", "og:image") },
    ];
    expect(renderPreview(report({ extractions: [several] }))).toContain("1 of 2");
    expect(renderPreview(report())).not.toContain("1 of 1");
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

  it("does not let an empty og:image hide a real twitter:image", () => {
    // The extractor keeps `content=""` verbatim, so `??` would never fire.
    const blank = extraction();
    blank.openGraph.images[0]!.url = meta("", "og:image");
    blank.twitter.image = meta("https://cdn.example.com/x.png", "twitter:image");
    blank.assets = undefined;
    const out = renderPreview(report({ extractions: [blank] }));
    expect(out).toContain("https://cdn.example.com/x.png");
    expect(out).toContain("twitter:image");
  });

  it("treats a declared height of 0 as unknown rather than as a ratio", () => {
    const zero = extraction();
    zero.openGraph.images[0]!.height = {
      value: 0,
      origin: { kind: "meta", property: "og:image:height" },
    };
    zero.assets = {
      "https://cdn.example.com/og.png": {
        status: 200,
        ok: true,
        sizes: [{ width: 1200, height: 630 }],
      },
    };
    // The decoded pair is usable, so it is what the caption reads.
    expect(renderPreview(report({ extractions: [zero] }))).toContain(
      "1.90:1 decoded from the file",
    );
  });

  it("does not escape the content type twice", () => {
    const typed = extraction({
      assets: {
        "https://cdn.example.com/og.png": {
          status: 200,
          ok: true,
          contentType: "image/png;charset=<x>",
        },
      },
    });
    const out = renderPreview(report({ extractions: [typed] }));
    expect(out).toContain("image/png;charset=&lt;x&gt;");
    expect(out).not.toContain("&amp;lt;");
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

describe("renderPreview — a site does not get to veto its own preview", () => {
  it("survives a JSON-LD block deep enough to blow the stack", () => {
    // The extractor's type walker skips `@type`, so a chain of them parses
    // cleanly and `JSON.stringify` is the first thing that ever walks it.
    let deep: unknown = "x";
    for (let i = 0; i < 7000; i++) deep = { "@type": deep };
    const bomb = extraction({
      jsonLd: [{ index: 0, types: [], data: deep, raw: "{…}" }],
    });
    expect(() => renderPreview(report({ extractions: [bomb] }))).not.toThrow();
  });

  it("caps a pretty-printed block instead of inlining megabytes of it", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 400; i++) deep = { "@type": deep };
    const out = renderPreview(
      report({
        extractions: [extraction({ jsonLd: [{ index: 0, types: [], data: deep, raw: "{}" }] })],
      }),
    );
    expect(out).toContain("… truncated");
    expect(out.length).toBeLessThan(200_000);
  });

  it("clips a data: URI instead of echoing it once per surface", () => {
    const huge = extraction();
    huge.openGraph.images[0]!.url = meta(
      `data:image/png;base64,${"A".repeat(200_000)}`,
      "og:image",
    );
    huge.assets = undefined;
    const out = renderPreview(report({ extractions: [huge] }));
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(200_000);
  });

  it("ships a policy that allows images and nothing else", () => {
    const out = renderPreview(report());
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("default-src 'none'");
    expect(out).toContain('referrerpolicy="no-referrer"');
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

  it("pins a site-scoped head finding too — /favicon.ico belongs to an origin", () => {
    const out = renderPreview(
      report({
        siteIssues: [
          {
            id: "site-0123456789",
            pageUrl: "https://example.com/fr",
            ruleId: "icons.ico.missing",
            severity: "info",
            message: "No /favicon.ico is served at the root.",
          },
        ],
      }),
    );
    expect(out).toContain("icons.ico.missing");
    expect(out).not.toContain("Nothing the catalogue judges");
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

describe("renderPreview — the locale axis", () => {
  const sibling = (path: string, locale: string, title: string) =>
    extraction({
      http: {
        requestedUrl: `https://example.com${path}`,
        finalUrl: `https://example.com${path}`,
        status: 200,
        headers: {},
        redirects: 0,
      },
      openGraph: {
        ...extraction().openGraph,
        title: meta(title, "og:title"),
        locale: meta(locale, "og:locale"),
      },
    });

  it("puts a route's translations side by side, with what a size ladder counts", () => {
    const out = renderPreview(
      report({
        extractions: [
          sibling("/fr/about", "fr_FR", "À propos de nous"),
          sibling("/en/about", "en_US", "About us"),
        ],
      }),
    );
    expect(out).toContain("This route in 2 languages");
    expect(out).toContain("fr_FR");
    expect(out).toContain("À propos de nous");
    // Graphemes, not UTF-16 units: "À propos de nous" is 16 either way, but
    // the panel must count the emoji case the same way the ladder does.
    expect(out).toContain(">16<");
  });

  it("counts a grapheme cluster once, the way a ladder reads a title", () => {
    const out = renderPreview(
      report({
        extractions: [sibling("/fr/x", "fr_FR", "👩‍👩‍👧‍👦"), sibling("/en/x", "en_US", "family")],
      }),
    );
    expect(out).toContain(">1<");
  });

  it("says nothing about a route that has one language", () => {
    expect(renderPreview(report())).not.toContain("This route in");
  });
});

describe("renderPreview — static vs hydrated", () => {
  it("names absence as absence, not as agreement", () => {
    const out = renderPreview(report());
    expect(out).toContain("Not established");
    expect(out).toContain("never rendered the page");
  });

  it("lists what only the browser has, and says unfurlers will not run it", () => {
    const hydrated = extraction({
      rendering: { mode: "headless", escalated: true, escalationReason: "empty head" },
      hydration: {
        titleChanged: true,
        htmlLangChanged: false,
        injectedMetas: [{ property: "og:image", content: "https://cdn.example.com/late.png" }],
        removedMetas: [],
        injectedLinks: [{ rel: "canonical", href: "https://example.com/fr" }],
        removedLinks: [],
        jsonLdBlocksAdded: 2,
      },
    });
    const out = renderPreview(report({ extractions: [hydrated] }));
    expect(out).toContain("og:image = https://cdn.example.com/late.png");
    expect(out).toContain("rel=canonical");
    expect(out).toContain("2 JSON-LD block(s) added by script");
    expect(out).toContain("rewritten after hydration");
    expect(out).toContain("Unfurlers run no JavaScript");
  });

  it("says the two readings agree when the delta is empty", () => {
    const agreed = extraction({
      rendering: { mode: "headless", escalated: true },
      hydration: {
        titleChanged: false,
        htmlLangChanged: false,
        injectedMetas: [],
        removedMetas: [],
        injectedLinks: [],
        removedLinks: [],
        jsonLdBlocksAdded: 0,
      },
    });
    expect(renderPreview(report({ extractions: [agreed] }))).toContain("Both readings agree");
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
