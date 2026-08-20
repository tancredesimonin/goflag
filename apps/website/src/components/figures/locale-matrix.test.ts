import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MATRIX_CELLS, MATRIX_ROWS } from "./locale-matrix";

/**
 * A drawing cannot be generated, but it can be pinned.
 *
 * This one claims to show every way goflag fills a cell of the translation
 * matrix. The engine decides that, three packages away, in a union this app
 * cannot import (invariant I3) — so it is read out of the source by relative
 * path, the same escape hatch `rules-catalog.ts` uses for `rules.json`. A
 * fourth provenance added there fails here, instead of leaving the reference
 * page quietly showing three of four.
 */

const I18N = readFileSync(
  join(process.cwd(), "..", "..", "packages", "cli", "src", "lib", "core", "i18n.ts"),
  "utf8",
);

/** `export type I18nCellSource = "crawled" | "sitemap" | "alternate";` */
function cellSources(): string[] {
  const declaration = /export type I18nCellSource =([^;]+);/.exec(I18N)?.[1];
  if (!declaration) throw new Error("`I18nCellSource` is no longer declared in core/i18n.ts.");
  return [...declaration.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]!);
}

describe("the translation matrix figure", () => {
  it("names every provenance the engine can record", () => {
    const engine = cellSources();
    expect(engine.length).toBeGreaterThan(0);
    for (const source of engine) {
      expect(Object.keys(MATRIX_CELLS), `the figure omits \`${source}\``).toContain(source);
    }
  });

  it("adds exactly one state of its own, the absence", () => {
    // `hole` is not a provenance — it is what the page calls an empty cell, and
    // it is the finding. Any *other* extra state would be a vocabulary this
    // figure invented, which is how a drawing starts teaching something the
    // engine does not do.
    const extra = Object.keys(MATRIX_CELLS).filter((cell) => !cellSources().includes(cell));
    expect(extra).toEqual(["hole"]);
  });

  it("shows every state it puts in the legend", () => {
    // A legend entry a reader cannot find in the grid teaches nothing, and is
    // the easy thing to get wrong when the example rows are edited.
    const drawn = new Set<string>(MATRIX_ROWS.flatMap((row) => Object.values(row.cells)));
    expect([...Object.keys(MATRIX_CELLS)].filter((cell) => !drawn.has(cell))).toEqual([]);
  });

  it("gives every state a label, so colour is never the only carrier", () => {
    for (const [cell, spec] of Object.entries(MATRIX_CELLS)) {
      expect(spec.label.length, cell).toBeGreaterThan(10);
    }
  });
});

describe("the page that shows it", () => {
  const mdx = readFileSync(join(process.cwd(), "content", "docs", "i18n.mdx"), "utf8");
  const map = readFileSync(join(process.cwd(), "src", "components", "docs", "mdx.tsx"), "utf8");

  it("is the section that was headed `The matrix` and drew none", () => {
    expect(mdx).toContain("## The matrix");
    expect(mdx).toContain("<LocaleMatrix />");
  });

  it("can render it, which needs the component registered in the MDX map", () => {
    // MDX renders an unregistered capitalised tag as nothing at all — no error,
    // no warning, an empty gap where the figure was meant to be.
    expect(map).toContain("LocaleMatrix");
  });
});
