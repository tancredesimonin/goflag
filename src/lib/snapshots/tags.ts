/**
 * Project a `Page` to the flat `SnapshotTag[]` list.
 *
 * The projection is deliberately verbose: every meaningful field on
 * the parsed `Page` is mapped to an explicit tag key. We trade a
 * little code length for two properties that matter:
 *
 *   1. **Stability across releases.** Adding a new field to the
 *      parser (e.g. `og:image:type` in Phase 6+) is a one-line
 *      addition here, not a clever auto-walker change that risks
 *      renaming a key by accident.
 *   2. **Documented contract.** A reader of this module sees
 *      every tag we promise to track, in order. The PR-comment
 *      renderer (Phase 9c) and the SaaS layer (v2.x) both depend
 *      on this surface being predictable.
 */

import type { OpenGraphImage, Page } from "@/lib/core/types";
import type { SnapshotTag } from "./types";

export function projectTags(page: Page): SnapshotTag[] {
  const out: SnapshotTag[] = [];

  push(out, "title", page.raw.title);
  push(out, "html:lang", page.raw.htmlLang);
  push(out, "html:dir", page.raw.htmlDir);

  // Generic metas — `<meta name="…">` and `<meta charset="…">`.
  push(out, "meta:description", page.meta.description?.value);
  const keywords = page.meta.keywords?.value;
  if (keywords && keywords.length > 0) push(out, "meta:keywords", keywords.join(","));
  push(out, "meta:author", page.meta.author?.value);
  push(out, "meta:viewport", page.meta.viewport?.value);
  push(out, "meta:charset", page.meta.charset?.value);
  push(out, "meta:robots", page.meta.robots?.value);
  push(out, "meta:googlebot", page.meta.googlebot?.value);
  push(out, "meta:theme-color", page.meta.themeColor?.value);
  push(out, "meta:color-scheme", page.meta.colorScheme?.value);
  push(out, "meta:application-name", page.meta.applicationName?.value);
  push(out, "meta:generator", page.meta.generator?.value);
  push(out, "meta:referrer", page.meta.referrer?.value);

  // Open Graph — singletons first, then images and locale alternates.
  push(out, "meta:og:title", page.openGraph.title?.value);
  push(out, "meta:og:type", page.openGraph.type?.value);
  push(out, "meta:og:url", page.openGraph.url?.value);
  push(out, "meta:og:description", page.openGraph.description?.value);
  push(out, "meta:og:site_name", page.openGraph.siteName?.value);
  push(out, "meta:og:locale", page.openGraph.locale?.value);
  page.openGraph.localeAlternates.forEach((alt, idx) => {
    push(out, `meta:og:locale:alternate[${idx}]`, alt.value);
  });
  page.openGraph.images.forEach((image, idx) => {
    pushImage(out, idx, image);
  });

  // Twitter Card.
  push(out, "meta:twitter:card", page.twitter.card?.value);
  push(out, "meta:twitter:site", page.twitter.site?.value);
  push(out, "meta:twitter:creator", page.twitter.creator?.value);
  push(out, "meta:twitter:title", page.twitter.title?.value);
  push(out, "meta:twitter:description", page.twitter.description?.value);
  push(out, "meta:twitter:image", page.twitter.image?.value);
  push(out, "meta:twitter:image:alt", page.twitter.imageAlt?.value);

  // <link> tags carrying SEO meaning.
  push(out, "link:canonical", page.links.canonical);
  push(out, "link:manifest", page.links.manifest?.href);
  for (const alt of page.links.alternates) {
    const selector = alt.isXDefault ? "x-default" : alt.hreflang;
    push(out, `link:alternate[hreflang=${selector}]`, alt.href);
  }
  for (const icon of page.links.icons) {
    const sizesPart = icon.sizes ? `[sizes=${icon.sizes}]` : "";
    push(out, `link:icon${sizesPart}`, icon.href);
  }

  // Side-channel probes — coarse "found / missing / blocks-all" markers.
  // We deliberately do not store the verbatim robots.txt or sitemap
  // body here; that's a content-drift story, not a structural one.
  if (page.probes.robots) {
    push(out, "probe:robots", page.probes.robots.found ? "found" : "missing");
    push(out, "probe:robots:blocks-all", page.probes.robots.blocksAll ? "true" : "false");
  }
  if (page.probes.sitemap) {
    push(out, "probe:sitemap", page.probes.sitemap.found ? "found" : "missing");
    push(out, "probe:sitemap:is-index", page.probes.sitemap.isIndex ? "true" : "false");
  }
  if (page.probes.manifest) {
    push(out, "probe:manifest", page.probes.manifest.found ? "found" : "missing");
  }

  // Sort by key so the digest is order-independent and the diff has
  // a deterministic walk. Ties (which shouldn't happen — keys are
  // unique by construction) sort lexicographically.
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

function push(out: SnapshotTag[], key: string, value: string | undefined | null): void {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && value.length === 0) return;
  out.push({ key, value });
}

function pushImage(out: SnapshotTag[], idx: number, image: OpenGraphImage): void {
  push(out, `meta:og:image[${idx}]`, image.url.value);
  push(out, `meta:og:image[${idx}]:secure_url`, image.secureUrl?.value);
  push(out, `meta:og:image[${idx}]:type`, image.type?.value);
  push(
    out,
    `meta:og:image[${idx}]:width`,
    typeof image.width?.value === "number" ? String(image.width.value) : undefined,
  );
  push(
    out,
    `meta:og:image[${idx}]:height`,
    typeof image.height?.value === "number" ? String(image.height.value) : undefined,
  );
  push(out, `meta:og:image[${idx}]:alt`, image.alt?.value);
}
