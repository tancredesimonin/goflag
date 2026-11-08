/**
 * The goflag MCP server: four read-only tools over the CLI's own engine.
 *
 * Local on purpose (`docs/integrations-plan.md` D1). An MCP server that runs
 * somewhere else cannot see `localhost:3000`, nor a preview behind a company
 * VPN; this one runs where the agent runs and sees what it sees. It is also
 * thin on purpose: `runAudit`, `summarize`, `diffReports` and the rule
 * catalogue are the CLI's, imported by name, so an answer here is the answer
 * `goflag` would print — never a second opinion that drifts from it.
 *
 * What it deliberately does not offer:
 *
 *   - No `start`. Letting an agent pass a command for this process to run is an
 *     arbitrary-execution door; the agent starts its own dev server.
 *   - No header as a tool argument. A value passed there would sit in the
 *     agent's transcript. Headers come from the server's own configuration —
 *     `GOFLAG_HEADERS`, bound to the origins in `GOFLAG_HEADERS_ORIGIN` — and
 *     go to those origins only (`readConfiguredHeaders`).
 *   - No write. A baseline is captured with `goflag --update-baseline`; this
 *     server only reads one.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  buildRuleCatalog,
  diffExitCode,
  diffReports,
  exitCode,
  parseHeaderArg,
  runAudit,
  summarize,
  totalFindings,
  type AuditOptions,
  type CatalogRule,
  type GoflagReport,
  type ProgressEvent,
} from "@goflag/cli";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { version } from "../package.json";

/** Where a rule explains itself, for a human the agent hands a link to. */
const RULE_DOCS = "https://goflag.tech/docs/rules/";

/**
 * The page budget when the agent sets none. The CLI's is 200, sized for a CI
 * job that has minutes; an agent waits on the answer, and on openfinanceguide
 * the link check alone took 618 s of a 715 s run (0.2.15). An agent can ask for
 * more; a first call should come back fast.
 */
const DEFAULT_MAX_PAGES = 50;

/** One progress notification per this many milliseconds at most, phase changes aside. */
const PROGRESS_INTERVAL_MS = 500;

const INSTRUCTIONS = `goflag audits a website's SEO and i18n plumbing: hreflang clusters, translation holes, sitemap and robots.txt agreement, canonical, Open Graph, icons, llms.txt, soft 404s.

Use it on the site you are editing, before committing a change to metadata, the sitemap, robots.txt or hreflang: start the dev server, call audit_site on its URL, fix what is new, and call it again. explain_rule gives a rule's requirement, how authoritative it is, and the documents behind it. compare_to_baseline answers "did my change make it worse?" against a report saved with the goflag CLI.

Findings carry a rigor: spec-required and vendor-spec are requirements, guideline and heuristic are advice.`;

/** What the server reads at start, beside the protocol. */
export interface GoflagServerOptions {
  /** Where `GOFLAG_HEADERS` and `GOFLAG_HEADERS_ORIGIN` are read. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Request headers from the server's configuration, and the origins they are for. */
export interface ConfiguredHeaders {
  origins: ReadonlySet<string>;
  headers: Readonly<Record<string, string>>;
}

/**
 * The headers a protected preview needs, read from the server's environment.
 *
 *   GOFLAG_HEADERS          one `Name: value` per line, as `--header` takes it
 *   GOFLAG_HEADERS_ORIGIN   the origins they are for, comma-separated
 *
 * Bound to origins because here, unlike on a command line, the URL is chosen
 * by the agent, call by call. Sent wherever it pointed, a preview's token would
 * go to any site a prompt injection named; bound, it goes to the origins the
 * person configured and nowhere else, which is the CLI's own rule — the header
 * goes to the origin the operator named — kept when the operator is not the one
 * typing the URL.
 *
 * A configuration that cannot be honoured stops the server rather than
 * running without it: headers with no origin, an origin that is not one, a line
 * `parseHeaderArg` refuses. Errors name the header and never quote its value.
 */
export function readConfiguredHeaders(
  env: Readonly<Record<string, string | undefined>>,
): ConfiguredHeaders | undefined {
  const raw = env.GOFLAG_HEADERS?.trim();
  if (!raw) return undefined;

  const declared = (env.GOFLAG_HEADERS_ORIGIN ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (declared.length === 0) {
    throw new Error(
      "GOFLAG_HEADERS is set without GOFLAG_HEADERS_ORIGIN: name the origin the headers are for, e.g. https://preview.example.com.",
    );
  }
  const origins = new Set<string>();
  for (const entry of declared) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`GOFLAG_HEADERS_ORIGIN: ${entry} is not an origin.`);
    }
    const bare = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !bare) {
      throw new Error(
        `GOFLAG_HEADERS_ORIGIN: ${entry} is not an origin — scheme and host only, e.g. https://preview.example.com.`,
      );
    }
    origins.add(url.origin);
  }

  const headers: Record<string, string> = {};
  raw.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const { name, value } = parseHeaderArg(line);
      headers[name] = value;
    } catch (err) {
      throw new Error(
        `GOFLAG_HEADERS line ${index + 1}: ${(err as Error).message.replace(/^--header /, "")}`,
      );
    }
  });
  return { origins, headers };
}

/** The headers for one audit: the configured ones, if `url` is on a configured origin. */
function headersFor(url: string, configured: ConfiguredHeaders | undefined) {
  if (!configured) return undefined;
  try {
    return configured.origins.has(new URL(url).origin) ? { ...configured.headers } : undefined;
  } catch {
    return undefined;
  }
}

/** The instructions, plus the origins audited with configured headers, when there are any. */
function instructionsFor(configured: ConfiguredHeaders | undefined): string {
  if (!configured) return INSTRUCTIONS;
  const origins = [...configured.origins].join(", ");
  const names = Object.keys(configured.headers).join(", ");
  return `${INSTRUCTIONS}

This server was configured with request headers (${names}) for ${origins}: an audit of that origin sends them, so a protected preview there can be audited. You cannot set headers yourself, and they are never sent to another origin.`;
}

const auditShape = {
  url: z
    .string()
    .describe("The site to audit, http or https. A dev server's URL works: http://localhost:3000."),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(`Page budget. Default ${DEFAULT_MAX_PAGES}.`),
  locales: z
    .array(z.string())
    .optional()
    .describe('Locales the site serves, e.g. ["en", "fr"], when its sitemap does not say.'),
  expectIndexing: z
    .enum(["no", "yes"])
    .optional()
    .describe('"no" for a staging or preview host that must stay out of search indexes.'),
  static: z
    .boolean()
    .optional()
    .describe("Never launch Chromium; judge the server-rendered HTML only."),
  advisories: z
    .boolean()
    .optional()
    .describe(
      "Also return the questions a linter cannot settle, with their evidence, for you to judge.",
    ),
  checkExternal: z
    .boolean()
    .optional()
    .describe("Also probe links to other sites. Off by default: slow, and not your site's fault."),
};

type AuditArgs = {
  url: string;
  maxPages?: number;
  locales?: string[];
  expectIndexing?: "no" | "yes";
  static?: boolean;
  advisories?: boolean;
  checkExternal?: boolean;
};

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function auditOptions(
  args: AuditArgs,
  extra: ToolExtra,
  configured: ConfiguredHeaders | undefined,
): AuditOptions {
  return {
    headers: headersFor(args.url, configured),
    maxPages: args.maxPages ?? DEFAULT_MAX_PAGES,
    locales: args.locales,
    expectIndexing: args.expectIndexing,
    static: args.static,
    advisories: args.advisories,
    checkExternal: args.checkExternal ?? false,
    signal: extra.signal,
    onProgress: progressReporter(extra),
  };
}

/**
 * Crawl progress as MCP progress notifications, when the client asked for them
 * (a `progressToken`). Throttled: a crawl reports every page, and a client
 * drawing a spinner needs a heartbeat, not a stream. `progress` only grows, as
 * the protocol requires; the crawl's own total grows as links are found, so it
 * goes in the message rather than in `total`.
 */
function progressReporter(extra: ToolExtra): ((event: ProgressEvent) => void) | undefined {
  const token = extra._meta?.progressToken;
  if (token === undefined) return undefined;
  let progress = 0;
  let lastPhase = "";
  let lastSent = 0;
  return (event) => {
    progress += 1;
    const now = Date.now();
    if (event.phase === lastPhase && now - lastSent < PROGRESS_INTERVAL_MS) return;
    lastPhase = event.phase;
    lastSent = now;
    extra
      .sendNotification({
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress,
          message: `${event.phase}: ${event.done} of ${event.total}`,
        },
      })
      .catch(() => undefined);
  };
}

function ok(text: string, structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: `${text}\n\n${JSON.stringify(structured)}` }],
    structuredContent: structured,
  };
}

function failure(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/** One line a human can read before the JSON an agent reads. */
function headline(report: GoflagReport): string {
  const total = totalFindings(report);
  const coverage = report.diagnostics.coverage;
  const pages =
    coverage?.selected !== undefined && coverage.considered !== undefined
      ? `${coverage.selected} of ${coverage.considered} sitemap URLs`
      : `${report.diagnostics.pagesCrawled} pages`;
  return `${report.url}: ${report.summary.verdict} flag, ${total} finding${total === 1 ? "" : "s"}, ${pages} audited.`;
}

/**
 * Read a report saved by the CLI. Errors say what was wrong with the file and
 * never quote it: an agent can point this at any path, and a parse error that
 * echoes the first bytes of `~/.ssh/id_ed25519` into the transcript would make
 * a read-only tool a way to read files the agent was not shown.
 */
async function readBaseline(path: string): Promise<GoflagReport | string> {
  if (extname(path).toLowerCase() !== ".json") {
    return `${path} is not a .json file. Pass a report saved by goflag --report or --update-baseline.`;
  }
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return `Could not read ${path}.`;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GoflagReport>;
    if (typeof parsed.url === "string" && parsed.summary && Array.isArray(parsed.seoIssues)) {
      return parsed as GoflagReport;
    }
  } catch {
    // Falls through to the same answer as a JSON file of the wrong shape.
  }
  return `${path} is not a goflag JSON report.`;
}

function ruleView(rule: CatalogRule, sources: ReturnType<typeof buildRuleCatalog>["sources"]) {
  return {
    ...rule,
    sources: rule.sources.map((id) => sources[id] ?? { id }),
    docs: `${RULE_DOCS}${rule.id}`,
  };
}

/** A server with goflag's four tools, not yet connected to a transport. */
export function createGoflagServer(options: GoflagServerOptions = {}): McpServer {
  const configured = readConfiguredHeaders(options.env ?? process.env);
  const catalog = buildRuleCatalog();
  const server = new McpServer(
    { name: "goflag", version },
    { instructions: instructionsFor(configured) },
  );

  server.registerTool(
    "audit_site",
    {
      title: "Audit a site",
      description:
        "Crawl a site — a local dev server, a preview or production — and judge its SEO and i18n plumbing. Returns the findings rolled up by rule, each with its rigor, plus translation holes, broken links and the pages audited.",
      inputSchema: auditShape,
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async (args, extra) => {
      try {
        const report = await runAudit(args.url, auditOptions(args, extra, configured));
        return ok(headline(report), {
          exitCode: exitCode(report),
          coverage: report.diagnostics.coverage ?? null,
          summary: summarize(report),
        });
      } catch (err) {
        return failure((err as Error).message);
      }
    },
  );

  server.registerTool(
    "compare_to_baseline",
    {
      title: "Compare to a baseline",
      description:
        "Audit a site and compare it to a report saved earlier with the goflag CLI (--report or --update-baseline). Returns what is new, what was resolved, and how many findings are unchanged: the question a change has to answer is whether it made things worse.",
      inputSchema: {
        ...auditShape,
        baseline: z
          .string()
          .describe("Path to the saved JSON report, relative to where this server runs."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async ({ baseline: path, ...args }, extra) => {
      const baseline = await readBaseline(path);
      if (typeof baseline === "string") return failure(baseline);
      try {
        const report = await runAudit(args.url, auditOptions(args, extra, configured));
        const diff = diffReports(baseline, report);
        return ok(
          `${headline(report)} Against the baseline: ${diff.added.length} new, ${diff.resolved.length} resolved, ${diff.unchanged} unchanged.`,
          {
            exitCode: diffExitCode(diff, "warning", { total: totalFindings(report) }),
            baseline: diff.baseline,
            added: diff.added,
            resolved: diff.resolved,
            unchanged: diff.unchanged,
            ...(diff.profileMismatch ? { profileMismatch: diff.profileMismatch } : {}),
            ...(diff.indexingMismatch ? { indexingMismatch: diff.indexingMismatch } : {}),
          },
        );
      } catch (err) {
        return failure((err as Error).message);
      }
    },
  );

  server.registerTool(
    "explain_rule",
    {
      title: "Explain a rule",
      description:
        "What one goflag rule checks, why, how authoritative it is (rigor), the documents that require it, and what a passing page looks like.",
      inputSchema: {
        id: z.string().describe('A rule id from a finding, e.g. "hreflang.cluster-incomplete".'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      const rule = catalog.rules.find((candidate) => candidate.id === id);
      if (!rule) {
        const family = id.split(".")[0] ?? "";
        const near = catalog.rules
          .filter((candidate) => candidate.id.startsWith(`${family}.`))
          .map((candidate) => candidate.id);
        return failure(
          `No rule "${id}".${near.length > 0 ? ` Rules in ${family}: ${near.join(", ")}.` : ""} list_rules returns them all.`,
        );
      }
      return ok(`${rule.id}: ${rule.summary}`, ruleView(rule, catalog.sources));
    },
  );

  server.registerTool(
    "list_rules",
    {
      title: "List the rules",
      description:
        "Every rule goflag runs, with its scope (page, site, prose), severity and rigor. Prose rules are questions for a reviewer, never findings.",
      inputSchema: {
        scope: z
          .enum(["page", "site", "prose"])
          .optional()
          .describe("Only the rules of one scope."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ scope }) => {
      const rules = catalog.rules
        .filter((rule) => scope === undefined || rule.scope === scope)
        .map(({ id, scope: ruleScope, severity, rigor, summary }) => ({
          id,
          scope: ruleScope,
          severity,
          rigor,
          summary,
        }));
      return ok(`${rules.length} rule${rules.length === 1 ? "" : "s"}.`, { rules });
    },
  );

  return server;
}
