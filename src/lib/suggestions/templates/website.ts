import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

export function websiteSuggestion(page: Page): Suggestion | undefined {
  const url = page.links.canonical ?? page.fetch.finalUrl ?? page.fetch.requestedUrl;
  const name = page.openGraph.siteName?.value ?? hostFrom(url);
  if (!url || !name) return undefined;

  const origin = ensureOriginUrl(url);
  const payload = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return {
    id: "WebSite",
    type: "WebSite",
    title: "Add a WebSite block to enable the sitelinks search box",
    rationale:
      "Pairing `WebSite` with a `potentialAction` of type `SearchAction` is what makes Google render the dedicated site search input under your homepage result. Replace the `target.urlTemplate` value with the URL pattern of your real search page.",
    severity: "info",
    example: { language: "json", snippet: renderJsonLd(payload) },
  };
}

function hostFrom(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function ensureOriginUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return url;
  }
}
