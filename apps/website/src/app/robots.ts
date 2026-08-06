import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/seo/site";

/**
 * The flag is read at runtime, not only at build time.
 *
 * `robots.blocks-site` exists because a production container that bakes in the
 * staging rules serves `Disallow: /` while every page asks to be indexed. This
 * site is audited by goflag in its own pipeline, so getting it wrong here would
 * fail its own build — which is the point. It reads the same `indexable` flag
 * as the `robots` meta tag in the root layout, so the two declarations cannot
 * contradict each other.
 */
export default function robots(): MetadataRoute.Robots {
  const { baseUrl, indexable } = siteConfig();

  if (!indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
