import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

export function softwareApplicationSuggestion(page: Page): Suggestion {
  const name = page.openGraph.title?.value ?? page.meta.title?.value ?? "Your app name";

  const payload = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    applicationCategory: "WebApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return {
    id: "SoftwareApplication",
    type: "SoftwareApplication",
    title: "Add a SoftwareApplication block so app result rows show price + rating",
    rationale:
      "`SoftwareApplication` is the schema.org type Google uses to render the price chip + star rating on result rows for apps. The required fields are `name`, `applicationCategory`, and `operatingSystem`; add `aggregateRating` once you actually have user ratings to surface them in the SERP.",
    severity: "info",
    example: { language: "json", snippet: renderJsonLd(payload) },
  };
}
