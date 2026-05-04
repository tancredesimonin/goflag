import type { Rule } from "./types";

const rule: Rule = {
  id: "twitter.card.matchesImage",
  severity: "warning",
  docs: {
    summary: "`twitter:card=summary_large_image` requires a `twitter:image` (or `og:image`)",
    rationale: `When a page declares \`twitter:card="summary_large_image"\`, X reserves
the big-image card layout — but if no image is available, X falls back
to displaying a *broken* large card (a grey rectangle where the image
should be) instead of gracefully degrading to the small summary
layout.

This rule fires when the card type promises an image but no image is
declared via \`twitter:image\` or \`og:image\` (X uses the latter as a
fallback).`,
  },
  check: ({ page, issue }) => {
    const card = page.twitter.card?.value?.trim();
    if (card !== "summary_large_image" && card !== "summary") return;
    const hasTwitterImg = !!page.twitter.image?.value?.trim();
    const hasOgImg = page.openGraph.images.length > 0;
    if (hasTwitterImg || hasOgImg) return;
    return issue({
      message: `\`twitter:card="${card}"\` is set but no \`twitter:image\` or \`og:image\` is available.`,
      origin: { kind: "meta", name: "twitter:image" },
    });
  },
};

export default rule;
