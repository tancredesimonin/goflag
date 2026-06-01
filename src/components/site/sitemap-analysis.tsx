import { AlertTriangle, Check, X } from "lucide-react";
import type { SiteDiscovery } from "@/lib/core/sitemap/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface SitemapAnalysisProps {
  discovery: SiteDiscovery;
}

const SOURCE_LABEL: Record<SiteDiscovery["source"], string> = {
  robots: "via robots.txt",
  "well-known": "via well-known path",
  crawl: "via crawl",
};

/**
 * Site-level "is this sitemap healthy?" panel — the sitemap analogue of
 * the robots.txt viewer in the Assets tab. Presentational only; every
 * signal is precomputed in `discovery.diagnostics`.
 */
export function SitemapAnalysis({ discovery }: SitemapAnalysisProps) {
  const { diagnostics: d } = discovery;
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "robots.txt reachable", ok: d.robotsFound },
    { label: "Sitemap found", ok: d.found },
    { label: "Declared in robots.txt", ok: d.declaredInRobots },
    { label: "Well-formed XML", ok: d.wellFormed },
  ];

  return (
    <Card className="border-border/60" data-testid="sitemap-analysis">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">
          {d.sitemapUrl ? (
            <code className="text-xs">{d.sitemapUrl}</code>
          ) : (
            <span className="text-muted-foreground">No sitemap located</span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">
            {SOURCE_LABEL[discovery.source]}
          </Badge>
          {d.isIndex ? (
            <Badge variant="secondary" className="text-[10px] uppercase">
              Index · {d.childSitemapCount}
            </Badge>
          ) : null}
          <Badge
            variant={d.found ? "secondary" : "outline"}
            className="font-mono tabular-nums"
            data-testid="sitemap-status"
          >
            {d.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {checks.map((c) => (
            <span
              key={c.label}
              className="flex items-center gap-1.5 text-xs"
              data-testid="sitemap-check"
              data-ok={c.ok}
            >
              {c.ok ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <X className="text-muted-foreground/60 size-3.5" />
              )}
              <span className={c.ok ? "text-foreground/80" : "text-muted-foreground"}>
                {c.label}
              </span>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            URLs collected:{" "}
            <span className="text-foreground font-mono tabular-nums">{d.urlCount}</span>
          </span>
          {d.childSitemapCount > 0 ? (
            <span className="text-muted-foreground">
              Child sitemaps:{" "}
              <span className="text-foreground font-mono tabular-nums">{d.childSitemapCount}</span>
              {d.childSitemapErrors > 0 ? (
                <span className="text-destructive"> ({d.childSitemapErrors} failed)</span>
              ) : null}
            </span>
          ) : null}
          {discovery.truncated ? (
            <span className="text-amber-500">Truncated (cap reached)</span>
          ) : null}
        </div>

        {d.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1" data-testid="sitemap-warnings">
            {d.warnings.map((w) => (
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
