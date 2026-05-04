import type { Rule } from "./types";

const rule: Rule = {
  id: "og.image.missing",
  severity: "warning",
  docs: {
    summary: "Provide at least one `og:image` so links unfurl with a preview",
    rationale: `\`og:image\` is the single most-shared piece of metadata on the modern
web. Slack, Discord, iMessage, X, Facebook, LinkedIn, WhatsApp,
Telegram, Notion, and basically every link unfurler reads it before it
considers the body of the page. Without one, the unfurl is either a
dull text-only block or — worse — the consumer scrapes a random
\`<img>\` from the body, which usually looks terrible.

The first \`og:image\` is what matters; multiple are allowed but most
consumers only render the first.`,
    exampleFix: {
      title: "Declare an og:image",
      language: "html",
      snippet: `<meta property="og:image" content="https://example.com/og.png">`,
    },
  },
  check: ({ page, issue }) => {
    if (page.openGraph.images.length > 0) return;
    return issue({
      message:
        "Page has no `og:image`. Link unfurls will fall back to text-only or a random body image.",
      origin: { kind: "meta", property: "og:image" },
      fix: {
        title: "Add an og:image",
        snippet: `<meta property="og:image" content="https://example.com/og.png">`,
        language: "html",
      },
    });
  },
};

export default rule;
