/**
 * Conformance matrix tests.
 *
 * The point of this view is that it distinguishes claims a violations list
 * cannot: "passes everywhere" from "never applied", and both from "was not
 * run at all". Each of those is asserted below, along with the arithmetic
 * that makes the matrix trustworthy — the five buckets must always sum to
 * the number of pages, or the grid is quietly lying about coverage.
 */

import { describe, expect, it } from "vitest";

import { evaluateRules } from "../lib/rules/evaluate";
import { extractionFromPage } from "../lib/rules/extraction/from-page";
import { RULES } from "../lib/rules";
import { rulesForProfile } from "../lib/rules/profiles";
import { pageFromHtml } from "../lib/rules/test-utils";
import type { Rule } from "../lib/rules/types";
import { buildConformance, type ConformanceRow } from "./conformance";

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

const BARE = `<html><head></head><body></body></html>`;

/** Evaluate one HTML snippet into a matrix row. */
function row(url: string, html: string, rules: ReadonlyArray<Rule> = RULES): ConformanceRow {
  const extraction = extractionFromPage(pageFromHtml(html, { url }));
  return { pageUrl: url, findings: evaluateRules(extraction, rules).findings };
}

describe("buildConformance", () => {
  it("reports a status for every rule on every page, passing ones included", () => {
    const view = buildConformance(RULES, [row("https://example.com/a", CLEAN)]);

    expect(view.rules.length).toBe(RULES.length);
    expect(view.pages.length).toBe(1);
    // The whole point: a clean page is not an empty row.
    expect(Object.keys(view.pages[0]!.statuses).sort()).toEqual(RULES.map((r) => r.id).sort());
    expect(view.pages[0]!.statuses["title.missing"]).toBe("pass");
  });

  it("separates 'passes everywhere' from 'never applied'", () => {
    const view = buildConformance(RULES, [
      row("https://example.com/a", CLEAN),
      row("https://example.com/b", CLEAN),
    ]);
    const byId = new Map(view.rules.map((r) => [r.ruleId, r]));

    // Satisfied on both pages…
    expect(byId.get("title.missing")!.totals).toMatchObject({ pass: 2, fail: 0, na: 0 });
    // …versus a rule with no subject to judge: `na`, not a silent pass.
    expect(byId.get("canonical.absolute")!.totals.na).toBe(0);
    const bareView = buildConformance(RULES, [row("https://example.com/c", BARE)]);
    const bareById = new Map(bareView.rules.map((r) => [r.ruleId, r]));
    expect(bareById.get("canonical.absolute")!.totals).toMatchObject({ na: 1, pass: 0, fail: 0 });
    expect(bareById.get("title.length")!.totals).toMatchObject({ na: 1 });
  });

  it("carries rule metadata once, in the legend, not per cell", () => {
    const view = buildConformance(RULES, [row("https://example.com/a", BARE)]);
    const title = view.rules.find((r) => r.ruleId === "title.missing")!;

    expect(title).toMatchObject({ kind: "boolean", rigor: "spec-required" });
    expect(title.sources).toContain("whatwg-html-title");
    expect(title.expected).toBeTruthy();
    // Cells are bare statuses — no repeated metadata.
    expect(view.pages[0]!.statuses["title.missing"]).toBe("fail");
  });

  it("totals always sum to the page count, crashes included", () => {
    const exploding: Rule = {
      id: "test.explodes",
      kind: "boolean",
      category: "test",
      severity: "error",
      title: "A rule with a bug in it",
      why: "Stands in for the buggy rule every registry eventually ships.",
      rigor: "heuristic",
      sources: ["moz-title-tag"],
      reads: ["document.title"],
      expected: "never to be reached",
      evaluate: () => {
        throw new Error("boom");
      },
    };
    const rules = [...RULES, exploding];
    const pages = [
      row("https://example.com/a", CLEAN, rules),
      row("https://example.com/b", BARE, rules),
    ];
    const view = buildConformance(rules, pages);

    for (const rule of view.rules) {
      const { pass, fail, warn, na, crashed } = rule.totals;
      expect(pass + fail + warn + na + crashed, rule.ruleId).toBe(pages.length);
    }
    // A crashed rule is counted as crashed, never folded into `na`.
    expect(view.rules.find((r) => r.ruleId === "test.explodes")!.totals).toMatchObject({
      crashed: 2,
      na: 0,
    });
    expect(view.pages[0]!.statuses["test.explodes"]).toBeUndefined();
  });

  it("omits a rule the active profile switched off, rather than showing it as all-zero", () => {
    const rules = rulesForProfile("spec-only");
    const view = buildConformance(rules, [row("https://example.com/a", BARE, rules)]);

    // "Not run" is a different claim from "never applied", and only one of
    // them belongs in a matrix that answers "where do we stand?".
    expect(view.rules.map((r) => r.ruleId)).not.toContain("title.length");
    expect(view.pages[0]!.statuses["title.length"]).toBeUndefined();
  });
});
