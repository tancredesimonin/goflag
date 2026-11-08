import { load } from "cheerio";
import { describe, expect, it } from "vitest";

import { DEMO_DIFF, DEMO_REPORT } from "../../scripts/transcripts";
import { collectFindings } from "./diff";
import { renderJunitReport } from "./render-junit";
import type { GoflagReport, SeoIssue } from "./types";

/** Parsed as a CI parses it: strict XML, not forgiving HTML. */
function parse(xml: string) {
  return load(xml, { xml: true });
}

function cases(xml: string) {
  const $ = parse(xml);
  return $("testcase")
    .toArray()
    .map((el) => {
      const node = $(el);
      return {
        suite: node.attr("classname"),
        name: node.attr("name"),
        failure: node.find("failure").attr("message"),
        failureText: node.find("failure").text(),
        skipped: node.find("skipped").attr("message"),
        out: node.find("system-out").text(),
      };
    });
}

const issue = (path: string, overrides: Partial<SeoIssue> = {}): SeoIssue => ({
  id: `id-${path}`,
  pageUrl: `https://example.com${path}`,
  ruleId: "title.missing",
  severity: "error",
  message: "Page has no `<title>`.",
  ...overrides,
});

function only(issues: SeoIssue[]): GoflagReport {
  return {
    ...DEMO_REPORT,
    seoIssues: issues,
    siteIssues: [],
    brokenLinks: [],
    unreachablePages: [],
    missingTranslations: { ...DEMO_REPORT.missingTranslations, holes: [], reciprocity: [] },
    diagnostics: { ...DEMO_REPORT.diagnostics, warnings: [] },
  };
}

describe("renderJunitReport", () => {
  it("writes XML a CI can parse, with totals that match its cases", () => {
    const xml = renderJunitReport(DEMO_REPORT, { gate: { exitCode: 1, failOn: "warning" } });
    const $ = parse(xml);
    const root = $("testsuites");
    expect(Number(root.attr("tests"))).toBe($("testcase").length);
    expect(Number(root.attr("failures"))).toBe($("failure").length);
    expect(Number(root.attr("skipped"))).toBe($("skipped").length);
    for (const el of $("testsuite").toArray()) {
      const suite = $(el);
      expect(Number(suite.attr("tests"))).toBe(suite.find("testcase").length);
      expect(Number(suite.attr("failures"))).toBe(suite.find("failure").length);
    }
  });

  it("makes one case of one rule on one page, however many findings it holds", () => {
    const xml = renderJunitReport(
      only([
        issue("/a", { id: "first", ruleId: "og.image.missing", message: "No og:image." }),
        issue("/a", { id: "second", ruleId: "og.image.missing", message: "No og:image, twice." }),
        issue("/b", { id: "third", ruleId: "og.image.missing" }),
      ]),
    );
    const og = cases(xml).filter((c) => c.suite === "og.image.missing");
    expect(og.map((c) => c.name)).toEqual(["/a", "/b"]);
    expect(og[0]!.failureText).toContain("Finding: first");
    expect(og[0]!.failureText).toContain("Finding: second");
  });

  it("puts the gate first, failing with the reason exactly when the run fails", () => {
    const passed = cases(renderJunitReport(only([]), { gate: { exitCode: 0, failOn: "warning" } }));
    expect(passed).toEqual([expect.objectContaining({ suite: "goflag", name: "gate" })]);
    expect(passed[0]!.failure).toBeUndefined();

    // Known findings alone, over a budget of 2: nothing is new, yet the run
    // fails, and the widget has to say so.
    const overBudget = cases(
      renderJunitReport(
        { ...DEMO_REPORT, diff: { ...DEMO_DIFF, added: [] } },
        { gate: { exitCode: 1, failOn: "warning", maxDebt: 2 } },
      ),
    );
    expect(overBudget[0]).toMatchObject({ suite: "goflag", name: "gate" });
    expect(overBudget[0]!.failure).toMatch(/findings exceed the --max-debt budget of 2\./);
    expect(overBudget.slice(1).every((c) => c.skipped === "Known: in the baseline, not new.")).toBe(
      true,
    );
  });

  it("under a baseline, fails what is new and skips what is known", () => {
    const added = DEMO_DIFF.added[0]!;
    const report: GoflagReport = {
      ...DEMO_REPORT,
      seoIssues: [
        ...DEMO_REPORT.seoIssues,
        issue("/pricing", { id: added.id, ruleId: "canonical.absolute" }),
      ],
      diff: DEMO_DIFF,
    };
    const all = cases(renderJunitReport(report, { gate: { exitCode: 1, failOn: "warning" } }));
    const fresh = all.find((c) => c.suite === "canonical.absolute")!;
    expect(fresh.failure).toBe("Page has no `<title>`.");
    expect(fresh.failureText).toContain("new since the baseline");
    const failing = all.filter((c) => c.failure !== undefined).map((c) => c.suite);
    expect(failing).toEqual(["goflag", "canonical.absolute"]);
  });

  it("without a baseline under --fail-on error, fails errors and skips warnings", () => {
    const all = cases(
      renderJunitReport(
        only([
          issue("/a", { ruleId: "title.missing", severity: "error" }),
          issue("/b", { ruleId: "description.length", severity: "warning" }),
        ]),
        { gate: { exitCode: 1, failOn: "error" } },
      ),
    );
    expect(all.find((c) => c.suite === "title.missing")!.failure).toBeDefined();
    expect(all.find((c) => c.suite === "description.length")!.skipped).toBe(
      "warning: below --fail-on error.",
    );
  });

  it("without a baseline under --fail-on warning, fails an info finding as the verdict does", () => {
    // Any finding turns the verdict yellow, and yellow fails under `warning`.
    const [, info] = cases(
      renderJunitReport(only([issue("/a", { severity: "info" })]), {
        gate: { exitCode: 1, failOn: "warning" },
      }),
    );
    expect(info!.failure).toBeDefined();
  });

  it("skips everything on the run that captures the baseline, and passes it", () => {
    const all = cases(
      renderJunitReport(DEMO_REPORT, {
        gate: { exitCode: 0, failOn: "warning", capturedBaseline: true },
      }),
    );
    expect(all[0]!.failure).toBeUndefined();
    expect(all.slice(1).every((c) => c.skipped === "Accepted into the baseline by this run.")).toBe(
      true,
    );
    // Every finding is still there, to be read.
    const ids = collectFindings(DEMO_REPORT).map((f) => f.id);
    const text = all.map((c) => c.out).join("\n");
    for (const id of ids) expect(text).toContain(`Finding: ${id}`);
  });

  it("names a case by its path on the audited origin, and a hole by its route", () => {
    const all = cases(renderJunitReport(DEMO_REPORT));
    const hole = DEMO_REPORT.missingTranslations.holes[0]!;
    expect(all.find((c) => c.suite === "translationHole")!.name).toBe(hole.route);
    expect(
      all
        .filter((c) => c.suite !== "goflag")
        .every((c) => !c.name?.startsWith("https://example.com")),
    ).toBe(true);
  });

  it("links a rule to its page, and nothing else", () => {
    const xml = renderJunitReport(DEMO_REPORT);
    expect(xml).toContain("Rule: https://goflag.tech/docs/rules/canonical.missing");
    expect(xml).not.toContain("https://goflag.tech/docs/rules/brokenLink");
  });

  it("escapes what the site said, and drops what XML cannot carry", () => {
    const xml = renderJunitReport(
      only([issue("/a", { message: 'Title is `<b>"A & B"</b>`\u0001 here.' })]),
    );
    expect(xml).not.toContain("\u0001");
    expect(xml).toContain("&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;");
    expect(cases(xml)[1]!.failure).toBe('Title is `<b>"A & B"</b>` here.');
  });
});
