/**
 * The `llmstxt.*` rules — what an `/llms.txt` owes the agents it is written for.
 *
 * ## Why every one of them is a `guideline`
 *
 * The file exists because of a proposal (https://llmstxt.org), not a standard:
 * no standards body has taken it up, and nobody is obliged to publish one. A
 * rule about it cannot carry more authority than the reason its subject exists,
 * so all five claim `guideline` — the catalogue entry for the proposal is itself
 * rated `guideline`, and `site-rules.test.ts` refuses a rule that claims more
 * than its strongest source. They are `warning`s for the same reason: in this
 * catalogue `error` is kept for a consequence a specification or the vendor
 * acting on it makes certain.
 *
 * ## What they stay silent about
 *
 * - **An absent file.** A 404 is the site saying it has none, which is allowed;
 *   Lighthouse's own audit marks that case not applicable.
 * - **What `http.not-found` already said.** A catch-all route that answers
 *   every unknown `.txt` with the home page answers `/llms.txt` with it too.
 *   That is one defect, and it belongs to the rule that asked for an invented
 *   path: reporting "this llms.txt is HTML" beside it would count it twice, and
 *   parsing the page as markdown would invent a missing H1 and a dozen dead
 *   links. Once the catch-all is fixed, the path 404s and nothing here fires —
 *   or the site has a real route at `/llms.txt`, and these rules judge it.
 *
 * The parser is goflag's own (`../core/llmstxt/parse.ts`, which says why).
 */

import { robotsAllows } from "../core/robots/match";
import type { SitemapEntryProbe } from "../core/types";
import { isDead, sample } from "./site-shared";
import type { SiteContext, SiteRule } from "./site-types";

/** The media types that say "read me as text". */
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);

/** The file was served, and what came back is not an HTML page. */
function readable(site: SiteContext): boolean {
  return site.llmsTxt?.found === true && !site.llmsTxt.html;
}

/**
 * Whether the invented `.txt` that `http.not-found` asked for got the same
 * class of answer `/llms.txt` did — a 2xx, or a 5xx. If so, the route answering
 * `/llms.txt` is the route that answers every unknown dotted path, and the
 * finding is that rule's.
 */
function explainedByCatchAll(site: SiteContext, status: number): boolean {
  const dotted = site.notFound?.find((probe) => probe.shape === "dotted");
  if (!dotted) return false;
  const klass = (code: number) => Math.floor(code / 100);
  return (klass(status) === 2 || klass(status) === 5) && klass(dotted.status) === klass(status);
}

/** Same-origin URLs the file lists, deduplicated, in file order. */
function sameOriginLinks(site: SiteContext): Array<{ url: string; line: number }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; line: number }> = [];
  for (const link of site.llmsTxt?.links ?? []) {
    if (seen.has(link.url) || !sameOrigin(link.url, site.origin)) continue;
    seen.add(link.url);
    out.push({ url: link.url, line: link.line });
  }
  return out;
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function fileUrl(site: SiteContext): string {
  return site.llmsTxt?.url ?? `${site.origin}/llms.txt`;
}

const llmstxtUnreachable: SiteRule = {
  id: "llmstxt.unreachable",
  severity: "warning",
  summary: "`/llms.txt` must answer with the file or with 404, not with a server error",
  rigor: "guideline",
  sources: ["lighthouse-llms-txt", "llmstxt"],
  // A 5xx only. No answer at all is not evidence about the route, and every
  // 4xx — a 404 above all — is the site saying it has no file.
  appliesTo: (site) =>
    site.llmsTxt !== undefined &&
    site.llmsTxt.status >= 500 &&
    !explainedByCatchAll(site, site.llmsTxt.status),
  check: ({ site, issue }) =>
    issue({
      pageUrl: fileUrl(site),
      message: `\`/llms.txt\` answered ${site.llmsTxt!.status}. Having no llms.txt is fine — a 404 says so — but a server error says something is here and failed, and the agent that asked for it gets nothing it can use. Lighthouse fails its llms.txt audit on exactly this.`,
      origin: { kind: "computed" },
    }),
};

const llmstxtContentType: SiteRule = {
  id: "llmstxt.content-type",
  severity: "warning",
  summary: "`/llms.txt` must be served as text — `text/plain` or `text/markdown` — not as a page",
  rigor: "guideline",
  sources: ["llmstxt", "ietf-rfc9110"],
  appliesTo: (site) => {
    const probe = site.llmsTxt;
    if (probe?.found !== true) return false;
    if (probe.html) return !explainedByCatchAll(site, probe.status);
    return !TEXT_TYPES.has(probe.contentType ?? "");
  },
  check: ({ site, issue }) => {
    const probe = site.llmsTxt!;
    const served = probe.contentType ? `\`${probe.contentType}\`` : "no content type";

    // Two failures with one remedy. An HTML document is not an llms.txt at
    // all; markdown with the wrong header is one that clients will misread.
    const message = probe.html
      ? `\`/llms.txt\` answered ${probe.status} with an HTML page (${served}), not a markdown file. An agent that asks for the site's llms.txt is handed a page instead. If the site has no llms.txt the path should answer 404; if it has one, this is not the route serving it.`
      : `\`/llms.txt\` is served with ${served}. The file is markdown, read by agents and by people: \`text/plain\` or \`text/markdown\` say so, while anything else tells a client to treat it as something it is not — \`text/html\` renders it as one run-on paragraph, and a download type does not render it at all.`;

    return issue({ pageUrl: fileUrl(site), message, origin: { kind: "computed" } });
  },
};

const llmstxtH1Missing: SiteRule = {
  id: "llmstxt.h1.missing",
  severity: "warning",
  summary: "An llms.txt must have an H1 naming the site",
  rigor: "guideline",
  sources: ["llmstxt"],
  appliesTo: (site) => readable(site) && !site.llmsTxt!.h1,
  check: ({ site, issue }) =>
    issue({
      pageUrl: fileUrl(site),
      message:
        "`/llms.txt` has no H1 (`# Name`, with a space after the `#`). The proposal calls it the only required section — without it the file is not an llms.txt by its own definition, and a reader following the format has no name for what the rest describes.",
      origin: { kind: "computed" },
    }),
};

/** What answered at each listed same-origin URL, when the pass ran. */
function listedProbes(site: SiteContext): SitemapEntryProbe[] {
  const byUrl = site.llmsTxtLinks?.byUrl;
  if (!byUrl) return [];
  return sameOriginLinks(site).flatMap(({ url }) => byUrl.get(url) ?? []);
}

const llmstxtLinkUnreachable: SiteRule = {
  id: "llmstxt.link.unreachable",
  severity: "warning",
  summary: "Every same-origin URL an llms.txt lists must answer",
  rigor: "guideline",
  sources: ["llmstxt"],
  appliesTo: (site) => readable(site) && listedProbes(site).some((probe) => isDead(probe.status)),
  check: ({ site, issue }) => {
    const dead = listedProbes(site).filter((probe) => isDead(probe.status));
    const unprobed = site.llmsTxtLinks?.unprobed ?? 0;
    const floor =
      unprobed > 0
        ? ` ${unprobed} further URL${unprobed === 1 ? " was" : "s were"} not checked — this count is a floor, not a total.`
        : "";

    return issue({
      pageUrl: fileUrl(site),
      message: `${dead.length} URL${dead.length === 1 ? "" : "s"} \`/llms.txt\` lists ${dead.length === 1 ? "does" : "do"} not answer: ${sample(dead.map((probe) => `${probe.url} (${probe.status === 0 ? "no response" : `HTTP ${probe.status}`})`))}. The file exists to send agents to these pages, so each dead one is a lookup that ends in an error instead of an answer.${floor}`,
      origin: { kind: "computed" },
    });
  },
};

/**
 * The contradiction that prompted this family, measured on openfinanceguide:
 * `Disallow: /raw/` in robots.txt, and an llms.txt planned to list `/raw/*.md`
 * mirrors. robots.txt governs the agents llms.txt is written for — Anthropic
 * documents that its bots, Claude-User among them, honour it — so every such
 * entry is a URL the file offers and its reader is forbidden to open.
 *
 * Same shape as `sitemap.entry.blocked-by-robots`, through the same RFC 9309
 * matcher, for `User-agent: *`. The file itself is checked too: a disallowed
 * `/llms.txt` is unreadable before any of its entries is reached. Skipped when
 * the whole origin is disallowed, because `robots.blocks-site` is that finding.
 */
const llmstxtLinkBlockedByRobots: SiteRule = {
  id: "llmstxt.link.blocked-by-robots",
  severity: "warning",
  summary: "An llms.txt must not list URLs that robots.txt forbids fetching",
  rigor: "guideline",
  sources: ["llmstxt", "ietf-rfc9309", "anthropic-crawlers"],
  appliesTo: (site) =>
    readable(site) && site.robots?.found === true && robotsAllows(site.robots.groups, "/").allowed,
  check: ({ site, issue }) => {
    const robots = site.robots!;
    const file = fileUrl(site);
    const blocked: string[] = [];

    for (const url of [file, ...sameOriginLinks(site).map((link) => link.url)]) {
      let path: string;
      try {
        const parsed = new URL(url);
        path = `${parsed.pathname}${parsed.search}`;
      } catch {
        continue;
      }
      const decision = robotsAllows(robots.groups, path);
      if (decision.allowed || !decision.rule) continue;
      // No backticks inside: `sample` already wraps each entry in a pair.
      const self = url === file ? ", the file itself" : "";
      blocked.push(
        `${url} (line ${decision.rule.line}: Disallow: ${decision.rule.pattern}${self})`,
      );
    }

    if (blocked.length === 0) return [];
    return issue({
      pageUrl: file,
      message: `${blocked.length} URL${blocked.length === 1 ? "" : "s"} \`/llms.txt\` points agents to ${blocked.length === 1 ? "is" : "are"} disallowed by \`robots.txt\` for \`User-agent: *\`: ${sample(blocked)}. The file offers them to agents, and an agent that honours robots.txt — Anthropic documents that Claude-User does — never fetches them.`,
      origin: { kind: "computed" },
    });
  },
};

/** In id order, as the registry they join is. */
export const LLMS_TXT_RULES: readonly SiteRule[] = [
  llmstxtContentType,
  llmstxtH1Missing,
  llmstxtLinkBlockedByRobots,
  llmstxtLinkUnreachable,
  llmstxtUnreachable,
];
