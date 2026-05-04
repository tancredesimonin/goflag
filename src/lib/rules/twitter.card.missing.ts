import type { Rule } from "./types";

const rule: Rule = {
  id: "twitter.card.missing",
  severity: "warning",
  docs: {
    summary: "Declare `twitter:card` so X renders the rich preview format you want",
    rationale: `X (formerly Twitter) reads the \`twitter:card\` meta to decide which
unfurl shape to render — \`summary\` (small thumbnail next to title),
\`summary_large_image\` (big image above title), \`app\`, or \`player\`.
Without it, X currently defaults to \`summary\`, which means even a
beautiful 1200×630 image gets cropped into a tiny square next to the
title.

Setting \`twitter:card\` to \`summary_large_image\` is the correct value
for the vast majority of editorial pages.`,
    exampleFix: {
      title: "Pick a Twitter card type",
      language: "html",
      snippet: `<meta name="twitter:card" content="summary_large_image">`,
    },
    references: [
      {
        label: "X: card types",
        href: "https://developer.x.com/en/docs/x-for-websites/cards/overview/abouts-cards",
      },
    ],
  },
  check: ({ page, issue }) => {
    if (page.twitter.card?.value?.trim()) return;
    return issue({
      message: "Page has no `twitter:card`; X will default to a small `summary` card.",
      origin: { kind: "meta", name: "twitter:card" },
    });
  },
};

export default rule;
