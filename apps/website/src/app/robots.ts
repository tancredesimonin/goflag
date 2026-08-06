import type { MetadataRoute } from "next";

import { routes } from "@/lib/seo/site";

/**
 * Derived from the same `indexable` flag as the `robots` meta tag every page
 * inherits, so the two declarations cannot contradict each other — which is
 * what `robots.conflict` reports when they do, and what `robots.blocks-site`
 * catches when a production container ships the staging value.
 *
 * This site is audited by goflag in its own pipeline, so getting it wrong here
 * fails its own build. That is the point.
 */
export default function robots(): MetadataRoute.Robots {
  return routes.robots();
}
