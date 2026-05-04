import type { Rule } from "./types";

const rule: Rule = {
  id: "description.missing",
  severity: "warning",
  docs: {
    summary: 'Provide a `<meta name="description">` on every indexable page',
    rationale: `The meta description is the snippet most search engines show under the
title in their result page. Google doesn't always honour it (it sometimes
synthesises a snippet from the page body) but when it does, you control
the pitch. It also acts as a fallback for OG / Twitter descriptions when
those are missing.

A missing description leaves consumers guessing — usually badly — and
strips you of one of the few pieces of copy you fully control on the
SERP. We treat it as a **warning** rather than an error because some
pages (e.g. \`noindex\` admin views) genuinely don't need one.`,
    exampleFix: {
      title: "Add a meta description to <head>",
      language: "html",
      snippet: `<meta name="description" content="One sentence that promises what this page delivers.">`,
    },
  },
  check: ({ page, issue }) => {
    const d = page.meta.description?.value?.trim();
    if (d && d.length > 0) return;
    return issue({
      message: 'Page has no `<meta name="description">`.',
      origin: { kind: "meta", name: "description" },
      fix: {
        title: "Add a meta description",
        snippet: `<meta name="description" content="One sentence that promises what this page delivers.">`,
        language: "html",
      },
    });
  },
};

export default rule;
