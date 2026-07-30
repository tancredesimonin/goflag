/**
 * Per-rule contract tests.
 *
 * Every SEO rule is exercised in both directions — it *fires* on a page
 * that violates it and stays *silent* on a page that satisfies it — using
 * `pageFromHtml` so no network or fixture server is needed. This is the
 * fast, deterministic safety net that lets us refactor the rule registry
 * with confidence.
 */

import { describe, expect, it } from "vitest";

import { lint } from "../core/lint";
import { RULES } from "./index";
import { pageFromHtml } from "./test-utils";

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
    <meta property="og:title" content="A perfectly good page title" />
    <meta property="og:description" content="An explicit open-graph description." />
    <meta property="og:image" content="https://example.com/og.png" />
  </head>
  <body><h1>Hello</h1></body>
</html>`;

describe("rule registry", () => {
  it("has unique, dotted rule ids", () => {
    const seen = new Set<string>();
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^[a-z]+(\.[a-z0-9]+)+$/);
      expect(seen.has(rule.id)).toBe(false);
      seen.add(rule.id);
    }
    expect(RULES.length).toBe(11);
  });

  it("produces zero findings on a clean page", () => {
    expect(ids(CLEAN)).toEqual([]);
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
