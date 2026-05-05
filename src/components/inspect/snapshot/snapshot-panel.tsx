import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SnapshotDiff, SnapshotDiffEntry } from "@/lib/snapshots/diff";

import { AcceptChangesButton } from "./accept-changes-button";

export interface SnapshotPanelProps {
  /** The route this panel is rendering for. */
  route: string;
  /** The URL that produced the current snapshot — passed back to the
   *  accept-changes server action so the engine can re-fetch. */
  url: string;
  /** Diff against the committed snapshot. `null` when no committed
   *  snapshot exists (the empty state). */
  diff: SnapshotDiff | null;
}

/**
 * The "Snapshot" tab body.
 *
 * Three states:
 *
 *   - **Empty**: no committed snapshot exists for this route. Shows a
 *     "Save snapshot" CTA that writes the current state as the baseline.
 *   - **Identical**: a committed snapshot exists and matches the live
 *     page. Shows a confirmation card; no action available.
 *   - **Diff**: shows the regression / addition / drift groupings, with
 *     an "Accept changes" CTA that overwrites the committed file.
 */
export function SnapshotPanel({ route, url, diff }: SnapshotPanelProps) {
  if (diff === null) {
    return (
      <Card data-testid="snapshot-empty">
        <CardHeader>
          <CardTitle>No committed snapshot</CardTitle>
          <CardDescription>
            Headlint hasn&apos;t seen this route before. Save the current state as the baseline so
            future runs can detect regressions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptChangesButton url={url} label="Save snapshot" variant="outline" />
        </CardContent>
      </Card>
    );
  }

  if (diff.identical) {
    return (
      <Card data-testid="snapshot-identical">
        <CardHeader>
          <CardTitle>No changes since the committed snapshot</CardTitle>
          <CardDescription>
            <code className="text-xs">{route}</code> matches its baseline byte-for-byte.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const buckets = bucket(diff.entries);

  return (
    <div className="space-y-6" data-testid="snapshot-diff">
      <Card>
        <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Snapshot diff</CardTitle>
            <CardDescription>
              <code className="text-xs">{route}</code> drifted from its committed baseline.
            </CardDescription>
          </div>
          <AcceptChangesButton url={url} />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <CountBadge count={buckets.regression.length} variant="destructive" label="regression" />
          <CountBadge count={buckets.addition.length} variant="default" label="addition" />
          <CountBadge
            count={buckets["content-drift"].length}
            variant="secondary"
            label="content drift"
          />
        </CardContent>
      </Card>

      <DiffGroup title="Regressions" entries={buckets.regression} tone="destructive" />
      <DiffGroup title="Additions" entries={buckets.addition} tone="default" />
      <DiffGroup title="Content drift" entries={buckets["content-drift"]} tone="muted" />
    </div>
  );
}

function bucket(
  entries: SnapshotDiffEntry[],
): Record<SnapshotDiffEntry["class"], SnapshotDiffEntry[]> {
  const out: Record<SnapshotDiffEntry["class"], SnapshotDiffEntry[]> = {
    regression: [],
    addition: [],
    "content-drift": [],
  };
  for (const e of entries) out[e.class].push(e);
  return out;
}

function CountBadge({
  count,
  label,
  variant,
}: {
  count: number;
  label: string;
  variant: "default" | "secondary" | "destructive";
}): ReactNode {
  if (count === 0) return null;
  return (
    <Badge variant={variant}>
      {count} {label}
      {count === 1 ? "" : "s"}
    </Badge>
  );
}

function DiffGroup({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: SnapshotDiffEntry[];
  tone: "destructive" | "default" | "muted";
}) {
  if (entries.length === 0) return null;
  return (
    <section
      className="space-y-2"
      data-testid={`group-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <h3 className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase">
        {title} ({entries.length})
      </h3>
      <ul className="border-border divide-border divide-y rounded-md border">
        {entries.map((entry, idx) => (
          <li key={`${entry.kind}:${entry.key}:${idx}`} className="flex flex-col gap-1 p-3">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  tone === "destructive"
                    ? "destructive"
                    : tone === "default"
                      ? "default"
                      : "outline"
                }
                className="text-[10px]"
              >
                {kindLabel(entry.kind)}
              </Badge>
              <code className="text-xs">{entry.key}</code>
            </div>
            {(entry.before !== undefined || entry.after !== undefined) && (
              <div className="text-muted-foreground text-xs">
                {entry.before !== undefined && (
                  <>
                    <span className="font-medium">before:</span>{" "}
                    <code className="text-[11px]">{entry.before}</code>
                  </>
                )}
                {entry.before !== undefined && entry.after !== undefined && <span> → </span>}
                {entry.after !== undefined && (
                  <>
                    <span className="font-medium">after:</span>{" "}
                    <code className="text-[11px]">{entry.after}</code>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function kindLabel(kind: SnapshotDiffEntry["kind"]): string {
  if (kind === "tag") return "tag";
  if (kind === "jsonld-type") return "json-ld type";
  if (kind === "jsonld-field") return "json-ld field";
  return "rule";
}
