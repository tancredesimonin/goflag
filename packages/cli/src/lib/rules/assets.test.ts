/**
 * The three rules that judge a file rather than a tag.
 *
 * `og.image.reachable`, `og.image.sizes-mismatch`, `icons.unreachable` and
 * `icons.sizes-mismatch` are the only rules whose subject is not in the page,
 * and the restraint they need is the same in all four: **absence of a probe is
 * not absence of a file.** A run
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

describe("og.image.sizes-mismatch", () => {
  const sized = (w: number, h: number) =>
    `<meta property="og:image" content="${OG}" />` +
    `<meta property="og:image:width" content="${w}" />` +
    `<meta property="og:image:height" content="${h}" />`;

  it("says nothing without a probe pass — the file was never looked at", () => {
    expect(ids(sized(1200, 630))).not.toContain("og.image.sizes-mismatch");
  });

  it("says nothing when the declaration is absent — that is another rule's job", () => {
    // `og.image.dimensions` reports the missing tags. Two rules on one defect
    // is two findings for one fix.
    const probed = { [OG]: ok(OG, [{ width: 1024, height: 1024 }]) };

    expect(ids(OG_TAG, probed)).not.toContain("og.image.sizes-mismatch");
    expect(ids(OG_TAG, probed)).toContain("og.image.dimensions");
  });

  it("says nothing when the probe decoded no size — unknown is not a mismatch", () => {
    expect(ids(sized(1200, 630), { [OG]: ok(OG) })).not.toContain("og.image.sizes-mismatch");
  });

  it("passes when the declaration is the file's own size", () => {
    const probed = { [OG]: ok(OG, [{ width: 1200, height: 630 }]) };

    expect(ids(sized(1200, 630), probed)).not.toContain("og.image.sizes-mismatch");
  });

  it("reports the invented declaration a library wrote without looking", () => {
    // The measured case: cover art at 1024x1024 declared 1200x630 by
    // `@goflag/next`, which had never fetched it.
    const found = lint(page(sized(1200, 630), { [OG]: ok(OG, [{ width: 1024, height: 1024 }]) }));
    const issue = found.find((i) => i.ruleId === "og.image.sizes-mismatch");

    expect(issue?.message).toContain("declares 1200x630 and is 1024x1024");
  });

  it("catches the placeholder, which is the shape that hides best", () => {
    // A 337-byte 1x1 declared 1200x630 renders an empty card, and every rule
    // that reads the declaration says the card is fine.
    expect(ids(sized(1200, 630), { [OG]: ok(OG, [{ width: 1, height: 1 }]) })).toContain(
      "og.image.sizes-mismatch",
    );
  });

  it("is what stops `og.image.ratio` from being fooled by its own input", () => {
    // 1200/630 is 1.9 and passes; the real 1024x1024 is 1.0. The ratio rule
    // reads the declaration and refuses to fetch, deliberately — so this is
    // the only rule in the catalogue that can say the input was false.
    const found = ids(sized(1200, 630), { [OG]: ok(OG, [{ width: 1024, height: 1024 }]) });

    expect(found).toContain("og.image.sizes-mismatch");
    expect(found).not.toContain("og.image.ratio");
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
