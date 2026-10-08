/**
 * `http.not-found` — what the origin answers for a path nobody published.
 *
 * The cases are the ones measured on 2026-10-05: openfinanceguide.com served a
 * dotted unknown path as its home page (200), its develop environment crashed
 * on the same path (500), and the bare path was correct on both (redirect, then
 * 404). What is worth testing beyond that is restraint — no verdict from a probe
 * that did not run or got no answer — and a fingerprint that survives the nonce.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import type { NotFoundProbe } from "../core/types";
import { fingerprint, routeKey } from "../../report/fingerprint";
import { getSiteRule } from "./site-rules";
import type { SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const RULE = getSiteRule("http.not-found");
if (!RULE) throw new Error("http.not-found is not registered");

const ORIGIN = "https://x.com";

function probe(
  shape: NotFoundProbe["shape"],
  status: number,
  extra: Partial<NotFoundProbe> = {},
  nonce = "abc",
): NotFoundProbe {
  const url = `${ORIGIN}/goflag-probe-${nonce}${shape === "dotted" ? ".txt" : ""}`;
  return { url, shape, status, finalUrl: url, ...extra };
}

function findings(notFound?: NotFoundProbe[]) {
  const site: SiteContext = {
    origin: ORIGIN,
    pages: [pageFromHtml("<html><head><title>t</title></head><body>b</body></html>")],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
    notFound,
  };
  return lintSite(site, [RULE!]);
}

describe("http.not-found", () => {
  it("says nothing when the probe never ran", () => {
    expect(findings(undefined)).toEqual([]);
  });

  it("says nothing when both invented paths answer 404 or 410", () => {
    expect(findings([probe("bare", 404), probe("dotted", 410)])).toEqual([]);
  });

  it("fires on a dotted path served as a page, and says the bare one was fine", () => {
    const found = findings([
      probe("bare", 404, { finalUrl: `${ORIGIN}/en/goflag-probe-abc` }),
      probe("dotted", 200, { contentType: "text/html" }),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.message).toContain("`/goflag-probe-abc.txt` answered 200 `text/html`");
    expect(found[0]!.message).toContain("`/goflag-probe-abc` answered 404");
    expect(found[0]!.message).toContain("soft 404");
    expect(found[0]!.message).not.toContain("5xx");
  });

  it("fires on a server error, with the consequence that belongs to it", () => {
    const found = findings([
      probe("bare", 404),
      probe("dotted", 500, { contentType: "text/plain" }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("answered 500");
    expect(found[0]!.message).toContain("slows its crawl");
    expect(found[0]!.message).not.toContain("soft 404");
  });

  it("reports both shapes in one finding when both fail, each with its own consequence", () => {
    const found = findings([
      probe("bare", 200, { finalUrl: `${ORIGIN}/`, contentType: "text/html" }),
      probe("dotted", 502),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain(`after redirecting to \`${ORIGIN}/\``);
    expect(found[0]!.message).toContain("soft 404");
    expect(found[0]!.message).toContain("slows its crawl");
    expect(found[0]!.message).not.toContain("only some unknown paths");
  });

  it("stays silent on other client errors and on no answer at all", () => {
    // A 403 still says "nothing for you here", and Google reads every 4xx but
    // 429 as "does not exist". Status 0 is goflag not hearing back — not
    // evidence about the route.
    expect(findings([probe("bare", 403), probe("dotted", 401)])).toEqual([]);
    expect(findings([probe("bare", 0), probe("dotted", 0)])).toEqual([]);
  });

  it("attributes the finding to the origin, so its fingerprint survives a fresh nonce", () => {
    const first = findings([probe("bare", 404), probe("dotted", 200, {}, "aaa")]);
    const second = findings([probe("bare", 404), probe("dotted", 200, {}, "bbb")]);

    expect(first[0]!.pageUrl).toBe(ORIGIN);
    expect(first[0]!.message).not.toBe(second[0]!.message);
    // The id `report/build.ts` derives: rule, route, occurrence. Equal across
    // runs, or every baseline would report this finding as new every time.
    const id = (pageUrl: string) => fingerprint("site", "http.not-found", routeKey(pageUrl), "0");
    expect(id(first[0]!.pageUrl)).toBe(id(second[0]!.pageUrl));
  });

  it("claims what Google claims, and cites the RFC for what the code means", () => {
    expect(RULE!.rigor).toBe("vendor-spec");
    expect(RULE!.sources).toEqual(["ietf-rfc9110", "google-soft-404", "google-http-status"]);
  });
});
