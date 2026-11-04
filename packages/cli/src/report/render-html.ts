/**
 * The report as one HTML file — what a pipeline keeps for whoever reads it
 * without running goflag.
 *
 * The person who decides about a red merge request on a large site is often
 * not the person who ran the CLI: an SEO lead, a reviewer, an agency. The
 * pipeline kept a JSON file they cannot read and a log that scrolled away.
 * This is the same report, laid out for them.
 *
 * Same standing as `renderPreview` (`docs/preview-plan.md` D1, D2): a pure
 * function of the report, one file, no asset beside it, no server, no
 * script. And same standing as `renderDiffTerminal` on the clock: the
 * baseline's age is computed from `options.now`, never from `Date.now()`, so a
 * committed fixture does not change at midnight UTC (I6).
 *
 * What it does not do is decide anything. The exit code is the CLI's — `--fail-on`,
 * `--max-debt` and the baseline all weigh in, in `cli.ts` — so the CLI passes
 * it in as `gate`. A programmatic caller that has no gate gets the report's own
 * verdict instead, and the page says which it is showing.
 */

import type { Rigor, Severity } from "../lib/core/types";
import type { FailOn } from "./build";
import { totalFindings, type DiffEntry, type ReportDiff } from "./diff";
import type { BrokenLink, GoflagReport, SeoIssue, SiteIssue } from "./types";

export interface RenderHtmlReportOptions {
  /** The clock the baseline's age is measured against. Required: see the header. */
  now: number;
  /** The goflag version that judged, printed in the footer. */
  version: string;
  /**
   * The command that produced the report, for the footer. The caller redacts
   * it (`redactCommand`): the CLI's argv carries `--header` values.
   */
  command?: string;
  /**
   * The gate as the CLI decided it. Without one, the report's verdict is shown.
   * `capturedBaseline` is the `--update-baseline` run, which accepts every
   * finding it saw and exits 0 whatever they are.
   */
  gate?: { exitCode: number; failOn: FailOn; maxDebt?: number; capturedBaseline?: boolean };
  /** Document `<title>`. Defaults to the audited host. */
  title?: string;
}

/**
 * Where a rule explains itself. A constant rather than a flag: the report
 * travels out of the repository that produced it, and a link to the catalogue
 * is the one place the reader can check what the rule says and who requires it.
 */
const RULE_DOCS = "https://goflag.tech/docs/rules/";

/** Pages listed under one rule before the rest are counted. The JSON keeps all. */
const PAGE_LIMIT = 20;

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Backticked spans in rule messages become `<code>`, after escaping (as in `renderPreview`). */
function codeSpans(escaped: string): string {
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A URL on the audited origin as its path; anything else whole. */
function where(url: string, origin: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin === origin) return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    // Not a URL: shown as given.
  }
  return url;
}

/** `2026-08-04T09:14:02.881Z` → `2026-08-04 09:14 UTC`. Read off the string, so no time zone leaks in. */
function utc(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)
    ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
    : iso;
}

function severityTag(severity: Severity): string {
  return `<span class="tag sev-${severity}">${severity}</span>`;
}

function rigorTag(rigor: Rigor | undefined): string {
  return rigor ? `<span class="tag rigor">${esc(rigor)}</span>` : "";
}

// --- verdict ----------------------------------------------------------------

interface Verdict {
  passed: boolean;
  headline: string;
  reason: string;
}

function blocking(entries: DiffEntry[], failOn: FailOn): DiffEntry[] {
  if (failOn === "never") return [];
  const threshold = failOn === "error" ? 0 : 1;
  return entries.filter((entry) => SEVERITY_RANK[entry.severity] <= threshold);
}

/**
 * The reason in words, from the same inputs the CLI weighed — in the order it
 * weighs them: the debt budget first, then the baseline, then the findings.
 */
function verdictOf(report: GoflagReport, gate: RenderHtmlReportOptions["gate"]): Verdict {
  const total = totalFindings(report);
  if (!gate) {
    const verdict = report.summary.verdict;
    return {
      passed: verdict === "green",
      headline: `${verdict} flag`,
      reason: `${plural(total, "finding")}. The gate's decision depends on --fail-on, --max-debt and the baseline, which this render was not given.`,
    };
  }

  const passed = gate.exitCode === 0;
  const headline = `${passed ? "Passed" : "Failed"} · exit code ${gate.exitCode}`;
  if (gate.capturedBaseline) {
    return {
      passed,
      headline: `Baseline captured · exit code ${gate.exitCode}`,
      reason: `${plural(total, "finding")} accepted as known. Later runs against this baseline fail only on what is new.`,
    };
  }
  if (gate.maxDebt !== undefined && total > gate.maxDebt) {
    return {
      passed,
      headline,
      reason: `${plural(total, "finding")} exceed the --max-debt budget of ${gate.maxDebt}.`,
    };
  }
  if (gate.failOn === "never") {
    return {
      passed,
      headline,
      reason: `--fail-on never: ${plural(total, "finding")} reported, none blocking.`,
    };
  }
  const threshold = gate.failOn === "error" ? "error" : "warning or error";
  if (report.diff) {
    const blockers = blocking(report.diff.added, gate.failOn).length;
    return {
      passed,
      headline,
      reason:
        blockers > 0
          ? `${plural(blockers, "new finding")} at ${threshold} since the baseline.`
          : `Nothing new at ${threshold} since the baseline; ${plural(report.diff.unchanged, "known finding")} carried.`,
    };
  }
  return {
    passed,
    headline,
    reason: passed
      ? total === 0
        ? "No findings."
        : `No finding at ${threshold}; ${plural(total, "finding")} below it.`
      : `${plural(total, "finding")}, at least one at ${threshold}.`,
  };
}

// --- sections ---------------------------------------------------------------

function coverageLine(report: GoflagReport): string {
  const coverage = report.diagnostics.coverage;
  const crawled = report.diagnostics.pagesCrawled;
  if (coverage?.mode === "structural" && coverage.considered !== undefined) {
    const families = coverage.families?.length ?? 0;
    return (
      `Structural coverage: ${coverage.selected ?? crawled} of ${plural(coverage.considered, "sitemap URL")} audited` +
      (families > 0
        ? `, ${plural(families, "template family", "template families")} sampled`
        : "") +
      `. Template rules are conclusive on a sampled family; copy rules, links and translations only on the pages drawn.`
    );
  }
  return `${plural(crawled, "page")} audited${report.diagnostics.truncated ? ", stopped at the page budget" : ""}.`;
}

function diffSection(diff: ReportDiff, now: number, origin: string): string {
  const age = Math.max(0, Math.floor((now - Date.parse(diff.baseline.finishedAt)) / 86_400_000));
  const notes: string[] = [];
  if (diff.profileMismatch) {
    notes.push(
      `The baseline was judged under the <code>${esc(diff.profileMismatch.baseline)}</code> profile and this run under <code>${esc(diff.profileMismatch.current)}</code>: the comparison is not like for like.`,
    );
  }
  if (diff.indexingMismatch) {
    notes.push(
      `The baseline and this run declared indexing differently (<code>${esc(String(diff.indexingMismatch.baseline))}</code> then <code>${esc(String(diff.indexingMismatch.current))}</code>).`,
    );
  }
  const list = (entries: DiffEntry[], kind: "new" | "fixed") =>
    entries.length === 0
      ? ""
      : `<ul class="entries ${kind}">${entries
          .slice(0, PAGE_LIMIT)
          .map(
            (entry) =>
              `<li>${severityTag(entry.severity)}<span>${esc(entry.summary)}</span>${
                entry.pageUrl && !entry.summary.includes(entry.pageUrl)
                  ? `<span class="dim"> on ${esc(where(entry.pageUrl, origin))}</span>`
                  : ""
              }</li>`,
          )
          .join("")}${
          entries.length > PAGE_LIMIT
            ? `<li class="more">and ${entries.length - PAGE_LIMIT} more</li>`
            : ""
        }</ul>`;

  return `<section class="block">
<h2>Against the baseline</h2>
<p class="lede">Baseline of ${esc(utc(diff.baseline.finishedAt))}, ${plural(age, "day")} old: <b>${plural(diff.added.length, "new finding")}</b>, ${diff.resolved.length} resolved, ${diff.unchanged} unchanged.</p>
${notes.map((note) => `<p class="note">${note}</p>`).join("\n")}
${diff.added.length > 0 ? `<h3>New</h3>${list(diff.added, "new")}` : ""}
${diff.resolved.length > 0 ? `<h3>Resolved</h3>${list(diff.resolved, "fixed")}` : ""}
</section>`;
}

interface RuleGroup {
  ruleId: string;
  severity: Severity;
  rigor?: Rigor;
  why?: string;
  fix?: string;
  issues: (SeoIssue | SiteIssue)[];
}

/** Findings grouped by rule, the most severe and most frequent first. Stable for equal keys. */
function groupByRule(issues: (SeoIssue | SiteIssue)[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const issue of issues) {
    const group = groups.get(issue.ruleId);
    if (group) {
      group.issues.push(issue);
      if (SEVERITY_RANK[issue.severity] < SEVERITY_RANK[group.severity])
        group.severity = issue.severity;
    } else {
      groups.set(issue.ruleId, {
        ruleId: issue.ruleId,
        severity: issue.severity,
        rigor: issue.rigor,
        why: issue.why,
        fix: issue.fix,
        issues: [issue],
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.issues.length - a.issues.length ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

function rulesSection(report: GoflagReport, origin: string, added: Set<string>): string {
  const groups = groupByRule([...report.siteIssues, ...report.seoIssues]);
  if (groups.length === 0) return "";

  const rendered = groups.map((group) => {
    const fresh = group.issues.some((issue) => added.has(issue.id));
    const rows = group.issues
      .slice(0, PAGE_LIMIT)
      .map(
        (issue) =>
          `<li${added.has(issue.id) ? ' class="is-new"' : ""}><span class="path">${esc(where(issue.pageUrl, origin))}</span><span class="msg">${codeSpans(esc(issue.message))}</span></li>`,
      )
      .join("");
    const more =
      group.issues.length > PAGE_LIMIT
        ? `<li class="more">and ${group.issues.length - PAGE_LIMIT} more in the JSON report</li>`
        : "";
    return `<details class="rule${fresh ? " has-new" : ""}">
<summary><span class="rid"><a href="${RULE_DOCS}${esc(group.ruleId)}">${esc(group.ruleId)}</a></span>${severityTag(group.severity)}${rigorTag(group.rigor)}${fresh ? '<span class="tag new">new</span>' : ""}<span class="count">${plural(group.issues.length, "page")}</span></summary>
${group.why ? `<p class="why">${codeSpans(esc(group.why))}</p>` : ""}
<ul class="pages">${rows}${more}</ul>
${group.fix ? `<pre class="fix"><code>${esc(group.fix)}</code></pre>` : ""}
</details>`;
  });

  return `<section class="block">
<h2>Findings by rule</h2>
<p class="lede">Each rule links to its page: what it checks, how authoritative it is, and who requires it.</p>
${rendered.join("\n")}
</section>`;
}

function translationsSection(report: GoflagReport, origin: string): string {
  const { holes, reciprocity } = report.missingTranslations;
  if (holes.length === 0 && reciprocity.length === 0) return "";
  const holeRows = holes
    .slice(0, PAGE_LIMIT)
    .map(
      (hole) =>
        `<tr><th scope="row">${esc(hole.route)}</th><td>${hole.presentLocales.map(esc).join(", ")}</td><td class="missing">${hole.missingLocales.map(esc).join(", ")}</td></tr>`,
    )
    .join("");
  const reciprocityRows = reciprocity
    .slice(0, PAGE_LIMIT)
    .map(
      (issue) =>
        `<li><span class="path">${esc(where(issue.url, origin))}</span><span class="msg">${codeSpans(esc(issue.message))}</span></li>`,
    )
    .join("");
  return `<section class="block">
<h2>Translations</h2>
<p class="lede">Locales ${report.localeAxis.locales.map((l) => `<code>${esc(l)}</code>`).join(" ")}, from ${esc(report.localeAxis.source === "explicit" ? "--locales" : report.localeAxis.source)}.</p>
${
  holes.length > 0
    ? `<div class="scroll"><table><thead><tr><th>Route</th><th>Present</th><th>Missing</th></tr></thead><tbody>${holeRows}</tbody></table></div>${
        holes.length > PAGE_LIMIT
          ? `<p class="more">and ${holes.length - PAGE_LIMIT} more routes</p>`
          : ""
      }`
    : ""
}
${reciprocity.length > 0 ? `<h3>hreflang reciprocity</h3><ul class="pages">${reciprocityRows}</ul>` : ""}
</section>`;
}

function linksSection(links: BrokenLink[], origin: string): string {
  if (links.length === 0) return "";
  const rows = links
    .slice(0, PAGE_LIMIT)
    .map(
      (link) =>
        `<tr><td>${esc(where(link.pageUrl, origin))}</td><td class="href">${esc(where(link.href, origin))}</td><td class="num">${link.status || "—"}</td><td>${esc(link.verdict)}${link.reason ? ` · ${esc(link.reason)}` : ""}</td></tr>`,
    )
    .join("");
  return `<section class="block">
<h2>Links</h2>
<div class="scroll"><table><thead><tr><th>On</th><th>Target</th><th>Status</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
${links.length > PAGE_LIMIT ? `<p class="more">and ${links.length - PAGE_LIMIT} more links</p>` : ""}
</section>`;
}

function unreachableSection(report: GoflagReport, origin: string): string {
  if (report.unreachablePages.length === 0) return "";
  return `<section class="block">
<h2>Pages that did not answer</h2>
<ul class="pages">${report.unreachablePages
    .slice(0, PAGE_LIMIT)
    .map(
      (page) =>
        `<li><span class="path">${esc(where(page.url, origin))}</span><span class="msg">${page.status === 0 ? "network error" : `HTTP ${page.status}`}</span></li>`,
    )
    .join("")}</ul>
</section>`;
}

function advisoriesSection(report: GoflagReport, origin: string): string {
  const advisories = report.advisories ?? [];
  if (advisories.length === 0) return "";
  return `<section class="block">
<h2>Questions for a reviewer</h2>
<p class="lede">Prose rules a linter cannot settle (<code>--advisories</code>). They never count as findings.</p>
<ul class="pages">${advisories
    .slice(0, PAGE_LIMIT)
    .map(
      (advisory) =>
        `<li><span class="path">${esc(where(advisory.pageUrl, origin))}</span><span class="msg"><a href="${RULE_DOCS}${esc(advisory.ruleId)}">${esc(advisory.ruleId)}</a> · ${codeSpans(esc(advisory.prose))}</span></li>`,
    )
    .join(
      "",
    )}${advisories.length > PAGE_LIMIT ? `<li class="more">and ${advisories.length - PAGE_LIMIT} more</li>` : ""}</ul>
</section>`;
}

// --- document ---------------------------------------------------------------

const STYLE = `
:root{--paper:#fff;--paper2:#f7f8f7;--ink:#09090b;--ink2:#4c534f;--ink3:#6d7671;--line:#e5e6e5;--brand:#009966;--amber:#bb4d00;--red:#e7000b;--wash:#f2f6f4;--redwash:#fdecec;
--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--ui:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#0a0a0c;--paper2:#121316;--ink:#fafafa;--ink2:#b6bcb9;--ink3:#878e8a;--line:#23252a;--brand:#00d492;--amber:#ffb900;--red:#ff6467;--wash:#101614;--redwash:#1f1012}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 64px;background:var(--paper);color:var(--ink);font:15px/1.55 var(--ui);-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin-inline:auto;display:flex;flex-direction:column;gap:28px}
a{color:inherit;text-underline-offset:2px}
code,pre,.rid,.path,.tag,.count,.meta,.num,.href{font-family:var(--mono)}
code{font-size:.9em}
h1{font:600 22px/1.25 var(--mono);margin:0;overflow-wrap:anywhere}
h2{font:600 16px/1.3 var(--mono);margin:0 0 10px}
h3{font:600 13px/1.3 var(--mono);margin:16px 0 8px;color:var(--ink2)}
.meta{margin:6px 0 0;font-size:12px;color:var(--ink3)}
.verdict{border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:6px;padding:14px 16px;background:var(--wash)}
.verdict.failed{border-left-color:var(--red);background:var(--redwash)}
.verdict b{display:block;font:600 17px/1.3 var(--mono)}
.verdict.failed b{color:var(--red)}
.verdict p{margin:4px 0 0;color:var(--ink2)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden}
.tiles div{background:var(--paper);padding:12px 14px}
.tiles b{display:block;font:600 24px/1.1 var(--ui);font-variant-numeric:tabular-nums}
.tiles span{font-size:12px;color:var(--ink3)}
.lede{margin:0 0 12px;color:var(--ink2)}
.note,.warn{margin:0 0 8px;font-size:13px;color:var(--amber)}
.coverage{margin:0;font-size:13px;color:var(--ink2)}
details.rule{border:1px solid var(--line);border-radius:6px;margin-bottom:8px;background:var(--paper)}
details.rule.has-new{border-color:var(--red)}
details.rule summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 12px;cursor:pointer;list-style-position:inside}
.rid{font-size:13px;font-weight:600;overflow-wrap:anywhere}
.count{margin-left:auto;font-size:12px;color:var(--ink3)}
.tag{font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:3px 6px;border-radius:3px;border:1px solid var(--line);color:var(--ink2)}
.sev-error{color:var(--red);border-color:var(--red)}
.sev-warning{color:var(--amber);border-color:var(--amber)}
.tag.new{color:var(--paper);background:var(--red);border-color:var(--red)}
.why{margin:0;padding:0 12px 8px;font-size:13px;color:var(--ink2)}
ul.pages,ul.entries{list-style:none;margin:0;padding:0 12px 10px;display:flex;flex-direction:column;gap:6px}
ul.pages li,ul.entries li{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:13px;border-top:1px solid var(--line);padding-top:6px;min-width:0}
ul.pages li.is-new{box-shadow:inset 3px 0 0 var(--red);padding-left:8px}
.path{color:var(--ink);overflow-wrap:anywhere}
.msg{color:var(--ink2);flex:1 1 20rem;min-width:0;overflow-wrap:anywhere}
.dim{color:var(--ink3)}
.more{color:var(--ink3);font-size:12px}
pre.fix{margin:0 12px 12px;padding:10px 12px;background:var(--paper2);border:1px solid var(--line);border-radius:4px;overflow-x:auto;font-size:12px}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{font:600 11px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--ink3)}
tbody th{font-family:var(--mono);font-weight:500}
td.missing{color:var(--red);font-family:var(--mono)}
.href{overflow-wrap:anywhere}
.num{font-variant-numeric:tabular-nums}
footer{border-top:1px solid var(--line);padding-top:14px;font-size:12px;color:var(--ink3)}
footer pre{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:var(--ink2)}
@media print{details.rule{break-inside:avoid}body{padding:0}}
`;

export function renderHtmlReport(report: GoflagReport, options: RenderHtmlReportOptions): string {
  const origin = (() => {
    try {
      return new URL(report.url).origin;
    } catch {
      return report.url;
    }
  })();
  const host = (() => {
    try {
      return new URL(report.url).host;
    } catch {
      return report.url;
    }
  })();
  const title = options.title ?? `goflag report — ${host}`;
  const verdict = verdictOf(report, options.gate);
  const total = totalFindings(report);
  const added = new Set(report.diff?.added.map((entry) => entry.id) ?? []);
  const errors = [...report.seoIssues, ...report.siteIssues].filter(
    (i) => i.severity === "error",
  ).length;

  const metaBits = [
    esc(utc(report.finishedAt)),
    `goflag ${esc(options.version)}`,
    `profile ${esc(report.profile)}`,
    ...(report.expectIndexing ? [`indexing: ${esc(report.expectIndexing)}`] : []),
    ...(report.diagnostics.requestHeaders?.length
      ? [
          `sent with ${report.diagnostics.requestHeaders.map((name) => `<code>${esc(name)}</code>`).join(", ")}`,
        ]
      : []),
  ];

  const tiles = report.diff
    ? [
        [report.diagnostics.pagesCrawled, "pages audited"],
        [total, "findings"],
        [report.diff.added.length, "new since the baseline"],
        [report.diff.resolved.length, "resolved"],
      ]
    : [
        [report.diagnostics.pagesCrawled, "pages audited"],
        [total, "findings"],
        [errors, "rule errors"],
        [report.summary.brokenLinks, "broken links"],
      ];

  const warnings = report.diagnostics.warnings;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="wrap">
<header>
<h1>${esc(host)}</h1>
<p class="meta">${metaBits.join(" · ")}</p>
</header>
<div class="verdict${verdict.passed ? "" : " failed"}"><b>${esc(verdict.headline)}</b><p>${esc(verdict.reason)}</p></div>
<div class="tiles">${tiles.map(([n, label]) => `<div><b>${n}</b><span>${label}</span></div>`).join("")}</div>
<section>
<p class="coverage">${esc(coverageLine(report))}</p>
${warnings.map((warning) => `<p class="warn">${esc(warning)}</p>`).join("\n")}
</section>
${report.diff ? diffSection(report.diff, options.now, origin) : ""}
${rulesSection(report, origin, added)}
${translationsSection(report, origin)}
${linksSection(report.brokenLinks, origin)}
${unreachableSection(report, origin)}
${advisoriesSection(report, origin)}
<footer>
<p>Rendered by goflag ${esc(options.version)} from the JSON report, which carries every finding in full. <a href="https://goflag.tech">goflag.tech</a></p>
${options.command ? `<pre>${esc(options.command)}</pre>` : ""}
</footer>
</main>
</body>
</html>
`;
}
