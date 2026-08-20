import { describe, expect, it } from "vitest";

import { PHANTOM_LOCALE, PHANTOM_ROWS } from "./phantom-locale";

/**
 * This figure exists to make one thing visible that the prose says in a
 * sentence with three clauses: `--ignore-holes` globs the route, and the route
 * carrying the phantom locale is not named after it.
 *
 * An example edited without that in mind — a `/cv` row added for symmetry,
 * say — would render perfectly and quietly destroy the point.
 */
describe("the phantom locale figure", () => {
  it("puts the one filled cell on the route the page occupies", () => {
    const filled = PHANTOM_ROWS.filter((row) => row.cells[PHANTOM_LOCALE] !== "hole");
    expect(filled).toHaveLength(1);
    expect(filled[0]!.route).toBe("/");
  });

  it("has no route named after the phantom locale, which is the whole point", () => {
    // `--ignore-holes /cv` matches nothing because there is no such route. A
    // `/cv` row would make the glob look like it would work.
    expect(PHANTOM_ROWS.map((row) => row.route)).not.toContain(`/${PHANTOM_LOCALE}`);
  });

  it("shows more holes than fills, or the column does not look invented", () => {
    const holes = PHANTOM_ROWS.filter((row) => row.cells[PHANTOM_LOCALE] === "hole");
    expect(holes.length).toBeGreaterThan(1);
    expect(holes.length).toBeGreaterThan(PHANTOM_ROWS.length - holes.length);
  });

  it("serves the real locales everywhere, so the contrast is the phantom column", () => {
    // Every non-phantom cell is `crawled`. A hole in `fr` would read as a
    // second, unrelated defect and blur what the figure is pointing at.
    for (const row of PHANTOM_ROWS) {
      for (const [locale, cell] of Object.entries(row.cells)) {
        if (locale === PHANTOM_LOCALE) continue;
        expect(cell, `${row.route} in ${locale}`).toBe("crawled");
      }
    }
  });
});
