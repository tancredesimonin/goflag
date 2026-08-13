import { describe, expect, it } from "vitest";

import {
  buildClusterIndex,
  buildHeadClusterIndex,
  clustersOnlyFrom,
  combineClusterIndexes,
} from "./clusters";
import type { SitemapUrlEntry } from "./sitemap/types";
import { pageFromHtml } from "../rules/test-utils";

const O = "https://acme.fr";

/** A cluster every member declares identically, as Google asks sites to. */
function cluster(members: Record<string, string>, xDefault: string): SitemapUrlEntry[] {
  const alternates = [
    ...Object.entries(members).map(([hreflang, path]) => ({ hreflang, href: O + path })),
    { hreflang: "x-default", href: O + xDefault },
  ];
  return Object.values(members).map((path) => ({ loc: O + path, alternates }));
}

describe("buildClusterIndex", () => {
  it("puts translated slugs in one row, named after the x-default target", () => {
    const index = buildClusterIndex(
      cluster({ en: "/en/pricing", fr: "/fr/tarifs" }, "/en/pricing"),
    );

    expect(index.routeOf(`${O}/en/pricing`)).toBe("/pricing");
    expect(index.routeOf(`${O}/fr/tarifs`)).toBe("/pricing");
    expect(index.size).toBe(1);
    expect(index.conflicts).toEqual([]);
  });

  it("does not merge a cluster with no x-default", () => {
    // The anchor has to be something the site says about itself. Choosing one
    // from the members would rename the row when a locale joins, moving every
    // fingerprint and reddening a baseline on a site where nothing moved.
    const entries: SitemapUrlEntry[] = [
      {
        loc: `${O}/en/pricing`,
        alternates: [
          { hreflang: "en", href: `${O}/en/pricing` },
          { hreflang: "fr", href: `${O}/fr/tarifs` },
        ],
      },
    ];

    const index = buildClusterIndex(entries);
    expect(index.routeOf(`${O}/en/pricing`)).toBeUndefined();
    expect(index.size).toBe(0);
  });

  it("is silent on a sitemap that declares nothing, which is most of them", () => {
    const index = buildClusterIndex([{ loc: `${O}/en/about` }, { loc: `${O}/fr/about` }]);
    expect(index.routeOf(`${O}/en/about`)).toBeUndefined();
    expect(index.size).toBe(0);
  });

  it("keeps the row stable when a locale joins the cluster", () => {
    // The property that matters for baselines: the same page keeps the same
    // row, so its findings keep their fingerprints.
    const before = buildClusterIndex(
      cluster({ en: "/en/pricing", fr: "/fr/tarifs" }, "/en/pricing"),
    );
    const after = buildClusterIndex(
      cluster({ en: "/en/pricing", fr: "/fr/tarifs", es: "/es/precios" }, "/en/pricing"),
    );

    expect(after.routeOf(`${O}/fr/tarifs`)).toBe(before.routeOf(`${O}/fr/tarifs`));
    expect(after.routeOf(`${O}/es/precios`)).toBe("/pricing");
  });

  it("matches a URL whatever its trailing slash", () => {
    const index = buildClusterIndex(
      cluster({ en: "/en/pricing", fr: "/fr/tarifs" }, "/en/pricing"),
    );
    expect(index.routeOf(`${O}/fr/tarifs/`)).toBe("/pricing");
    expect(index.routeOf(`${O}/fr/tarifs#top`)).toBe("/pricing");
  });

  it("reports a URL two entries claim for different clusters, and keeps the first", () => {
    const entries = [
      ...cluster({ en: "/en/a", fr: "/fr/a" }, "/en/a"),
      ...cluster({ en: "/en/b", fr: "/fr/a" }, "/en/b"),
    ];

    const index = buildClusterIndex(entries);
    expect(index.routeOf(`${O}/fr/a`)).toBe("/a");
    expect(index.conflicts).toEqual([`${O}/fr/a`]);
  });

  it("ignores an unparseable member rather than dropping the cluster", () => {
    const entries: SitemapUrlEntry[] = [
      {
        loc: `${O}/en/pricing`,
        alternates: [
          { hreflang: "fr", href: "not a url" },
          { hreflang: "x-default", href: `${O}/en/pricing` },
        ],
      },
    ];

    const index = buildClusterIndex(entries);
    expect(index.routeOf(`${O}/en/pricing`)).toBe("/pricing");
  });
});

/** A page whose `<head>` declares exactly these alternates. */
function head(path: string, alternates: Array<[string, string]>) {
  const links = alternates
    .map(([tag, target]) => `<link rel="alternate" hreflang="${tag}" href="${O}${target}" />`)
    .join("");
  return pageFromHtml(`<html><head><title>t</title>${links}</head><body>b</body></html>`, {
    url: `${O}${path}`,
  });
}

/** The correct shape: both sides point at each other and name one x-default. */
const RECIPROCAL: Array<[string, string]> = [
  ["en", "/en/pricing"],
  ["fr", "/fr/tarifs"],
  ["x-default", "/en/pricing"],
];

describe("buildHeadClusterIndex", () => {
  it("pairs translated slugs from reciprocal alternates, named after x-default", () => {
    const index = buildHeadClusterIndex([
      head("/en/pricing", RECIPROCAL),
      head("/fr/tarifs", RECIPROCAL),
    ]);

    expect(index.routeOf(`${O}/en/pricing`)).toBe("/pricing");
    expect(index.routeOf(`${O}/fr/tarifs`)).toBe("/pricing");
    expect(index.size).toBe(1);
    expect(index.refused).toBe(0);
  });

  it("forms nothing from a one-sided declaration", () => {
    // `/fr/tarifs` was crawled and does not point back. Acting on the English
    // page's word alone is the silent merge the design refused: one page can
    // claim an identity its supposed peer denies.
    const index = buildHeadClusterIndex([
      head("/en/pricing", RECIPROCAL),
      head("/fr/tarifs", [
        ["fr", "/fr/tarifs"],
        ["x-default", "/fr/tarifs"],
      ]),
    ]);

    expect(index.routeOf(`${O}/en/pricing`)).toBeUndefined();
    expect(index.routeOf(`${O}/fr/tarifs`)).toBeUndefined();
    expect(index.size).toBe(0);
  });

  it("forms nothing when the peer was never crawled", () => {
    // The measured limit, pinned: under structural coverage the two locales of
    // a slug-translating family draw disjoint pages, so this is the common case
    // and the reason the sitemap source is not replaced by this one.
    const index = buildHeadClusterIndex([head("/en/pricing", RECIPROCAL)]);
    expect(index.size).toBe(0);
    expect(index.refused).toBe(0);
  });

  it("refuses a cluster whose members disagree about x-default", () => {
    const index = buildHeadClusterIndex([
      head("/en/pricing", RECIPROCAL),
      head("/fr/tarifs", [
        ["en", "/en/pricing"],
        ["fr", "/fr/tarifs"],
        ["x-default", "/fr/tarifs"],
      ]),
    ]);

    expect(index.size).toBe(0);
    expect(index.refused).toBe(1);
  });

  it("refuses a cluster whose x-default is not one of its members", () => {
    // The field mistake this guard exists for: `x-default` pointed at the site
    // home page on every page. Without the membership test every reciprocal
    // pair on such a site would merge onto the `/` row and the whole audit
    // would collapse into one route.
    const toHome: Array<[string, string]> = [
      ["en", "/en/pricing"],
      ["fr", "/fr/tarifs"],
      ["x-default", "/"],
    ];
    const index = buildHeadClusterIndex([head("/en/pricing", toHome), head("/fr/tarifs", toHome)]);

    expect(index.size).toBe(0);
    expect(index.refused).toBe(1);
    expect(index.routeOf(`${O}/en/pricing`)).toBeUndefined();
  });

  it("is a no-op on a site that declares no hreflang at all", () => {
    // The founding bug's shape. This mechanism neither fixes it nor hides it:
    // with no alternates there are no edges, and `hreflang.missing` still reads
    // the same empty list it always did.
    const bare = pageFromHtml("<html><head><title>t</title></head><body>b</body></html>", {
      url: `${O}/en/pricing`,
    });
    const index = buildHeadClusterIndex([bare]);
    expect(index.size).toBe(0);
    expect(index.refused).toBe(0);
  });

  it("keeps the row stable when a locale joins the cluster", () => {
    const three: Array<[string, string]> = [...RECIPROCAL, ["es", "/es/precios"]];
    const before = buildHeadClusterIndex([
      head("/en/pricing", RECIPROCAL),
      head("/fr/tarifs", RECIPROCAL),
    ]);
    const after = buildHeadClusterIndex([
      head("/en/pricing", three),
      head("/fr/tarifs", three),
      head("/es/precios", three),
    ]);

    expect(after.routeOf(`${O}/fr/tarifs`)).toBe(before.routeOf(`${O}/fr/tarifs`));
    expect(after.routeOf(`${O}/es/precios`)).toBe("/pricing");
  });
});

describe("combineClusterIndexes", () => {
  const pages = [head("/en/pricing", RECIPROCAL), head("/fr/tarifs", RECIPROCAL)];

  it("lets the sitemap decide where both sources answer", () => {
    // The sitemap survives sampling and the `<head>` does not, so where the two
    // disagree the one that saw the whole site wins — and the disagreement is
    // recorded rather than resolved quietly.
    const sitemap = buildClusterIndex(
      cluster({ en: "/en/pricing", fr: "/fr/tarifs" }, "/fr/tarifs"),
    );
    const combined = combineClusterIndexes(sitemap, buildHeadClusterIndex(pages));

    expect(combined.routeOf(`${O}/en/pricing`)).toBe("/tarifs");
    expect(combined.conflicts).toEqual([`${O}/en/pricing`, `${O}/fr/tarifs`]);
  });

  it("keeps the head's answer where the sitemap declared nothing", () => {
    const combined = combineClusterIndexes(buildClusterIndex([]), buildHeadClusterIndex(pages));
    expect(combined.routeOf(`${O}/fr/tarifs`)).toBe("/pricing");
    expect(combined.size).toBe(1);
    expect(combined.conflicts).toEqual([]);
  });

  it("counts one cluster, not two, when both sources declare the same one", () => {
    // Subtracting totals would claim the `<head>` added a cluster it merely
    // agreed with, and `declaredClusters.count` would double on every correct
    // site.
    const sitemap = buildClusterIndex(
      cluster({ en: "/en/pricing", fr: "/fr/tarifs" }, "/en/pricing"),
    );
    const headIndex = buildHeadClusterIndex(pages);

    expect(combineClusterIndexes(sitemap, headIndex).size).toBe(1);
    expect(clustersOnlyFrom(sitemap, headIndex)).toBe(0);
    expect(clustersOnlyFrom(buildClusterIndex([]), headIndex)).toBe(1);
  });
});
