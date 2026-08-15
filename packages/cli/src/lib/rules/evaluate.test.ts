/**
 * Runner semantics: the conformance view (every rule answers, passing ones
 * included), band placement, crash isolation, and the narrowing conversion
 * to report `Issue`s. Per-rule behavior lives in `rules.test.ts`; this file
 * only cares about the machinery.
 */

import { describe, expect, it } from "vitest";

import { bandFor, evaluateRules, findingsToIssues } from "./evaluate";
import { extractionFromPage } from "./extraction/from-page";
import { RULES } from "./index";
import { pageFromHtml } from "./test-utils";

const extraction = (html: string) => extractionFromPage(pageFromHtml(html));

describe("evaluateRules — conformance view", () => {
  it("answers for every rule, pass and na included", () => {
    const { findings, crashes } = evaluateRules(
      extraction(`<html><head>
        <title>A perfectly good page title</title>
        <meta name="description" content="A description comfortably inside the fifty to one hundred and sixty character window that Google likes." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://example.com/page" />
        <meta property="og:title" content="T" />
        <meta property="og:description" content="D" />
        <meta property="og:image" content="https://example.com/og.png" />
      </head></html>`),
      RULES,
    );
    expect(crashes).toEqual([]);
    expect(findings).toHaveLength(RULES.length);
    const byId = new Map(findings.map((f) => [f.ruleId, f]));
    expect(byId.get("title.missing")?.status).toBe("pass");
    expect(byId.get("title.length")).toMatchObject({ status: "pass", band: "ideal" });
    // Only one robots declaration source → nothing to conflict with.
    expect(byId.get("robots.conflict")?.status).toBe("na");
  });

  it("every finding is self-explaining: observed, expected, rigor, sources", () => {
    const { findings } = evaluateRules(extraction(`<html><head></head></html>`), RULES);
    for (const finding of findings) {
      expect(finding.expected, finding.ruleId).toBeTruthy();
      expect(finding.rigor, finding.ruleId).toBeTruthy();
      expect(finding.sources.length, finding.ruleId).toBeGreaterThan(0);
      expect("observed" in finding, finding.ruleId).toBe(true);
    }
  });

  it("scored rules carry their band and banded severity", () => {
    const { findings } = evaluateRules(
      extraction(`<html><head><title>Short</title></head></html>`),
      RULES,
    );
    const titleLength = findings.find((f) => f.ruleId === "title.length");
    // "Short" is 5 chars: outside ideal [10,60], inside acceptable [5,70].
    expect(titleLength).toMatchObject({
      status: "warn",
      band: "acceptable",
      severity: "warning",
      observed: 5,
    });
  });

  it("absent subjects answer na, not fail (scored rules are optional)", () => {
    const { findings } = evaluateRules(extraction(`<html><head></head></html>`), RULES);
    expect(findings.find((f) => f.ruleId === "title.length")?.status).toBe("na");
    expect(findings.find((f) => f.ruleId === "description.length")?.status).toBe("na");
    expect(findings.find((f) => f.ruleId === "canonical.absolute")?.status).toBe("na");
  });
});

describe("bandFor", () => {
  const bands = { ideal: [10, 60] as [number, number], acceptable: [5, 70] as [number, number] };

  it("places values inside ideal as pass", () => {
    expect(bandFor(10, bands)).toEqual({ status: "pass", band: "ideal" });
    expect(bandFor(60, bands)).toEqual({ status: "pass", band: "ideal" });
  });

  it("places values inside acceptable-but-not-ideal as warn/acceptable", () => {
    expect(bandFor(5, bands)).toEqual({ status: "warn", band: "acceptable" });
    expect(bandFor(70, bands)).toEqual({ status: "warn", band: "acceptable" });
  });

  it("places everything else as warn/poor", () => {
    expect(bandFor(4, bands)).toEqual({ status: "warn", band: "poor" });
    expect(bandFor(200, bands)).toEqual({ status: "warn", band: "poor" });
  });
});

describe("findingsToIssues", () => {
  it("narrows to violations and threads the rule's fix snippet", () => {
    const result = evaluateRules(extraction(`<html><head></head></html>`), RULES);
    const issues = findingsToIssues(result, RULES);
    const failingIds = result.findings
      .filter((f) => f.status === "fail" || f.status === "warn")
      .map((f) => f.ruleId)
      .sort();
    expect(issues.map((i) => i.ruleId).sort()).toEqual(failingIds);

    const titleMissing = issues.find((i) => i.ruleId === "title.missing");
    expect(titleMissing?.fix?.snippet).toContain("export const metadata");
    const ogTitle = issues.find((i) => i.ruleId === "og.title.missing");
    expect(ogTitle?.fix).toBeUndefined();
  });

  it("carries the rigor and its sources all the way to the issue", () => {
    // The whole point of phase F. A report is read where the registry is not —
    // a JSON file in CI, an agent's context — and an agent that cannot tell a
    // `spec-required` from a `heuristic` will fix folklore first. These four
    // fields were known on the finding and stopped here until now.
    const result = evaluateRules(extraction(`<html><head></head></html>`), RULES);
    const issues = findingsToIssues(result, RULES);

    const titleMissing = issues.find((i) => i.ruleId === "title.missing");
    expect(titleMissing?.rigor).toBe("spec-required");
    expect(titleMissing?.sources).toContain("whatwg-html-title");
    expect(titleMissing?.expected).toBe("a non-empty `<title>` element");
    expect(titleMissing?.observed).toBeNull();

    // Every violation, not just the one looked at above.
    for (const issue of issues) {
      if (issue.ruleId === "engine.rule-crashed") continue;
      expect(issue.rigor, issue.ruleId).toBeDefined();
      expect(issue.sources?.length, issue.ruleId).toBeGreaterThan(0);
      expect(issue.expected, issue.ruleId).toBeTruthy();
    }
  });

  it("leaves a crash without a rigor rather than inventing one", () => {
    // `engine.rule-crashed` is goflag talking about itself. There is no
    // document behind it, and claiming one would be the exact dishonesty the
    // rigor axis exists to prevent.
    const issues = findingsToIssues(
      { findings: [], crashes: [{ ruleId: "broken.rule", message: "kaput" }] },
      RULES,
    );

    expect(issues[0]?.rigor).toBeUndefined();
    expect(issues[0]?.sources).toBeUndefined();
  });

  it("converts crashes into the synthetic engine.rule-crashed issue", () => {
    const issues = findingsToIssues(
      { findings: [], crashes: [{ ruleId: "broken.rule", message: "kaput" }] },
      RULES,
    );
    expect(issues).toEqual([
      {
        ruleId: "engine.rule-crashed",
        severity: "info",
        message: "Rule `broken.rule` threw: kaput",
      },
    ]);
  });
});
