import { ogImage, ogImageMetadata } from "@/lib/seo/og";

const CARD = {
  title: "CLI reference",
  subtitle: "Every flag, its default, and what it changes.",
  label: "docs",
};

export function generateImageMetadata() {
  return ogImageMetadata(CARD.title);
}

export default function Image() {
  return ogImage(CARD);
}
