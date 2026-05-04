"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { originKey } from "@/lib/core/origin-key";
import { summariseIssues } from "@/lib/core/lint";
import type { Issue, Severity } from "@/lib/core/types";
import { JUMP_TO_ORIGIN_EVENT } from "@/components/inspect/raw/raw-head-viewer";

export interface IssuesTabProps {
  issues: Issue[];
  /**
   * Called by issue rows when the user clicks "Jump to tag". The tab
   * container handles the actual tab switch + scroll; the IssuesTab
   * itself only knows how to dispatch the request.
   */
  onJump?: (originKey: string) => void;
}

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

const SEVERITY_META: Record<
  Severity,
  { label: string; tone: string; ring: string; icon: typeof CircleAlert }
> = {
  error: {
    label: "Errors",
    tone: "text-destructive",
    ring: "border-destructive/40 bg-destructive/5",
    icon: CircleAlert,
  },
  warning: {
    label: "Warnings",
    tone: "text-amber-600 dark:text-amber-400",
    ring: "border-amber-400/40 bg-amber-50/40 dark:bg-amber-500/5",
    icon: TriangleAlert,
  },
  info: {
    label: "Info",
    tone: "text-sky-600 dark:text-sky-400",
    ring: "border-sky-400/40 bg-sky-50/40 dark:bg-sky-500/5",
    icon: Info,
  },
};

/**
 * Issues tab — the report side of Headlint. Renders the lint output as
 * three severity-ordered groups of cards, each card carrying its rule
 * id, message, optional fix snippet, and optional "Jump to tag" link
 * back into the Raw viewer.
 *
 * Decisions worth knowing about before editing this file:
 *
 *  - The component is a **client** component because it dispatches the
 *    `JUMP_TO_ORIGIN_EVENT` custom event the Raw viewer listens for.
 *    Lint results themselves are computed on the server (in
 *    `inspect-view.tsx`) and passed in via props — we don't re-run the
 *    rules in the browser.
 *  - Severity ordering matches `lint()`'s sort: error > warning > info.
 *    Within a group we keep the rule order `lint()` already produced
 *    (alphabetical by rule id) — predictable diffing in screenshots
 *    and snapshot tests.
 *  - The "Jump to tag" button is a `<button>` rather than an
 *    `<a href="#…">` so we don't rewrite the URL for every click. The
 *    underlying anchor target on the Raw viewer is still id-addressable
 *    if a user wants to deep-link from outside (Phase 8 might wire that
 *    up).
 */
export function IssuesTab({ issues, onJump }: IssuesTabProps) {
  const grouped = useMemo(() => {
    const out: Record<Severity, Issue[]> = { error: [], warning: [], info: [] };
    for (const issue of issues) out[issue.severity].push(issue);
    return out;
  }, [issues]);
  const counts = useMemo(() => summariseIssues(issues), [issues]);

  function dispatchJump(key: string) {
    if (onJump) {
      onJump(key);
      return;
    }
    document.dispatchEvent(new CustomEvent(JUMP_TO_ORIGIN_EVENT, { detail: key }));
  }

  if (issues.length === 0) {
    return (
      <Card className="border-emerald-400/40 bg-emerald-50/40 dark:bg-emerald-500/5">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
          <CardTitle className="text-sm font-medium">No issues detected</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Headlint ran all 25 rules against this page and didn&apos;t find anything to report.
          That&apos;s rare — congrats.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="issues-tab">
      <SeveritySummary counts={counts} />
      <div className="space-y-6">
        {SEVERITY_ORDER.map((severity) => {
          const bucket = grouped[severity];
          if (bucket.length === 0) return null;
          return (
            <SeveritySection
              key={severity}
              severity={severity}
              issues={bucket}
              onJump={dispatchJump}
            />
          );
        })}
      </div>
    </div>
  );
}

function SeveritySummary({ counts }: { counts: Record<Severity, number> }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="issues-summary">
      {SEVERITY_ORDER.map((severity) => {
        const meta = SEVERITY_META[severity];
        const count = counts[severity];
        const Icon = meta.icon;
        return (
          <Badge
            key={severity}
            variant="outline"
            className={cn(
              "gap-1.5 px-2.5 py-1 text-xs font-medium",
              count > 0 ? meta.tone : "text-muted-foreground/60",
            )}
            data-testid={`issues-count-${severity}`}
          >
            <Icon className="size-3.5" data-icon="inline-start" />
            {count} {meta.label.toLowerCase()}
          </Badge>
        );
      })}
    </div>
  );
}

function SeveritySection({
  severity,
  issues,
  onJump,
}: {
  severity: Severity;
  issues: Issue[];
  onJump: (key: string) => void;
}) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <section
      aria-labelledby={`issues-${severity}-heading`}
      className="space-y-3"
      data-testid={`issues-section-${severity}`}
    >
      <h3
        id={`issues-${severity}-heading`}
        className={cn("flex items-center gap-2 text-sm font-medium", meta.tone)}
      >
        <Icon className="size-4" />
        {meta.label}
        <span className="text-muted-foreground/70 text-xs tabular-nums">({issues.length})</span>
      </h3>
      <ul className="space-y-3" data-testid={`issues-list-${severity}`}>
        {issues.map((issue, idx) => (
          <li key={`${issue.ruleId}-${idx}`}>
            <IssueCard issue={issue} onJump={onJump} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueCard({ issue, onJump }: { issue: Issue; onJump: (key: string) => void }) {
  const meta = SEVERITY_META[issue.severity];
  const docsHref = issue.docs ?? `/rules/${issue.ruleId}`;
  return (
    <Card
      className={cn("border", meta.ring)}
      data-testid="issue-card"
      data-rule-id={issue.ruleId}
      data-severity={issue.severity}
    >
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("font-mono text-[10px]", meta.tone)}>
            {issue.ruleId}
          </Badge>
          <CardTitle className="text-sm leading-snug font-medium">{issue.message}</CardTitle>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground self-start text-xs"
          render={
            <Link href={docsHref} data-testid="issue-docs-link">
              <BookOpen className="size-3.5" />
              Learn more
            </Link>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        {issue.suggestion ? (
          <p className="text-muted-foreground">
            Suggested value:{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">{issue.suggestion}</code>
          </p>
        ) : null}
        {issue.fix ? <FixSnippet fix={issue.fix} /> : null}
        {issue.origin ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => onJump(originKey(issue.origin!))}
            data-testid="issue-jump-button"
          >
            Jump to tag
            <ArrowRight className="size-3.5" />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FixSnippet({ fix }: { fix: NonNullable<Issue["fix"]> }) {
  return (
    <div className="space-y-1.5" data-testid="issue-fix">
      <p className="text-muted-foreground/80 text-xs">{fix.title}</p>
      <ScrollArea className="border-border/60 bg-muted/40 max-h-48 rounded-md border">
        <pre
          className="p-3 font-mono text-xs whitespace-pre-wrap"
          data-testid="issue-fix-snippet"
          data-language={fix.language}
        >
          {fix.snippet}
        </pre>
      </ScrollArea>
    </div>
  );
}
