import type { MetadataRoute } from "next";

import { siteSitemapUrls } from "@/lib/seo/site-routes";

/**
 * One entry per URL the site actually serves, projected from the same registry
 * the pages use for their `<head>`.
 *
 * It used to rebuild the `route × locale` map by hand from the same
 * collections. Two derivations of one truth is exactly the disagreement
 * `hreflang.sitemap-mismatch` reports, and the old version already carried it
 * latently: it gave every legal page all four locales while the page itself
 * derived its own set, so a notice translated into three would have been listed
 * in four and clustered in three.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return siteSitemapUrls().map(({ url, languages }) => ({
    url,
    lastModified,
    ...(languages ? { alternates: { languages } } : {}),
  }));
}
