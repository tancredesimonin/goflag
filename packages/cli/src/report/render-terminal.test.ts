/**
 * Terminal renderer tests.
 *
 * `renderTerminal` is a pure function of a `GoflagReport`, so we feed it
 * hand-built reports and assert on the plain-text (color-off) output. This
 * covers each verdict and every section without needing a crawl.
 */

import { describe, expect, it } from "vitest";

import { renderTerminal } from "./render-terminal";
import type { GoflagReport } from "./types";

type ReportOverrides = Partial<Omit<GoflagReport, "summary">> & {
  summary?: Partial<GoflagReport["summary"]>;
};

function baseReport(overrides: ReportOverrides = {}): GoflagReport {
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
    pages: [{ url: "https://example.com/", status: 200, locale: null }],
    unreachablePages: [],
    brokenLinks: [],
    missingTranslations: { holes: [], reciprocity: [] },
    seoIssues: [],
    siteIssues: [],
    diagnostics: {
      pagesCrawled: 1,
      pagesScanned: 1,
      pagesFailed: 0,
      truncated: false,
      warnings: [],
    },
  };
  return { ...base, ...overrides, summary: { ...base.summary, ...(overrides.summary ?? {}) } };
}

describe("renderTerminal — header + verdict", () => {
  it("shows a GREEN FLAG and the reassuring line when clean", () => {
    const out = renderTerminal(baseReport(), { color: false });
    expect(out).toContain("GREEN FLAG");
    expect(out).toContain("No problems found.");
    expect(out).toContain("https://example.com/");
    expect(out).toContain("1 pages crawled, 1 scanned");
    // The default policy is the assumed one, so naming it would be noise.
    expect(out).not.toContain("profile");
  });

  it("names a non-default profile next to the crawl counts", () => {
    const out = renderTerminal(baseReport({ profile: "marketing" }), { color: false });
    expect(out).toContain("1 pages crawled, 1 scanned, profile marketing");
  });

  it("renders conformance as per-rule totals, not the raw matrix", () => {
    const out = renderTerminal(
      baseReport({
        conformance: {
          rules: [
            {
              ruleId: "title.missing",
              kind: "boolean",
              title: "Every page needs a title",
              rigor: "spec-required",
              sources: ["whatwg-html-title"],
              expected: "a non-empty title",
              totals: { pass: 3, fail: 1, warn: 0, na: 0, crashed: 0 },
            },
          ],
          pages: [{ url: "https://example.com/", statuses: { "title.missing": "fail" } }],
        },
      }),
      { color: false },
    );
    expect(out).toContain("Conformance");
    expect(out).toContain("title.missing");
    expect(out).toContain("1 fail");
    expect(out).toContain("3 pass");
    expect(out).toContain("[spec-required]");
  });

  it("lists advisories as questions, without letting them read as findings", () => {
    const report = baseReport({
      advisories: [
        {
          id: "abc",
          pageUrl: "https://example.com/",
          ruleId: "title.descriptive",
          kind: "prose",
          prose: "Does the title describe what is on THIS page?",
          rigor: "guideline",
          sources: ["google-title-link"],
          evidence: { "document.title": { value: "Home", origin: { kind: "title" } } },
          verdict: "needs-judgment",
        },
      ],
    });
    const out = renderTerminal(report, { color: false });

    expect(out).toContain("Needs judgment");
    expect(out).toContain("Does the title describe what is on THIS page?");
    // A question is not a problem: the verdict and the all-clear line stand.
    expect(out).toContain("No problems found.");
  });

  it("shows neither section when the report carries neither", () => {
    const out = renderTerminal(baseReport(), { color: false });
    expect(out).not.toContain("Conformance");
    expect(out).not.toContain("Needs judgment");
  });

  it("shows a RED FLAG and no all-clear line when there are hard failures", () => {
    const out = renderTerminal(
      baseReport({
        summary: { brokenLinks: 2, missingTranslations: 0, seoIssues: 1, verdict: "red" },
      }),
      { color: false },
    );
    expect(out).toContain("RED FLAG");
    expect(out).not.toContain("No problems found.");
  });

  it("shows a YELLOW FLAG for soft findings", () => {
    const out = renderTerminal(
      baseReport({
        summary: { brokenLinks: 0, missingTranslations: 1, seoIssues: 0, verdict: "yellow" },
      }),
      { color: false },
    );
    expect(out).toContain("YELLOW FLAG");
  });

  it("pluralizes the summary counts", () => {
    const one = renderTerminal(
      baseReport({
        summary: { brokenLinks: 1, missingTranslations: 1, seoIssues: 1, verdict: "red" },
      }),
      { color: false },
    );
    expect(one).toContain("1 broken link ");
    expect(one).toContain("1 missing translation ");
    expect(one).toContain("1 SEO issue");
    expect(one).not.toContain("1 SEO issues");

    const many = renderTerminal(
      baseReport({
        summary: { brokenLinks: 3, missingTranslations: 2, seoIssues: 4, verdict: "red" },
      }),
      { color: false },
    );
    expect(many).toContain("3 broken links");
    expect(many).toContain("2 missing translations");
    expect(many).toContain("4 SEO issues");
  });
});

describe("renderTerminal — sections", () => {
  it("renders an unreachable-pages section with status tags", () => {
    const out = renderTerminal(
      baseReport({
        summary: { verdict: "red", unreachablePages: 2 },
        unreachablePages: [
          { id: "page-aaaaaaaaaa", url: "https://example.com/down", status: 500 },
          { id: "page-bbbbbbbbbb", url: "https://example.com/gone", status: 0 },
        ],
      }),
      { color: false },
    );
    expect(out).toContain("Unreachable pages");
    expect(out).toContain("[500]");
    expect(out).toContain("[network error]");
    expect(out).toContain("https://example.com/down");
    expect(out).toContain("2 unreachable pages");
  });

  it("renders broken links grouped by page with status/verdict tags", () => {
    const out = renderTerminal(
      baseReport({
        summary: { brokenLinks: 1, missingTranslations: 0, seoIssues: 0, verdict: "red" },
        brokenLinks: [
          {
            id: "link-aaaaaaaaaa",
            pageUrl: "https://example.com/",
            href: "https://example.com/ghost",
            status: 404,
            verdict: "broken",
          },
          {
            id: "link-bbbbbbbbbb",
            pageUrl: "https://example.com/",
            href: "https://example.com/blocked",
            status: 403,
            verdict: "blocked",
            reason: "403 forbidden",
          },
        ],
      }),
      { color: false },
    );
    expect(out).toContain("Broken links");
    expect(out).toContain("[404]");
    expect(out).toContain("https://example.com/ghost");
    expect(out).toContain("[blocked 403 forbidden]");
  });

  it("renders translation holes and reciprocity findings", () => {
    const out = renderTerminal(
      baseReport({
        summary: { brokenLinks: 0, missingTranslations: 2, seoIssues: 0, verdict: "yellow" },
        missingTranslations: {
          holes: [
            {
              id: "i18n-hole-blog",
              route: "/blog",
              presentLocales: ["en", "fr"],
              missingLocales: ["de"],
            },
          ],
          reciprocity: [
            {
              id: "i18n-recip-1",
              code: "missing-back-link",
              url: "https://example.com/fr/about",
              peerUrl: "https://example.com/de/about",
              locale: "de",
              message: "peer does not link back.",
            },
          ],
        },
      }),
      { color: false },
    );
    expect(out).toContain("Missing translations");
    expect(out).toContain("/blog");
    expect(out).toContain("missing de");
    expect(out).toContain("have en, fr");
    expect(out).toContain("missing-back-link");
    expect(out).toContain("peer does not link back.");
  });

  it("renders SEO issues with severity labels and strips backticks", () => {
    const out = renderTerminal(
      baseReport({
        summary: { brokenLinks: 0, missingTranslations: 0, seoIssues: 2, verdict: "red" },
        seoIssues: [
          {
            id: "seo-aaaaaaaaaa",
            pageUrl: "https://example.com/",
            ruleId: "title.missing",
            severity: "error",
            message: "Page is missing a `<title>` element.",
          },
          {
            id: "seo-bbbbbbbbbb",
            pageUrl: "https://example.com/",
            ruleId: "og.description.missing",
            severity: "info",
            message: "no `og:description`.",
          },
        ],
      }),
      { color: false },
    );
    expect(out).toContain("SEO issues");
    expect(out).toContain("error");
    expect(out).toContain("info");
    expect(out).toContain("title.missing");
    // Backticks are stripped from messages for clean terminal output.
    expect(out).not.toContain("`");
  });

  it("prints diagnostic notes and the truncation warning", () => {
    const out = renderTerminal(
      baseReport({
        diagnostics: {
          pagesCrawled: 200,
          pagesScanned: 200,
          pagesFailed: 1,
          truncated: true,
          warnings: ["crawl: https://example.com/x — boom"],
        },
      }),
      { color: false },
    );
    expect(out).toContain("note: crawl: https://example.com/x — boom");
    expect(out).toContain("note: results truncated");
  });
});

describe("renderTerminal — color", () => {
  it("emits ANSI escapes only when color is enabled", () => {
    const report = baseReport({
      summary: { brokenLinks: 1, missingTranslations: 0, seoIssues: 0, verdict: "red" },
    });
    expect(renderTerminal(report, { color: false })).not.toContain("\x1b[");
    expect(renderTerminal(report, { color: true })).toContain("\x1b[");
  });

  it("defaults to color off", () => {
    expect(renderTerminal(baseReport())).not.toContain("\x1b[");
  });
});
