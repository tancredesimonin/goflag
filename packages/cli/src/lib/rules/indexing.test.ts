/**
 * `--expect-indexing`, and the three rules that exist only because of it.
 *
 * The declaration moves what the audit looks for rather than switching it off, so
 * most of what is asserted is the pairing: a finding going away, and the question
 * it was hiding being asked in its place. Unset, nothing here may fire and the two
 * rules that read it must answer exactly as they did.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import { parseRobots } from "../core/robots/parse";
import type { Page, RobotsProbe } from "../core/types";
import { getSiteRule, SITE_RULES } from "./site-rules";
import type { ExpectIndexing, SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const O = "https://x.com";
const NOINDEX = '<meta name="robots" content="noindex">';
const INDEX = '<meta name="robots" content="index, follow">';
const BLOCK_ALL = "User-agent: *\nDisallow: /\n";
const ALLOW_ALL = "User-agent: *\nAllow: /\n";

function served(body: string): RobotsProbe {
  return {
    url: `${O}/robots.txt`,
    status: 200,
    found: true,
    byteLength: Buffer.byteLength(body),
    redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
    ...parseRobots(body),
  };
}

function page(path: string, head = "", headers: Record<string, string> = {}): Page {
  return pageFromHtml(`<html><head><title>t</title>${head}</head><body></body></html>`, {
    url: path.startsWith("http") ? path : `${O}${path}`,
    headers,
  });
}

/** A page reached by asking for `from`, as a redirect leaves it. */
function redirected(from: string, to: string, head = ""): Page {
  const reached = page(to, head);

  return { ...reached, fetch: { ...reached.fetch, requestedUrl: `${O}${from}` } };
}

function run(
  expectIndexing: ExpectIndexing | undefined,
  pages: Page[],
  robots: string | undefined,
  locales: string[] = [],
  source: "explicit" | "sitemap" = "explicit",
  entryUrl = `${O}/`,
) {
  const site: SiteContext = {
    origin: O,
    entryUrl,
    pages,
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales, source, multilingual: locales.length > 1, candidates: [] },
    ...(robots === undefined ? {} : { robots: served(robots) }),
    ...(expectIndexing ? { expectIndexing } : {}),
  };
  return lintSite(site, SITE_RULES);
}

const found = (issues: ReturnType<typeof run>, id: string) =>
  issues.filter((issue) => issue.ruleId === id);

describe("registered with sources", () => {
  it.each([
    ["indexing.not-excluded", "error"],
    ["indexing.blocked-url-indexable", "warning"],
    ["indexing.site-blocked", "error"],
    ["indexing.site-excluded", "error"],
  ])("%s at %s, vendor-spec", (id, severity) => {
    const rule = getSiteRule(id);

    expect(rule?.severity).toBe(severity);
    expect(rule?.rigor).toBe("vendor-spec");
    expect(rule?.sources?.length).toBeGreaterThan(0);
  });
});

describe("with nothing declared", () => {
  it("fires none of the three, on any shape of site", () => {
    for (const [pages, robots] of [
      [[page("/")], ALLOW_ALL],
      [[page("/")], BLOCK_ALL],
      [[page("/", NOINDEX)], ALLOW_ALL],
    ] as const) {
      expect(
        run(undefined, [...pages], robots).filter((issue) => issue.ruleId.startsWith("indexing.")),
      ).toEqual([]);
    }
  });

  it("leaves `robots.blocks-site` the warning it was", () => {
    const [issue] = found(run(undefined, [page("/")], BLOCK_ALL), "robots.blocks-site");

    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("staging or preview");
  });
});

describe("--expect-indexing no", () => {
  it("stops reporting the whole-site block", () => {
    expect(found(run("no", [page("/", NOINDEX)], BLOCK_ALL), "robots.blocks-site")).toEqual([]);
  });

  it("keeps it when a page asks to be indexed, which no declaration explains", () => {
    const [issue] = found(run("no", [page("/", INDEX)], BLOCK_ALL), "robots.blocks-site");

    expect(issue?.severity).toBe("error");
  });

  it("is clean when every page can be crawled and says noindex", () => {
    const issues = run("no", [page("/", NOINDEX), page("/a", NOINDEX)], ALLOW_ALL);

    expect(found(issues, "indexing.not-excluded")).toEqual([]);
    expect(found(issues, "indexing.blocked-url-indexable")).toEqual([]);
  });

  it("reads the X-Robots-Tag header as well as the meta tag", () => {
    const issues = run("no", [page("/", "", { "x-robots-tag": "noindex, nofollow" })], ALLOW_ALL);

    expect(found(issues, "indexing.not-excluded")).toEqual([]);
  });

  it("errors on a page free to be indexed, which is the leak", () => {
    const issues = found(
      run("no", [page("/", NOINDEX), page("/leak")], ALLOW_ALL),
      "indexing.not-excluded",
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.pageUrl).toBe(`${O}/leak`);
  });

  it("reports each open page, so a host opening up behind an accepted one is new", () => {
    // The gate matches by identity. One aggregate finding would hold it for ever.
    const issues = found(run("no", [page("/a"), page("/b")], ALLOW_ALL), "indexing.not-excluded");

    expect(issues.map((issue) => issue.pageUrl)).toEqual([`${O}/a`, `${O}/b`]);
  });

  it("does not count a noindex addressed to another crawler as excluded from Google", () => {
    for (const header of ["bingbot: noindex", "bingbot: noarchive, noindex", "otherbot: none"]) {
      const issues = run("no", [page("/", "", { "x-robots-tag": header })], ALLOW_ALL);

      expect(found(issues, "indexing.not-excluded"), header).toHaveLength(1);
    }
  });

  it("counts a noindex addressed to Googlebot, or to nobody", () => {
    for (const header of [
      "googlebot: noindex",
      "GoogleBot: nofollow, noindex",
      "bingbot: nofollow, googlebot: noindex",
      "max-snippet: 0, noindex",
    ]) {
      const issues = run("no", [page("/", "", { "x-robots-tag": header })], ALLOW_ALL);

      expect(found(issues, "indexing.not-excluded"), header).toEqual([]);
    }
  });

  it("does not read `max-image-preview: none` as a noindex", () => {
    const issues = run(
      "no",
      [page("/", "", { "x-robots-tag": "max-image-preview: none" })],
      ALLOW_ALL,
    );

    expect(found(issues, "indexing.not-excluded")).toHaveLength(1);
  });

  it("says nothing of a page a redirect left on another host", () => {
    // An SSO-gated staging host: this origin's robots.txt says nothing about that one.
    const issues = run("no", [page("https://sso.example.org/login")], BLOCK_ALL);

    expect(found(issues, "indexing.not-excluded")).toEqual([]);
    expect(found(issues, "indexing.blocked-url-indexable")).toEqual([]);
  });

  it("errors too on a site with no robots.txt to block anything", () => {
    expect(found(run("no", [page("/")], undefined), "indexing.not-excluded")).toHaveLength(1);
  });

  it("warns on a blocked page, whose noindex Googlebot cannot read", () => {
    const issues = run("no", [page("/", NOINDEX), page("/a", NOINDEX)], BLOCK_ALL);
    const [issue] = found(issues, "indexing.blocked-url-indexable");

    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("2 pages");
    expect(issue?.message).toContain("All of them say `noindex`");
    expect(found(issues, "indexing.not-excluded")).toEqual([]);
  });

  it("warns on a blocked page with no noindex, rather than calling it free", () => {
    const issues = run("no", [page("/")], BLOCK_ALL);
    const [issue] = found(issues, "indexing.blocked-url-indexable");

    expect(issue?.message).toContain("It does not say `noindex`");
    expect(found(issues, "indexing.not-excluded")).toEqual([]);
  });

  it("decides for Googlebot, not for `*`", () => {
    // Googlebot's own group lets it in, whatever `*` says, and a block addressed
    // to everyone else keeps nothing out of Google.
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n";

    expect(found(run("no", [page("/")], robots), "indexing.not-excluded")).toHaveLength(1);
    expect(found(run("no", [page("/")], robots), "indexing.blocked-url-indexable")).toEqual([]);
  });

  it("sorts a partial block page by page", () => {
    const issues = run(
      "no",
      [page("/private/a", NOINDEX), page("/public"), page("/fine", NOINDEX)],
      "User-agent: *\nDisallow: /private/\n",
    );

    expect(found(issues, "indexing.blocked-url-indexable")[0]?.message).toContain("/private/a");
    expect(found(issues, "indexing.blocked-url-indexable")[0]?.message).toContain("It says");
    expect(found(issues, "indexing.not-excluded").map((issue) => issue.pageUrl)).toEqual([
      `${O}/public`,
    ]);
  });
});

describe("how a blocked page is worded", () => {
  const worded = (pages: Page[]) =>
    found(run("no", pages, BLOCK_ALL), "indexing.blocked-url-indexable")[0]?.message;

  it("counts the pages that say noindex when only some do", () => {
    expect(worded([page("/a", NOINDEX), page("/b")])).toContain("1 of them says");
    expect(worded([page("/a", NOINDEX), page("/b", NOINDEX), page("/c")])).toContain(
      "2 of them say `noindex`",
    );
  });

  it("says when none of several does", () => {
    expect(worded([page("/a"), page("/b")])).toContain("None of them says");
  });
});

describe("--expect-indexing yes", () => {
  it("gives a quiet whole-site block a rule of its own, at error", () => {
    // Its own rule because `robots.blocks-site` raised would keep its identity, and
    // a baseline captured on a staging host would wave the outage through as known.
    const issues = run("yes", [page("/")], BLOCK_ALL);
    const [issue] = found(issues, "indexing.site-blocked");

    expect(found(issues, "robots.blocks-site")).toEqual([]);
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("`Disallow: /` (line 2)");
  });

  it("reports a block addressed to Googlebot alone", () => {
    expect(
      found(
        run("yes", [page("/")], "User-agent: Googlebot\nDisallow: /\n"),
        "indexing.site-blocked",
      ),
    ).toHaveLength(1);
  });

  it("keeps `robots.blocks-site` for a page asking to be indexed, alongside", () => {
    const issues = run("yes", [page("/", INDEX)], BLOCK_ALL);

    expect(found(issues, "robots.blocks-site")[0]?.severity).toBe("error");
    expect(found(issues, "indexing.site-blocked")).toHaveLength(1);
  });

  it("is clean on a site that is simply open", () => {
    const issues = run("yes", [page("/"), page("/a")], ALLOW_ALL);

    expect(found(issues, "indexing.site-excluded")).toEqual([]);
    expect(found(issues, "indexing.site-blocked")).toEqual([]);
  });

  it("leaves a noindex on an ordinary page alone, as production may have one", () => {
    const issues = run("yes", [page("/"), page("/thanks", NOINDEX)], ALLOW_ALL);

    expect(found(issues, "indexing.site-excluded")).toEqual([]);
  });

  it("errors on a noindex on the home page", () => {
    const [issue] = found(
      run("yes", [page("/", NOINDEX), page("/a")], ALLOW_ALL),
      "indexing.site-excluded",
    );

    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("The home page says");
    expect(issue?.pageUrl).toBe(`${O}/`);
  });

  it("counts a locale's root as a home page, only when the operator named that locale", () => {
    // A sitemap-read axis takes `/cv` and `/faq` for locales, and a noindex there
    // is an ordinary page's.
    const pages = [page("/fr", NOINDEX), page("/fr/a"), page("/en")];
    const site = (source: "explicit" | "sitemap") =>
      found(run("yes", pages, ALLOW_ALL, ["en", "fr"], source), "indexing.site-excluded");

    expect(site("explicit")).toHaveLength(1);
    expect(site("sitemap")).toEqual([]);
    expect(found(run("yes", pages, ALLOW_ALL), "indexing.site-excluded")).toEqual([]);
  });

  it("follows the home page through a redirect, wherever it lands", () => {
    for (const to of ["/fr", "/en/home", "/pt_BR"]) {
      const issues = run("yes", [redirected("/", to, NOINDEX), page("/other")], ALLOW_ALL);

      expect(found(issues, "indexing.site-excluded"), to).toHaveLength(1);
    }
  });

  it("takes the page the audit started from as the front door", () => {
    const issues = run(
      "yes",
      [page("/app", NOINDEX), page("/app/about")],
      ALLOW_ALL,
      [],
      "explicit",
      `${O}/app`,
    );

    expect(found(issues, "indexing.site-excluded")).toHaveLength(1);
  });

  it("does not take a query string on a root for the home page", () => {
    // `/?s=foo` is the search result production may exclude.
    const issues = run("yes", [page("/"), page("/?s=foo", NOINDEX)], ALLOW_ALL, ["fr"]);

    expect(found(issues, "indexing.site-excluded")).toEqual([]);
    expect(
      found(
        run("yes", [page("/fr"), page("/fr?sort=x", NOINDEX), page("/")], ALLOW_ALL, ["fr"]),
        "indexing.site-excluded",
      ),
    ).toEqual([]);
  });

  it("does not take a noindex for another crawler as Google dropping the page", () => {
    const issues = run(
      "yes",
      [page("/", "", { "x-robots-tag": "bingbot: noindex" }), page("/a")],
      ALLOW_ALL,
    );

    expect(found(issues, "indexing.site-excluded")).toEqual([]);
  });

  it("errors on each page when every one says noindex, whichever they are", () => {
    const issues = found(
      run(
        "yes",
        [page("/x/a", NOINDEX), page("/x/b", "", { "x-robots-tag": "none" })],
        ALLOW_ALL,
        [],
        "explicit",
        `${O}/x/`,
      ),
      "indexing.site-excluded",
    );

    expect(issues.map((issue) => issue.pageUrl)).toEqual([`${O}/x/a`, `${O}/x/b`]);
    expect(issues[0]?.message).toContain("All 2 crawled pages say");
  });

  it("stays silent with nothing crawled", () => {
    expect(found(run("yes", [], ALLOW_ALL), "indexing.site-excluded")).toEqual([]);
  });
});
