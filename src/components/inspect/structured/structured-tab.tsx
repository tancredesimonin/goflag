import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { JsonLdBlock } from "@/lib/core/types";
import { validateJsonLdBlock } from "@/lib/structured/validate";
import type { JsonLdValidationIssue } from "@/lib/structured/types";
import { JsonTree } from "./json-tree";

export interface StructuredTabProps {
  blocks: JsonLdBlock[];
}

/**
 * Structured-data tab.
 *
 * Renders one card per `<script type="application/ld+json">` block with:
 *
 *   - the @type badges discovered in the block (top-level + @graph
 *     entities), so the user can scan a page's structured-data surface
 *     without expanding anything;
 *   - the validation summary (errors / warnings / info counts);
 *   - the typed JSON tree, with inline highlighting on every node that
 *     produced a validation issue.
 *
 * Validation runs in this server component (it's a pure synchronous
 * call) so the markup is fully rendered before it reaches the
 * browser — the JsonTree client island only owns the open/closed
 * state of each collapsible node.
 */
export function StructuredTab({ blocks }: StructuredTabProps) {
  if (blocks.length === 0) {
    return (
      <Card className="border-border/40 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">No JSON-LD blocks</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          This page declares no{" "}
          <code className="bg-muted rounded px-1 text-xs">application/ld+json</code> blocks. Check
          the Suggestions tab — Goflag may recommend adding one.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="structured-tab">
      {blocks.map((block) => {
        const issues = validateJsonLdBlock(block);
        const counts = countSeverities(issues);
        return (
          <Card key={block.index} data-testid="json-ld-card" data-block-index={block.index}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm font-medium">Block #{block.index + 1}</CardTitle>
                {block.types.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
                {counts.error > 0 ? (
                  <Badge
                    variant="outline"
                    className="text-destructive ml-auto text-[10px]"
                    data-testid="json-ld-error-count"
                  >
                    {counts.error} error{counts.error === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {counts.warning > 0 ? (
                  <Badge
                    variant="outline"
                    className={`text-[10px] text-amber-600 dark:text-amber-400 ${counts.error > 0 ? "" : "ml-auto"}`}
                  >
                    {counts.warning} warning{counts.warning === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {counts.error === 0 && counts.warning === 0 ? (
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400"
                    data-testid="json-ld-clean"
                  >
                    valid
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {block.parseError ? (
                <p className="text-destructive text-xs">
                  Parse error: <code className="bg-muted rounded px-1">{block.parseError}</code>
                </p>
              ) : (
                <JsonTree value={block.data} issues={issues} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function countSeverities(issues: JsonLdValidationIssue[]): {
  error: number;
  warning: number;
  info: number;
} {
  const out = { error: 0, warning: 0, info: 0 };
  for (const i of issues) out[i.severity] += 1;
  return out;
}
