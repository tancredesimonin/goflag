import { ALL_RULES } from "@/lib/rules-catalog";
import { ogImage, ogImageMetadata } from "@/lib/seo/og";

export function generateStaticParams() {
  return ALL_RULES.map((rule) => ({ id: rule.id }));
}

/** The card's copy, read once and used by both exports below. */
async function card(params: Promise<{ id: string }>) {
  const { id } = await params;
  const rule = ALL_RULES.find((entry) => entry.id === id);

  return {
    title: rule?.id ?? "Rule",
    subtitle: rule?.summary.replace(/`/g, ""),
    // A prose rule carries no severity — it is a question, not a finding.
    label: rule ? (rule.severity ?? "needs-judgment") : "rule",
  };
}

export async function generateImageMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { title } = await card(params);

  return ogImageMetadata(title);
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return ogImage(await card(params));
}
