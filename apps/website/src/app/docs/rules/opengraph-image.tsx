import { ogImage } from "@goflag/og/next";

import { ALL_RULES } from "@/lib/rules-catalog";
import { og, ogAlt } from "@/lib/seo/og";

const TITLE = "Rule catalogue";

const image = ogImage(og, () => ({
  title: TITLE,
  subtitle: `All ${ALL_RULES.length} rules, what each one checks, and why it matters.`,
  label: "docs",
  alt: ogAlt(TITLE),
}));

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
