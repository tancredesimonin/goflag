/**
 * `robots.blocks-ai-answers` — a robots.txt that lets Googlebot in and keeps
 * an AI answer engine out.
 *
 * OpenAI, Anthropic and Perplexity each document the agent whose access decides
 * whether their answers can draw on a site, and each says robots.txt governs
 * it. Keeping that agent out is therefore not a matter of opinion: the vendor
 * states what follows. OpenAI, that a site opted out of `OAI-SearchBot` "will
 * not be shown in ChatGPT search answers"; Anthropic, that disabling
 * `Claude-SearchBot` stops it indexing the site for search, and disabling
 * `Claude-User` stops Claude retrieving a page in response to a person's
 * question; Perplexity, that a site appears in its search results by allowing
 * `PerplexityBot`. Being cited by those engines is search visibility the same
 * way being listed by Google is, so this is a finding, beside
 * `robots.blocks-site`, and not a question.
 *
 * Its first draft (!261) was a question under `--advisories`, on the reasoning
 * that opting out is a choice the vendors built their tokens to allow. That is
 * true of every rule here — a site may also mean to keep Google out — and the
 * catalogue does not hide a consequence because someone could want it. A site
 * that opts out on purpose says so the way it says so for any other finding:
 * `--baseline`, or `--fail-on error`.
 *
 * ## Why a warning
 *
 * The site is still in Google, which is the larger share of its search traffic,
 * and keeping an AI engine out is sometimes the decision. A warning fails the
 * default build and lets `--fail-on error` through; `robots.blocks-site` keeps
 * `error` for the site no engine can crawl.
 *
 * ## Which agents
 *
 * One per purpose that the vendor says robots.txt decides:
 *
 * - **The search crawlers** (`OAI-SearchBot`, `Claude-SearchBot`,
 *   `PerplexityBot`), which build the index an engine cites from.
 * - **`Claude-User`**, which fetches a page when a person asks Claude about it.
 *   Anthropic states that all its agents honour robots.txt, so a disallow is a
 *   page Claude will not read for the person asking.
 *
 * And none of these:
 *
 * - **Training crawlers** (`GPTBot`, `ClaudeBot`). They decide what a model
 *   learns from, not what an engine cites; no vendor says refusing them costs a
 *   citation, and a rule claiming it would cite nothing.
 * - **`ChatGPT-User` and `Perplexity-User`.** Their operators say robots.txt
 *   may not apply to them, so the file does not decide what they do and a
 *   finding about it would assert a consequence nobody documents.
 *
 * ## What it is silent about
 *
 * - **A file that keeps Googlebot out too.** Nothing singles an AI engine out,
 *   and the whole-site case is `robots.blocks-site`'s.
 * - **A disallow narrower than `/`.** Decided at the root, as
 *   `robots.blocks-site` decides: a section kept out of one engine is a
 *   section, not the site.
 */

import { robotsAllows } from "../core/robots/match";
import type { SiteRule } from "./site-types";

/**
 * The agents, in the order a finding names them, each with the source that
 * documents it and what that source says follows from a disallow. Product
 * tokens as the vendors spell them; the matcher folds case.
 */
export const AI_ANSWER_AGENTS = [
  {
    userAgent: "OAI-SearchBot",
    source: "openai-crawlers",
    consequence: "ChatGPT search leaves the site out of its answers",
  },
  {
    userAgent: "Claude-SearchBot",
    source: "anthropic-crawlers",
    consequence: "Claude does not index the site for its search",
  },
  {
    userAgent: "Claude-User",
    source: "anthropic-crawlers",
    consequence: "Claude does not fetch a page when someone asks about it",
  },
  {
    userAgent: "PerplexityBot",
    source: "perplexity-crawlers",
    consequence: "Perplexity does not crawl the site for its search results",
  },
] as const;

export const robotsBlocksAiAnswers: SiteRule = {
  id: "robots.blocks-ai-answers",
  severity: "warning",
  summary: "`robots.txt` must not keep AI answer engines out of a site Googlebot may crawl",
  rigor: "vendor-spec",
  sources: ["openai-crawlers", "anthropic-crawlers", "perplexity-crawlers"],
  appliesTo: (site) =>
    site.robots?.found === true && robotsAllows(site.robots.groups, "/", "Googlebot").allowed,
  check: ({ site, issue }) => {
    const probe = site.robots!;

    // Each refusal says which group and which line kept the agent out: a
    // `User-agent: *` written for scrapers and a pasted list of "AI bots" are
    // the usual causes, and the fix differs between them.
    const keptOut = AI_ANSWER_AGENTS.flatMap((agent) => {
      const decision = robotsAllows(probe.groups, "/", agent.userAgent);
      // A refusal always names the rule that decided; the guard is for the type.
      if (decision.allowed || !decision.rule) return [];
      const named = decision.group === "*" ? "*" : agent.userAgent;
      const lines = decision.groupLines ?? [];
      const group = `\`User-agent: ${named}\` (line${lines.length === 1 ? "" : "s"} ${lines.join(", ")})`;
      const rule = `\`Disallow: ${decision.rule.pattern}\` (line ${decision.rule.line})`;
      return [`\`${agent.userAgent}\`, through ${group} and ${rule}: ${agent.consequence}.`];
    });
    if (keptOut.length === 0) return [];

    const count =
      keptOut.length === 1
        ? "an AI answer engine's agent"
        : `${keptOut.length} AI answer engine agents`;

    return issue({
      pageUrl: probe.url,
      message: `\`robots.txt\` lets Googlebot in and keeps ${count} out of the whole site. ${keptOut.join(" ")}`,
      origin: { kind: "computed" },
      fix: {
        title: "Give the answer engines' agents a group of their own",
        snippet: [
          "# robots.txt — an agent obeys the group that names it, so a `*` or",
          "# training-crawler group no longer catches these. Take them out of any",
          "# group that disallows them: groups naming the same agent are merged.",
          "User-agent: OAI-SearchBot",
          "User-agent: Claude-SearchBot",
          "User-agent: Claude-User",
          "User-agent: PerplexityBot",
          "Allow: /",
        ].join("\n"),
        language: "txt",
      },
    });
  },
};
