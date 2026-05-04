import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

export function faqSuggestion(_page: Page): Suggestion {
  // The template is fully static for now — page-specific extraction
  // (existing Q/A blocks, headings) is on the Phase 7 roadmap. The
  // unused parameter keeps the call signature uniform across all
  // suggestion templates so the engine in `index.ts` can fan out
  // without per-template branching.
  void _page;
  const payload = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Replace with the first question",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Replace with the answer text. Plain text or HTML allowed.",
        },
      },
      {
        "@type": "Question",
        name: "Replace with the second question",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Replace with the answer.",
        },
      },
    ],
  };

  return {
    id: "FAQPage",
    type: "FAQPage",
    title: "Add an FAQPage block to make this eligible for Google's expandable FAQ rich result",
    rationale:
      "Pages structured as Q&A unlock Google's expandable FAQ block right inside the SERP — a huge real-estate win. Mirror every visible question on the page as a `Question` entry with an `acceptedAnswer`. Google rejects duplicate or boilerplate FAQs, so keep the content unique to this page.",
    severity: "info",
    example: { language: "json", snippet: renderJsonLd(payload) },
  };
}
