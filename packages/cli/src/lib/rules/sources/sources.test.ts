/**
 * Provenance contract tests for the source catalog.
 *
 * The shipped catalog must pass structural validation on every pipeline —
 * this is the CI half of "every source has a rigor" from the rule-catalog
 * plan. URL liveness is deliberately not tested here (unit tests are
 * offline); `scripts/validate-sources.ts` covers it on scheduled pipelines.
 */

import { describe, expect, it } from "vitest";

import { getSource, SOURCES, sourceUrl } from "./index";
import type { Source } from "./types";
import { validateSourceCatalog } from "./validate";

/** A well-formed entry the negative cases can break one field at a time. */
const VALID: Source = {
  id: "example-spec",
  publisher: "Example",
  rigor: "normative",
  title: "Example Spec",
  url: "https://example.com/spec",
  retrievedAt: "2026-08-06",
};

describe("source catalog", () => {
  it("passes structural validation", () => {
    expect(validateSourceCatalog(SOURCES)).toEqual([]);
  });

  it("seeds every reference from the plan (§4.1–§4.3)", () => {
    expect(SOURCES.length).toBe(41);
  });

  it("covers all four rigor levels", () => {
    const rigors = new Set(SOURCES.map((s) => s.rigor));
    expect(rigors).toEqual(new Set(["normative", "vendor-spec", "guideline", "heuristic"]));
  });

  it("carries a paraphrase on every entry", () => {
    // `note` is optional in the type (a future entry may lean on `quote`
    // instead), but the seeded catalog explains every source in our own words.
    for (const source of SOURCES) {
      expect(source.note, source.id).toBeTruthy();
    }
  });

  it("looks sources up by id", () => {
    expect(getSource("whatwg-html-title")?.publisher).toBe("WHATWG");
    expect(getSource("nope")).toBeUndefined();
  });

  it("rebuilds the full deep link from url + anchor", () => {
    const title = getSource("whatwg-html-title")!;
    expect(sourceUrl(title)).toBe(
      "https://html.spec.whatwg.org/multipage/semantics.html#the-title-element",
    );
    const url = getSource("whatwg-url")!;
    expect(sourceUrl(url)).toBe("https://url.spec.whatwg.org/");
  });
});

describe("validateSourceCatalog", () => {
  it("accepts a well-formed entry", () => {
    expect(validateSourceCatalog([VALID])).toEqual([]);
  });

  it.each<[string, Partial<Source>]>([
    ["rejects a non-kebab id", { id: "Not_Kebab" }],
    ["rejects an empty publisher", { publisher: "  " }],
    ["rejects an empty title", { title: "" }],
    ["rejects an unparseable url", { url: "not a url" }],
    ["rejects a non-https url", { url: "http://example.com/spec" }],
    ["rejects a fragment baked into the url", { url: "https://example.com/spec#section" }],
    ["rejects an anchor with a leading #", { anchor: "#section" }],
    ["rejects an empty anchor", { anchor: "" }],
    ["rejects a malformed retrievedAt", { retrievedAt: "06/08/2026" }],
    ["rejects an impossible calendar date", { retrievedAt: "2026-02-31" }],
    ["rejects a blank quote", { quote: "   " }],
    ["rejects an over-long quote", { quote: "x".repeat(301) }],
    ["rejects a blank note", { note: "" }],
  ])("%s", (_name, patch) => {
    const errors = validateSourceCatalog([{ ...VALID, ...patch }]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.sourceId).toBeTruthy();
  });

  it("rejects duplicate ids", () => {
    const errors = validateSourceCatalog([VALID, { ...VALID }]);
    expect(errors).toEqual([{ sourceId: "example-spec", message: "duplicate id" }]);
  });

  it("reports the index when the id itself is empty", () => {
    const errors = validateSourceCatalog([{ ...VALID, id: "" }]);
    expect(errors[0]?.sourceId).toBe("#0");
  });

  it("reports every problem, not just the first", () => {
    const errors = validateSourceCatalog([{ ...VALID, publisher: "", retrievedAt: "yesterday" }]);
    expect(errors.length).toBe(2);
  });
});
