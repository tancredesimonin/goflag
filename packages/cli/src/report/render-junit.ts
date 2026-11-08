/**
 * The report as JUnit XML — the one format every CI already knows how to show.
 *
 * Jenkins and GitLab's merge-request test widget render a JUnit file and
 * nothing else goflag writes. Without one, a red pipeline says "job failed" and
 * the reason sits in a log or an artefact someone has to open. With one, the
 * widget lists the findings by rule, on the merge request itself.
 *
 * A test case is **one rule on one page** (`docs/integrations-plan.md` T-2): the
 * suite is the rule, the case is the page, and several findings of one rule on
 * one page share a case, each written out in its body. A translation hole has no
 * page, so its case is the route.
 *
 * Same standing as `renderHtmlReport`: a pure function of the report, and it
 * decides nothing. The CLI passes its gate in, and the file states it:
 *
 *   - a finding that makes the run fail is a `<failure>`;
 *   - one that does not — known in the baseline, below `--fail-on`, `info`, or
 *     accepted by the run that captured the baseline — is `<skipped>`, with the
 *     reason, so it stays visible without turning the widget red;
 *   - the first suite, `goflag`, holds one case, `gate`, that fails exactly when
 *     the run does, with the reason `gateVerdict` gives the HTML report. A
 *     budget exceeded by known findings alone, or a red verdict with no
 *     finding to show for it, still turns the widget red.
 *
 * So the widget's colour is the exit code's, and a reader who sees it red finds
 * a failing case that says why.
 *
 * No location attribute: JUnit's `file` and `line` name source code, and a
 * goflag finding sits on a URL. They wait for `.goflag/routes.json` (D7), as
 * SARIF does.
 */
import type { Rigor, Severity } from "../lib/core/types";
import { gateVerdict, blocksAt, SEVERITY_RANK, type GateDecision } from "./gate-verdict";
import type { GoflagReport } from "./types";

export interface RenderJunitOptions {
  /** The gate as the CLI decided it. Without one, the report's verdict decides. */
  gate?: GateDecision;
}

/** Where a rule explains itself; the same constant as the HTML report's. */
const RULE_DOCS = "https://goflag.tech/docs/rules/";

/** One finding, whatever section of the report it came from. */
interface Item {
  id: string;
  /** The suite: a rule id, or the finding class for links, pages and holes. */
  suite: string;
  /** Whether `suite` has a page on goflag.tech. */
  isRule: boolean;
  /** The page it sits on, or the route for a translation hole. */
  where: string;
  severity: Severity;
  message: string;
  why?: string;
  fix?: string;
  rigor?: Rigor;
  sources?: string[];
}

function itemsOf(report: GoflagReport): Item[] {
  const items: Item[] = [];
  for (const link of report.brokenLinks) {
    items.push({
      id: link.id,
      suite: "brokenLink",
      isRule: false,
      where: link.pageUrl,
      severity: "error",
      message:
        `${link.verdict} link → ${link.href} (` +
        `${link.status === 0 ? "network error" : `HTTP ${link.status}`}` +
        `${link.reason ? `, ${link.reason}` : ""})`,
    });
  }
  for (const page of report.unreachablePages) {
    items.push({
      id: page.id,
      suite: "unreachablePage",
      isRule: false,
      where: page.url,
      severity: "error",
      message: page.status === 0 ? "Network error" : `HTTP ${page.status}`,
    });
  }
  for (const hole of report.missingTranslations.holes) {
    items.push({
      id: hole.id,
      suite: "translationHole",
      isRule: false,
      where: hole.route,
      severity: "warning",
      message:
        `Missing in ${hole.missingLocales.join(", ")}; ` +
        `served in ${hole.presentLocales.join(", ")}.`,
    });
  }
  for (const issue of report.missingTranslations.reciprocity) {
    items.push({
      id: issue.id,
      suite: issue.code,
      isRule: false,
      where: issue.url,
      severity: "warning",
      message: issue.message,
    });
  }
  for (const issue of [...report.seoIssues, ...report.siteIssues]) {
    items.push({
      id: issue.id,
      suite: issue.ruleId,
      isRule: true,
      where: issue.pageUrl,
      severity: issue.severity,
      message: issue.message,
      why: issue.why,
      fix: issue.fix,
      rigor: issue.rigor,
      sources: issue.sources,
    });
  }
  return items;
}

/**
 * Why a finding does not fail the run, or `undefined` when it does — the rules
 * `exitCode` and `diffExitCode` apply, which are not the same rule:
 *
 *   - without a baseline the verdict decides, and any finding at all makes it
 *     yellow, so under `--fail-on warning` every finding blocks, `info`
 *     included; under `--fail-on error` only what makes it red does, which is
 *     an `error`, a broken link or an unreachable page (all `error` here);
 *   - under a baseline only a new finding blocks, and only at `warning` or
 *     above (`blocksAt`).
 *
 * A captured baseline accepts everything, and `--fail-on never` blocks nothing.
 */
function skipReason(
  item: Item,
  gate: GateDecision | undefined,
  added: Set<string> | undefined,
): string | undefined {
  if (gate?.capturedBaseline) return "Accepted into the baseline by this run.";
  const failOn = gate?.failOn ?? "warning";
  if (failOn === "never") return "--fail-on never: reported, not blocking.";
  if (!added) {
    if (failOn === "error" && item.severity !== "error") {
      return `${item.severity}: below --fail-on error.`;
    }
    return undefined;
  }
  if (!blocksAt(item.severity, failOn)) {
    return item.severity === "info"
      ? "info: never blocks under a baseline."
      : `${item.severity}: below --fail-on ${failOn}.`;
  }
  if (!added.has(item.id)) return "Known: in the baseline, not new.";
  return undefined;
}

// --- XML --------------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escaped for an attribute or a text node. The control characters XML 1.0
 * forbids are dropped rather than escaped: there is no escape for them, and a
 * message quoting a page's `<title>` can carry one, which would make the whole
 * file unreadable to the CI that parses it.
 */
function xml(value: string): string {
  let allowed = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code !== 0xfffe && code !== 0xffff)
    ) {
      allowed += ch;
    }
  }
  return allowed.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** One line, short enough for a widget's row; the body keeps the rest. */
function headline(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

/** A URL on the audited origin as its path; anything else whole. */
function pathOf(where: string, origin: string): string {
  try {
    const parsed = new URL(where);
    if (parsed.origin === origin) return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    // A route, not a URL: shown as given.
  }
  return where;
}

function body(item: Item, skipped: string | undefined, isNew: boolean): string {
  const tags = [item.severity, item.rigor, isNew ? "new since the baseline" : undefined]
    .filter(Boolean)
    .join(" · ");
  const lines = [tags, item.message];
  if (item.why) lines.push(`Why: ${item.why}`);
  if (item.fix) lines.push("Fix:", item.fix);
  if (item.isRule) lines.push(`Rule: ${RULE_DOCS}${item.suite}`);
  for (const source of item.sources ?? []) lines.push(`Source: ${source}`);
  if (skipped) lines.push(`Not blocking: ${skipped}`);
  lines.push(`Finding: ${item.id}`);
  return lines.join("\n");
}

interface Case {
  name: string;
  items: Item[];
}

interface Suite {
  name: string;
  cases: Case[];
}

function suitesOf(items: Item[], origin: string): Suite[] {
  const bySuite = new Map<string, Map<string, Item[]>>();
  for (const item of items) {
    const cases = bySuite.get(item.suite) ?? new Map<string, Item[]>();
    const name = pathOf(item.where, origin);
    cases.set(name, [...(cases.get(name) ?? []), item]);
    bySuite.set(item.suite, cases);
  }
  const worst = (suite: Suite) =>
    Math.min(...suite.cases.flatMap((c) => c.items.map((i) => SEVERITY_RANK[i.severity])));
  return [...bySuite]
    .map(([name, cases]) => ({
      name,
      cases: [...cases]
        .map(([caseName, caseItems]) => ({
          name: caseName,
          items: [...caseItems].sort((a, b) => a.id.localeCompare(b.id)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => worst(a) - worst(b) || a.name.localeCompare(b.name));
}

export function renderJunitReport(report: GoflagReport, options: RenderJunitOptions = {}): string {
  const { gate } = options;
  const origin = (() => {
    try {
      return new URL(report.url).origin;
    } catch {
      return "";
    }
  })();
  const added = report.diff ? new Set(report.diff.added.map((entry) => entry.id)) : undefined;
  const verdict = gateVerdict(report, gate);

  const gateCase =
    `    <testcase classname="goflag" name="gate">\n` +
    (verdict.passed
      ? ""
      : `      <failure message="${xml(verdict.reason)}" type="gate">${xml(
          `${verdict.headline}\n${verdict.reason}` +
            report.diagnostics.warnings.map((w) => `\nWarning: ${w}`).join(""),
        )}</failure>\n`) +
    `    </testcase>\n`;
  const blocks: string[] = [
    `  <testsuite name="goflag" tests="1" failures="${verdict.passed ? 0 : 1}" errors="0" skipped="0">\n${gateCase}  </testsuite>\n`,
  ];
  let tests = 1;
  let failures = verdict.passed ? 0 : 1;
  let skippedTotal = 0;

  for (const suite of suitesOf(itemsOf(report), origin)) {
    let suiteFailures = 0;
    let suiteSkipped = 0;
    const cases = suite.cases.map((testCase) => {
      const reasons = testCase.items.map((item) => skipReason(item, gate, added));
      const failing = reasons.some((reason) => reason === undefined);
      const text = testCase.items
        .map((item, i) => body(item, reasons[i], added?.has(item.id) ?? false))
        .join("\n\n");
      const first = testCase.items[reasons.findIndex((r) => r === undefined)] ?? testCase.items[0]!;
      let inner: string;
      if (failing) {
        suiteFailures += 1;
        inner = `      <failure message="${xml(headline(first.message))}" type="${first.severity}">${xml(text)}</failure>\n`;
      } else {
        suiteSkipped += 1;
        inner = `      <skipped message="${xml(reasons[0]!)}"/>\n      <system-out>${xml(text)}</system-out>\n`;
      }
      return `    <testcase classname="${xml(suite.name)}" name="${xml(testCase.name)}">\n${inner}    </testcase>\n`;
    });
    tests += cases.length;
    failures += suiteFailures;
    skippedTotal += suiteSkipped;
    blocks.push(
      `  <testsuite name="${xml(suite.name)}" tests="${cases.length}" failures="${suiteFailures}" errors="0" skipped="${suiteSkipped}">\n` +
        cases.join("") +
        `  </testsuite>\n`,
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites name="goflag ${xml(report.url)}" tests="${tests}" failures="${failures}" errors="0" skipped="${skippedTotal}" timestamp="${xml(report.finishedAt)}">\n` +
    blocks.join("") +
    `</testsuites>\n`
  );
}
