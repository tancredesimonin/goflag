import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The route × locale matrix, drawn.
 *
 * The section this sits in is headed "The matrix" and drew nothing, while
 * `components/home/workflow/check-flows.tsx` drew one to sell the product six
 * sections up the landing page. The reference page described what the marketing
 * page showed.
 *
 * ## A table, not an SVG
 *
 * `docs/visuals-plan.md` V3 says a diagram is inline SVG, and that is right for
 * the shapes with real geometry. A matrix is not one of those: it is a grid of
 * labelled cells, which is what a table element *is*. Written as SVG it would
 * lose the row and column headers a screen reader navigates by, stop reflowing
 * on a narrow screen, and need its own text sizing. The geometry is the
 * semantics.
 *
 * ## Shared with the page's other figure, not with the landing
 *
 * `MatrixTable` is exported because `phantom-locale.tsx` draws the same grid
 * further down the same page, in the same vocabulary, for the same reader.
 * Extracting the landing's matrix instead would have been the wrong sharing: it
 * has two cell states because it makes one point inside a switcher, and
 * generalising it would oblige a sales pitch to carry a distinction it never
 * makes.
 */

/** The three ways a cell gets filled, plus the absence that is the finding. */
export type Cell = "crawled" | "sitemap" | "alternate" | "hole";

export interface MatrixRow {
  route: string;
  cells: Record<string, Cell>;
}

export const MATRIX_CELLS: Record<Cell, { className: string; label: string }> = {
  crawled: {
    className: "bg-flag-green/15 border-flag-green/50 text-flag-green",
    label: "fetched by the crawl",
  },
  sitemap: {
    className: "bg-flag-green/5 border-flag-green/30 text-flag-green/70 border-dashed",
    label: "listed in the sitemap, not fetched",
  },
  alternate: {
    className: "bg-flag-yellow/10 border-flag-yellow/50 text-flag-yellow border-dotted",
    label: "declared by an hreflang, nothing else",
  },
  hole: {
    className: "bg-flag-red/10 border-flag-red/50 text-flag-red",
    label: "a hole — the finding",
  },
};

export const MATRIX_GLYPH: Record<Cell, string> = {
  crawled: "●",
  sitemap: "◐",
  alternate: "◌",
  hole: "✕",
};

/** One cell, carrying its state as a glyph and as text, never as colour alone. */
function CellBox({ cell, title }: { cell: Cell; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded border align-middle",
        MATRIX_CELLS[cell].className,
      )}
    >
      <span className="sr-only">{MATRIX_CELLS[cell].label}</span>
      <span aria-hidden="true">{MATRIX_GLYPH[cell]}</span>
    </span>
  );
}

export function MatrixTable({
  locales,
  rows,
  caption,
  phantom,
}: {
  locales: readonly string[];
  rows: readonly MatrixRow[];
  caption: ReactNode;
  /** A column to mark as a locale the site does not actually serve. */
  phantom?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full border-separate border-spacing-1 font-mono text-xs">
        <caption className="text-muted-foreground mb-3 text-left text-sm">{caption}</caption>
        <thead>
          <tr>
            <th />
            {locales.map((locale) => (
              <th
                key={locale}
                scope="col"
                className={cn(
                  "px-2 pb-1 text-center font-normal",
                  locale === phantom
                    ? "text-flag-red font-semibold underline decoration-dotted underline-offset-4"
                    : "text-muted-foreground",
                )}
              >
                {locale}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ route, cells }) => (
            <tr key={route}>
              <th
                scope="row"
                className="text-muted-foreground pr-3 text-left font-normal whitespace-nowrap"
              >
                {route}
              </th>
              {locales.map((locale) => (
                <td key={locale} className="px-1 text-center">
                  <CellBox
                    cell={cells[locale]!}
                    title={`${route} in ${locale}: ${MATRIX_CELLS[cells[locale]!].label}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The legend, shared for the same reason the table is. */
export function MatrixLegend({ only }: { only?: readonly Cell[] }) {
  const cells = only ?? (Object.keys(MATRIX_CELLS) as Cell[]);
  return (
    <>
      {cells.map((cell) => (
        <span key={cell} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded border font-mono text-xs",
              MATRIX_CELLS[cell].className,
            )}
          >
            {MATRIX_GLYPH[cell]}
          </span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{cell}</span> — {MATRIX_CELLS[cell].label}
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * Four routes, chosen so every state appears exactly once — a legend whose
 * entries a reader cannot find in the grid teaches nothing.
 */
export const MATRIX_ROWS: readonly MatrixRow[] = [
  { route: "/", cells: { en: "crawled", fr: "crawled", de: "crawled" } },
  { route: "/pricing", cells: { en: "crawled", fr: "sitemap", de: "crawled" } },
  { route: "/about", cells: { en: "crawled", fr: "crawled", de: "alternate" } },
  { route: "/blog/hreflang-basics", cells: { en: "crawled", fr: "crawled", de: "hole" } },
];

export function LocaleMatrix() {
  return (
    <figure className="not-prose border-border my-8 rounded-lg border p-4 sm:p-6">
      <MatrixTable
        locales={["en", "fr", "de"]}
        rows={MATRIX_ROWS}
        caption="One row per route, one column per locale. What fills a cell is not the same as what proves it."
      />
      <figcaption className="mt-4 flex flex-col gap-2 text-sm">
        <MatrixLegend />
        <span className="text-muted-foreground mt-1">
          Only the first is a fact. The second and third are the site&rsquo;s own word for it, and
          the third is counted separately as <code>diagnostics.unverifiedAlternates</code> because a
          head advertising a translation nobody serves fills the cell just the same.
        </span>
      </figcaption>
    </figure>
  );
}
