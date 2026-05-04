import type { Rule } from "./types";

const rule: Rule = {
  id: "og.image.absolute",
  severity: "error",
  docs: {
    summary: "`og:image` URLs must be absolute (https preferred)",
    rationale: `Open Graph crawlers do not have a notion of "the page that referenced
this tag" — they take the \`content\` value verbatim and try to fetch it.
A relative path like \`/og.png\` therefore resolves to
\`https://t.co/og.png\` (for X), \`https://facebook.com/og.png\` (for
Facebook's debugger), and so on, all of which 404. The unfurl falls
back to a generic placeholder.

This is an **error** because the symptom is a broken link unfurl
everywhere, even though the page validates as HTML.`,
    references: [{ label: "Open Graph protocol", href: "https://ogp.me/" }],
  },
  check: ({ page, issue }) => {
    const issues = [];
    for (const img of page.openGraph.images) {
      const url = img.url.value.trim();
      if (!url) continue;
      let valid = false;
      try {
        const u = new URL(url);
        valid = u.protocol === "http:" || u.protocol === "https:";
      } catch {
        valid = false;
      }
      if (valid) continue;
      issues.push(
        issue({
          message: `og:image is "${url}" — must be an absolute http(s) URL.`,
          origin: img.url.origin,
        }),
      );
    }
    return issues;
  },
};

export default rule;
