/**
 * `sitemap.orphans`, and the pages it has no business counting.
 *
 * The rule's claim is narrow: a page that asks to be indexed, measured against
 * every sitemap the site declares, read in full, is missing from them. Each
 * case below is a way that claim used to be made about something else — a page
 * that names another URL as the one to index, a page the sitemap does reach
 * through a redirect, an inventory goflag only read part of.
 * `test/integration/sitemap-orphans.test.ts` runs the same cases against a real
 * server; the cut at the 5,000-entry cap is only here, because a fixture built
 * to cross it is a fixture nobody runs.
 *
 * `sitemap.entry.non-canonical` is tested here too, because the two rules share
 * one test for "this page names another as canonical", and the last block holds
 * them to it: whatever a page declares, and whether or not the sitemap lists it,
 * at most one of the two may name it.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import type { SiteDiscovery } from "../core/sitemap/types";
import type { Page, RobotsProbe, SitemapEntryProbe } from "../core/types";
import { getSiteRule } from "./site-rules";
import type { SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const ORPHANS = getSiteRule("sitemap.orphans");
const NON_CANONICAL = getSiteRule("sitemap.entry.non-canonical");
if (!ORPHANS || !NON_CANONICAL) throw new Error("a sitemap rule under test is not registered");

const O = "https://x.com";

function page(path: string, head = "", headers: Record<string, string> = {}): Page {
  return pageFromHtml(`<html><head><title>t</title>${head}</head><body>b</body></html>`, {
    url: `${O}${path}`,
    headers,
  });
}

/** A page the crawl asked for at one URL and was served at another. */
function reachedThrough(requested: string, served: Page): Page {
  return { ...served, fetch: { ...served.fetch, requestedUrl: `${O}${requested}` } };
}

function canonical(href: string) {
  return `<link rel="canonical" href="${href.startsWith("http") ? href : `${O}${href}`}">`;
}

function discovery(paths: string[], overrides: Partial<SiteDiscovery> = {}): SiteDiscovery {
  return {
    origin: O,
    baseUrl: O,
    source: "well-known",
    urls: paths.map((p) => ({ loc: `${O}${p}` })),
    documents: [
      {
        url: `${O}/sitemap.xml`,
        status: 200,
        byteLength: 400,
        gzipped: false,
        kind: "urlset",
        childLocs: [],
        urlCount: paths.length,
        declaredInRobots: false,
      },
    ],
    truncated: false,
    diagnostics: {
      found: true,
      status: 200,
      declaredInRobots: false,
      robotsFound: false,
      atWellKnownPath: true,
      wellFormed: true,
      isIndex: false,
      childSitemapCount: 0,
      childSitemapErrors: 0,
      urlCount: paths.length,
      warnings: [],
      sitemapUrl: `${O}/sitemap.xml`,
    },
    ...overrides,
  };
}

function robotsDeclaring(...declared: string[]): RobotsProbe {
  return {
    url: `${O}/robots.txt`,
    status: 200,
    found: true,
    byteLength: 100,
    redirects: { count: 0, finalUrl: `${O}/robots.txt`, crossOrigin: false },
    groups: [],
    sitemaps: declared.map((path, i) => ({ value: `${O}${path}`, line: i + 1 })),
    invalidLines: [],
    unknownDirectives: [],
  };
}

interface ContextOptions {
  /** What the probe pass answered. `null` for a run where it never ran. */
  probes?: SitemapEntryProbe[] | null;
  robots?: RobotsProbe;
}

function context(pages: Page[], sitemap: SiteDiscovery, options: ContextOptions = {}): SiteContext {
  const probes = options.probes === undefined ? [] : options.probes;
  return {
    origin: O,
    pages,
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: ["en"], source: "sitemap", multilingual: false, candidates: [] },
    discovery: sitemap,
    robots: options.robots,
    ...(probes === null
      ? {}
      : { sitemapEntries: { byUrl: new Map(probes.map((p) => [p.url, p])), unprobed: 0 } }),
  };
}

function probe(path: string, landsOn?: string): SitemapEntryProbe {
  return {
    url: `${O}${path}`,
    status: 200,
    via: "probe",
    finalUrl: `${O}${landsOn ?? path}`,
    redirected: landsOn !== undefined,
  };
}

function orphans(ctx: SiteContext) {
  return lintSite(ctx, [ORPHANS!]);
}

function nonCanonical(ctx: SiteContext) {
  return lintSite(ctx, [NON_CANONICAL!]);
}

const home = page("/");

describe("sitemap.orphans", () => {
  it("counts a page that asks to be indexed and that no sitemap lists", () => {
    const found = orphans(context([home, page("/forgotten")], discovery(["/"])));

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1 crawled page asks to be indexed");
    expect(found[0]!.message).toContain(`${O}/forgotten`);
    expect(found[0]!.severity).toBe("warning");
    expect(found[0]!.pageUrl).toBe(`${O}/sitemap.xml`);
  });

  it("counts several in one finding, in the plural", () => {
    const found = orphans(context([home, page("/a"), page("/b"), page("/c")], discovery(["/"])));

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("3 crawled pages ask to be indexed and are absent");
    expect(found[0]!.message).toContain("will never see them");
  });

  it("leaves out a page that asks not to be, by meta tag or by header", () => {
    const found = orphans(
      context(
        [
          home,
          page("/meta", `<meta name="robots" content="noindex">`),
          page("/header", "", { "x-robots-tag": "noindex, nofollow" }),
        ],
        discovery(["/"]),
      ),
    );

    expect(found).toEqual([]);
  });

  it("leaves out a page whose canonical names another URL", () => {
    // Listing it is what `sitemap.entry.non-canonical` warns about. Counting it
    // here too left a site no answer that satisfied both rules.
    const found = orphans(
      context(
        [home, page("/syndicated", canonical("https://publisher.example/a"))],
        discovery(["/"]),
      ),
    );

    expect(found).toEqual([]);
  });

  it("still counts a page whose canonical names itself, trailing slash and all", () => {
    // The exclusion is for a page that disclaims itself. A self-canonical that
    // differs only by the slash is the same page, and dropping it would trade a
    // false positive for a missed one.
    const found = orphans(
      context([home, page("/forgotten", canonical("/forgotten/"))], discovery(["/"])),
    );

    expect(found).toHaveLength(1);
  });

  it("matches the sitemap by page, not by spelling", () => {
    // A trailing slash and a fragment do not make a different page.
    const found = orphans(context([home, page("/about")], discovery(["/", "/about/#team"])));

    expect(found).toEqual([]);
  });

  it("says nothing when every crawled page is listed", () => {
    expect(orphans(context([home, page("/a")], discovery(["/", "/a"])))).toEqual([]);
  });
});

describe("sitemap.orphans and the sitemaps it did not read", () => {
  it("renders no verdict on a sitemap cut at a cap", () => {
    // Past the cut, a listed page and an unlisted one look the same.
    const found = orphans(
      context([home, page("/forgotten")], discovery(["/"], { truncated: true })),
    );

    expect(found).toEqual([]);
  });

  it("renders no verdict when a child sitemap yielded no urlset", () => {
    const cut = discovery(["/"]);
    const found = orphans(
      context([home, page("/forgotten")], {
        ...cut,
        diagnostics: {
          ...cut.diagnostics,
          isIndex: true,
          childSitemapCount: 2,
          childSitemapErrors: 1,
        },
      }),
    );

    expect(found).toEqual([]);
  });

  it("renders no verdict when robots.txt declares a sitemap discovery did not read", () => {
    // Discovery stops at the first declared sitemap that parses; a search
    // engine reads every `Sitemap:` line. `/forgotten` may well be in the other.
    const found = orphans(
      context([home, page("/forgotten")], discovery(["/"]), {
        robots: robotsDeclaring("/sitemap.xml", "/posts.xml"),
      }),
    );

    expect(found).toEqual([]);
  });

  it("judges once every sitemap robots.txt declares was read", () => {
    const found = orphans(
      context([home, page("/forgotten")], discovery(["/"]), {
        robots: robotsDeclaring("/sitemap.xml"),
      }),
    );

    expect(found).toHaveLength(1);
  });
});

describe("sitemap.orphans and the entries that redirect", () => {
  it("counts the page an entry lands on as listed, when the probe pass followed it", () => {
    // The redirect is `sitemap.entry.redirects`'s finding. The page behind it is
    // named by the sitemap, just through one hop too many.
    const found = orphans(
      context([home, page("/landed")], discovery(["/", "/moved"]), {
        probes: [probe("/moved", "/landed")],
      }),
    );

    expect(found).toEqual([]);
  });

  it("counts it as listed when the crawl itself reached the page through the entry", () => {
    // The probe pass has a budget, and skips what the crawl already answered.
    // A page the crawl asked for at `/moved` and was served at `/landed` says
    // where that entry leads without a second request.
    const found = orphans(
      context([home, reachedThrough("/moved", page("/landed"))], discovery(["/", "/moved"]), {
        probes: [],
      }),
    );

    expect(found).toEqual([]);
  });

  it("does not take a redirect from an unlisted URL for a listing", () => {
    const found = orphans(
      context([home, reachedThrough("/old-path", page("/landed"))], discovery(["/"])),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`${O}/landed`);
  });

  it("does not take a probed entry that did not redirect for a listing of anything else", () => {
    const found = orphans(
      context([home, page("/forgotten")], discovery(["/", "/moved"]), {
        probes: [probe("/moved")],
      }),
    );

    expect(found).toHaveLength(1);
  });
});

describe("sitemap.orphans and the entries nothing followed", () => {
  it("adds no note when every entry was crawled or probed", () => {
    const [finding] = orphans(
      context([home, page("/forgotten")], discovery(["/", "/moved"]), {
        probes: [probe("/moved", "/elsewhere")],
      }),
    );

    expect(finding!.message).not.toContain("ceiling");
  });

  it("says the count is a ceiling when one entry was never fetched", () => {
    // That entry may redirect to `/forgotten`, which would make it listed.
    const [finding] = orphans(
      context([home, page("/forgotten")], discovery(["/", "/unseen"]), { probes: [] }),
    );

    expect(finding!.message).toContain(
      "1 sitemap entry was not fetched, and a page one of them redirects to would be counted here — this count is a ceiling, not a total.",
    );
  });

  it("counts every entry nothing fetched, in the plural", () => {
    const [finding] = orphans(
      context([home, page("/forgotten")], discovery(["/", "/u1", "/u2", "/u3"]), {
        probes: [],
      }),
    );

    expect(finding!.message).toContain("3 sitemap entries were not fetched");
  });

  it("does not count an entry the probe pass answered without a redirect", () => {
    // It was fetched, and it leads nowhere else: nothing about it is unknown.
    const [finding] = orphans(
      context([home, page("/forgotten")], discovery(["/", "/probed"]), {
        probes: [probe("/probed")],
      }),
    );

    expect(finding!.message).toContain(`${O}/forgotten`);
    expect(finding!.message).not.toContain("ceiling");
  });

  it("does not count an entry the crawl followed through a redirect", () => {
    const [finding] = orphans(
      context(
        [home, reachedThrough("/moved", page("/landed")), page("/forgotten")],
        discovery(["/", "/moved"]),
        { probes: [] },
      ),
    );

    expect(finding!.message).toContain(`${O}/forgotten`);
    expect(finding!.message).not.toContain("ceiling");
  });

  it("does not count an entry the crawl reached under another spelling", () => {
    const [finding] = orphans(
      context([home, page("/about"), page("/forgotten")], discovery(["/", "/about/"]), {
        probes: [],
      }),
    );

    expect(finding!.message).not.toContain("ceiling");
  });

  it("treats a run with no probe pass as one where nothing beyond the crawl was followed", () => {
    const [finding] = orphans(
      context([home, page("/forgotten")], discovery(["/", "/unseen"]), { probes: null }),
    );

    expect(finding!.message).toContain("1 sitemap entry was not fetched");
  });

  it("owes no note when there is no finding to qualify", () => {
    expect(orphans(context([home], discovery(["/", "/u1", "/u2"]), { probes: [] }))).toEqual([]);
  });
});

describe("sitemap.entry.non-canonical", () => {
  it("flags a listed page whose canonical names another page of the site", () => {
    const found = nonCanonical(
      context([home, page("/a", canonical("/b"))], discovery(["/", "/a"])),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`${O}/a → ${O}/b`);
    expect(found[0]!.severity).toBe("warning");
  });

  it("flags a listed page whose canonical names another origin", () => {
    const found = nonCanonical(
      context(
        [home, page("/syndicated", canonical("https://publisher.example/a"))],
        discovery(["/", "/syndicated"]),
      ),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("https://publisher.example/a");
  });

  it("says nothing of a self-canonical, trailing slash and all", () => {
    expect(
      nonCanonical(context([home, page("/a", canonical("/a/"))], discovery(["/", "/a"]))),
    ).toEqual([]);
  });

  it("says nothing of a listed page that declares no canonical", () => {
    expect(nonCanonical(context([home, page("/a")], discovery(["/", "/a"])))).toEqual([]);
  });

  it("says nothing of a listed URL the crawl never fetched", () => {
    // No page, no canonical to have seen — assuming one either way would invent
    // a finding or hide one.
    expect(nonCanonical(context([home], discovery(["/", "/a"])))).toEqual([]);
  });

  it("says nothing of an unlisted page, whatever its canonical says", () => {
    expect(nonCanonical(context([home, page("/a", canonical("/b"))], discovery(["/"])))).toEqual(
      [],
    );
  });
});

describe("the two rules, on one page", () => {
  // Every combination a page can present: listed or not, and a canonical that
  // is missing, names the page itself, or names another URL. Whatever the site
  // does, it must have an answer that satisfies both rules — so no page may be
  // named by both, and the listed variant and the unlisted self-canonical must
  // each be named by exactly the one rule that owns them.
  const declarations = {
    none: "",
    self: canonical("/p"),
    selfWithSlash: canonical("/p/"),
    sameOrigin: canonical("/other"),
    otherOrigin: canonical("https://publisher.example/p"),
  } as const;

  for (const listed of [true, false]) {
    for (const [name, head] of Object.entries(declarations)) {
      const elsewhere = name === "sameOrigin" || name === "otherOrigin";

      it(`${listed ? "listed" : "unlisted"}, canonical ${name}`, () => {
        const ctx = context([home, page("/p", head)], discovery(listed ? ["/", "/p"] : ["/"]));
        const namedByOrphans = orphans(ctx).some((f) => f.message.includes(`${O}/p\``));
        const namedByNonCanonical = nonCanonical(ctx).some((f) => f.message.includes(`${O}/p →`));

        expect(namedByOrphans && namedByNonCanonical).toBe(false);
        expect(namedByNonCanonical).toBe(listed && elsewhere);
        expect(namedByOrphans).toBe(!listed && !elsewhere);
      });
    }
  }
});

const NOINDEX_RULE = getSiteRule("sitemap.entry.noindex");
if (!NOINDEX_RULE) throw new Error("sitemap.entry.noindex is not registered");

function noindexRule(ctx: SiteContext) {
  return lintSite(ctx, [NOINDEX_RULE!]);
}

describe("what counts as asking not to be indexed", () => {
  // One table, read by both rules that ask: an unlisted page is left out of
  // `sitemap.orphans` exactly when it says `noindex`, and a listed one is
  // flagged by `sitemap.entry.noindex` exactly then too.
  const cases: Array<{ says: string; head?: string; header?: string; noindex: boolean }> = [
    { says: "meta robots noindex", head: `<meta name="robots" content="noindex">`, noindex: true },
    {
      says: "meta robots in capitals",
      head: `<meta name="robots" content="NOINDEX">`,
      noindex: true,
    },
    { says: "meta robots none", head: `<meta name="robots" content="none">`, noindex: true },
    {
      says: "meta googlebot noindex",
      head: `<meta name="googlebot" content="noindex">`,
      noindex: true,
    },
    { says: "meta googlebot none", head: `<meta name="googlebot" content="none">`, noindex: true },
    { says: "header noindex", header: "noindex", noindex: true },
    { says: "header none", header: "none", noindex: true },
    { says: "header scoped to googlebot", header: "googlebot: noindex", noindex: true },
    { says: "header scoped without a space", header: "googlebot:noindex", noindex: true },
    {
      says: "header scoped to another crawler",
      header: "otherbot: noindex, nofollow",
      noindex: true,
    },
    {
      says: "two headers joined, the second one noindex",
      header: "bingbot: nofollow, googlebot: noindex",
      noindex: true,
    },
    {
      says: "meta robots index, follow",
      head: `<meta name="robots" content="index, follow">`,
      noindex: false,
    },
    {
      says: "meta googlebot nosnippet",
      head: `<meta name="googlebot" content="nosnippet">`,
      noindex: false,
    },
    { says: "header scoped nofollow", header: "googlebot: nofollow", noindex: false },
    {
      says: "header with valued directives",
      header: "max-snippet: 20, max-image-preview: large",
      noindex: false,
    },
    {
      says: "header unavailable_after with a date",
      header: "unavailable_after: 25 Jun 2010 15:00:00 PST",
      noindex: false,
    },
    {
      says: "header naming a crawler and a valued directive",
      header: "googlebot: max-snippet: 0",
      noindex: false,
    },
    { says: "nothing at all", noindex: false },
  ];

  for (const c of cases) {
    const p = page("/p", c.head ?? "", c.header ? { "x-robots-tag": c.header } : {});

    it(`${c.says}: ${c.noindex ? "left out of" : "counted by"} sitemap.orphans`, () => {
      const named = orphans(context([home, p], discovery(["/"]))).some((f) =>
        f.message.includes(`${O}/p\``),
      );
      expect(named).toBe(!c.noindex);
    });

    it(`${c.says}: ${c.noindex ? "flagged" : "not flagged"} by sitemap.entry.noindex when listed`, () => {
      expect(noindexRule(context([home, p], discovery(["/", "/p"])))).toHaveLength(
        c.noindex ? 1 : 0,
      );
    });
  }
});

describe("canonical variants the audit set aside", () => {
  // `dropCanonicalDuplicates` takes `/a?ref=x` out of `pages` as soon as `/a`
  // is crawled, and hands it over as a variant. The sitemap rules that ask what
  // a listed URL serves must still see it.
  const target = page("/a");
  const variant = page("/a?ref=x", canonical("/a"));

  function withVariants(ctx: SiteContext, variants: Page[]): SiteContext {
    return { ...ctx, variants };
  }

  it("lets sitemap.entry.non-canonical flag a listed variant — its own example", () => {
    const found = nonCanonical(
      withVariants(context([home, target], discovery(["/", "/a", "/a?ref=x"])), [variant]),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(
      "1 sitemap entry names a page whose canonical points elsewhere",
    );
    expect(found[0]!.message).toContain(`${O}/a?ref=x → ${O}/a`);
  });

  it("puts two in the plural", () => {
    const other = page("/a?ref=y", canonical("/a"));
    const found = nonCanonical(
      withVariants(context([home, target], discovery(["/", "/a", "/a?ref=x", "/a?ref=y"])), [
        variant,
        other,
      ]),
    );

    expect(found[0]!.message).toContain(
      "2 sitemap entries name pages whose canonicals point elsewhere",
    );
  });

  it("lets sitemap.entry.noindex flag a listed variant that says noindex", () => {
    const hidden = page("/a?print=1", `${canonical("/a")}<meta name="robots" content="noindex">`);
    expect(
      noindexRule(
        withVariants(context([home, target], discovery(["/", "/a", "/a?print=1"])), [hidden]),
      ),
    ).toHaveLength(1);
  });

  it("never lets sitemap.orphans count a variant", () => {
    expect(
      orphans(withVariants(context([home, target], discovery(["/", "/a"])), [variant])),
    ).toEqual([]);
  });

  it("counts a listed variant as fetched, not as an entry nothing followed", () => {
    const [finding] = orphans(
      withVariants(
        context([home, target, page("/forgotten")], discovery(["/", "/a", "/a?ref=x"]), {
          probes: [],
        }),
        [variant],
      ),
    );

    expect(finding!.message).not.toContain("ceiling");
  });
});

describe("the canonical a page names, when nobody audited it", () => {
  it("counts an unlisted target on the same origin, and says which page named it", () => {
    const found = orphans(
      context([home, page("/guide?tab=api", canonical("/guide"))], discovery(["/"])),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe(
      `1 URL that crawled pages name as their canonical is absent from the sitemap, and was not audited: \`${O}/guide (canonical of ${O}/guide?tab=api)\`. A consumer that reads the sitemap rather than following links will never see it.`,
    );
  });

  it("does not count a target the sitemap lists", () => {
    expect(
      orphans(
        context([home, page("/guide?tab=api", canonical("/guide"))], discovery(["/", "/guide"])),
      ),
    ).toEqual([]);
  });

  it("does not count a target the sitemap reaches through a redirect", () => {
    expect(
      orphans(
        context([home, page("/guide?tab=api", canonical("/guide"))], discovery(["/", "/old"]), {
          probes: [probe("/old", "/guide")],
        }),
      ),
    ).toEqual([]);
  });

  it("does not count a target on another origin", () => {
    expect(
      orphans(
        context(
          [home, page("/syndicated", canonical("https://publisher.example/a"))],
          discovery(["/"]),
        ),
      ),
    ).toEqual([]);
  });

  it("does not count a target the crawl fetched — that one is judged as a page", () => {
    // Here `/guide` is itself unlisted, so it is counted once, as a crawled
    // page, and not a second time as somebody's canonical.
    const found = orphans(
      context(
        [home, page("/guide"), page("/guide?tab=api", canonical("/guide"))],
        discovery(["/"]),
      ),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1 crawled page asks to be indexed");
    expect(found[0]!.message).not.toContain("canonical of");
  });

  it("counts a target named by several pages once, with the first that named it", () => {
    const found = orphans(
      context(
        [
          home,
          page("/guide?tab=api", canonical("/guide")),
          page("/guide?tab=cli", canonical("/guide")),
        ],
        discovery(["/"]),
      ),
    );

    expect(found[0]!.message).toContain("1 URL that crawled pages name as their canonical");
    expect(found[0]!.message).toContain(`(canonical of ${O}/guide?tab=api)`);
    expect(found[0]!.message).not.toContain("tab=cli");
  });

  it("does not count the target of a page that asks not to be indexed", () => {
    expect(
      orphans(
        context(
          [home, page("/print", `${canonical("/guide")}<meta name="robots" content="noindex">`)],
          discovery(["/"]),
        ),
      ),
    ).toEqual([]);
  });

  it("joins both counts in one finding when there are both", () => {
    const found = orphans(
      context(
        [home, page("/forgotten"), page("/guide?tab=api", canonical("/guide"))],
        discovery(["/"]),
      ),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(
      "1 crawled page asks to be indexed and is absent from the sitemap",
    );
    expect(found[0]!.message).toContain(
      "1 URL that crawled pages name as their canonical is absent from it too, and was not audited",
    );
    expect(found[0]!.message).toContain("will never see them.");
  });

  it("puts several targets in the plural", () => {
    const found = orphans(
      context(
        [home, page("/a?x=1", canonical("/a")), page("/b?x=1", canonical("/b"))],
        discovery(["/"]),
      ),
    );

    expect(found[0]!.message).toContain(
      "2 URLs that crawled pages name as their canonical are absent from the sitemap, and were not audited",
    );
  });

  it("still carries the ceiling when entries were never fetched", () => {
    const [finding] = orphans(
      context([home, page("/guide?tab=api", canonical("/guide"))], discovery(["/", "/unseen"]), {
        probes: [],
      }),
    );

    expect(finding!.message).toContain("this count is a ceiling");
  });
});
