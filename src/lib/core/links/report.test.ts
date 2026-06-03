import { describe, expect, it } from "vitest";
import { buildLinkRows, listHosts } from "./report";
import { emptyVerdictSummary, type LinkAuditReport, type LinkCheck } from "./types";

function check(url: string, verdict: LinkCheck["verdict"], status = 200): LinkCheck {
  return {
    url,
    finalUrl: url,
    status,
    verdict,
    method: "GET",
    redirectChain: [],
    checkedAt: "2024-01-01T00:00:00.000Z",
    durationMs: 1,
  };
}

function report(): LinkAuditReport {
  const ok = check("https://site.example/a", "ok");
  const broken = check("https://site.example/dead", "broken", 404);
  const external = check("https://other.example/x", "redirect", 200);
  return {
    origin: "https://site.example",
    baseUrl: "https://site.example",
    pagesScanned: 2,
    occurrences: [
      { pageUrl: "https://site.example/", ref: ref(ok.url, "internal", "Home A") },
      { pageUrl: "https://site.example/p2", ref: ref(broken.url, "internal", "Dead one") },
      { pageUrl: "https://site.example/", ref: ref(broken.url, "internal", "Dead two") },
      { pageUrl: "https://site.example/", ref: ref(external.url, "external", "Off site") },
    ],
    checks: { [ok.url]: ok, [broken.url]: broken, [external.url]: external },
    summary: emptyVerdictSummary(),
    brokenByPage: [],
    truncated: false,
    diagnostics: { pagesFailed: 0, warnings: [] },
  };
}

function ref(url: string, kind: "internal" | "external", anchorText: string) {
  return { rawHref: url, url, kind, source: "a" as const, rel: [], anchorText };
}

describe("buildLinkRows", () => {
  it("sorts worst verdicts first and joins source pages", () => {
    const rows = buildLinkRows(report());
    expect(rows[0]?.check.verdict).toBe("broken");
    const brokenRow = rows.find((r) => r.check.url.endsWith("/dead"));
    expect(brokenRow?.sources).toHaveLength(2);
    expect(brokenRow?.sources.map((s) => s.pageUrl)).toContain("https://site.example/p2");
  });

  it("tags external links by kind and host", () => {
    const rows = buildLinkRows(report());
    const ext = rows.find((r) => r.check.url.startsWith("https://other.example"));
    expect(ext?.kind).toBe("external");
    expect(ext?.host).toBe("other.example");
  });

  it("dedupes repeated source pages", () => {
    const r = report();
    r.occurrences.push({
      pageUrl: "https://site.example/p2",
      ref: ref("https://site.example/dead", "internal", "again"),
    });
    const rows = buildLinkRows(r);
    const brokenRow = rows.find((row) => row.check.url.endsWith("/dead"));
    expect(brokenRow?.sources).toHaveLength(2);
  });
});

describe("listHosts", () => {
  it("returns distinct hosts sorted", () => {
    expect(listHosts(report())).toEqual(["other.example", "site.example"]);
  });
});

describe("buildLinkRows tie-breakers and fallbacks", () => {
  it("orders same-verdict rows by reference count then URL", () => {
    const a = check("https://site.example/a", "broken", 404); // 1 source
    const b = check("https://site.example/b", "broken", 404); // 2 sources
    const c = check("https://site.example/c", "broken", 404); // 1 source, sorts after /a
    const r: LinkAuditReport = {
      origin: "https://site.example",
      baseUrl: "https://site.example",
      pagesScanned: 1,
      occurrences: [
        { pageUrl: "p1", ref: ref(a.url, "internal", "a") },
        { pageUrl: "p1", ref: ref(b.url, "internal", "b") },
        { pageUrl: "p2", ref: ref(b.url, "internal", "b2") },
        { pageUrl: "p1", ref: ref(c.url, "internal", "c") },
      ],
      checks: { [a.url]: a, [b.url]: b, [c.url]: c },
      summary: emptyVerdictSummary(),
      brokenByPage: [],
      truncated: false,
      diagnostics: { pagesFailed: 0, warnings: [] },
    };
    const urls = buildLinkRows(r).map((row) => row.check.url);
    expect(urls[0]).toBe(b.url); // most references first
    expect(urls.indexOf(a.url)).toBeLessThan(urls.indexOf(c.url)); // then alpha
  });

  it("falls back gracefully for an un-parseable check URL with no occurrences", () => {
    const weird = check(":::not a url", "skipped", 0);
    const r: LinkAuditReport = {
      origin: "https://site.example",
      baseUrl: "https://site.example",
      pagesScanned: 1,
      occurrences: [],
      checks: { [weird.url]: weird },
      summary: emptyVerdictSummary(),
      brokenByPage: [],
      truncated: false,
      diagnostics: { pagesFailed: 0, warnings: [] },
    };
    const rows = buildLinkRows(r);
    expect(rows[0]?.kind).toBe("external");
    expect(rows[0]?.host).toBe(":::not a url");
    expect(rows[0]?.sources).toEqual([]);
  });
});
