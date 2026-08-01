import type { Page } from "../types";

/**
 * Decide whether a page that came back from the static fetcher looks like
 * its real metadata is injected by client-side JS (typical of Vue / React /
 * Angular SPAs that don't pre-render their `<head>`).
 *
 * The heuristic is intentionally conservative: a false negative means we
 * miss an SPA and the user has to pass `--headless` manually. A false
 * positive means we boot Chromium for a page that didn't need it, which
 * costs ~1–2 s and a Playwright browser. We bias toward avoiding the boot.
 *
 * A page is treated as "looks client-rendered" iff *every* discriminating
 * signal is missing — no title, no description, no canonical, no OG, no
 * Twitter, no JSON-LD, no hreflang. That excludes:
 *
 *  - SSR'd pages with a real title and a description (the common case).
 *  - Static landing pages that have at least one OG tag.
 *  - Anything that ships a JSON-LD block (Wordpress, Astro, Hugo, etc.).
 *
 * It catches the textbook SPA case: `<head>` has charset + viewport +
 * a `<title>` like "React App" + a single `<div id="root">` in the body.
 */
export interface ClientRenderedSignal {
  /** True if the page looks like a client-rendered SPA. */
  likely: boolean;
  /** Human-readable explanation, used in escalation logs and Page.extractor. */
  reason: string;
}

const PLACEHOLDER_TITLES = new Set([
  "react app",
  "vue app",
  "vite app",
  "create react app",
  "next.js",
  "nuxt",
  "angular",
  "ember",
  "webpack app",
  "document",
  "untitled",
  "",
]);

export function looksClientRendered(
  partial: Pick<Page, "raw" | "meta" | "openGraph" | "twitter" | "links" | "jsonLd">,
): ClientRenderedSignal {
  const reasons: string[] = [];

  const titleRaw = partial.raw.title?.trim().toLowerCase() ?? "";
  const titleMissing = titleRaw === "";
  const titlePlaceholder = !titleMissing && PLACEHOLDER_TITLES.has(titleRaw);
  if (titleMissing) reasons.push("title missing");
  else if (titlePlaceholder) reasons.push(`placeholder title "${partial.raw.title}"`);

  const descMissing = partial.meta.description === undefined;
  if (descMissing) reasons.push("no description");

  const canonicalMissing = partial.meta.canonical === undefined;
  if (canonicalMissing) reasons.push("no canonical");

  const ogMissing =
    partial.openGraph.title === undefined &&
    partial.openGraph.description === undefined &&
    partial.openGraph.images.length === 0 &&
    partial.openGraph.type === undefined &&
    partial.openGraph.url === undefined &&
    partial.openGraph.siteName === undefined &&
    partial.openGraph.unknown.length === 0;
  if (ogMissing) reasons.push("no og:*");

  const twitterMissing =
    partial.twitter.card === undefined &&
    partial.twitter.title === undefined &&
    partial.twitter.image === undefined;
  if (twitterMissing) reasons.push("no twitter:*");

  const jsonLdMissing = partial.jsonLd.length === 0;
  if (jsonLdMissing) reasons.push("no JSON-LD");

  const hreflangMissing = partial.links.alternates.length === 0;
  if (hreflangMissing) reasons.push("no hreflang");

  // Only escalate when *all* signals fire simultaneously — that's the SPA
  // shape. A page missing only the description but with a real OG card is
  // SSR'd, just incomplete; that's a job for the rule engine, not headless.
  const likely =
    (titleMissing || titlePlaceholder) &&
    descMissing &&
    canonicalMissing &&
    ogMissing &&
    twitterMissing &&
    jsonLdMissing &&
    hreflangMissing;

  return {
    likely,
    reason: reasons.join(", ") || "all metadata present",
  };
}
