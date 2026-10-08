/**
 * The `llmstxt.*` rules.
 *
 * Half of what is tested here is silence. The file is optional, so an absent
 * one says nothing; and a catch-all route that answers `/llms.txt` with the
 * home page is `http.not-found`'s finding, so these rules must not stack a
 * second, garbled report of it on top. The other half is the contradiction
 * that prompted the family: `Disallow: /raw/` in robots.txt, and an llms.txt
 * pointing agents at `/raw/*.md`.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import { parseLlmsTxt } from "../core/llmstxt/parse";
import { parseRobots } from "../core/robots/parse";
import type { LlmsTxtProbe, NotFoundProbe, RobotsProbe, SitemapEntryProbe } from "../core/types";
import { LLMS_TXT_RULES } from "./llms-txt";
import { getSiteRule, SITE_RULES } from "./site-rules";
import type { SiteContext } from "./site-types";

const O = "https://x.com";
const FILE = `${O}/llms.txt`;

const MARKDOWN = [
  "# Example",
  "",
  "> What this site is.",
  "",
  "## Docs",
  "",
  `- [Guide](${O}/raw/guide.md): the guide`,
  "- [Home](/)",
  "- [Elsewhere](https://other.org/page)",
].join("\n");

function served(body: string, extra: Partial<LlmsTxtProbe> = {}): LlmsTxtProbe {
  return {
    url: FILE,
    status: 200,
    finalUrl: FILE,
    found: true,
    contentType: "text/plain",
    html: false,
    ...parseLlmsTxt(body, FILE),
    ...extra,
  };
}

function robots(body: string): RobotsProbe {
  return {
    url: `${O}/robots.txt`,
    status: 200,
    found: true,
    byteLength: body.length,
    redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
    ...parseRobots(body),
  };
}

function dotted(status: number): NotFoundProbe[] {
  return [
    { url: `${O}/goflag-probe-n`, shape: "bare", status: 404, finalUrl: `${O}/goflag-probe-n` },
    {
      url: `${O}/goflag-probe-n.txt`,
      shape: "dotted",
      status,
      finalUrl: `${O}/goflag-probe-n.txt`,
    },
  ];
}

function answers(entries: Array<[string, number]>, unprobed = 0): SiteContext["llmsTxtLinks"] {
  const byUrl = new Map<string, SitemapEntryProbe>(
    entries.map(([url, status]) => [
      url,
      { url, status, via: "probe", finalUrl: url, redirected: false },
    ]),
  );
  return { byUrl, unprobed };
}

function site(extra: Partial<SiteContext>): SiteContext {
  return {
    origin: O,
    pages: [],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
    ...extra,
  };
}

const run = (ctx: SiteContext, id?: string) =>
  lintSite(ctx, id ? [getSiteRule(id)!] : LLMS_TXT_RULES);

describe("the llmstxt.* family", () => {
  it("joins the registry, every rule at guideline and warning", () => {
    for (const rule of LLMS_TXT_RULES) {
      expect(SITE_RULES).toContain(rule);
      // A proposal cannot back more than a guideline; the catalogue rates the
      // proposal itself `guideline`, and site-rules.test.ts holds the ceiling.
      expect(rule.rigor, rule.id).toBe("guideline");
      expect(rule.severity, rule.id).toBe("warning");
      expect(rule.sources, rule.id).toContain(
        rule.id === "llmstxt.unreachable" ? "lighthouse-llms-txt" : "llmstxt",
      );
    }
  });

  it("says nothing when the probe never ran, or the file is absent", () => {
    expect(run(site({}))).toEqual([]);
    expect(
      run(
        site({
          llmsTxt: { url: FILE, status: 404, finalUrl: FILE, found: false, html: false, links: [] },
          robots: robots("User-agent: *\nDisallow: /raw/\n"),
        }),
      ),
    ).toEqual([]);
  });

  it("says nothing about a well-formed file whose entries all answer", () => {
    const ctx = site({
      llmsTxt: served(MARKDOWN),
      llmsTxtLinks: answers([
        [`${O}/raw/guide.md`, 200],
        [`${O}/`, 200],
      ]),
      robots: robots("User-agent: *\nAllow: /\n"),
    });
    expect(run(ctx)).toEqual([]);
  });
});

describe("a home page served at /llms.txt", () => {
  const html: LlmsTxtProbe = {
    url: FILE,
    status: 200,
    finalUrl: FILE,
    found: true,
    contentType: "text/html",
    html: true,
    links: [],
  };

  it("is left to http.not-found when the catch-all answers every dotted path", () => {
    // openfinanceguide.com, 2026-10-05. One defect, one finding — and it is
    // the one that names the cause.
    expect(run(site({ llmsTxt: html, notFound: dotted(200) }))).toEqual([]);
  });

  it("is reported once, as not an llms.txt, when other unknown paths 404", () => {
    const found = run(site({ llmsTxt: html, notFound: dotted(404) }));
    expect(found.map((f) => f.ruleId)).toEqual(["llmstxt.content-type"]);
    expect(found[0]!.message).toContain("HTML page");
    expect(found[0]!.pageUrl).toBe(FILE);
  });

  it("is reported when nothing says whether the origin has a catch-all", () => {
    expect(run(site({ llmsTxt: html })).map((f) => f.ruleId)).toEqual(["llmstxt.content-type"]);
  });
});

describe("llmstxt.content-type", () => {
  it("accepts text/plain and text/markdown", () => {
    for (const contentType of ["text/plain", "text/markdown"]) {
      expect(
        run(site({ llmsTxt: served(MARKDOWN, { contentType }) }), "llmstxt.content-type"),
      ).toEqual([]);
    }
  });

  it("flags markdown served as a page, and still reads the file", () => {
    const found = run(site({ llmsTxt: served("- [a](/a)", { contentType: "text/html" }) }));
    // The body is markdown, so the H1 rule still has something to judge.
    expect(found.map((f) => f.ruleId).sort()).toEqual([
      "llmstxt.content-type",
      "llmstxt.h1.missing",
    ]);
    expect(found.find((f) => f.ruleId === "llmstxt.content-type")!.message).toContain(
      "served with `text/html`",
    );
  });

  it("names a missing content type as such", () => {
    const found = run(
      site({ llmsTxt: served(MARKDOWN, { contentType: undefined }) }),
      "llmstxt.content-type",
    );
    expect(found[0]!.message).toContain("served with no content type");
  });
});

describe("llmstxt.h1.missing", () => {
  it("fires on a file whose first heading is an H2", () => {
    const found = run(site({ llmsTxt: served("## Docs\n- [a](/a)") }), "llmstxt.h1.missing");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("only required section");
  });
});

describe("llmstxt.unreachable", () => {
  const broken: LlmsTxtProbe = {
    url: FILE,
    status: 503,
    finalUrl: FILE,
    found: false,
    html: false,
    links: [],
  };

  it("fires on a server error at /llms.txt", () => {
    const found = run(site({ llmsTxt: broken, notFound: dotted(404) }));
    expect(found.map((f) => f.ruleId)).toEqual(["llmstxt.unreachable"]);
    expect(found[0]!.message).toContain("answered 503");
  });

  it("is left to http.not-found when every dotted path errors the same way", () => {
    // develop.openfinanceguide.com, 2026-10-05: 500 on any `.txt`.
    expect(run(site({ llmsTxt: broken, notFound: dotted(500) }))).toEqual([]);
  });

  it("stays silent on no answer at all", () => {
    expect(run(site({ llmsTxt: { ...broken, status: 0 } }))).toEqual([]);
  });
});

describe("llmstxt.link.unreachable", () => {
  it("reports the dead same-origin entries, and says when the count is a floor", () => {
    const found = run(
      site({
        llmsTxt: served(MARKDOWN),
        llmsTxtLinks: answers(
          [
            [`${O}/raw/guide.md`, 404],
            [`${O}/`, 200],
          ],
          3,
        ),
      }),
      "llmstxt.link.unreachable",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`${O}/raw/guide.md (HTTP 404)`);
    expect(found[0]!.message).toContain("1 URL `/llms.txt` lists does not answer");
    expect(found[0]!.message).toContain("3 further URLs were not checked");
    // The off-site entry was never the run's business.
    expect(found[0]!.message).not.toContain("other.org");
  });

  it("says nothing when the pass did not run", () => {
    expect(run(site({ llmsTxt: served(MARKDOWN) }), "llmstxt.link.unreachable")).toEqual([]);
  });
});

describe("llmstxt.link.blocked-by-robots", () => {
  const RAW_BLOCKED = "User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /raw/\n";

  it("catches the openfinanceguide contradiction: /raw/ listed and disallowed", () => {
    const found = run(
      site({ llmsTxt: served(MARKDOWN), robots: robots(RAW_BLOCKED) }),
      "llmstxt.link.blocked-by-robots",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`${O}/raw/guide.md (line 4: Disallow: /raw/)`);
    expect(found[0]!.message).toContain("Claude-User");
    expect(found[0]!.message).not.toContain("other.org");
  });

  it("checks the file itself", () => {
    const found = run(
      site({ llmsTxt: served("# N"), robots: robots("User-agent: *\nDisallow: /llms.txt\n") }),
      "llmstxt.link.blocked-by-robots",
    );
    expect(found[0]!.message).toContain("the file itself");
  });

  it("reads the group for `*`, not a group addressed to someone else", () => {
    const ctx = site({
      llmsTxt: served(MARKDOWN),
      robots: robots("User-agent: Googlebot\nDisallow: /raw/\n"),
    });
    expect(run(ctx, "llmstxt.link.blocked-by-robots")).toEqual([]);
  });

  it("leaves a site-wide disallow to robots.blocks-site", () => {
    const ctx = site({ llmsTxt: served(MARKDOWN), robots: robots("User-agent: *\nDisallow: /\n") });
    expect(run(ctx, "llmstxt.link.blocked-by-robots")).toEqual([]);
  });
});
