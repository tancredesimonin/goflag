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
 *
 * No `Host:` line any more. It is non-standard, read by Yandex alone, ignored
 * by Google, and goflag reports an unrecognised directive as
 * `robotstxt.unknown-directive` — a site that publishes the auditor should not
 * be serving what the auditor warns about.
 */
export default function robots(): MetadataRoute.Robots {
  return routes.robots();
}
