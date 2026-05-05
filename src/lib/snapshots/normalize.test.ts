import { describe, expect, it } from "vitest";
import { normalizeSnapshotBody, type NormalizeRule } from "./normalize";
import { hashValue } from "./digest";
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "./types";

function body(overrides: Partial<Omit<Snapshot, "digest">> = {}): Omit<Snapshot, "digest"> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    route: "/",
    sampleUrl: "https://example.com/",
    capturedAt: "2026-01-01T00:00:00.000Z",
    tags: [
      { key: "title", value: "Hello" },
      { key: "meta:description", value: "Long description copy" },
      { key: "meta:og:image[0]", value: "https://cdn/a.png" },
      { key: "meta:og:image[1]", value: "https://cdn/b.png" },
    ],
    jsonLd: [
      { type: "Article", fields: ["author.name", "datePublished", "headline"] },
      { type: "BreadcrumbList", fields: ["itemListElement[*].name"] },
    ],
    ruleOutcomes: {},
    ...overrides,
  };
}

describe("normalizeSnapshotBody — tags", () => {
  it("returns input unchanged when rules is empty", () => {
    const b = body();
    expect(normalizeSnapshotBody(b, [])).toBe(b);
  });

  it("applies `strip` by dropping the matching tag", () => {
    const rules: NormalizeRule[] = [{ path: "meta:description", strategy: "strip" }];
    const out = normalizeSnapshotBody(body(), rules);
    expect(out.tags.find((t) => t.key === "meta:description")).toBeUndefined();
    expect(out.tags.find((t) => t.key === "title")).toBeDefined();
  });

  it("applies `redact` by replacing the value with the redact sentinel", () => {
    const rules: NormalizeRule[] = [{ path: "meta:description", strategy: "redact" }];
    const out = normalizeSnapshotBody(body(), rules);
    const tag = out.tags.find((t) => t.key === "meta:description");
    expect(tag).toEqual({ key: "meta:description", value: "<redacted>" });
  });

  it("applies `hash` by storing a 12-hex hash and dropping value", () => {
    const rules: NormalizeRule[] = [{ path: "title", strategy: "hash" }];
    const out = normalizeSnapshotBody(body(), rules);
    const tag = out.tags.find((t) => t.key === "title");
    expect(tag).toEqual({ key: "title", hash: hashValue("Hello") });
  });

  it("hash on a value-less tag emits the entry without value or hash", () => {
    const b = body({ tags: [{ key: "x" }] });
    const out = normalizeSnapshotBody(b, [{ path: "x", strategy: "hash" }]);
    expect(out.tags).toEqual([{ key: "x" }]);
  });

  it("supports `[*]` wildcards over indexed tags", () => {
    const rules: NormalizeRule[] = [{ path: "meta:og:image[*]", strategy: "strip" }];
    const out = normalizeSnapshotBody(body(), rules);
    expect(out.tags.some((t) => t.key.startsWith("meta:og:image["))).toBe(false);
  });

  it("last matching rule wins", () => {
    const rules: NormalizeRule[] = [
      { path: "meta:**", strategy: "redact" },
      { path: "meta:description", strategy: "strip" },
    ];
    const out = normalizeSnapshotBody(body(), rules);
    expect(out.tags.find((t) => t.key === "meta:description")).toBeUndefined();
    // og:image is still redacted (only the broad rule matched)
    expect(out.tags.find((t) => t.key === "meta:og:image[0]")).toEqual({
      key: "meta:og:image[0]",
      value: "<redacted>",
    });
  });
});

describe("normalizeSnapshotBody — JSON-LD", () => {
  it("strips an entire entry when `jsonld:<Type>` matches", () => {
    const rules: NormalizeRule[] = [{ path: "jsonld:Article", strategy: "strip" }];
    const out = normalizeSnapshotBody(body(), rules);
    expect(out.jsonLd.map((e) => e.type)).toEqual(["BreadcrumbList"]);
  });

  it("strips a single field when `jsonld:<Type>.<field>` matches", () => {
    const rules: NormalizeRule[] = [{ path: "jsonld:Article.datePublished", strategy: "strip" }];
    const out = normalizeSnapshotBody(body(), rules);
    const article = out.jsonLd.find((e) => e.type === "Article");
    expect(article?.fields).toEqual(["author.name", "headline"]);
  });

  it("returns the same entry reference when no fields are stripped", () => {
    const before = body();
    const out = normalizeSnapshotBody(before, [{ path: "jsonld:Other", strategy: "strip" }]);
    expect(out.jsonLd[0]).toBe(before.jsonLd[0]);
  });
});
