import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Page } from "@/lib/core/types";
import { buildI18nMatrix, reciprocityIssues, type ReciprocityIssue } from "@/lib/core/i18n";
import { I18nMatrixGrid } from "./i18n-matrix";

export interface I18nTabProps {
  /** The page actively being inspected. */
  page: Page;
  /**
   * Sister pages from the most recent crawl (Phase 7.1) that share an
   * origin with `page`. Empty when no crawl has run — in that case we
   * surface a hint that crawling is required to populate the matrix.
   */
  crawledPages?: Page[];
}

/**
 * The Phase 7 i18n tab.
 *
 * The single-page mode (no crawl) surfaces the hreflang alternates
 * declared on the active page plus the same x-default + locale-tag
 * checks the matrix engine emits — this matches what existed before
 * Phase 7 so no flow regresses.
 *
 * The crawl mode adds the reciprocity matrix and per-pair issue list
 * derived from the crawled `Page[]`. Both modes route through the
 * same `reciprocityIssues()` engine so what shows here matches what
 * `headlint inspect --crawl --json` returns to CI.
 */
export function I18nTab({ page, crawledPages }: I18nTabProps) {
  const universe = crawledPages && crawledPages.length > 0 ? crawledPages : [page];
  const matrix = buildI18nMatrix(universe);
  const issues = reciprocityIssues(universe);
  const brokenPairs = brokenPairKeys(matrix.routes, issues);

  const counts = countIssues(issues);
  const totalAlternates = matrix.routes.reduce((acc, r) => {
    return (
      acc + matrix.locales.reduce((rowAcc, l) => rowAcc + (matrix.cells[r]?.[l]?.url ? 1 : 0), 0)
    );
  }, 0);

  return (
    <div className="space-y-4" data-testid="i18n-tab">
      <Card>
        <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">Hreflang matrix</CardTitle>
            <p className="text-muted-foreground text-xs">
              {matrix.routes.length} route(s) × {matrix.locales.length} locale(s) —{" "}
              {totalAlternates} cell(s) declared.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {counts.error > 0 ? (
              <Badge variant="outline" className="text-destructive text-[10px]">
                {counts.error} error{counts.error === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {counts.warning > 0 ? (
              <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                {counts.warning} warning{counts.warning === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {counts.error === 0 && counts.warning === 0 ? (
              <Badge
                variant="outline"
                className="text-[10px] text-emerald-600 dark:text-emerald-400"
                data-testid="i18n-clean"
              >
                reciprocal
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <I18nMatrixGrid matrix={matrix} brokenPairs={brokenPairs} />
        </CardContent>
      </Card>

      {issues.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reciprocity issues</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm" data-testid="i18n-issues">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className="border-border/60 bg-muted/30 rounded-md border px-3 py-2"
                  data-code={issue.code}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {issue.code}
                    </Badge>
                    {issue.locale ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {issue.locale}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {issue.message}
                  </p>
                  <p className="text-muted-foreground/70 mt-1 truncate font-mono text-[11px]">
                    {issue.url}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!crawledPages || crawledPages.length === 0 ? (
        <p className="text-muted-foreground/80 text-xs">
          Tip: run{" "}
          <code className="bg-muted rounded px-1">
            headlint inspect &lt;url&gt; --crawl --depth 2
          </code>{" "}
          to populate every route × locale cell.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Walks the issue list and returns a `route|locale` set the matrix
 * uses to flag specific cells red. Only `missing-back-link` and
 * `self-mismatch` issues are pinned to a cell — the others are
 * page-wide.
 */
function brokenPairKeys(routes: string[], issues: ReciprocityIssue[]): Set<string> {
  const out = new Set<string>();
  for (const issue of issues) {
    if (issue.code !== "missing-back-link" && issue.code !== "self-mismatch") continue;
    if (!issue.locale) continue;
    const route = guessRoute(issue.url, routes);
    if (route) out.add(`${route}|${issue.locale}`);
  }
  return out;
}

function guessRoute(url: string, routes: string[]): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  // Try each known route, longest first, and return the one that's
  // the suffix of the pathname.
  const sorted = [...routes].sort((a, b) => b.length - a.length);
  for (const r of sorted) {
    if (parsed.pathname === r || parsed.pathname.endsWith(r)) return r;
  }
  return undefined;
}

function countIssues(issues: ReciprocityIssue[]): { error: number; warning: number } {
  let error = 0;
  let warning = 0;
  for (const issue of issues) {
    if (issue.code === "missing-back-link" || issue.code === "self-mismatch") error += 1;
    else warning += 1;
  }
  return { error, warning };
}
