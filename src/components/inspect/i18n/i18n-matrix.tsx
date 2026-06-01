"use client";

import { Check, ExternalLink, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { I18nMatrix } from "@/lib/core/i18n";

export interface I18nMatrixProps {
  matrix: I18nMatrix;
  /**
   * Optional set of `(route, locale)` pairs that should be highlighted
   * as having reciprocity issues even when the cell is filled. Each
   * key is `${route}|${locale}`.
   */
  brokenPairs?: Set<string>;
}

/**
 * Hreflang reciprocity matrix.
 *
 * Rows are routes, columns are locales. Each cell is one of:
 *
 *   - filled, inspected (green check, link to the URL),
 *   - filled, declared but not inspected (amber dot),
 *   - filled but flagged as broken via `brokenPairs` (red X),
 *   - empty (muted dash).
 *
 * The cell text deliberately stays small — the matrix gets noisy fast
 * once a real i18n site has 10+ routes, so we treat density as a
 * feature. Hover shows the full URL via the native `title` attribute
 * (no Tooltip primitive: the matrix tab can render hundreds of cells
 * and Radix tooltips per cell would burn re-renders).
 */
export function I18nMatrixGrid({ matrix, brokenPairs }: I18nMatrixProps) {
  if (matrix.routes.length === 0 || matrix.locales.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="i18n-matrix-empty">
        No hreflang data discovered. Crawl with{" "}
        <code className="bg-muted rounded px-1">--depth 1</code> or higher to populate the matrix.
      </p>
    );
  }

  const gridTemplate = `minmax(8rem, 16rem) repeat(${matrix.locales.length}, minmax(2.5rem, 1fr))`;

  return (
    <div
      className="border-border/60 overflow-x-auto rounded-lg border"
      data-testid="i18n-matrix"
      data-route-count={matrix.routes.length}
      data-locale-count={matrix.locales.length}
    >
      <div
        className="divide-border/60 grid divide-y text-xs"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div
          className="bg-muted/40 text-muted-foreground/80 col-span-full grid font-medium"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-3 py-2">Route</div>
          {matrix.locales.map((locale) => (
            <div key={locale} className="px-2 py-2 text-center" data-testid="i18n-matrix-locale">
              <Badge variant="outline" className="font-mono text-[10px]">
                {locale}
              </Badge>
            </div>
          ))}
        </div>
        {matrix.routes.map((route) => (
          <div
            key={route}
            className="divide-border/40 col-span-full grid divide-x"
            style={{ gridTemplateColumns: gridTemplate }}
            data-testid="i18n-matrix-row"
            data-route={route}
          >
            <div className="text-muted-foreground px-3 py-2 font-mono text-xs">{route}</div>
            {matrix.locales.map((locale) => {
              const cell = matrix.cells[route]?.[locale];
              const broken = brokenPairs?.has(`${route}|${locale}`) ?? false;
              return (
                <Cell
                  key={locale}
                  url={cell?.url ?? null}
                  inspected={cell?.inspected ?? false}
                  broken={broken}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

interface CellProps {
  url: string | null;
  inspected: boolean;
  broken: boolean;
}

function Cell({ url, inspected, broken }: CellProps) {
  if (url === null) {
    return (
      <div
        className="text-muted-foreground/40 flex items-center justify-center px-2 py-2"
        data-testid="i18n-matrix-cell"
        data-state="missing"
      >
        —
      </div>
    );
  }
  const tone = broken
    ? "text-destructive bg-destructive/10"
    : inspected
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : "text-amber-600 dark:text-amber-400 bg-amber-500/10";
  const icon = broken ? <X className="size-3.5" /> : <Check className="size-3.5" />;
  const state = broken ? "broken" : inspected ? "inspected" : "declared";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className={cn(
        "flex items-center justify-center gap-1 px-2 py-2 transition-colors hover:underline",
        tone,
      )}
      data-testid="i18n-matrix-cell"
      data-state={state}
    >
      {icon}
      <ExternalLink className="size-3 opacity-70" />
    </a>
  );
}
