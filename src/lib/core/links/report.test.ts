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
