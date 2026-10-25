/**
 * `robots.blocks-ai-answers`.
 *
 * What fires is the accident and the decision alike — a `User-agent: *`
 * disallow with a Googlebot exception, a pasted list of AI bots, an explicit
 * group — because the vendor's consequence is the same for both. What stays
 * silent is everything no vendor ties to a citation: training crawlers, the
 * `-User` fetchers whose operators say robots.txt may not bind them, a section
 * kept out rather than the site, and a file that keeps Google out as well.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import { parseRobots } from "../core/robots/parse";
import type { RobotsProbe } from "../core/types";
import { AI_ANSWER_AGENTS, robotsBlocksAiAnswers } from "./robots-ai-answers";
import { getSiteProseRule } from "./site-prose";
import { getSiteRule, SITE_RULES } from "./site-rules";
import type { SiteContext } from "./site-types";

const O = "https://x.com";

function served(body: string, found = true): RobotsProbe {
  return {
    url: `${O}/robots.txt`,
    status: found ? 200 : 404,
    found,
    byteLength: Buffer.byteLength(body),
    redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
    ...parseRobots(found ? body : ""),
  };
}

function run(body: string, found = true) {
  const site: SiteContext = {
    origin: O,
    pages: [],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
    robots: served(body, found),
  };
  return lintSite(site, [robotsBlocksAiAnswers]);
}

describe("robots.blocks-ai-answers, as a rule", () => {
  it("is a site rule at warning, not a question under --advisories", () => {
    expect(SITE_RULES).toContain(robotsBlocksAiAnswers);
    expect(getSiteRule("robots.blocks-ai-answers")).toBe(robotsBlocksAiAnswers);
    expect(robotsBlocksAiAnswers.severity).toBe("warning");
    expect(getSiteProseRule("robotstxt.blocks-ai-search")).toBeUndefined();
  });

  it("cites the page of every operator whose agent it names, at vendor-spec", () => {
    expect(robotsBlocksAiAnswers.rigor).toBe("vendor-spec");
    expect(robotsBlocksAiAnswers.sources).toEqual([
      ...new Set(AI_ANSWER_AGENTS.map((agent) => agent.source)),
    ]);
  });
});

describe("robots.blocks-ai-answers, when it fires", () => {
  it("reports an agent its own group keeps out, with the group, the line and what follows", () => {
    const issues = run("User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n");

    expect(issues).toEqual([
      expect.objectContaining({
        ruleId: "robots.blocks-ai-answers",
        severity: "warning",
        pageUrl: `${O}/robots.txt`,
        rigor: "vendor-spec",
        message:
          "`robots.txt` lets Googlebot in and keeps an AI answer engine's agent out of the whole site. " +
          "`OAI-SearchBot`, through `User-agent: OAI-SearchBot` (line 1) and `Disallow: /` (line 2): " +
          "ChatGPT search leaves the site out of its answers.",
      }),
    ]);
    expect(issues[0]?.fix?.snippet).toContain("User-agent: Claude-User");
  });

  it("reports every agent `User-agent: *` catches while Googlebot has its own group", () => {
    // The accident: a fallback group written for scrapers, a Googlebot
    // exception, and the answer engines caught along with everything else.
    const [issue, ...rest] = run("User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /\n");

    expect(rest).toEqual([]);
    expect(issue?.message).toMatch(
      /^`robots.txt` lets Googlebot in and keeps 4 AI answer engine agents out/,
    );
    for (const agent of AI_ANSWER_AGENTS) {
      expect(issue?.message).toContain(
        `\`${agent.userAgent}\`, through \`User-agent: *\` (line 4) and \`Disallow: /\` (line 5): ${agent.consequence}.`,
      );
    }
  });

  it("reports Claude-User, which fetches a page when a person asks Claude about it", () => {
    const [issue] = run("User-agent: Claude-User\nDisallow: /\n");

    expect(issue?.message).toContain(
      "`Claude-User`, through `User-agent: Claude-User` (line 1) and `Disallow: /` (line 2): " +
        "Claude does not fetch a page when someone asks about it.",
    );
    expect(issue?.message).not.toContain("OAI-SearchBot");
  });

  it("names the agent a shared group was chosen for, not the group's first line", () => {
    // A pasted list of AI bots: the training crawler opens the group, the
    // search crawler is caught by the second line.
    const [issue] = run("User-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: /\n");

    expect(issue?.message).toContain(
      "`PerplexityBot`, through `User-agent: PerplexityBot` (line 2) and `Disallow: /` (line 3)",
    );
    expect(issue?.message).not.toContain("GPTBot");
  });
});

describe("robots.blocks-ai-answers, when it stays silent", () => {
  it("on a file that lets every agent in", () => {
    expect(run("User-agent: *\nDisallow:\n")).toEqual([]);
    expect(run("User-agent: *\nAllow: /\n")).toEqual([]);
    expect(run("")).toEqual([]);
  });

  it("on a site with no robots.txt", () => {
    // A 404 allows everything (RFC 9309 §2.3.1.3).
    expect(run("User-agent: *\nDisallow: /\n", false)).toEqual([]);
  });

  it("when Googlebot is kept out too", () => {
    // Nothing singles an AI engine out, and a whole-site disallow is
    // `robots.blocks-site`'s finding.
    expect(run("User-agent: *\nDisallow: /\n")).toEqual([]);
  });

  it("on training crawlers and the fetchers robots.txt may not bind", () => {
    // GPTBot and ClaudeBot decide what a model learns from, not what an engine
    // cites; OpenAI and Perplexity say robots.txt may not apply to their `-User`
    // agents. No vendor ties any of these to a citation.
    expect(
      run(
        "User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: ChatGPT-User\n" +
          "User-agent: Perplexity-User\nDisallow: /\n",
      ),
    ).toEqual([]);
  });

  it("on a disallow narrower than the root", () => {
    // A section kept out of one engine, not the site — decided at `/`, as
    // `robots.blocks-site` decides.
    expect(run("User-agent: OAI-SearchBot\nDisallow: /members/\n")).toEqual([]);
  });
});
