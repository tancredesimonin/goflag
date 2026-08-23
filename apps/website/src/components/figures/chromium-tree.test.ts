import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CHROMIUM_OUTCOMES, CHROMIUM_SIGNALS } from "./chromium-tree";

/**
 * The figure claims to show the exact condition under which goflag boots a
 * browser. That condition lives in one expression, three packages away, in a
 * file this app cannot import (invariant I3) — so it is read out of the source
 * the way `rules-catalog.ts` reads `rules.json`.
 *
 * The point is narrow and worth stating: nobody editing `heuristics.ts` has any
 * reason to think about a documentation page. This is what makes them find out.
 */

const HEURISTICS = readFileSync(
  join(
    process.cwd(),
    "..",
    "..",
    "packages",
    "cli",
    "src",
    "lib",
    "core",
    "extract",
    "heuristics.ts",
  ),
  "utf8",
);

/**
 * The identifiers in `const likely = a && (b || c) && d;`.
 *
 * Deliberately not a parser. The expression is a flat conjunction of
 * identifiers by construction — the comment above it says so — and a regex that
 * stops matching is a failing test rather than a wrong one, because the
 * extraction is asserted to be non-empty before it is used.
 */
function conjunctionTerms(): string[] {
  const expression = /const likely =([\s\S]*?);/.exec(HEURISTICS)?.[1];
  if (!expression) {
    throw new Error(
      "`const likely = …` is no longer in heuristics.ts. The Chromium figure describes that " +
        "expression, so it has to be found before it can be compared.",
    );
  }
  return [...new Set([...expression.matchAll(/\b([a-z][A-Za-z]*)\b/g)].map((m) => m[1]!))];
}

describe("the Chromium decision figure", () => {
  const terms = conjunctionTerms();

  it("found the expression it describes", () => {
    // Guards every assertion below: an empty list would make them all vacuous.
    expect(terms.length).toBeGreaterThan(3);
  });

  it("names every signal the engine ands together", () => {
    const drawn = new Set(CHROMIUM_SIGNALS.flatMap((s) => s.signals));
    expect(terms.filter((term) => !drawn.has(term))).toEqual([]);
  });

  it("names no signal the engine does not have", () => {
    // The other direction, and the one that catches a figure left behind by a
    // deletion: a term removed from the conjunction stops gating anything, and
    // a page would still be shown a condition goflag no longer applies.
    const engine = new Set(terms);
    const drawn = CHROMIUM_SIGNALS.flatMap((s) => s.signals);
    expect(drawn.filter((signal) => !engine.has(signal))).toEqual([]);
  });

  it("draws the escalation as all-or-nothing, which is what the code does", () => {
    // `&&` throughout, no `||` between the groups. If the engine ever loosened
    // this to "any two signals", the figure's central claim — one surviving tag
    // keeps the page static — would be false and nothing else here would say so.
    const expression = /const likely =([\s\S]*?);/.exec(HEURISTICS)![1]!;
    const groups = expression.split("&&");
    expect(groups.length).toBe(CHROMIUM_SIGNALS.length);
  });

  it("gives every signal a label a reader can act on", () => {
    for (const signal of CHROMIUM_SIGNALS) {
      expect(signal.signals.length, signal.label).toBeGreaterThan(0);
      expect(signal.detail.length, signal.label).toBeGreaterThan(15);
    }
  });

  it("shows the outcome that is a warning rather than an error", () => {
    // The one worth drawing: playwright is an optional peer, so a missing
    // browser is not a failure — the run falls back and records why, and
    // `build.ts` turns that into a diagnostics warning. A figure with three
    // outcomes would let a reader assume the fourth crashes.
    expect(CHROMIUM_OUTCOMES.length).toBe(4);
    expect(CHROMIUM_OUTCOMES.filter((o) => o.tone === "red")).toHaveLength(1);
    expect(CHROMIUM_OUTCOMES.some((o) => o.when.includes("--static"))).toBe(true);
  });
});
