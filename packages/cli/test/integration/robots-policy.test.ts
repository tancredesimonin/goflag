import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAudit } from "@/report/build";
import type { GoflagReport } from "@/report/types";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

/**
 * `robots.txt` policy.
 *
 * The most expensive misconfiguration a site can carry, and the one nothing in
 * goflag was watching. tancrede.eu — a live freelance shopfront — served
 * `User-agent: * / Disallow: /` in production while every page carried
 * `<meta name="robots" content="index, follow">`. goflag fetched that
 * robots.txt on every run, read the `Sitemap:` line out of it, and never
 * looked at the rest. `blocksAll` was even computed and thrown away.
 *
 * The two fixtures separate the cases that matter. A site that blocks the
 * crawl *and* asks to be indexed cannot have meant both. A staging site that
 * blocks everything and claims nothing is doing exactly what it means to, and
 * flagging it as an error would teach the reader to ignore the rule.
 */
function robotsFindings(report: GoflagReport) {
  return report.siteIssues.filter((i) => i.ruleId === "robots.blocks-site");
}

describe("robots.txt blocks a site that asks to be indexed", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/blocked-but-indexable" });
    report = await runAudit(server.url, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("raises it as an error — the two declarations contradict each other", () => {
    const found = robotsFindings(report);
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("error");
  });

  it("attributes the finding to robots.txt, not to a page", () => {
    expect(robotsFindings(report)[0]?.pageUrl).toBe(`${server.url}/robots.txt`);
  });

  it("says how many pages contradict it, and why robots.txt wins", () => {
    const message = robotsFindings(report)[0]?.message ?? "";
    expect(message).toContain("disallows the whole site");
    expect(message).toContain("2 crawled pages declare");
    expect(message).toContain("robots.txt wins");
  });

  it("offers an App Router fix that gates on the environment", () => {
    const fix = robotsFindings(report)[0]?.fix ?? "";
    expect(fix).toContain("app/robots.ts");
    expect(fix).toContain("APP_ENV");
  });

  it("turns the verdict red", () => {
    expect(report.summary.verdict).toBe("red");
  });
});

describe("robots.txt blocks a site that claims nothing", () => {
  let server: FixtureServer;
  let report: GoflagReport;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/blocked-staging" });
    report = await runAudit(server.url, { depth: 2, static: true });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("warns rather than errors — a blocked staging site is doing its job", () => {
    // An explicit `index` is a statement of intent; its mere absence is the
    // default on every page ever written. Treating the default as a
    // contradiction would fire on every preview environment and teach the
    // reader to skip the rule.
    const found = robotsFindings(report);
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("warning");
  });

  it("names the consequence and allows for it being deliberate", () => {
    const message = robotsFindings(report)[0]?.message ?? "";
    expect(message).toContain("no search engine will crawl");
    expect(message).toContain("staging");
  });

  it("stays yellow: nothing here is provably wrong", () => {
    expect(report.summary.verdict).toBe("yellow");
  });
});

describe("a site that allows crawling", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({ root: "fixtures/sites/monolingual" });
  }, 60_000);

  afterAll(async () => {
    await server.stop();
  });

  it("says nothing about robots.txt", async () => {
    const report = await runAudit(server.url, { depth: 2, static: true });
    expect(robotsFindings(report)).toEqual([]);
  }, 60_000);
});
