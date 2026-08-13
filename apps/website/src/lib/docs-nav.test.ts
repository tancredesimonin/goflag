import { describe, expect, it } from "vitest";

import { activeDocsHref } from "./docs-nav";

/** The sidebar as it stands: two nested sections and an index. */
const HREFS = [
  "/docs",
  "/docs/install",
  "/docs/quickstart",
  "/docs/ci",
  "/docs/ci/baseline",
  "/docs/rules",
  "/docs/cli",
  "/docs/next",
  "/docs/next/routes",
  "/docs/next/guarantees",
];

describe("activeDocsHref", () => {
  it("lights exactly one entry on a nested page, the deepest", () => {
    // The defect: `startsWith` made `/docs/next` and `/docs/next/routes` both
    // claim the page, so the sidebar highlighted two rows at once.
    expect(activeDocsHref("/docs/next/routes", HREFS)).toBe("/docs/next/routes");
    expect(activeDocsHref("/docs/ci/baseline", HREFS)).toBe("/docs/ci/baseline");
  });

  it("lights the section on a page the sidebar does not list", () => {
    // Rule pages are generated, one per rule, and none of them is a nav entry.
    // The catalogue row has to stay highlighted or the reader loses their place.
    expect(activeDocsHref("/docs/rules/title.missing", HREFS)).toBe("/docs/rules");
    expect(activeDocsHref("/docs/next/something-unlisted", HREFS)).toBe("/docs/next");
  });

  it("lights the index only on the index", () => {
    // `/docs` prefixes every page here. Letting it match by prefix lit it up
    // under everything.
    expect(activeDocsHref("/docs", HREFS)).toBe("/docs");
    expect(activeDocsHref("/docs/install", HREFS)).toBe("/docs/install");
    expect(activeDocsHref("/docs/unlisted-page", HREFS)).toBeNull();
  });

  it("lights nothing outside the docs", () => {
    expect(activeDocsHref("/", HREFS)).toBeNull();
    expect(activeDocsHref("/en/changelog", HREFS)).toBeNull();
  });

  it("does not treat a shared prefix as containment", () => {
    // `/docs/ci` must not claim `/docs/cli`: the boundary is a path segment,
    // not a character count.
    expect(activeDocsHref("/docs/cli", HREFS)).toBe("/docs/cli");
  });
});
