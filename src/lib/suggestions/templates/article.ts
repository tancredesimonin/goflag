import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

const TODAY = "2026-01-01";

export function articleSuggestion(page: Page): Suggestion | undefined {
  const url = page.links.canonical ?? page.openGraph.url?.value ?? page.fetch.finalUrl;
  if (!url) return undefined;

  const headline =
    page.openGraph.title?.value ?? page.meta.title?.value ?? "Replace with the post headline";
  const image = page.openGraph.images[0]?.url.value;
  const author = page.meta.author?.value ?? "Author Name";
  const siteName = page.openGraph.siteName?.value ?? hostFrom(url) ?? "Your publication";

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    author: { "@type": "Person", name: author },
    datePublished: TODAY,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: {
      "@type": "Organization",
      name: siteName,
    },
  };
  if (image) payload.image = [image];

  return {
    id: "Article",
    type: "Article",
    title: "Add an Article block so Google can index this as editorial content",
    rationale:
      "An `Article` block unlocks Google's Top Stories carousel and the headline-rich snippet (with author, date, and lead image). The required fields are `headline`, `author`, and `datePublished`; we've inferred them from the page's metadata where possible — fill in the placeholders and replace the `datePublished` with the real publication date in ISO 8601 form.",
    severity: "info",
    example: { language: "json", snippet: renderJsonLd(payload) },
  };
}

function hostFrom(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
