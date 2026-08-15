/**
 * The three rules that judge a file rather than a tag.
 *
 * `og.image.reachable`, `icons.unreachable` and `icons.sizes-mismatch` are the
 * only rules whose subject is not in the page, and the restraint they need is
 * the same in all three: **absence of a probe is not absence of a file.** A run
 * without the asset pass, or a URL the pass skipped, has to come out `na` — a
 * rule that reported a 404 it never asked for would be worse than the defect.
 *
 * The probe itself is exercised against a real server in
 * `test/integration/asset-probe.test.ts`; what is here is the judgment.
 */

import { describe, expect, it } from "vitest";

import { lint } from "../core/lint";
import type { AssetProbe } from "../core/types";
import { pageFromHtml } from "./test-utils";

const OG = "https://example.com/og.png";
const ICON = "https://example.com/icon.png";

const ok = (url: string, sizes?: Array<{ width: number; height: number }>): AssetProbe => ({
  url,
  status: 200,
  ok: true,
  contentType: "image/png",
  ...(sizes ? { sizes } : {}),
});

const page = (head: string, assets?: Record<string, AssetProbe>) =>
  pageFromHtml(`<html><head><title>A perfectly good title</title>${head}</head></html>`, {
    ...(assets ? { assets } : {}),
  });

const ids = (head: string, assets?: Record<string, AssetProbe>) =>
  lint(page(head, assets)).map((issue) => issue.ruleId);

const OG_TAG = `<meta property="og:image" content="${OG}" />`;
const ICON_TAG = `<link rel="icon" href="${ICON}" sizes="32x32" />`;

describe("og.image.reachable", () => {
  it("says nothing when no probe pass ran", () => {
    expect(ids(OG_TAG)).not.toContain("og.image.reachable");
  });

  it("says nothing about a relative URL the pass could not have fetched", () => {
    // `og.image.absolute` owns that page, and a crawler cannot resolve the URL
    // either — so there is nothing here to have found.
    expect(ids(`<meta property="og:image" content="/og.png" />`, {})).not.toContain(
      "og.image.reachable",
    );
  });

  it("passes on a 200 image", () => {
    expect(ids(OG_TAG, { [OG]: ok(OG) })).not.toContain("og.image.reachable");
  });

  it("fires on a 404", () => {
    const found = ids(OG_TAG, { [OG]: { url: OG, status: 404, ok: false } });
    expect(found).toContain("og.image.reachable");
  });

  it("fires on a 200 that is not an image — the redirect-to-app-shell shape", () => {
    // The failure this rule was written for, found on this project's own docs:
    // a URL that answers, answers 200, and answers HTML.
    const probe: AssetProbe = { url: OG, status: 200, ok: false, contentType: "text/html" };
    const issue = lint(page(OG_TAG, { [OG]: probe })).find(
      (i) => i.ruleId === "og.image.reachable",
    );

    expect(issue).toBeDefined();
    expect(issue?.message).toContain("text/html");
    expect(issue?.severity).toBe("error");
  });
});

describe("icons.unreachable", () => {
  it("says nothing when no probe pass ran", () => {
    expect(ids(ICON_TAG)).not.toContain("icons.unreachable");
  });

  it("passes when the icon answers with an image", () => {
    expect(ids(ICON_TAG, { [ICON]: ok(ICON, [{ width: 32, height: 32 }]) })).not.toContain(
      "icons.unreachable",
    );
  });

  it("fires when a declared icon 404s, and names which rel", () => {
    const issue = lint(page(ICON_TAG, { [ICON]: { url: ICON, status: 404, ok: false } })).find(
      (i) => i.ruleId === "icons.unreachable",
    );

    expect(issue?.message).toContain("icon");
    expect(issue?.message).toContain(ICON);
  });
});

describe("icons.sizes-mismatch", () => {
  it("says nothing when the file's size could not be decoded", () => {
    // An SVG, a JPEG — formats the probe does not read. Unknown is not a
    // mismatch, and guessing here would fire on every site serving an SVG icon.
    expect(ids(ICON_TAG, { [ICON]: ok(ICON) })).not.toContain("icons.sizes-mismatch");
  });

  it("says nothing when the declaration is `any`", () => {
    const head = `<link rel="icon" href="${ICON}" sizes="any" />`;
    expect(ids(head, { [ICON]: ok(ICON, [{ width: 48, height: 48 }]) })).not.toContain(
      "icons.sizes-mismatch",
    );
  });

  it("passes when the declaration matches", () => {
    expect(ids(ICON_TAG, { [ICON]: ok(ICON, [{ width: 32, height: 32 }]) })).not.toContain(
      "icons.sizes-mismatch",
    );
  });

  it("fires when the declaration is simply wrong", () => {
    const issue = lint(page(ICON_TAG, { [ICON]: ok(ICON, [{ width: 64, height: 64 }]) })).find(
      (i) => i.ruleId === "icons.sizes-mismatch",
    );

    expect(issue?.message).toContain("64x64");
  });

  it("fires when the declaration is half true — the common shape", () => {
    // The case §7.1 measured: a container carrying 16, 32 and 48 declared as
    // `48x48`. Nothing is false about it, and it still advertises one third of
    // the file.
    const head = `<link rel="icon" href="${ICON}" sizes="48x48" />`;
    const sizes = [
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 48, height: 48 },
    ];

    expect(ids(head, { [ICON]: ok(ICON, sizes) })).toContain("icons.sizes-mismatch");
  });

  it("accepts a declaration listing every size, in any order", () => {
    const head = `<link rel="icon" href="${ICON}" sizes="48x48 16x16 32x32" />`;
    const sizes = [
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 48, height: 48 },
    ];

    expect(ids(head, { [ICON]: ok(ICON, sizes) })).not.toContain("icons.sizes-mismatch");
  });

  it("says nothing about an icon that did not answer", () => {
    // `icons.unreachable` is that page's finding; a size comparison against a
    // file nobody received would be a second complaint about one fact.
    const probe: AssetProbe = { url: ICON, status: 404, ok: false };
    expect(ids(ICON_TAG, { [ICON]: probe })).not.toContain("icons.sizes-mismatch");
  });
});
