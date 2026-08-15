/**
 * The claim worth testing here is the restraint, not the fetch.
 *
 * `probeSitemapEntries` exists to answer a question about every sitemap entry,
 * and its whole design is about *not* asking the network for answers it
 * already has. A version that quietly re-fetched every URL would pass any test
 * of its findings and be rude to every site it audits.
 */

import { describe, expect, it } from "vitest";

import type { LinkCheck } from "../links/types";
import { probeSitemapEntries } from "./entries";

const check = (url: string, over: Partial<LinkCheck> = {}): LinkCheck => ({
  url,
  finalUrl: url,
  status: 200,
  verdict: "ok",
  method: "HEAD",
  redirectChain: [],
  checkedAt: "2026-08-15T00:00:00.000Z",
  durationMs: 1,
  ...over,
});

/** An unroutable port: any real fetch attempt fails fast and visibly. */
const UNREACHABLE = "http://127.0.0.1:1/never";

describe("probeSitemapEntries", () => {
  it("takes the crawl's answer without asking again", async () => {
    const result = await probeSitemapEntries([UNREACHABLE], {
      crawled: new Map([[UNREACHABLE, 200]]),
      checked: new Map(),
      maxProbes: 10,
    });

    // Had it fetched, this URL would have come back `status: 0`.
    expect(result.byUrl.get(UNREACHABLE)).toMatchObject({ status: 200, via: "crawl" });
    expect(result.unprobed).toBe(0);
  });

  it("takes the link audit's answer without asking again", async () => {
    const result = await probeSitemapEntries([UNREACHABLE], {
      crawled: new Map(),
      checked: new Map([[UNREACHABLE, check(UNREACHABLE, { status: 404 })]]),
      maxProbes: 10,
    });

    expect(result.byUrl.get(UNREACHABLE)).toMatchObject({ status: 404, via: "link-audit" });
  });

  it("prefers the crawl over the link audit when both know", async () => {
    // The crawl fetched the page and parsed it; the link audit may have only
    // sent a HEAD. The richer visit wins.
    const result = await probeSitemapEntries([UNREACHABLE], {
      crawled: new Map([[UNREACHABLE, 200]]),
      checked: new Map([[UNREACHABLE, check(UNREACHABLE, { status: 500 })]]),
      maxProbes: 10,
    });

    expect(result.byUrl.get(UNREACHABLE)?.via).toBe("crawl");
  });

  it("reads a redirect out of a link check rather than re-following it", async () => {
    const moved = check(UNREACHABLE, {
      status: 200,
      finalUrl: `${UNREACHABLE}/final`,
      redirectChain: [`${UNREACHABLE}/final`],
      verdict: "redirect",
    });
    const result = await probeSitemapEntries([UNREACHABLE], {
      crawled: new Map(),
      checked: new Map([[UNREACHABLE, moved]]),
      maxProbes: 10,
    });

    expect(result.byUrl.get(UNREACHABLE)).toMatchObject({
      redirected: true,
      finalUrl: `${UNREACHABLE}/final`,
    });
  });

  it("counts what the cap left unanswered instead of dropping it", async () => {
    // The number a finding needs to stay honest: three unreachable entries out
    // of a sitemap where hundreds were never checked is a floor, not a total.
    const result = await probeSitemapEntries(
      ["a", "b", "c", "d"].map((s) => `https://x.com/${s}`),
      {
        crawled: new Map([["https://x.com/a", 200]]),
        checked: new Map(),
        maxProbes: 0,
      },
    );

    expect(result.byUrl.size).toBe(1);
    expect(result.unprobed).toBe(3);
  });

  it("de-duplicates a URL the sitemap lists twice", async () => {
    const result = await probeSitemapEntries([UNREACHABLE, UNREACHABLE], {
      crawled: new Map([[UNREACHABLE, 200]]),
      checked: new Map(),
      maxProbes: 10,
    });

    expect(result.byUrl.size).toBe(1);
    expect(result.unprobed).toBe(0);
  });

  it("fetches only what nothing else answered", async () => {
    const known = "https://x.com/known";
    const result = await probeSitemapEntries([known, UNREACHABLE], {
      crawled: new Map([[known, 200]]),
      checked: new Map(),
      maxProbes: 10,
    });

    expect(result.byUrl.get(known)?.via).toBe("crawl");
    // The one it had no answer for was actually fetched, and the unroutable
    // port is what proves it went out rather than guessed.
    expect(result.byUrl.get(UNREACHABLE)).toMatchObject({ via: "probe", status: 0 });
  }, 20_000);
});
