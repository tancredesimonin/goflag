import type { ManifestProbe } from "@/lib/core/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ManifestViewerProps {
  probe?: ManifestProbe;
}

export function ManifestViewer({ probe }: ManifestViewerProps) {
  if (!probe) {
    return (
      <Card className="border-border/40 border-dashed">
        <CardContent className="text-muted-foreground p-6 text-sm">
          No <code>&lt;link rel=&quot;manifest&quot;&gt;</code> declared.
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
        <Badge
          variant={probe.found ? "secondary" : "destructive"}
          className="font-mono tabular-nums"
          data-testid="manifest-status"
        >
          {probe.status}
        </Badge>
      </CardHeader>
      <CardContent>
        {probe.parseError ? (
          <p className="text-destructive text-xs" data-testid="manifest-error">
            Parse error: {probe.parseError}
          </p>
        ) : probe.data !== undefined ? (
          <pre
            className="bg-muted/30 max-h-80 overflow-auto rounded-md p-3 font-mono text-[11px] leading-relaxed"
            data-testid="manifest-json"
          >
            {JSON.stringify(probe.data, null, 2)}
          </pre>
        ) : probe.raw ? (
          <pre className="bg-muted/30 max-h-80 overflow-auto rounded-md p-3 font-mono text-[11px]">
            {probe.raw}
          </pre>
        ) : (
          <p className="text-muted-foreground text-xs">Manifest fetch returned no body.</p>
        )}
      </CardContent>
    </Card>
  );
}
