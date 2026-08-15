/**
 * `icons.ico.missing` — the fallback nobody declares.
 *
 * The rule is cheap; what is worth testing is its restraint. It must stay
 * silent when the probe never ran (goflag did not look, which is not the same
 * as nothing being there), and it must not accept a 200 of HTML, which is what
 * every catch-all route on every SPA answers to a request for a file it has
 * never heard of.
 */

import { describe, expect, it } from "vitest";

import { lintSite } from "../core/lint-site";
import type { FaviconProbe } from "../core/types";
import { getSiteRule } from "./site-rules";
import type { SiteContext } from "./site-types";
import { pageFromHtml } from "./test-utils";

const RULE = getSiteRule("icons.ico.missing");
if (!RULE) throw new Error("icons.ico.missing is not registered");

const ORIGIN = "https://x.com";

function context(favicon?: FaviconProbe): SiteContext {
  return {
    origin: ORIGIN,
    pages: [pageFromHtml("<html><head><title>t</title></head><body>b</body></html>")],
    matrix: { locales: [], routes: [], cells: {} },
    localeAxis: { locales: [], source: "none", multilingual: false, candidates: [] },
    favicon,
  };
}

const findings = (favicon?: FaviconProbe) => lintSite(context(favicon), [RULE!]);

describe("icons.ico.missing", () => {
  it("says nothing when the probe never ran", () => {
    expect(findings(undefined)).toEqual([]);
  });

  it("says nothing when the origin serves one", () => {
    expect(
      findings({
        url: `${ORIGIN}/favicon.ico`,
        status: 200,
        found: true,
        contentType: "image/x-icon",
      }),
    ).toEqual([]);
  });

  it("fires on a 404", () => {
    const found = findings({ url: `${ORIGIN}/favicon.ico`, status: 404, found: false });
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("404");
  });

  it("fires on a 200 of HTML, and says why rather than just 'missing'", () => {
    // The catch-all that answers the app shell for every unknown path. A rule
    // that trusted the status alone would pass here — on exactly the sites it
    // exists for.
    const found = findings({
      url: `${ORIGIN}/favicon.ico`,
      status: 200,
      found: false,
      contentType: "text/html",
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("text/html");
    expect(found[0]?.message).toContain("not an image");
  });

  it("fires when the request failed outright", () => {
    const found = findings({ url: `${ORIGIN}/favicon.ico`, status: 0, found: false });
    expect(found[0]?.message).toContain("failed outright");
  });

  it("points the finding at the file, not at an arbitrary page", () => {
    const found = findings({ url: `${ORIGIN}/favicon.ico`, status: 404, found: false });
    expect(found[0]?.pageUrl).toBe(`${ORIGIN}/favicon.ico`);
  });

  it("carries its rigor and a real source, unlike the rules that predate the field", () => {
    expect(RULE!.rigor).toBe("guideline");
    expect(RULE!.sources?.length).toBeGreaterThan(0);
  });
});
