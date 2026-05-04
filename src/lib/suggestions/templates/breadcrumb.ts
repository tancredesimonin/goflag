import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

/**
 * Build a `BreadcrumbList` snippet by walking the URL path.
 *
 * `https://example.com/blog/the-post` becomes:
 *
 *   Home → Blog → The post
 *
 * with each crumb pointing at its origin-relative URL. The crumb name
 * is a humanised version of the path segment (kebab/underscore →
 * spaces, title-case). Consumers will almost always tweak the names —
 * the value of the snippet is the *shape* (correct positions,
 * `ListItem` wrappers, absolute URLs).
 */
export function breadcrumbSuggestion(page: Page): Suggestion | undefined {
  const url = page.links.canonical ?? page.fetch.finalUrl ?? page.fetch.requestedUrl;
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return undefined;

  const origin = `${parsed.protocol}//${parsed.host}`;
  const items = [
    {
      "@type": "ListItem" as const,
      position: 1,
      name: "Home",
      item: `${origin}/`,
    },
    ...segments.map((seg, i) => ({
      "@type": "ListItem" as const,
      position: i + 2,
      name: humanise(seg),
      item: `${origin}/${segments.slice(0, i + 1).join("/")}`,
    })),
  ];

  const payload = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };

  return {
    id: "BreadcrumbList",
    type: "BreadcrumbList",
    title: "Add a BreadcrumbList so Google replaces the URL in your search result",
    rationale:
      "When a `BreadcrumbList` validates, Google renders the breadcrumbs (Home › Blog › Post title) directly in the SERP row instead of the raw URL. Update the `name` fields below to match the labels you actually use in your nav.",
    severity: "info",
    example: { language: "json", snippet: renderJsonLd(payload) },
  };
}

function humanise(segment: string): string {
  const decoded = decodeURIComponent(segment);
  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
