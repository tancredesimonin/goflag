import type { RobotsProbe } from "@/lib/core/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface RobotsViewerProps {
  probe?: RobotsProbe;
}

export function RobotsViewer({ probe }: RobotsViewerProps) {
  if (!probe) {
    return (
      <Card className="border-border/40 border-dashed">
        <CardContent className="text-muted-foreground p-6 text-sm">
          robots.txt probe was disabled for this inspection.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">
          <code className="text-xs">{probe.url}</code>
        </CardTitle>
        <div className="flex items-center gap-2">
          {probe.blocksAll ? (
            <Badge variant="destructive" className="text-[10px] uppercase">
              Disallow: /
            </Badge>
          ) : null}
          <Badge
            variant={probe.found ? "secondary" : "outline"}
            className="font-mono tabular-nums"
            data-testid="robots-status"
          >
            {probe.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {probe.found && probe.raw ? (
          <pre
            className="bg-muted/30 max-h-80 overflow-auto rounded-md p-3 font-mono text-[11px] leading-relaxed"
            data-testid="robots-body"
          >
            {probe.raw}
          </pre>
        ) : (
          <p className="text-muted-foreground text-xs">No robots.txt body returned.</p>
        )}
        {probe.sitemaps.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground/60 text-[10px] tracking-wider uppercase">
              Sitemaps declared
            </span>
            <ul
              className="text-foreground/80 list-inside list-disc text-xs"
              data-testid="robots-sitemaps"
            >
              {probe.sitemaps.map((s) => (
                <li key={s} className="font-mono">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
