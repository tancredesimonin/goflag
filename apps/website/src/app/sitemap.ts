import type { MetadataRoute } from "next";

import { routes } from "@/lib/seo/site";

/**
 * One entry per URL the site serves, projected from the registry the pages use
 * for their `<head>`. Two derivations of one truth is exactly the disagreement
 * `hreflang.sitemap-mismatch` reports, so there is only one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return routes.sitemap({ lastModified: new Date() });
}
