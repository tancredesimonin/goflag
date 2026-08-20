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
 * the shapes with real geometry — a decision tree, a loop with a barred arrow.
 * A matrix is not one of those: it is a grid of labelled cells, which is what a
 * table element *is*. Written as SVG it would lose the row and column headers a
 * screen reader navigates by, stop reflowing on a narrow screen, and need its
 * own text sizing. The geometry here is the semantics.
 *
 * ## Not shared with the landing page
 *
 * The obvious move is to extract the marketing one and use it twice. It is the
 * wrong move: that matrix has two cell states because it is making one point in
 * a switcher, and this one has four because the four *are* the content of the
 * page. Generalising the landing's component to carry a distinction it never
 * makes would complicate the sales pitch to serve the reference, and the two
 * would then have to agree about a vocabulary only one of them uses.
 */

/** The three ways a cell gets filled, plus the absence that is the finding. */
type Cell = "crawled" | "sitemap" | "alternate" | "hole";

const LOCALES = ["en", "fr", "de"] as const;

/**
 * Four routes, chosen so every state appears exactly once — a legend whose
 * entries a reader cannot find in the grid teaches nothing.
 */
export const MATRIX_ROWS: ReadonlyArray<{ route: string; cells: Record<string, Cell> }> = [
  { route: "/", cells: { en: "crawled", fr: "crawled", de: "crawled" } },
  { route: "/pricing", cells: { en: "crawled", fr: "sitemap", de: "crawled" } },
  { route: "/about", cells: { en: "crawled", fr: "crawled", de: "alternate" } },
  { route: "/blog/hreflang-basics", cells: { en: "crawled", fr: "crawled", de: "hole" } },
];

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

const GLYPH: Record<Cell, string> = {
  crawled: "●",
  sitemap: "◐",
  alternate: "◌",
  hole: "✕",
};

export function LocaleMatrix() {
  return (
    <figure className="not-prose border-border my-8 rounded-lg border p-4 sm:p-6">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-1 font-mono text-xs">
          <caption className="text-muted-foreground mb-3 text-left text-sm">
            One row per route, one column per locale. What fills a cell is not the same as what
            proves it.
          </caption>
          <thead>
            <tr>
              <th />
              {LOCALES.map((locale) => (
                <th
                  key={locale}
                  scope="col"
                  className="text-muted-foreground px-2 pb-1 text-center font-normal"
                >
                  {locale}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_ROWS.map(({ route, cells }) => (
              <tr key={route}>
                <th
                  scope="row"
                  className="text-muted-foreground pr-3 text-left font-normal whitespace-nowrap"
                >
                  {route}
                </th>
                {LOCALES.map((locale) => {
                  const cell = cells[locale]!;
                  return (
                    <td key={locale} className="px-1 text-center">
                      <span
                        // The glyph carries the state visually; the title
                        // carries it to everything else. Colour alone would put
                        // the whole figure behind normal colour vision.
                        title={`${route} in ${locale}: ${MATRIX_CELLS[cell].label}`}
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded border align-middle",
                          MATRIX_CELLS[cell].className,
                        )}
                      >
                        <span className="sr-only">{MATRIX_CELLS[cell].label}</span>
                        <span aria-hidden="true">{GLYPH[cell]}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figcaption className="mt-4 flex flex-col gap-2 text-sm">
        {(Object.keys(MATRIX_CELLS) as Cell[]).map((cell) => (
          <span key={cell} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded border font-mono text-xs",
                MATRIX_CELLS[cell].className,
              )}
            >
              {GLYPH[cell]}
            </span>
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">{cell}</span> —{" "}
              {MATRIX_CELLS[cell].label}
            </span>
          </span>
        ))}
        <span className="text-muted-foreground mt-1">
          Only the first is a fact. The second and third are the site&rsquo;s own word for it, and
          the third is counted separately as <code>diagnostics.unverifiedAlternates</code> because a
          head advertising a translation nobody serves fills the cell just the same.
        </span>
      </figcaption>
    </figure>
  );
}
