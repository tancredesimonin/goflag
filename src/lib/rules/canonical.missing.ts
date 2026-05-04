import type { Rule } from "./types";

const rule: Rule = {
  id: "canonical.missing",
  severity: "warning",
  docs: {
    summary: 'Declare a `<link rel="canonical">` so search engines pick the right URL',
    rationale: `Without an explicit canonical, search engines pick a winner from the set
of equivalent URLs they discover for the same content (HTTP vs HTTPS,
\`?utm_*\` variants, trailing slashes, language proxies, AMP copies). They
usually pick well — but "usually" is the problem: ranking signals split
across the duplicates and you have no recourse.

A canonical tag is a single line that pins the authoritative URL for a
piece of content. We treat its absence as a **warning** rather than an
error because some pages (e.g. infinite-scroll category roots) are
deliberately uncanonical, but every editorial page should have one.`,
    exampleFix: {
      title: "Add a canonical link to <head>",
      language: "html",
      snippet: `<link rel="canonical" href="https://example.com/the-page/">`,
    },
    references: [
      {
        label: "Google: rel=canonical",
        href: "https://developers.google.com/search/docs/crawling-indexing/canonicalization",
      },
    ],
  },
  check: ({ page, issue }) => {
    if (page.links.canonical) return;
    return issue({
      message: 'Page is missing `<link rel="canonical">`.',
      origin: { kind: "link", rel: "canonical" },
      fix: {
        title: "Declare the canonical URL",
        snippet: `<link rel="canonical" href="https://example.com/the-page/">`,
        language: "html",
      },
    });
  },
};

export default rule;
