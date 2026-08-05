import { allDocs, allLegals } from "content-collections";
import type { MetadataRoute } from "next";

import { defaultLocale, locales } from "@/i18n/config";
import { docsHref } from "@/lib/docs-nav";
import { ALL_RULES } from "@/lib/rules-catalog";
import { getBaseUrl } from "@/lib/seo/metadata";

/**
 * One entry per URL the site actually serves, with `alternates.languages` on the
 * localized ones — the same source the pages use for their `<head>`, because a
 * sitemap that disagrees with the head is exactly what
 * `hreflang.sitemap-mismatch` reports.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getBaseUrl();

  const localizedPaths = [
    "",
    "/changelog",
    ...(allLegals.some((doc) => doc.slug === "legal") ? ["/legal"] : []),
  ];

  const localized = localizedPaths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      alternates: {
        languages: {
          ...Object.fromEntries(
            locales.map((alternate) => [alternate, `${base}/${alternate}${path}`]),
          ),
          "x-default": `${base}/${defaultLocale}${path}`,
        },
      },
    })),
  );

  // The documentation is English only and lives outside the locale segment, so
  // these carry no alternates at all rather than alternates pointing at English.
  const docs = [
    ...allDocs.map((doc) => `${base}${docsHref(doc.slug)}`),
    `${base}/docs/cli`,
    `${base}/docs/rules`,
    ...ALL_RULES.map((rule) => `${base}/docs/rules/${rule.id}`),
  ].map((url) => ({ url, lastModified: new Date() }));

  return [...localized, ...docs];
}
