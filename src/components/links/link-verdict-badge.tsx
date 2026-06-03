import type { LinkVerdict } from "@/lib/core/links/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface VerdictMeta {
  label: string;
  /** Tailwind classes for the badge surface. */
  className: string;
  /** Short, human description for tooltips / legends. */
  description: string;
}

/**
 * Single source of truth for how each verdict is labelled and coloured,
 * shared by the summary, the table, and the legend.
 */
export const VERDICT_META: Record<LinkVerdict, VerdictMeta> = {
  ok: {
    label: "OK",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    description: "2xx — resolves cleanly",
  },
  redirect: {
    label: "Redirect",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    description: "3xx resolving to 2xx — a signal, not a break",
  },
  broken: {
    label: "Broken",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    description: "4xx / 5xx / network failure",
  },
  blocked: {
    label: "Blocked",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    description: "403 / 429 — likely anti-bot, triage manually",
  },
  warning: {
    label: "Warning",
    className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    description: "Soft-404 / suspicious",
  },
  skipped: {
    label: "Skipped",
    className: "border-border bg-muted/40 text-muted-foreground",
    description: "Non-http scheme (mailto:, tel:, …)",
  },
};

export const VERDICT_ORDER: LinkVerdict[] = [
  "ok",
  "redirect",
  "broken",
  "blocked",
  "warning",
  "skipped",
];

export interface LinkVerdictBadgeProps {
  verdict: LinkVerdict;
  className?: string;
}

export function LinkVerdictBadge({ verdict, className }: LinkVerdictBadgeProps) {
  const meta = VERDICT_META[verdict];
  return (
    <Badge
      variant="outline"
      className={cn("h-5 px-1.5 text-[10px] font-medium uppercase", meta.className, className)}
      title={meta.description}
      data-testid="link-verdict-badge"
      data-verdict={verdict}
    >
      {meta.label}
    </Badge>
  );
}
