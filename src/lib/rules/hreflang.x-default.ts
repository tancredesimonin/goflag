import type { Rule } from "./types";

const rule: Rule = {
  id: "hreflang.x-default",
  severity: "info",
  docs: {
    summary: 'Declare an `hreflang="x-default"` alternate when serving multiple languages',
    rationale: `The \`x-default\` alternate tells Google which version to serve when the
user's locale doesn't match any of the explicitly enumerated
alternates. Without it, Google falls back to its own heuristic
(usually the page with the geo-IP closest to the user), which is
unpredictable and frequently wrong — Spanish-speaking users in Mexico
end up on the Spain Spanish version, etc.

This rule fires when a page has at least two non-x-default
\`hreflang\` alternates but no \`x-default\` declared.`,
    exampleFix: {
      title: "Add an x-default alternate",
      language: "html",
      snippet: `<link rel="alternate" href="https://example.com/" hreflang="x-default">`,
    },
  },
  check: ({ page, issue }) => {
    const alts = page.links.alternates;
    const nonDefault = alts.filter((a) => !a.isXDefault);
    if (nonDefault.length < 2) return;
    if (alts.some((a) => a.isXDefault)) return;
    return issue({
      message: `Page declares ${nonDefault.length} hreflang alternates but no \`x-default\`.`,
      origin: { kind: "link", rel: "alternate" },
    });
  },
};

export default rule;
