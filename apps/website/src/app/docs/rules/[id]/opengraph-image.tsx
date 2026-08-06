import { ALL_RULES } from "@/lib/rules-catalog";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return ALL_RULES.map((rule) => ({ id: rule.id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rule = ALL_RULES.find((entry) => entry.id === id);

  return ogImage({
    title: rule?.id ?? "Rule",
    subtitle: rule?.summary.replace(/`/g, ""),
    // A prose rule carries no severity — it is a question, not a finding.
    label: rule ? (rule.severity ?? "needs-judgment") : "rule",
  });
}
