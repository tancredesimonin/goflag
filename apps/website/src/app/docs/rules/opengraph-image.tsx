import { ALL_RULES } from "@/lib/rules-catalog";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    title: "Rule catalogue",
    subtitle: `All ${ALL_RULES.length} rules, what each one checks, and why it matters.`,
    label: "docs",
  });
}
