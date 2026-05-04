import type { Rule } from "./types";

const rule: Rule = {
  id: "og.siteName.missing",
  severity: "info",
  docs: {
    summary: "Set `og:site_name` so unfurls credit the brand, not just the URL",
    rationale: `\`og:site_name\` is what Facebook, LinkedIn, and Slack render in the
small-print line above (or below) the unfurl title — the bit that
usually reads "MEDIUM", "GITHUB", "STRIPE BLOG". Without it, consumers
fall back to displaying the host (\`example.com\`), which loses the
branding.

It's a one-time setting per site (typically baked into the layout
template) and an info-level finding because the unfurl still works,
just less polished.`,
    exampleFix: {
      title: "Add og:site_name to the layout",
      language: "html",
      snippet: `<meta property="og:site_name" content="Acme Engineering">`,
    },
  },
  check: ({ page, issue }) => {
    if (page.openGraph.siteName?.value?.trim()) return;
    return issue({
      message: "Page has no `og:site_name`; unfurls will display the bare host.",
      origin: { kind: "meta", property: "og:site_name" },
    });
  },
};

export default rule;
