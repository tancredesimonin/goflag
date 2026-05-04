import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { highlightHtml } from "@/lib/highlight";
import { getRule, RULES } from "@/lib/rules";
import { MarkdownLite } from "@/components/rules/markdown-lite";

interface RuleDocPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Pre-render every rule page at build time. The set is small (25
 * today, ~80 by Phase 8) and the route is deterministic, so static
 * generation gives us free CDN caching and instant tab switching from
 * the Issues panel.
 */
export function generateStaticParams() {
  return RULES.map((rule) => ({ id: rule.id }));
}

export async function generateMetadata({ params }: RuleDocPageProps): Promise<Metadata> {
  const { id } = await params;
  const rule = getRule(id);
  if (!rule) {
    return { title: "Rule not found — Headlint" };
  }
  return {
    title: `${rule.id} — Headlint`,
    description: rule.docs.summary,
  };
}

const SEVERITY_TONE: Record<"error" | "warning" | "info", string> = {
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

export default async function RuleDocPage({ params }: RuleDocPageProps) {
  const { id } = await params;
  const rule = getRule(id);
  if (!rule) notFound();

  const fix = rule.docs.exampleFix;
  const highlightedFix = fix
    ? await highlightHtml(fix.snippet, { lang: mapLang(fix.language) })
    : null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12" data-testid="rule-doc">
      <Link
        href="/rules"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" />
        All rules
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`font-mono text-xs ${SEVERITY_TONE[rule.severity]}`}>
            {rule.id}
          </Badge>
          <Badge variant="outline" className={`text-xs ${SEVERITY_TONE[rule.severity]}`}>
            {rule.severity}
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{rule.docs.summary}</h1>
      </header>

      <section className="space-y-3" aria-labelledby="why-it-matters-heading">
        <h2
          id="why-it-matters-heading"
          className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
        >
          Why it matters
        </h2>
        <MarkdownLite source={rule.docs.rationale} />
      </section>

      {fix && highlightedFix ? (
        <section className="space-y-3" aria-labelledby="example-fix-heading">
          <h2
            id="example-fix-heading"
            className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            Example fix
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{fix.title}</CardTitle>
            </CardHeader>
            <CardContent
              className="raw-tag-highlight overflow-x-auto p-0 font-mono text-xs"
              data-testid="rule-fix"
              data-language={fix.language}
              dangerouslySetInnerHTML={{ __html: highlightedFix }}
            />
          </Card>
        </section>
      ) : null}

      {rule.docs.references && rule.docs.references.length > 0 ? (
        <section className="space-y-3" aria-labelledby="references-heading">
          <h2
            id="references-heading"
            className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            References
          </h2>
          <ul className="space-y-1.5 text-sm">
            {rule.docs.references.map((ref) => (
              <li key={ref.href}>
                <a
                  className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  href={ref.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.label}
                  <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function mapLang(lang: "html" | "json" | "txt"): string {
  if (lang === "txt") return "text";
  return lang;
}
