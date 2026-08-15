import { ALL_RULES } from "@/lib/rules-catalog";
import { ogImage, ogImageMetadata } from "@/lib/seo/og";

const CARD = {
  title: "Rule catalogue",
  subtitle: `All ${ALL_RULES.length} rules, what each one checks, and why it matters.`,
  label: "docs",
};

export function generateImageMetadata() {
  return ogImageMetadata(CARD.title);
}

export default function Image() {
  return ogImage(CARD);
}
