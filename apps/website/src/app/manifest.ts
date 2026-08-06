import type { MetadataRoute } from "next";

import { defaultLocale } from "@/i18n/config";
import { SITE } from "@/lib/constants";

/**
 * Present because `manifest.missing` is a probe goflag runs, and a site that
 * ships the tool should pass its own probes. Deliberately minimal: this is a
 * documentation site, not an installable application.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name}: ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.tagline,
    start_url: `/${defaultLocale}`,
    display: "browser",
    background_color: "#12151a",
    theme_color: "#12151a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
