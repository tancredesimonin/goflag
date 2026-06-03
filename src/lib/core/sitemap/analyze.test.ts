import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeEntries, analyzeSitemapHealth, parseWildcardDisallows } from "./analyze";
import { discoverSitemap } from "./discover";
import type { SiteDiscovery } from "./types";
import {
  startAuditFixtureServer,
  type AuditFixtureServer,
} from "../../../../test/audit-fixture-server";

const noSleep = () => Promise.resolve();
const NOW = Date.parse("2024-06-01T00:00:00.000Z");

describe("analyzeEntries (pure)", () => {
  it("counts missing, malformed and future lastmod as issues", () => {
    const stats = analyzeEntries(
      [
        { loc: "https://x.example/a", lastmod: "2024-01-01" },
        { loc: "https://x.example/b" }, // missing
        { loc: "https://x.example/c", lastmod: "not-a-date" }, // malformed
        { loc: "https://x.example/d", lastmod: "2999-01-01" }, // future
      ],
      NOW,
    );
    expect(stats.lastmodIssues).toBe(3);
  });

  it("detects mixed protocol and host", () => {
    expect(
      analyzeEntries([{ loc: "http://x.example/a" }, { loc: "https://x.example/b" }], NOW)
        .mixedProtocol,
    ).toBe(true);
    expect(
      analyzeEntries([{ loc: "https://x.example/a" }, { loc: "https://www.x.example/b" }], NOW)
        .mixedHost,
    ).toBe(true);
  });

  it("reports no issues for a clean, consistent set", () => {
    const stats = analyzeEntries(
      [
        { loc: "https://x.example/a", lastmod: "2024-01-01" },
        { loc: "https://x.example/b", lastmod: "2024-02-01" },
      ],
      NOW,
    );
    expect(stats).toEqual({ lastmodIssues: 0, mixedProtocol: false, mixedHost: false });
  });
});

describe("parseWildcardDisallows", () => {
  it("extracts disallow paths only for the * group", () => {
    const raw = `User-agent: *\nDisallow: /private\nDisallow:\nUser-agent: Googlebot\nDisallow: /secret`;
    expect(parseWildcardDisallows(raw)).toEqual(["/private"]);
  });
});

describe("analyzeSitemapHealth — real fetch path", () => {
  let server: AuditFixtureServer;
  let discovery: SiteDiscovery;

  beforeAll(async () => {
    server = await startAuditFixtureServer();
    discovery = await discoverSitemap(server.url);
  });
  afterAll(async () => {
    await server.stop();
  });

  it("probes entry reachability and flags the dead URL", async () => {
    const health = await analyzeSitemapHealth(discovery, { sleep: noSleep });
    expect(health.reachable.checked).toBe(discovery.urls.length);
    expect(health.reachable.broken).toBeGreaterThanOrEqual(1); // /missing 404
    expect(health.checks[`${server.url}/missing`]?.verdict).toBe("broken");
    expect(health.reachable.ok).toBeGreaterThan(0);
  });

  it("counts lastmod issues from the fixture sitemap", async () => {
    const health = await analyzeSitemapHealth(discovery, {
      probeReachability: false,
      sleep: noSleep,
    });
    // /future (future-dated) + /badmod (malformed).
    expect(health.lastmodIssues).toBeGreaterThanOrEqual(2);
  });

  it("detects robots.txt conflicts (entry under a Disallow path)", async () => {
    const health = await analyzeSitemapHealth(discovery, {
      probeReachability: false,
      sleep: noSleep,
    });
    // /private/secret is disallowed by robots.txt (Disallow: /private).
    expect(health.robotsConflicts).toBeGreaterThanOrEqual(1);
  });

  it("detects orphan pages from linked internal URLs not in the sitemap", async () => {
    const health = await analyzeSitemapHealth(discovery, {
      probeReachability: false,
      linkedInternalUrls: [`${server.url}/orphan`, `${server.url}/about`],
      sleep: noSleep,
    });
    expect(health.orphanCount).toBe(1);
    expect(health.orphans).toContain(`${server.url}/orphan`);
  });
});
