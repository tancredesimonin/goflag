import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { rulesByCategory, type Rule, type RuleCategory } from "@/lib/rules";

export const metadata: Metadata = {
  title: "Rules — Goflag",
  description: "Every Goflag rule, grouped by category, with one-line summaries.",
};

const CATEGORY_LABELS: Record<RuleCategory, string> = {
  core: "Core (title, description, canonical, viewport, lang)",
  "open-graph": "Open Graph",
  twitter: "X / Twitter",
  i18n: "Internationalisation",
  icons: "Icons & favicons",
  manifest: "Web app manifest",
  robots: "Robots & indexing",
};

const CATEGORY_ORDER: RuleCategory[] = [
  "core",
  "open-graph",
  "twitter",
  "i18n",
  "icons",
  "manifest",
  "robots",
];

export default function RulesIndex() {
  const grouped = rulesByCategory();
  const total = CATEGORY_ORDER.reduce((sum, cat) => sum + grouped[cat].length, 0);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Goflag rules</h1>
        <p className="text-muted-foreground">
          {total} rules ship with Goflag. Each one is documented below with its severity, rationale,
          and an example fix snippet.
        </p>
      </header>

      {CATEGORY_ORDER.map((category) => {
        const rules = grouped[category];
        if (rules.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase">
              {CATEGORY_LABELS[category]}
            </h2>
            <ul className="space-y-2" data-testid={`rules-category-${category}`}>
              {rules.map((rule) => (
                <li key={rule.id}>
                  <RuleListItem rule={rule} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

function RuleListItem({ rule }: { rule: Rule }) {
  return (
    <Card
      className="hover:border-primary/40 transition-colors"
      data-testid="rules-index-row"
      data-rule-id={rule.id}
    >
      <Link href={`/rules/${rule.id}`} className="block focus:outline-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="font-mono text-sm">{rule.id}</CardTitle>
          <Badge
            variant="outline"
            className={
              rule.severity === "error"
                ? "text-destructive"
                : rule.severity === "warning"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-sky-600 dark:text-sky-400"
            }
          >
            {rule.severity}
          </Badge>
        </CardHeader>
        <CardContent className="text-muted-foreground pt-0 text-sm">
          {rule.docs.summary}
        </CardContent>
      </Link>
    </Card>
  );
}
