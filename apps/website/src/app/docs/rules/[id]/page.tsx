import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsPage } from "@/components/docs/docs-page";
import { stripTicks, Ticks } from "@/components/docs/ticks";
import { Badge } from "@/components/ui/badge";
import { highlight } from "@/lib/highlight";
import { ALL_RULES, type RuleSeverity } from "@/lib/rules-catalog";
import { buildDocsMetadata, clampDescription } from "@/lib/seo/metadata";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

const SEVERITY_CLASS: Record<RuleSeverity, string> = {
  error: "border-flag-red/40 text-flag-red",
  warning: "border-flag-yellow/40 text-flag-yellow",
  info: "text-muted-foreground",
};

export function generateStaticParams() {
  return ALL_RULES.map((rule) => ({ id: rule.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const rule = ALL_RULES.find((entry) => entry.id === id);
  if (!rule) return {};

  return buildDocsMetadata({
    path: `/docs/rules/${rule.id}`,
    // The rule id is the thing people search for and the thing a report prints,
    // so it leads. Appending the summary pushed every one of these past the
    // 60-character window the tool itself reports on.
    title: `${rule.id}: goflag rule`,
    absoluteTitle: true,
    // Summary then reason: three of the summaries are short enough on their own
    // to fall under the 50-character floor the tool also reports on.
    description: clampDescription(`${stripTicks(rule.summary)}. ${stripTicks(rule.why)}`),
  });
}

export default async function RulePage({ params }: PageProps) {
  const { id } = await params;
  const rule = ALL_RULES.find((entry) => entry.id === id);
  if (!rule) notFound();

  const snippet = rule.fix ? await highlight(rule.fix.snippet, rule.fix.language) : null;

  return (
    <DocsPage
      title={rule.id}
      description={stripTicks(rule.summary)}
      href="/docs/rules"
      breadcrumb={{ label: "Rule catalogue", href: "/docs/rules" }}
    >
      <div className="mb-8 flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className={cn("font-mono text-xs font-normal", SEVERITY_CLASS[rule.severity])}
        >
          {rule.severity}
        </Badge>
        <Badge variant="outline" className="font-mono text-xs font-normal">
          {rule.scope === "site" ? "site-wide" : "per page"}
        </Badge>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight">Why it matters</h2>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          <Ticks>{rule.why}</Ticks>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          What the finding looks like
        </h2>
        <p className="text-muted-foreground mt-3 text-sm">
          The message goflag prints, with example values substituted.
        </p>
        <div className="bg-terminal text-terminal-foreground border-terminal-border mt-4 overflow-x-auto rounded-lg border px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
          <span className={cn(SEVERITY_CLASS[rule.severity].split(" ").pop())}>
            {rule.severity === "warning" ? "warn " : rule.severity}
          </span>{" "}
          <span className="text-terminal-dim">{rule.id}</span> {stripTicks(rule.message)}
        </div>
      </section>

      {rule.fix && snippet ? (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">{rule.fix.title}</h2>
          <p className="text-muted-foreground mt-3 text-sm">
            Written for the Next.js App Router. The finding is correct on any stack; only the remedy
            assumes one.
          </p>
          <div
            className="[&_pre]:bg-muted [&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[0.8125rem] [&_pre]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: snippet }}
          />
        </section>
      ) : (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">How to fix it</h2>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            This rule ships no snippet, because the remedy is a judgement rather than a line of
            code: the finding tells you what is out of range, and what to put there is yours to
            decide.
          </p>
        </section>
      )}

      {/* The rigor level is announced once, on the catalogue page, rather than
          repeated verbatim under every rule. This section returns when the
          registry actually carries per-rule rigor data (phase 3). */}
    </DocsPage>
  );
}
