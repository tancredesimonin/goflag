/**
 * Prose rule + advisory contract tests.
 *
 * The provenance half mirrors `./rules.test.ts`: ids are unique and dotted,
 * every rule cites a source that exists. The half that matters more is the
 * evidence contract — a prose rule is *only* as good as the facts it hands
 * over, so every declared path is resolved against a maximal page here. A
 * typo'd path would otherwise ship as a silent `null` and an agent would
 * judge a question with a fact missing from the table.
 *
 * And the invariant the whole design rests on: nothing goflag produces ever
 * carries a verdict other than `needs-judgment`.
 */

import { describe, expect, it } from "vitest";

import { collectAdvisories, evidenceFor, resolveEvidencePath } from "./advisory";
import { extractionFromPage } from "./extraction/from-page";
import { RULES } from "./index";
import { getProseRule, PROSE_RULES } from "./prose";
import { getSource } from "./sources";
import { pageFromHtml } from "./test-utils";

/** A page carrying every observation the prose rules declare they read. */
const MAXIMAL = `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <title>A perfectly good page title</title>
    <meta name="description" content="A description comfortably inside the window Google likes to show." />
    <meta property="og:title" content="A perfectly good page title" />
    <meta property="og:locale" content="en_GB" />
    <meta property="og:image" content="https://example.com/og.png" />
  </head>
  <body><h1>Hello</h1></body>
</html>`;

const extraction = extractionFromPage(pageFromHtml(MAXIMAL));

describe("prose rule registry", () => {
  it("has unique, dotted ids that do not collide with deterministic rules", () => {
    const deterministic = new Set(RULES.map((r) => r.id));
    const seen = new Set<string>();
    for (const rule of PROSE_RULES) {
      expect(rule.id).toMatch(/^[a-z]+(\.[a-z0-9-]+)+$/);
      expect(seen.has(rule.id), `duplicate prose rule ${rule.id}`).toBe(false);
      // A shared id would make a finding and a question indistinguishable.
      expect(deterministic.has(rule.id), `${rule.id} shadows a deterministic rule`).toBe(false);
      seen.add(rule.id);
    }
    expect(getProseRule("title.descriptive")?.kind).toBe("prose");
    expect(getProseRule("title.missing")).toBeUndefined();
  });

  it("cites ≥1 source per rule, and every cited source exists in the catalog", () => {
    for (const rule of PROSE_RULES) {
      expect(rule.sources.length, rule.id).toBeGreaterThan(0);
      for (const sourceId of rule.sources) {
        expect(getSource(sourceId), `${rule.id} cites unknown source ${sourceId}`).toBeDefined();
      }
    }
  });

  it("states each policy as a question, and explains why it matters", () => {
    for (const rule of PROSE_RULES) {
      expect(rule.title.trim(), rule.id).toBeTruthy();
      expect(rule.why.trim(), rule.id).toBeTruthy();
      // A prose rule an agent cannot answer yes/no to is a mood, not a rule.
      expect(rule.prose.trim().endsWith("?"), `${rule.id} prose is not a question`).toBe(true);
    }
  });

  it("gates every rule on its subject existing", () => {
    const nothing = extractionFromPage(pageFromHtml(`<html><head></head></html>`));
    for (const rule of PROSE_RULES) {
      // Without a gate, a rule would ask its question of a page that has
      // nothing to ask about. Every shipped rule declares one.
      expect(rule.appliesTo, `${rule.id} has no appliesTo gate`).toBeDefined();
      expect(rule.appliesTo!(nothing), `${rule.id} applies to an empty page`).toBe(false);
      expect(rule.appliesTo!(extraction), `${rule.id} skips a page that has everything`).toBe(true);
    }
  });

  it("declares evidence paths that all resolve on a page that has everything", () => {
    for (const rule of PROSE_RULES) {
      expect(rule.reads.length, rule.id).toBeGreaterThan(0);
      for (const path of rule.reads) {
        expect(
          resolveEvidencePath(extraction, path),
          `${rule.id} declares ${path}, which resolves to nothing`,
        ).not.toBeNull();
      }
    }
  });

  it("only relates to rules that exist in one registry or the other", () => {
    const known = new Set([...RULES.map((r) => r.id), ...PROSE_RULES.map((r) => r.id)]);
    for (const rule of PROSE_RULES) {
      for (const related of rule.relates ?? []) {
        expect(known.has(related), `${rule.id} relates to unknown rule ${related}`).toBe(true);
      }
    }
  });
});

describe("evidence resolution", () => {
  it("reads nested paths and hands back the Fact, origin included", () => {
    const title = resolveEvidencePath(extraction, "document.title");
    expect(title).toMatchObject({
      value: "A perfectly good page title",
      origin: { kind: "title" },
    });
    expect(resolveEvidencePath(extraction, "http.finalUrl")).toBe("https://example.com/");
  });

  it("records an absent observation as null, not as a missing key", () => {
    const bare = extractionFromPage(pageFromHtml(`<html><head></head></html>`));
    const bundle = evidenceFor(bare, ["meta.description", "openGraph.images"]);
    // "This page has no description" is evidence; a missing key is a bug.
    expect(Object.keys(bundle)).toEqual(["meta.description", "openGraph.images"]);
    expect(bundle["meta.description"]).toBeNull();
    // An empty collection is a real observation and survives as itself.
    expect(bundle["openGraph.images"]).toEqual([]);
  });

  it("returns null rather than throwing when a path runs off the model", () => {
    expect(resolveEvidencePath(extraction, "document.nope.deeper")).toBeNull();
    expect(resolveEvidencePath(extraction, "http.status.nope")).toBeNull();
  });
});

describe("collectAdvisories", () => {
  it("asks every question on a page that has every subject", () => {
    expect(collectAdvisories(extraction, PROSE_RULES).map((a) => a.ruleId)).toEqual(
      PROSE_RULES.map((r) => r.id),
    );
  });

  it("stays silent about a subject the page does not have", () => {
    const bare = extractionFromPage(pageFromHtml(`<html><head></head></html>`));
    // Not deferral — there is nothing to judge, and `description.missing` /
    // `og.image.missing` already fail this page deterministically. Asking
    // anyway would stack an unanswerable question on top of a real finding.
    expect(collectAdvisories(bare, PROSE_RULES)).toEqual([]);
  });

  it("gates on presence only, never on how good the value looks", () => {
    const awful = extractionFromPage(
      pageFromHtml(`<html lang="en"><head><title>Home</title>
        <meta name="description" content="x" /></head></html>`),
    );
    const asked = collectAdvisories(awful, PROSE_RULES).map((a) => a.ruleId);
    // A one-character description is exactly the case a human most wants
    // judged; a quality gate here would silence it.
    expect(asked).toContain("description.accurate");
    expect(asked).toContain("title.descriptive");
    expect(asked).toContain("lang.matches-content");
  });

  it("carries the question, its provenance, and the evidence it turns on", () => {
    const advisory = collectAdvisories(extraction, PROSE_RULES).find(
      (a) => a.ruleId === "title.descriptive",
    )!;
    expect(advisory.prose).toContain("title");
    expect(advisory.rigor).toBe("guideline");
    expect(advisory.sources).toContain("google-title-link");
    expect(Object.keys(advisory.evidence)).toEqual(getProseRule("title.descriptive")!.reads);
    expect(advisory.evidence["document.title"]).toMatchObject({
      value: "A perfectly good page title",
    });
  });

  it("never carries a verdict other than needs-judgment", () => {
    for (const advisory of collectAdvisories(extraction, PROSE_RULES)) {
      expect(advisory.verdict, advisory.ruleId).toBe("needs-judgment");
    }
  });
});
