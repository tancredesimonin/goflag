import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { discoverSitemap } from "@/lib/core/sitemap/discover";
import type { SiteDiscovery } from "@/lib/core/sitemap/types";
import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * The sitemap document tree, against a real server.
 *
 * G.3 shipped with unit tests over hand-built `SitemapDocument` objects, which
 * proved the rules' arithmetic and nothing about whether discovery ever hands
 * them a tree. That gap is what this file closes: every number below comes off
 * the wire.
 *
 * The fixture is the one `docs/sitemap-robots-plan.md` §7 asks for under its
 * exit criteria — an index with a broken child, a nested index, and a child
 * that overreaches its own directory:
 *
 *   /sitemap.xml          index → catalog/sitemap.xml, missing.xml, nested.xml
 *   /catalog/sitemap.xml  urlset → /catalog/hammer, /catalog/anvil, /images/forge
 *   /missing.xml          404
 *   /nested.xml           index → an index inside an index
 *
 * **Two layers, asserted separately and on purpose.** The tree is internal: the
 * report keeps `diagnostics.sitemap` in its summarized shape, as §6 of the plan
 * requires, so `runAudit` is the wrong place to look for a document list. The
 * first block below calls discovery directly; the second checks that the
 * findings reach a report.
 *
 * `sitemap.limits.exceeded` is deliberately not exercised end to end. Its
 * thresholds are 50,000 entries and 50 MB, and a fixture built to cross either
 * is a fixture nobody runs; its arithmetic lives in
 * `src/lib/rules/sitemap-documents.test.ts`. What it is owed here instead is
 * evidence that the two fields it reads — `urlCount` and `byteLength` — arrive
 * populated from a real fetch rather than defaulting to zero, which is the way
 * that rule would fail silently forever.
 */

function siteIssuesFor(report: GoflagReport, ruleId: string) {
  return report.siteIssues.filter((issue) => issue.ruleId === ruleId);
}

describe("the document tree, off the wire", () => {
  let server: FixtureServer;
  let discovery: SiteDiscovery;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/sitemap-tree" });
    discovery = await discoverSitemap(`${server.url}/`, { crawlFallback: false });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("keeps every document it fetched, root first", () => {
    // The 404 and the nested index are nodes of the tree too. Before G.3 they
    // survived only as an increment to `childSitemapErrors`, which is why
    // nothing could tell the two apart.
    expect(discovery.documents.map((doc) => new URL(doc.url).pathname)).toEqual([
      "/sitemap.xml",
      "/catalog/sitemap.xml",
      "/missing.xml",
      "/nested.xml",
    ]);
  });

  it("records what each document is, including the index inside an index", () => {
    const byPath = new Map(
      discovery.documents.map((doc) => [new URL(doc.url).pathname, doc] as const),
    );

    expect(byPath.get("/sitemap.xml")?.kind).toBe("index");
    expect(byPath.get("/catalog/sitemap.xml")?.kind).toBe("urlset");
    expect(byPath.get("/missing.xml")?.kind).toBe("unparsable");
    // The case no rule judges, because no specification addresses it — but the
    // tree names it, which is the difference between "unsupported" and
    // "indistinguishable from a broken file".
    expect(byPath.get("/nested.xml")?.kind).toBe("index");
  });

  it("carries the two numbers `sitemap.limits.exceeded` reads", () => {
    const catalog = discovery.documents.find((doc) => doc.url.endsWith("/catalog/sitemap.xml"));

    // Three `<url>` entries in the file, and a body with a real size. A rule
    // whose inputs silently default to zero never fires, and nothing else in
    // the suite would have said so.
    expect(catalog?.urlCount).toBe(3);
    expect(catalog?.byteLength).toBeGreaterThan(100);
    expect(catalog?.gzipped).toBe(false);
    expect(catalog?.parentUrl).toBe(`${server.url}/sitemap.xml`);
  });

  it("names all three children the root index declared, followed or not", () => {
    expect(discovery.documents[0]?.childLocs.map((loc) => new URL(loc).pathname)).toEqual([
      "/catalog/sitemap.xml",
      "/missing.xml",
      "/nested.xml",
    ]);
  });

  it("stamps every entry with the document that declared it", () => {
    expect(discovery.urls.length).toBe(3);
    for (const entry of discovery.urls) {
      expect(entry.documentUrl, entry.loc).toBe(`${server.url}/catalog/sitemap.xml`);
    }
  });

  it("counts the root document's own size and leaves its url count at zero", () => {
    // An index declares no `<url>`, and the ceiling it is judged against is the
    // one on its children. Reading `urlCount` there would make the rule
    // permanently silent on exactly the documents most likely to be too big.
    const root = discovery.documents[0];
    expect(root?.urlCount).toBe(0);
    expect(root?.childLocs).toHaveLength(3);
    expect(root?.byteLength).toBeGreaterThan(100);
    expect(root?.declaredInRobots).toBe(true);
  });
});

describe("what the tree makes judgeable, in a report", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/sitemap-tree" });
    report = await runAudit(`${server.url}/`, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("flags the entry outside its sitemap's directory, and only that one", () => {
    const found = siteIssuesFor(report, "sitemap.entry.out-of-scope");

    expect(found).toHaveLength(1);
    expect(found[0]!.pageUrl).toBe(`${server.url}/catalog/sitemap.xml`);
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.message).toContain("`/catalog/`");
    expect(found[0]!.message).toContain("/images/forge");
    // The two entries that stay inside the directory are not swept into the
    // count — the whole point of the rule is which URLs, not how many.
    expect(found[0]!.message).toContain("1 entry is");
  });

  it("reports the unreadable child, and counts the nested one with it", () => {
    // Two children yielded no urlset: one because it is not there, one because
    // it is an index. They are one finding today, and its message says "could
    // not be read" of a file that read perfectly well — the imprecision
    // `docs/sitemap-robots-plan.md` §4.3 records rather than papers over.
    const found = siteIssuesFor(report, "sitemap.index.child-error");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("2 of 3");
  });

  it("claims no ceiling on a fixture nowhere near one", () => {
    expect(siteIssuesFor(report, "sitemap.limits.exceeded")).toEqual([]);
  });
});
