import { MATRIX_GLYPH, MatrixLegend, MatrixTable, type MatrixRow } from "./locale-matrix";

/**
 * The founding bug, and the one detail everybody misses about it.
 *
 * `i18n.mdx` §"The bug that started this" is the most memorable passage in the
 * documentation — the tool describing its own defect — and it is three
 * paragraphs of reasoning a reader has to build a grid in their head to follow.
 * A page at `/cv` is read as route `/` in locale `cv`, so a column opens for a
 * language the site does not serve, and every other route reports a hole in it.
 *
 * ## The detail the grid makes obvious and the prose cannot
 *
 * `--ignore-holes` globs the **route**, and the filled cell in the `cv` column
 * sits on the row named `/` — not on a row named `/cv`, because no such route
 * exists. So `--ignore-holes /cv` matches nothing at all, and every phantom
 * hole survives it.
 *
 * The prose says this in a sentence with three clauses. The figure says it by
 * putting the one filled cell where a reader can see it is on the wrong row.
 */

const LOCALES = ["en", "fr", "cv"] as const;

/**
 * The `/` row is the CV page: it is what opened the column, and it is the only
 * cell in it that is filled. Every other row is a hole in a language nobody
 * serves.
 */
export const PHANTOM_ROWS: readonly MatrixRow[] = [
  { route: "/", cells: { en: "crawled", fr: "crawled", cv: "crawled" } },
  { route: "/about", cells: { en: "crawled", fr: "crawled", cv: "hole" } },
  { route: "/pricing", cells: { en: "crawled", fr: "crawled", cv: "hole" } },
  { route: "/blog", cells: { en: "crawled", fr: "crawled", cv: "hole" } },
];

/** The locale that is not one. `cv` is Chuvash, and also a résumé. */
export const PHANTOM_LOCALE = "cv";

export function PhantomLocale() {
  const holes = PHANTOM_ROWS.filter((row) => row.cells[PHANTOM_LOCALE] === "hole");

  return (
    <figure className="not-prose border-border my-8 rounded-lg border p-4 sm:p-6">
      <MatrixTable
        locales={LOCALES}
        rows={PHANTOM_ROWS}
        phantom={PHANTOM_LOCALE}
        caption={
          <>
            A site serving <code>en</code> and <code>fr</code>, with one page at <code>/cv</code>.
            goflag reads that segment as Chuvash — a real ISO 639-1 code — and opens a third column.
          </>
        }
      />

      <figcaption className="mt-4 flex flex-col gap-3 text-sm">
        <MatrixLegend only={["crawled", "hole"]} />

        <span className="border-flag-red/50 bg-flag-red/5 text-muted-foreground rounded border-l-2 py-2 pr-3 pl-4">
          <strong className="text-foreground">
            Look at which row the filled <code>cv</code> cell is on.
          </strong>{" "}
          It is on <code>/</code>, because the CV page <em>is</em> route <code>/</code> in locale{" "}
          <code>cv</code>. There is no route named <code>/cv</code> — so{" "}
          <code>--ignore-holes /cv</code> matches nothing, and all{" "}
          <span className="text-flag-red font-mono">
            {holes.length} {MATRIX_GLYPH.hole}
          </span>{" "}
          survive it. <code>--exclude</code> does not help either when the sitemap lists the page:
          sitemap URLs are seeded into the crawl without passing through the glob filters.
        </span>

        <span className="text-muted-foreground">
          The tell, until goflag can be told a segment is not a locale: every one of these findings
          names <code>cv</code> as the missing locale, and the pages under it declare{" "}
          <code>&lt;html lang=&quot;fr&quot;&gt;</code> rather than <code>cv</code>.
        </span>
      </figcaption>
    </figure>
  );
}
