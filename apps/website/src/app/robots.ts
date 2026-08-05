import type { MetadataRoute } from "next";

import { getBaseUrl, isProduction } from "@/lib/seo/metadata";

/**
 * The flag is read at runtime, not only at build time.
 *
 * `robots.blocks-site` exists because a production container that bakes in the
 * staging rules serves `Disallow: /` while every page asks to be indexed. This
 * site is audited by goflag in its own pipeline, so getting it wrong here would
 * fail its own build — which is the point.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();

  if (!isProduction()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
