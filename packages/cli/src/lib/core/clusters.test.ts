import { describe, expect, it } from "vitest";

import { buildClusterIndex } from "./clusters";
import type { SitemapUrlEntry } from "./sitemap/types";

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
