"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RotateCw, Globe2, Clock3, Hash } from "lucide-react";
import { toast } from "sonner";
import { runInspect } from "@/app/actions/inspect";
import type { Page } from "@/lib/core/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface PageHeaderCardProps {
  page: Page;
}

/**
 * Top-of-inspect-view summary card.
 *
 * Shows the inspected URL, the page's own title/description/canonical, the
 * fetch status + duration, the extractor mode (with an "auto-escalated"
 * badge when relevant), and a Re-fetch button that re-runs the engine and
 * refreshes the route.
 */
export function PageHeaderCard({ page }: PageHeaderCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refetch() {
    startTransition(async () => {
      const result = await runInspect({ url: page.fetch.requestedUrl });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Re-fetched");
      router.refresh();
    });
  }

  const title = page.meta.title?.value ?? page.raw.title ?? "(untitled)";
  const description = page.meta.description?.value;
  const canonical = page.meta.canonical?.value;
  const isOk = page.fetch.status >= 200 && page.fetch.status < 300;

  return (
    <Card className="border-border/60">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant={isOk ? "secondary" : "destructive"}
              className="font-mono tabular-nums"
              data-testid="header-status"
            >
              {page.fetch.status} {page.fetch.statusText || (isOk ? "OK" : "")}
            </Badge>
            <ExtractorBadge page={page} />
            <a
              href={page.fetch.requestedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate font-mono"
              data-testid="header-url"
            >
              <span className="truncate">{page.fetch.requestedUrl}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </div>

          <h1
            className="text-2xl leading-tight font-semibold tracking-tight"
            data-testid="header-title"
          >
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground max-w-3xl text-sm" data-testid="header-description">
              {description}
            </p>
          ) : (
            <p className="text-muted-foreground/60 max-w-3xl text-sm italic">
              No <code>&lt;meta name=&quot;description&quot;&gt;</code>
            </p>
          )}
        </div>

        <Separator className="opacity-50" />

        <div className="text-muted-foreground grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <Stat
            icon={<Globe2 className="size-3.5" />}
            label="Canonical"
            value={canonical ?? "(none)"}
            mono
          />
          <Stat
            icon={<Clock3 className="size-3.5" />}
            label="Fetch time"
            value={`${page.fetch.durationMs} ms · ${formatBytes(page.fetch.bodyBytes)}`}
          />
          <Stat
            icon={<Hash className="size-3.5" />}
            label="Final URL"
            value={
              page.fetch.finalUrl === page.fetch.requestedUrl
                ? "no redirects"
                : `${page.fetch.finalUrl} (${page.fetch.redirectCount}×)`
            }
            mono
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isPending}
            data-testid="refetch-button"
          >
            <RotateCw className={cn("size-3.5", isPending && "animate-spin")} />
            {isPending ? "Re-fetching…" : "Re-fetch"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExtractorBadge({ page }: { page: Page }) {
  if (page.extractor.mode === "headless") {
    return (
      <Badge variant="outline" className="font-mono">
        {page.extractor.escalated ? "headless · auto" : "headless"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono">
      static
    </Badge>
  );
}

function Stat({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground/60 inline-flex items-center gap-1 text-[10px] tracking-wider uppercase">
        {icon}
        {label}
      </span>
      <span className={cn("text-foreground/80 truncate text-xs", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
