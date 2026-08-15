/**
 * Per-rule contract tests.
 *
 * Every SEO rule is exercised in both directions — it *fires* on a page
 * that violates it and stays *silent* on a page that satisfies it — using
 * `pageFromHtml` so no network or fixture server is needed. This is the
 * fast, deterministic safety net that lets us refactor the rule registry
 * with confidence.
 *
 * The "rule registry" block is also the CI half of the provenance
 * contract from the rules-catalog plan: every rule must cite at least one
 * source that actually exists in the catalog, and must declare which
 * extraction paths it reads.
 */

import { describe, expect, it } from "vitest";

import { lint } from "../core/lint";
import { extractionFromPage } from "./extraction/from-page";
import { RULES } from "./index";
import { PROSE_RULES } from "./prose";
import { SITE_RULES } from "./site-rules";
import { getSource } from "./sources";
import type { SourceRigor } from "./sources/types";
import { pageFromHtml } from "./test-utils";
import type { Rigor } from "./types";

/** Rule ids present after linting a snippet. */
function ids(html: string, opts?: Parameters<typeof pageFromHtml>[1]): string[] {
  return lint(pageFromHtml(html, opts)).map((i) => i.ruleId);
}

/** A fully well-formed document: every rule must stay silent on it. */
const CLEAN = `<!doctype html>
<html lang="en">
  <head>
    <title>A perfectly good page title</title>
    <meta name="description" content="A description comfortably inside the fifty to one hundred and sixty character window that Google likes." />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="canonical" href="https://example.com/page" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" />
    <meta property="og:title" content="A perfectly good page title" />
    <meta property="og:description" content="An explicit open-graph description." />
    <meta property="og:image" content="https://example.com/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="A perfectly good page title, on a dark card." />
  </head>
  <body><h1>Hello</h1></body>
</html>`;

/**
 * The same page as one locale of a translated cluster. The locale rules gate
 * on hreflang, so a monolingual document can never exercise them — and a page
 * that declares the cluster without `og:locale` is exactly the shape both of
 * them are written to catch.
 */
const CLEAN_TRANSLATED = CLEAN.replace(
  "</head>",
  `  <link rel="alternate" hreflang="en" href="https://example.com/en/page" />
    <link rel="alternate" hreflang="fr" href="https://example.com/fr/page" />
    <link rel="alternate" hreflang="es" href="https://example.com/es/page" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="fr_FR" />
    <meta property="og:locale:alternate" content="es_ES" />
  </head>`,
);

describe("rule registry", () => {
  it("has unique, dotted rule ids", () => {
    const seen = new Set<string>();
    for (const rule of RULES) {
      // `category.short-name`, as `RuleBase` documents it — the hyphen is part
      // of the convention, and the cross-page registry has always used it
      // (`hreflang.sitemap-mismatch`).
      expect(rule.id).toMatch(/^[a-z]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/);
      expect(seen.has(rule.id)).toBe(false);
      seen.add(rule.id);
    }
    expect(RULES.length).toBe(23);
  });

  it("cites ≥1 source per rule, and every cited source exists in the catalog", () => {
    for (const rule of RULES) {
      expect(rule.sources.length, rule.id).toBeGreaterThan(0);
      for (const sourceId of rule.sources) {
        expect(getSource(sourceId), `${rule.id} cites unknown source ${sourceId}`).toBeDefined();
      }
    }
  });

  it("never claims more authority than its sources actually carry", () => {
    // The honesty claim the whole rigor axis rests on. Citing a source is
    // cheap; citing one that *supports the claimed rigor* is the part worth
    // enforcing — a rule labelled `spec-required` on the strength of a blog
    // post would poison exactly the decision an agent uses rigor to make.
    //
    // `spec-required` and `spec-recommended` differ in what the spec says
    // (MUST vs SHOULD), not in who published it, so both need a `normative`
    // source; the rest map onto the source scale directly.
    const NEEDS: Record<Rigor, SourceRigor> = {
      "spec-required": "normative",
      "spec-recommended": "normative",
      "vendor-spec": "vendor-spec",
      guideline: "guideline",
      heuristic: "heuristic",
    };
    const AUTHORITY: Record<SourceRigor, number> = {
      normative: 4,
      "vendor-spec": 3,
      guideline: 2,
      heuristic: 1,
    };

    for (const rule of [...RULES, ...PROSE_RULES]) {
      const best = Math.max(...rule.sources.map((id) => AUTHORITY[getSource(id)!.rigor]));
      expect(
        best,
        `${rule.id} claims ${rule.rigor} but its strongest source is weaker than ${NEEDS[rule.rigor]}`,
      ).toBeGreaterThanOrEqual(AUTHORITY[NEEDS[rule.rigor]]);
    }
  });

  it("declares which extraction paths it reads, and they exist", () => {
    // Populated with every optional section, because an optional one is still
    // a real section: a rule may legitimately read `assets` on a run where the
    // probe pass did not fill it.
    const extraction = extractionFromPage(pageFromHtml(CLEAN, { manifest: {}, assets: {} }));
    const topLevel = new Set(Object.keys(extraction));
    for (const rule of RULES) {
      expect(rule.reads.length, rule.id).toBeGreaterThan(0);
      for (const path of rule.reads) {
        const head = path.split(".")[0]!;
        expect(topLevel.has(head), `${rule.id} reads unknown section ${path}`).toBe(true);
      }
    }
  });

  it("explains itself: title, why, expected and relates all resolve", () => {
    // Across every registry, not just this one: `og.locale.missing` and
    // `hreflang.missing` describe the same fact from either side of the
    // page/site boundary, and the relation is true whichever list holds the
    // other rule. The catalogue exports all three together for that reason.
    const known = new Set([...RULES, ...SITE_RULES, ...PROSE_RULES].map((r) => r.id));
    for (const rule of RULES) {
      expect(rule.title.trim(), rule.id).toBeTruthy();
      expect(rule.why.trim(), rule.id).toBeTruthy();
      expect(rule.expected.trim(), rule.id).toBeTruthy();
      for (const related of rule.relates ?? []) {
        expect(known.has(related), `${rule.id} relates to unknown rule ${related}`).toBe(true);
      }
    }
  });

  it("produces zero findings on a clean page", () => {
    expect(ids(CLEAN)).toEqual([]);
  });

  it("produces zero findings on a clean page inside a translated cluster", () => {
    expect(ids(CLEAN_TRANSLATED)).toEqual([]);
  });
});

describe("title.missing", () => {
  it("fires when there is no <title>", () => {
    expect(ids(`<html><head></head><body></body></html>`)).toContain("title.missing");
  });
  it("fires when the <title> is empty / whitespace", () => {
    expect(ids(`<html><head><title>   </title></head></html>`)).toContain("title.missing");
  });
  it("stays silent when a real title is present", () => {
    expect(ids(`<html><head><title>Real title here</title></head></html>`)).not.toContain(
      "title.missing",
    );
  });
});

describe("title.length", () => {
  it("fires when the title is too short (<10)", () => {
    expect(ids(`<html><head><title>Short</title></head></html>`)).toContain("title.length");
  });
  it("fires when the title is too long (>60)", () => {
    const long = "x".repeat(61);
    expect(ids(`<html><head><title>${long}</title></head></html>`)).toContain("title.length");
  });
  it("stays silent inside the 10–60 window", () => {
    expect(ids(`<html><head><title>Ten chars ok</title></head></html>`)).not.toContain(
      "title.length",
    );
  });
});

describe("description.missing / description.length", () => {
  it("missing fires when there is no meta description", () => {
    expect(ids(`<html><head><title>xxxxxxxxxx</title></head></html>`)).toContain(
      "description.missing",
    );
  });
  it("length fires when the description is too short", () => {
    const html = `<html><head><meta name="description" content="too short" /></head></html>`;
    expect(ids(html)).toContain("description.length");
    expect(ids(html)).not.toContain("description.missing");
  });
  it("length fires when the description is too long (>160)", () => {
    const html = `<html><head><meta name="description" content="${"y".repeat(161)}" /></head></html>`;
    expect(ids(html)).toContain("description.length");
  });
});

describe("canonical.missing / canonical.absolute", () => {
  it("missing fires when there is no canonical link", () => {
    expect(ids(`<html><head><title>xxxxxxxxxx</title></head></html>`)).toContain(
      "canonical.missing",
    );
  });
  it("absolute fires on a root-relative canonical", () => {
    const html = `<html><head><link rel="canonical" href="/page" /></head></html>`;
    expect(ids(html)).toContain("canonical.absolute");
    // It resolves to an absolute URL, so "missing" must NOT also fire.
    expect(ids(html)).not.toContain("canonical.missing");
  });
  it("absolute fires on a protocol-relative canonical", () => {
    const html = `<html><head><link rel="canonical" href="//cdn.example.com/page" /></head></html>`;
    expect(ids(html)).toContain("canonical.absolute");
  });
  it("stays silent on a fully-qualified canonical", () => {
    const html = `<html><head><link rel="canonical" href="https://example.com/page" /></head></html>`;
    expect(ids(html)).not.toContain("canonical.absolute");
    expect(ids(html)).not.toContain("canonical.missing");
  });
});

describe("viewport.missing", () => {
  it("fires when no viewport meta is declared", () => {
    expect(ids(`<html><head><title>xxxxxxxxxx</title></head></html>`)).toContain(
      "viewport.missing",
    );
  });
  it("stays silent when a viewport is declared", () => {
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head></html>`;
    expect(ids(html)).not.toContain("viewport.missing");
  });
});

describe("og.title.missing / og.image.missing / og.description.missing", () => {
  it("og.title and og.image fire when there are no og tags at all", () => {
    const found = ids(`<html><head><title>xxxxxxxxxx</title></head></html>`);
    expect(found).toContain("og.title.missing");
    expect(found).toContain("og.image.missing");
  });

  it("og.description stays silent when there are NO other og tags", () => {
    // Nothing to unfurl → not worth nagging about a missing og:description.
    expect(ids(`<html><head><title>xxxxxxxxxx</title></head></html>`)).not.toContain(
      "og.description.missing",
    );
  });

  it("og.description fires when other og tags exist but the description is absent", () => {
    const html = `<html><head>
      <meta property="og:title" content="Has a title" />
      <meta property="og:image" content="https://example.com/og.png" />
    </head></html>`;
    expect(ids(html)).toContain("og.description.missing");
  });

  it("all three stay silent with a complete og block", () => {
    const html = `<html><head>
      <meta property="og:title" content="Has a title" />
      <meta property="og:description" content="Has a description" />
      <meta property="og:image" content="https://example.com/og.png" />
    </head></html>`;
    const found = ids(html);
    expect(found).not.toContain("og.title.missing");
    expect(found).not.toContain("og.image.missing");
    expect(found).not.toContain("og.description.missing");
  });
});

describe("og.image.absolute", () => {
  it("fires on a root-relative og:image", () => {
    const html = `<html><head><meta property="og:image" content="/og.png" /></head></html>`;
    expect(ids(html)).toContain("og.image.absolute");
  });

  it("fires on a protocol-relative og:image, which no crawler resolves", () => {
    const html = `<html><head><meta property="og:image" content="//example.com/og.png" /></head></html>`;
    expect(ids(html)).toContain("og.image.absolute");
  });

  it("fires when og:image is absolute but og:image:secure_url is not", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.png" />
      <meta property="og:image:secure_url" content="/og.png" />
    </head></html>`;
    expect(ids(html)).toContain("og.image.absolute");
  });

  it("stays silent on an absolute URL, and where there is no image to judge", () => {
    const absolute = `<html><head><meta property="og:image" content="https://example.com/og.png" /></head></html>`;
    expect(ids(absolute)).not.toContain("og.image.absolute");
    expect(ids(`<html><head><title>xxxxxxxxxx</title></head></html>`)).not.toContain(
      "og.image.absolute",
    );
  });
});

describe("og.image.alt", () => {
  it("fires on an og:image with no og:image:alt", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/og.png" /></head></html>`;
    expect(ids(html)).toContain("og.image.alt");
  });

  it("fires when only some of several images are described", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/a.png" />
      <meta property="og:image:alt" content="The first card" />
      <meta property="og:image" content="https://example.com/b.png" />
    </head></html>`;
    expect(ids(html)).toContain("og.image.alt");
  });

  it("treats a whitespace-only alt as absent", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.png" />
      <meta property="og:image:alt" content="   " />
    </head></html>`;
    expect(ids(html)).toContain("og.image.alt");
  });

  it("stays silent once every image is described", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.png" />
      <meta property="og:image:alt" content="A dark terminal card" />
    </head></html>`;
    expect(ids(html)).not.toContain("og.image.alt");
  });
});

describe("og.image.dimensions / og.image.ratio", () => {
  it("dimensions fires when the size is not declared", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/og.png" /></head></html>`;
    expect(ids(html)).toContain("og.image.dimensions");
  });

  it("dimensions fires when only one of the two is declared", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.png" />
      <meta property="og:image:width" content="1200" />
    </head></html>`;
    expect(ids(html)).toContain("og.image.dimensions");
  });

  it("ratio stays quiet when nothing declared a size — it measures, it does not guess", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/og.png" /></head></html>`;
    expect(ids(html)).not.toContain("og.image.ratio");
  });

  it("ratio fires on a square card", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.png" />
      <meta property="og:image:width" content="600" />
      <meta property="og:image:height" content="600" />
    </head></html>`;
    expect(ids(html)).toContain("og.image.ratio");
  });

  it("both stay silent on 1200×630", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
    </head></html>`;
    const found = ids(html);
    expect(found).not.toContain("og.image.dimensions");
    expect(found).not.toContain("og.image.ratio");
  });
});

describe("og.locale.missing / og.locale.alternates", () => {
  /** An og block with a hreflang cluster, so the locale rules apply at all. */
  const cluster = (og: string) => `<html><head>
      <title>A perfectly good page title</title>
      <meta property="og:title" content="A perfectly good page title" />
      <link rel="alternate" hreflang="en" href="https://example.com/en/page" />
      <link rel="alternate" hreflang="fr" href="https://example.com/fr/page" />
      <link rel="alternate" hreflang="x-default" href="https://example.com/en/page" />
      ${og}
    </head></html>`;

  it("og.locale fires on a translated page that never says which locale it is", () => {
    expect(ids(cluster(""))).toContain("og.locale.missing");
  });

  it("og.locale stays silent on a monolingual page", () => {
    const html = `<html><head>
      <meta property="og:title" content="A perfectly good page title" />
    </head></html>`;
    expect(ids(html)).not.toContain("og.locale.missing");
  });

  it("og.locale stays silent where x-default is the only other annotation", () => {
    const html = `<html><head>
      <meta property="og:title" content="A perfectly good page title" />
      <link rel="alternate" hreflang="en" href="https://example.com/page" />
      <link rel="alternate" hreflang="x-default" href="https://example.com/page" />
    </head></html>`;
    expect(ids(html)).not.toContain("og.locale.missing");
  });

  it("og.locale stays silent on a page with no Open Graph at all", () => {
    // og.title.missing already carries that page; a second finding asking for
    // og:locale on top of it is noise.
    const html = `<html><head>
      <title>A perfectly good page title</title>
      <link rel="alternate" hreflang="en" href="https://example.com/en/page" />
      <link rel="alternate" hreflang="fr" href="https://example.com/fr/page" />
    </head></html>`;
    expect(ids(html)).not.toContain("og.locale.missing");
  });

  it("alternates fires when the hreflang cluster names a locale Open Graph does not", () => {
    expect(ids(cluster(`<meta property="og:locale" content="en_US" />`))).toContain(
      "og.locale.alternates",
    );
  });

  it("alternates fires on an og:locale:alternate no hreflang backs", () => {
    const html = cluster(`
      <meta property="og:locale" content="en_US" />
      <meta property="og:locale:alternate" content="fr_FR" />
      <meta property="og:locale:alternate" content="de_DE" />`);
    expect(ids(html)).toContain("og.locale.alternates");
  });

  it("alternates matches across the two tag formats, and across a bare language", () => {
    // hreflang `fr` and og `fr_FR` are one declaration written twice: only one
    // of the two formats can express the territory, so the difference is not
    // evidence of a disagreement.
    const html = cluster(`
      <meta property="og:locale" content="en_US" />
      <meta property="og:locale:alternate" content="fr_FR" />`);
    expect(ids(html)).not.toContain("og.locale.alternates");
  });

  it("alternates defers to og.locale.missing rather than piling on", () => {
    expect(ids(cluster(""))).not.toContain("og.locale.alternates");
  });
});

describe("icons.missing / icons.apple-touch.missing", () => {
  it("icons.missing fires on a page that declares none", () => {
    expect(ids(`<html><head><title>xxxxxxxxxx</title></head></html>`)).toContain("icons.missing");
  });

  it("icons.missing ignores a rel it was not asked about", () => {
    // `rel="stylesheet"` is a link, not an icon. The extraction keeps every
    // link; the rule is what decides which ones are icons.
    const html = `<html><head><link rel="preload" href="/x.png" as="image" /></head></html>`;
    expect(ids(html)).toContain("icons.missing");
  });

  it("icons.missing stays silent on `shortcut icon`, the legacy spelling", () => {
    const html = `<html><head><link rel="shortcut icon" href="/favicon.png" /></head></html>`;
    expect(ids(html)).not.toContain("icons.missing");
  });

  it("apple-touch fires when the page declares icons but no Apple flavour", () => {
    const html = `<html><head><link rel="icon" href="/icon.svg" /></head></html>`;
    expect(ids(html)).toContain("icons.apple-touch.missing");
  });

  it("apple-touch defers to icons.missing rather than piling on", () => {
    const found = ids(`<html><head><title>xxxxxxxxxx</title></head></html>`);
    expect(found).toContain("icons.missing");
    expect(found).not.toContain("icons.apple-touch.missing");
  });

  it("both stay silent once an icon and an apple-touch-icon are declared", () => {
    const html = `<html><head>
      <link rel="icon" href="/icon.svg" />
      <link rel="apple-touch-icon" href="/apple-icon.png" />
    </head></html>`;
    const found = ids(html);
    expect(found).not.toContain("icons.missing");
    expect(found).not.toContain("icons.apple-touch.missing");
  });
});

describe("icons.manifest-mismatch", () => {
  /** A page whose manifest probe answered with these `icons`. */
  const withManifest = (icons: unknown, head = "") =>
    pageFromHtml(
      `<html><head><link rel="manifest" href="/site.webmanifest" />${head}</head></html>`,
      { manifest: { icons } },
    );

  it("stays silent when the manifest was never fetched — that is not evidence", () => {
    const html = `<html><head>
      <link rel="manifest" href="/site.webmanifest" />
      <link rel="icon" href="/icon.png" sizes="32x32" />
      <link rel="apple-touch-icon" href="/apple-icon.png" />
    </head></html>`;
    expect(ids(html)).not.toContain("icons.manifest-mismatch");
  });

  it("fires when only the manifest declares icons — a tab never reads it", () => {
    const page = withManifest([{ src: "/icon-192.png", sizes: "192x192" }]);
    expect(lint(page).map((i) => i.ruleId)).toContain("icons.manifest-mismatch");
  });

  it("fires when the two describe the same file with different sizes", () => {
    const page = withManifest(
      [{ src: "/icon.png", sizes: "192x192" }],
      '<link rel="icon" href="/icon.png" sizes="32x32" /><link rel="apple-touch-icon" href="/a.png" />',
    );
    expect(lint(page).map((i) => i.ruleId)).toContain("icons.manifest-mismatch");
  });

  it("does not mind two lists that legitimately differ", () => {
    // An apple-touch-icon is not a manifest icon, and a 192px PWA icon has no
    // business in the `<head>`. Divergence is the normal case.
    const page = withManifest(
      [{ src: "/icon-192.png", sizes: "192x192" }],
      '<link rel="icon" href="/icon.svg" /><link rel="apple-touch-icon" href="/apple-icon.png" />',
    );
    expect(lint(page).map((i) => i.ruleId)).not.toContain("icons.manifest-mismatch");
  });

  it("recognises one file declared as a path and as an absolute URL", () => {
    const page = withManifest(
      [{ src: "/icon.png", sizes: "32x32" }],
      '<link rel="icon" href="https://example.com/icon.png" sizes="32x32" /><link rel="apple-touch-icon" href="/a.png" />',
    );
    expect(lint(page).map((i) => i.ruleId)).not.toContain("icons.manifest-mismatch");
  });

  it("survives a manifest whose icons are not what the spec says", () => {
    const page = withManifest([{ sizes: "32x32" }, "nonsense", null, 7]);
    expect(() => lint(page)).not.toThrow();
    // Every entry was unusable, so the manifest declares no icon goflag can
    // compare — and an empty list is not a disagreement.
    expect(lint(page).map((i) => i.ruleId)).not.toContain("icons.manifest-mismatch");
  });
});

describe("robots.conflict", () => {
  it("fires when meta robots and meta googlebot disagree on indexing", () => {
    const html = `<html><head>
      <meta name="robots" content="index, follow" />
      <meta name="googlebot" content="noindex" />
    </head></html>`;
    expect(ids(html)).toContain("robots.conflict");
  });

  it("fires when a meta tag conflicts with the X-Robots-Tag header", () => {
    const html = `<html><head><meta name="robots" content="index" /></head></html>`;
    expect(ids(html, { headers: { "x-robots-tag": "noindex" } })).toContain("robots.conflict");
  });

  it("fires on a follow/nofollow contradiction", () => {
    const html = `<html><head>
      <meta name="robots" content="follow" />
      <meta name="googlebot" content="nofollow" />
    </head></html>`;
    expect(ids(html)).toContain("robots.conflict");
  });

  it("stays silent with a single directive source", () => {
    const html = `<html><head><meta name="robots" content="noindex, nofollow" /></head></html>`;
    expect(ids(html)).not.toContain("robots.conflict");
  });

  it("stays silent when two sources agree", () => {
    const html = `<html><head>
      <meta name="robots" content="index, follow" />
      <meta name="googlebot" content="index" />
    </head></html>`;
    expect(ids(html)).not.toContain("robots.conflict");
  });
});
