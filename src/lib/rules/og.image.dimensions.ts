import type { Rule } from "./types";

const rule: Rule = {
  id: "og.image.dimensions",
  severity: "warning",
  docs: {
    summary: "Declare `og:image:width` and `og:image:height` on every `og:image`",
    rationale: `When width and height are declared in the markup, unfurlers can lay out
the card immediately instead of waiting for a HEAD request to discover
the image dimensions. Slack's bot in particular is known to skip
unfurls when it has to fetch an image larger than ~5 MB and there are
no declared dimensions, because it can't tell ahead of time whether the
image is worth downloading.

This rule fires when an \`og:image\` exists but is missing either
\`og:image:width\` or \`og:image:height\`.`,
    exampleFix: {
      title: "Declare width and height alongside og:image",
      language: "html",
      snippet: `<meta property="og:image" content="https://example.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">`,
    },
  },
  check: ({ page, issue }) => {
    const issues = [];
    for (const img of page.openGraph.images) {
      if (img.width && img.height) continue;
      issues.push(
        issue({
          message: `og:image "${img.url.value}" is missing ${
            !img.width && !img.height
              ? "`og:image:width` and `og:image:height`"
              : !img.width
                ? "`og:image:width`"
                : "`og:image:height`"
          }.`,
          origin: img.url.origin,
        }),
      );
    }
    return issues;
  },
};

export default rule;
