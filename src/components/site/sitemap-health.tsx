import { AlertTriangle, Check, X } from "lucide-react";
import type { SitemapHealth } from "@/lib/core/sitemap/analyze";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SitemapHealthChecklistProps {
  health: SitemapHealth;
}

/**
 * The strengthened sitemap health panel: entry reachability, lastmod
 * hygiene, protocol/host consistency, robots conflicts, and orphan pages.
 * Presentational only — every signal comes from `analyzeSitemapHealth`.
 */
export function SitemapHealthChecklist({ health }: SitemapHealthChecklistProps) {
  const { reachable } = health;
  const reachPct =
    reachable.checked > 0 ? Math.round((reachable.ok / reachable.checked) * 100) : null;

  const checks: Array<{ label: string; ok: boolean; detail?: string }> = [
    {
      label: "Single protocol",
      ok: !health.mixedProtocol,
      detail: health.mixedProtocol ? "mixes http and https" : undefined,
    },
    {
      label: "Single host",
      ok: !health.mixedHost,
      detail: health.mixedHost ? "mixes www / apex hosts" : undefined,
    },
    {
      label: "lastmod hygiene",
      ok: health.lastmodIssues === 0,
      detail:
        health.lastmodIssues > 0 ? `${health.lastmodIssues} missing/malformed/future` : undefined,
    },
    {
      label: "No robots conflicts",
      ok: health.robotsConflicts === 0,
      detail: health.robotsConflicts > 0 ? `${health.robotsConflicts} disallowed` : undefined,
    },
  ];

  return (
    <Card className="border-border/60" data-testid="sitemap-health">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Health checks</CardTitle>
        {reachPct !== null ? (
          <Badge
            variant="outline"
            className={cn(
              "tabular-nums",
              reachable.broken === 0
                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/30 text-destructive",
            )}
            data-testid="reachable-pct"
          >
            {reachPct}% reachable
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {reachable.checked > 0 ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs" data-testid="reachable-stats">
            <Stat label="Checked" value={reachable.checked} />
            <Stat label="OK" value={reachable.ok} tone="ok" />
            <Stat label="Redirected" value={reachable.redirected} tone="redirect" />
            <Stat
              label="Broken"
              value={reachable.broken}
              tone={reachable.broken > 0 ? "broken" : undefined}
            />
            {health.orphanCount > 0 ? (
              <Stat label="Orphans" value={health.orphanCount} tone="warning" />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {checks.map((c) => (
            <span
              key={c.label}
              className="flex items-center gap-1.5 text-xs"
              data-testid="health-check"
              data-ok={c.ok}
            >
              {c.ok ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <X className="text-destructive size-3.5" />
              )}
              <span className={c.ok ? "text-foreground/80" : "text-muted-foreground"}>
                {c.label}
                {c.detail ? <span className="text-muted-foreground/70"> — {c.detail}</span> : null}
              </span>
            </span>
          ))}
        </div>

        {health.orphans.length > 0 ? (
          <details className="text-xs" data-testid="orphan-list">
            <summary className="text-muted-foreground flex cursor-pointer items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-500" />
              {health.orphans.length} orphan page{health.orphans.length === 1 ? "" : "s"} (linked
              but not in the sitemap)
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-5">
              {health.orphans.map((o) => (
                <li key={o} className="text-muted-foreground truncate font-mono">
                  {pathOf(o)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "redirect" | "broken" | "warning";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "redirect"
        ? "text-sky-600 dark:text-sky-400"
        : tone === "broken"
          ? "text-destructive"
          : tone === "warning"
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground";
  return (
    <span className="text-muted-foreground">
      {label}: <span className={cn("font-mono tabular-nums", toneClass)}>{value}</span>
    </span>
  );
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}
