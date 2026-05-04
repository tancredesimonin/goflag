import type { Rule } from "./types";

const rule: Rule = {
  id: "og.title.missing",
  severity: "warning",
  docs: {
    summary: "Set an explicit `og:title` instead of relying on `<title>` fallback",
    rationale: `Most unfurlers fall back to the document \`<title>\` when \`og:title\` is
absent, which is fine until you remember that \`<title>\` is usually
formatted for the browser tab strip ("Page name — Site name") rather
than for a social card. An explicit \`og:title\` lets you ship the
short, punchy version.

Some unfurlers (older WhatsApp builds, certain in-app browsers) also
ignore \`<title>\` entirely if no OG metadata is present, dropping the
unfurl to a bare URL. Declaring \`og:title\` explicitly is the safe
posture.`,
    exampleFix: {
      title: "Add an og:title meta",
      language: "html",
      snippet: `<meta property="og:title" content="Short, punchy version of the page title">`,
    },
  },
  check: ({ page, issue }) => {
    if (page.openGraph.title?.value?.trim()) return;
    return issue({
      message: "Page has no `og:title`; consumers will fall back to `<title>` (or nothing).",
      origin: { kind: "meta", property: "og:title" },
    });
  },
};

export default rule;
