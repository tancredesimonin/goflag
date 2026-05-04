import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

export function personSuggestion(page: Page): Suggestion | undefined {
  const url = page.links.canonical ?? page.fetch.finalUrl ?? page.fetch.requestedUrl;
  const name =
    page.meta.author?.value ?? page.openGraph.title?.value ?? page.meta.title?.value ?? undefined;
  if (!url || !name) return undefined;

  const payload = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    url,
    sameAs: ["https://twitter.com/your-handle", "https://github.com/your-handle"],
  };

  return {
    id: "Person",
    type: "Person",
    title: "Add a Person block to anchor an author/profile in the Knowledge Graph",
    rationale:
      "A `Person` block tells search engines who this profile represents and which off-site identities (Twitter, GitHub, LinkedIn, Wikipedia) belong to the same person. Replace the `sameAs` placeholders with the profile's real off-site URLs.",
    severity: "info",
    example: { language: "json", snippet: renderJsonLd(payload) },
  };
}
