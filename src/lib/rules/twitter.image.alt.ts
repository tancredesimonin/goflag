import type { Rule } from "./types";

const MAX_ALT_LENGTH = 420;

const rule: Rule = {
  id: "twitter.image.alt",
  severity: "info",
  docs: {
    summary: "Provide `twitter:image:alt` whenever a Twitter image is set",
    rationale: `Alt text on social cards is the only way blind and low-vision users
get any information out of an image-driven unfurl. X exposes
\`twitter:image:alt\` directly in its accessibility tree (and on hover
in the desktop client), so it's a free win for accessibility — the
copy can be the same as the image's own \`alt\`.

The cap is **420 characters** (X's enforced limit). Above that, X
truncates silently.`,
  },
  check: ({ page, issue }) => {
    if (!page.twitter.image?.value?.trim()) return;
    const alt = page.twitter.imageAlt?.value?.trim();
    if (!alt) {
      return issue({
        message: "`twitter:image` is set but `twitter:image:alt` is missing.",
        origin: { kind: "meta", name: "twitter:image:alt" },
      });
    }
    if (alt.length > MAX_ALT_LENGTH) {
      return issue({
        message: `\`twitter:image:alt\` is ${alt.length} characters — X truncates above ${MAX_ALT_LENGTH}.`,
        origin: page.twitter.imageAlt!.origin,
      });
    }
  },
};

export default rule;
