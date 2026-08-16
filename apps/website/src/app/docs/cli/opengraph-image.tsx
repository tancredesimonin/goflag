import { ogImage } from "@goflag/og/next";

import { og, ogAlt } from "@/lib/seo/og";

const TITLE = "CLI reference";

const image = ogImage(og, () => ({
  title: TITLE,
  subtitle: "Every flag, its default, and what it changes.",
  label: "docs",
  alt: ogAlt(TITLE),
}));

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
