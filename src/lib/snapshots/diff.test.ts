import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff";
import { digestSnapshot } from "./digest";
import {
  SNAPSHOT_SCHEMA_VERSION,
  type Snapshot,
  type SnapshotJsonLd,
  type SnapshotTag,
} from "./types";
import type { Severity } from "@/lib/core/types";

function snap(overrides: {
  tags?: SnapshotTag[];
  jsonLd?: SnapshotJsonLd[];
  ruleOutcomes?: Record<string, Severity>;
  route?: string;
}): Snapshot {
  const body = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    route: overrides.route ?? "/",
    sampleUrl: "https://example.com/",
    capturedAt: "2026-01-01T00:00:00.000Z",
    tags: overrides.tags ?? [],
    jsonLd: overrides.jsonLd ?? [],
    ruleOutcomes: overrides.ruleOutcomes ?? {},
  };
  return { ...body, digest: digestSnapshot(body) };
}

describe("diffSnapshots — fast path", () => {
  it("returns identical: true when digests match", () => {
    const before = snap({ tags: [{ key: "title", value: "x" }] });
    const after = snap({ tags: [{ key: "title", value: "x" }] });
    const out = diffSnapshots(before, after);
    expect(out.identical).toBe(true);
    expect(out.entries).toEqual([]);
  });
});

describe("diffSnapshots — tags", () => {
  it("classifies a removed tag as `regression`", () => {
    const out = diffSnapshots(
      snap({ tags: [{ key: "meta:og:image[0]", value: "x" }] }),
      snap({ tags: [] }),
    );
    expect(out.entries).toEqual([
      { class: "regression", kind: "tag", key: "meta:og:image[0]", before: "x" },
    ]);
  });

  it("classifies an added tag as `addition`", () => {
    const out = diffSnapshots(
      snap({ tags: [] }),
      snap({ tags: [{ key: "meta:og:image[0]", value: "x" }] }),
    );
    expect(out.entries).toEqual([
      { class: "addition", kind: "tag", key: "meta:og:image[0]", after: "x" },
    ]);
  });

  it("classifies a value change as `content-drift`", () => {
    const out = diffSnapshots(
      snap({ tags: [{ key: "title", value: "Old" }] }),
      snap({ tags: [{ key: "title", value: "New" }] }),
    );
    expect(out.entries).toEqual([
      { class: "content-drift", kind: "tag", key: "title", before: "Old", after: "New" },
    ]);
  });

  it("treats a hash → hash change as content-drift via the `hash:` prefix", () => {
    const out = diffSnapshots(
      snap({ tags: [{ key: "title", hash: "a".repeat(12) }] }),
      snap({ tags: [{ key: "title", hash: "b".repeat(12) }] }),
    );
    expect(out.entries).toEqual([
      {
        class: "content-drift",
        kind: "tag",
        key: "title",
        before: `hash:${"a".repeat(12)}`,
        after: `hash:${"b".repeat(12)}`,
      },
    ]);
  });
});

describe("diffSnapshots — JSON-LD", () => {
  it("classifies a lost JSON-LD type as `regression`", () => {
    const out = diffSnapshots(
      snap({ jsonLd: [{ type: "Article", fields: ["headline"] }] }),
      snap({ jsonLd: [] }),
    );
    expect(out.entries).toEqual([{ class: "regression", kind: "jsonld-type", key: "Article" }]);
  });

  it("classifies an added JSON-LD type as `addition`", () => {
    const out = diffSnapshots(
      snap({ jsonLd: [] }),
      snap({ jsonLd: [{ type: "Organization", fields: ["name"] }] }),
    );
    expect(out.entries).toEqual([{ class: "addition", kind: "jsonld-type", key: "Organization" }]);
  });

  it("classifies a lost field within a kept type as `regression`", () => {
    const out = diffSnapshots(
      snap({ jsonLd: [{ type: "Article", fields: ["headline", "datePublished"] }] }),
      snap({ jsonLd: [{ type: "Article", fields: ["headline"] }] }),
    );
    expect(out.entries).toEqual([
      { class: "regression", kind: "jsonld-field", key: "Article.datePublished" },
    ]);
  });

  it("classifies an added field within a kept type as `addition`", () => {
    const out = diffSnapshots(
      snap({ jsonLd: [{ type: "Article", fields: ["headline"] }] }),
      snap({ jsonLd: [{ type: "Article", fields: ["headline", "author.name"] }] }),
    );
    expect(out.entries).toEqual([
      { class: "addition", kind: "jsonld-field", key: "Article.author.name" },
    ]);
  });

  it("coalesces repeated @types into a single bucket", () => {
    const out = diffSnapshots(
      snap({
        jsonLd: [
          { type: "Article", fields: ["headline"] },
          { type: "Article", fields: ["author.name"] },
        ],
      }),
      snap({ jsonLd: [{ type: "Article", fields: ["headline", "author.name"] }] }),
    );
    expect(out.entries).toEqual([]);
  });
});

describe("diffSnapshots — rule outcomes", () => {
  it("classifies a new failing rule as regression (kind: rule-outcome)", () => {
    const out = diffSnapshots(
      snap({ ruleOutcomes: {} }),
      snap({ ruleOutcomes: { "og.image.missing": "error" } }),
    );
    expect(out.entries).toEqual([
      { class: "regression", kind: "rule-outcome", key: "og.image.missing", after: "error" },
    ]);
  });

  it("classifies a fixed rule as addition", () => {
    const out = diffSnapshots(
      snap({ ruleOutcomes: { "og.image.missing": "error" } }),
      snap({ ruleOutcomes: {} }),
    );
    expect(out.entries).toEqual([
      { class: "addition", kind: "rule-outcome", key: "og.image.missing", before: "error" },
    ]);
  });

  it("classifies a worsening severity as regression", () => {
    const out = diffSnapshots(
      snap({ ruleOutcomes: { x: "warning" } }),
      snap({ ruleOutcomes: { x: "error" } }),
    );
    expect(out.entries).toEqual([
      {
        class: "regression",
        kind: "rule-outcome",
        key: "x",
        before: "warning",
        after: "error",
      },
    ]);
  });

  it("classifies an improving severity as addition", () => {
    const out = diffSnapshots(
      snap({ ruleOutcomes: { x: "error" } }),
      snap({ ruleOutcomes: { x: "warning" } }),
    );
    expect(out.entries).toEqual([
      {
        class: "addition",
        kind: "rule-outcome",
        key: "x",
        before: "error",
        after: "warning",
      },
    ]);
  });

  it("ignores same-severity entries", () => {
    const before = snap({ ruleOutcomes: { x: "warning" } });
    const after = snap({ ruleOutcomes: { x: "warning" } });
    expect(diffSnapshots(before, after).entries).toEqual([]);
  });
});

describe("diffSnapshots — value-less tags", () => {
  it("treats a stripped→present transition as addition", () => {
    // Going from "tag absent" to "tag with no value AND no hash" is
    // unusual but legal — e.g. a normalize rule that only kept the
    // key. The diff still sees an addition because the key now
    // exists. The before/after value pair should be undefined on
    // both sides.
    const out = diffSnapshots(snap({ tags: [] }), snap({ tags: [{ key: "x" }] }));
    expect(out.entries).toEqual([{ class: "addition", kind: "tag", key: "x", after: undefined }]);
  });
});

describe("diffSnapshots — entry ordering", () => {
  it("sorts regressions first, then additions, then drift; rule-outcomes first within each class", () => {
    const before = snap({
      tags: [{ key: "title", value: "Old" }],
      jsonLd: [{ type: "Article", fields: ["headline"] }],
      ruleOutcomes: {},
    });
    const after = snap({
      tags: [{ key: "title", value: "New" }],
      jsonLd: [{ type: "Organization", fields: ["name"] }],
      ruleOutcomes: { "title.length": "warning" },
    });
    const entries = diffSnapshots(before, after).entries;
    // Regressions: rule-outcome (title.length), then jsonld-type (Article)
    // Additions: jsonld-type (Organization)
    // Drift: tag (title)
    expect(entries.map((e) => `${e.class}:${e.kind}:${e.key}`)).toEqual([
      "regression:rule-outcome:title.length",
      "regression:jsonld-type:Article",
      "addition:jsonld-type:Organization",
      "content-drift:tag:title",
    ]);
  });
});
