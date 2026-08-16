import { ogImage } from "@goflag/og/next";

import { ALL_RULES } from "@/lib/rules-catalog";
import { og, ogAlt } from "@/lib/seo/og";

export function generateStaticParams() {
  return ALL_RULES.map((rule) => ({ id: rule.id }));
}

const image = ogImage(og, async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const rule = ALL_RULES.find((entry) => entry.id === id);
  const title = rule?.id ?? "Rule";

  return {
    title,
    subtitle: rule?.summary.replace(/`/g, ""),
    // A prose rule carries no severity — it is a question, not a finding.
    label: rule ? (rule.severity ?? "needs-judgment") : "rule",
    alt: ogAlt(title),
  };
});

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
