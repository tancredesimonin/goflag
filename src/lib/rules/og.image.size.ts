import type { Rule } from "./types";

const MIN_SIDE = 200;
const MAX_SIDE = 8192;
const RECOMMENDED_WIDTH = 1200;
const RECOMMENDED_HEIGHT = 630;

const rule: Rule = {
  id: "og.image.size",
  severity: "info",
  docs: {
    summary: `Aim for ~${RECOMMENDED_WIDTH}×${RECOMMENDED_HEIGHT} \`og:image\` dimensions`,
    rationale: `Each platform has its own preferred image size, but they all converge
on roughly **1200×630** (the Facebook recommendation, also Discord's
default render box and X's \`summary_large_image\` aspect ratio). Going
much smaller than ~600×315 forces the platform to upscale and the card
looks blurry; going much larger than ~4096 on either axis and Facebook
silently drops the image.

This rule reads the **declared** \`og:image:width\` / \`og:image:height\`
meta tags (not the image bytes themselves — see \`og.image.dimensions\`
for the existence check). It is intentionally an **info**-level
finding: dimensions are a recommendation, not a hard rule.`,
  },
  check: ({ page, issue }) => {
    const issues = [];
    for (const img of page.openGraph.images) {
      const w = img.width?.value;
      const h = img.height?.value;
      if (typeof w !== "number" || typeof h !== "number") continue;
      const tooSmall = w < MIN_SIDE || h < MIN_SIDE;
      const tooBig = w > MAX_SIDE || h > MAX_SIDE;
      if (!tooSmall && !tooBig) continue;
      const reason = tooSmall
        ? `under the ${MIN_SIDE}px minimum`
        : `over the ${MAX_SIDE}px maximum (Facebook will drop it)`;
      issues.push(
        issue({
          message: `og:image is declared ${w}×${h} — ${reason}. Aim for ~${RECOMMENDED_WIDTH}×${RECOMMENDED_HEIGHT}.`,
          origin: img.url.origin,
        }),
      );
    }
    return issues;
  },
};

export default rule;
