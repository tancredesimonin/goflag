import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DEMO_DIFF, DEMO_REPORT, FROZEN_NOW, TRANSCRIPTS } from "../../scripts/transcripts";
import { renderDiffTerminal } from "../../src/report/render-diff";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(here, "..", "fixtures", "transcripts", name), "utf8");
const packageFile = (name: string) => readFileSync(join(here, "..", "..", name), "utf8");

/** Built, not written literally — see the note in `apps/website/src/lib/transcripts.ts`. */
const ESC = "\u001b";
const SGR_PATTERN = new RegExp(`${ESC}\\[([0-9]*m)`, "g");
const ANY_ESCAPE = new RegExp(`${ESC}\\[`);

/** The seven the renderers emit. Anything else means the tokeniser is blind. */
const SGR = new Set(["0m", "1m", "2m", "31m", "32m", "33m", "36m"]);

describe("the committed transcripts", () => {
  it.each(TRANSCRIPTS.map((spec) => spec.id))("matches the renderers, byte for byte: %s", (id) => {
    // The guarantee. The pre-commit hook regenerates these when `src/report/`
    // is staged, but a hook can be skipped with --no-verify and this cannot: a
    // renderer changed without regenerating fails here, in the suite CI already
    // runs, instead of reaching a documentation site that quotes output the
    // engine stopped printing. Which is exactly what happened to the file this
    // one replaces — `[rigor]` shipped on 2026-08-15 and the hand-written copy
    // never grew it.
    const spec = TRANSCRIPTS.find((s) => s.id === id)!;
    expect(fixture(`${id}.ansi`)).toBe(spec.render(true));
    expect(fixture(`${id}.txt`)).toBe(spec.render(false));
  });

  it("carries a manifest the site can iterate, in tab order", () => {
    const manifest = JSON.parse(fixture("index.json")) as Array<{ id: string; command: string }>;
    expect(manifest).toEqual(TRANSCRIPTS.map((s) => ({ id: s.id, command: s.command })));
  });

  it("emits only the seven SGR codes the site's tokeniser knows", () => {
    // The tokeniser on the site throws on anything else rather than dropping
    // it, so this is the other half of that contract: a renderer that starts
    // using, say, bright red would fail here first, with a message that says
    // which code and which view.
    for (const spec of TRANSCRIPTS) {
      const codes = [...spec.render(true).matchAll(SGR_PATTERN)].map((m) => m[1]!);
      expect(codes.length).toBeGreaterThan(0);
      expect([...new Set(codes)].filter((code) => !SGR.has(code))).toEqual([]);
    }
  });

  it("renders the plain text with no escape at all", () => {
    // `.txt` is what a CI log shows and what an `alt` says. One argument
    // separates it from `.ansi`, which is why they cannot drift apart — but a
    // renderer could still paint unconditionally somewhere, and that would put
    // raw escapes into the README.
    for (const spec of TRANSCRIPTS) expect(spec.render(false)).not.toMatch(ANY_ESCAPE);
  });
});

describe("the frozen report", () => {
  it("counts its findings the way `build.ts` does", () => {
    // Hand-written, so nothing derives these for us. `renderTerminal` lists
    // every finding it has, so a summary that claims more than the arrays hold
    // renders a transcript no run could produce — the specific way the
    // previous hand-written sample was wrong, claiming fourteen SEO issues
    // above a list of four.
    const { summary, brokenLinks, missingTranslations, seoIssues, siteIssues } = DEMO_REPORT;
    expect(summary.brokenLinks).toBe(brokenLinks.filter((l) => l.verdict === "broken").length);
    expect(summary.missingTranslations).toBe(
      missingTranslations.holes.length + missingTranslations.reciprocity.length,
    );
    expect(summary.seoIssues).toBe(seoIssues.length);
    expect(summary.siteIssues).toBe(siteIssues.length);
    expect(summary.unreachablePages).toBe(DEMO_REPORT.unreachablePages.length);
  });

  it("earns the verdict it prints", () => {
    // `build.ts:981`: red when a link is broken, a page is unreachable, or any
    // rule fired at error severity. A transcript headed RED FLAG over findings
    // that only add up to yellow teaches the wrong reading of the flag.
    const errors =
      DEMO_REPORT.seoIssues.filter((i) => i.severity === "error").length +
      DEMO_REPORT.siteIssues.filter((i) => i.severity === "error").length;
    expect(summaryIsRed(DEMO_REPORT.summary.brokenLinks, errors)).toBe(true);
    expect(DEMO_REPORT.summary.verdict).toBe("red");
  });

  it("cites only rules the catalogue still has", () => {
    // The fixture names rules by id, and the registry churns — fifteen commits
    // in ninety days. Without this a transcript can go on advertising a rule
    // the engine dropped, which is the same class of untruth as a stale
    // sample, one level down.
    const catalogue = JSON.parse(packageFile("rules.json")) as { rules: Array<{ id: string }> };
    const known = new Set(catalogue.rules.map((rule) => rule.id));
    const cited = [
      ...DEMO_REPORT.seoIssues.map((i) => i.ruleId),
      ...DEMO_REPORT.siteIssues.map((i) => i.ruleId),
    ];
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((id) => !known.has(id))).toEqual([]);
  });

  it("names every page its findings sit on", () => {
    const crawled = new Set(DEMO_REPORT.pages.map((p) => p.url));
    for (const issue of DEMO_REPORT.seoIssues) expect(crawled.has(issue.pageUrl)).toBe(true);
    for (const issue of DEMO_REPORT.siteIssues) expect(crawled.has(issue.pageUrl)).toBe(true);
    for (const link of DEMO_REPORT.brokenLinks) expect(crawled.has(link.pageUrl)).toBe(true);
  });

  it("gives every finding a distinct fingerprint", () => {
    const ids = [
      ...DEMO_REPORT.brokenLinks.map((f) => f.id),
      ...DEMO_REPORT.missingTranslations.holes.map((f) => f.id),
      ...DEMO_REPORT.missingTranslations.reciprocity.map((f) => f.id),
      ...DEMO_REPORT.seoIssues.map((f) => f.id),
      ...DEMO_REPORT.siteIssues.map((f) => f.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the gate transcript's clock", () => {
  it("reads the injected one, so the fixture does not age", () => {
    // `renderDiffTerminal` prints the baseline's age in whole days
    // (`render-diff.ts:92`). Left to `Date.now()` the text changes at midnight
    // UTC and the byte-for-byte test above reddens on a tree nobody touched.
    const aDayLater = renderDiffTerminal(DEMO_DIFF, { now: FROZEN_NOW + 86_400_000 });
    expect(renderDiffTerminal(DEMO_DIFF, { now: FROZEN_NOW })).toContain("(14 days ago)");
    expect(aDayLater).toContain("(15 days ago)");
    expect(fixture("gate.txt")).toContain("(14 days ago)");
  });
});

/** `build.ts:981`, restated so the expectation reads as the rule it checks. */
function summaryIsRed(brokenLinks: number, errorFindings: number): boolean {
  return brokenLinks > 0 || errorFindings > 0;
}
