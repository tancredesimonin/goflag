import { AlertTriangle } from "lucide-react";
import type { LinkAuditReport } from "@/lib/core/links/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VERDICT_META, VERDICT_ORDER } from "./link-verdict-badge";

export interface LinkAuditSummaryProps {
  report: LinkAuditReport;
}

/**
 * Header card for the link audit: per-verdict counts, pages scanned, and
 * the unique-link total. Presentational — every number is precomputed in
 * the report. Mirrors `SitemapAnalysis`.
 */
export function LinkAuditSummary({ report }: LinkAuditSummaryProps) {
  const uniqueChecked = Object.keys(report.checks).length;

  return (
    <Card className="border-border/60" data-testid="link-audit-summary">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">
          <code className="text-xs">{hostOf(report.baseUrl)}</code>
          <span className="text-muted-foreground ml-2 text-xs font-normal">link health</span>
        </CardTitle>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            <span className="text-foreground font-mono tabular-nums">{report.pagesScanned}</span>{" "}
            pages
          </span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-mono tabular-nums">{uniqueChecked}</span> links
          </span>
          {report.truncated ? (
            <Badge variant="outline" className="text-amber-500">
              Truncated
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" data-testid="verdict-counts">
          {VERDICT_ORDER.map((verdict) => {
            const count = report.summary[verdict];
            const meta = VERDICT_META[verdict];
            return (
              <span
                key={verdict}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  count > 0 ? meta.className : "border-border/60 text-muted-foreground/70",
                )}
                data-testid="verdict-count"
                data-verdict={verdict}
              >
                <span className="font-medium">{meta.label}</span>
                <span className="font-mono tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>

        {report.diagnostics.pagesFailed > 0 ? (
          <p className="text-muted-foreground text-xs">
            {report.diagnostics.pagesFailed} page
            {report.diagnostics.pagesFailed === 1 ? "" : "s"} could not be scanned.
          </p>
        ) : null}

        {report.diagnostics.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1" data-testid="link-audit-warnings">
            {report.diagnostics.warnings.map((w) => (
              <li key={w} className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
