import { describe, expect, it } from "vitest";
import { canonicalise, digestSnapshot, hashValue } from "./digest";
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "./types";

const baseBody: Omit<Snapshot, "digest"> = {
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  route: "/",
  sampleUrl: "https://example.com/",
  capturedAt: "2026-05-05T12:00:00.000Z",
  tags: [{ key: "title", value: "Hello" }],
  jsonLd: [],
  ruleOutcomes: { "title.length": "warning" },
};

describe("hashValue", () => {
  it("returns a 12-char hex string", () => {
    const h = hashValue("hello");
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(h).toHaveLength(12);
  });

  it("is deterministic", () => {
    expect(hashValue("a")).toBe(hashValue("a"));
  });

  it("differs across inputs", () => {
    expect(hashValue("a")).not.toBe(hashValue("b"));
  });
});

describe("canonicalise", () => {
  it("sorts object keys lexically", () => {
    expect(canonicalise({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("preserves array order", () => {
    expect(canonicalise([3, 1, 2])).toBe("[3,1,2]");
  });

  it("walks nested structures", () => {
    expect(canonicalise({ x: [{ b: 1, a: 2 }] })).toBe('{"x":[{"a":2,"b":1}]}');
  });

  it("serialises primitives via JSON.stringify", () => {
    expect(canonicalise(null)).toBe("null");
    expect(canonicalise("a")).toBe('"a"');
    expect(canonicalise(42)).toBe("42");
    expect(canonicalise(true)).toBe("true");
  });
});

describe("digestSnapshot", () => {
  it("returns a 12-hex digest", () => {
    expect(digestSnapshot(baseBody)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("ignores capturedAt", () => {
    const a = digestSnapshot(baseBody);
    const b = digestSnapshot({ ...baseBody, capturedAt: "1999-01-01T00:00:00.000Z" });
    expect(a).toBe(b);
  });

  it("ignores sampleUrl (host volatility)", () => {
    const a = digestSnapshot(baseBody);
    const b = digestSnapshot({ ...baseBody, sampleUrl: "http://localhost:9999/" });
    expect(a).toBe(b);
  });

  it("changes when tags change", () => {
    const a = digestSnapshot(baseBody);
    const b = digestSnapshot({ ...baseBody, tags: [{ key: "title", value: "World" }] });
    expect(a).not.toBe(b);
  });

  it("changes when ruleOutcomes change", () => {
    const a = digestSnapshot(baseBody);
    const b = digestSnapshot({ ...baseBody, ruleOutcomes: { "title.length": "error" } });
    expect(a).not.toBe(b);
  });

  it("is independent of ruleOutcomes key insertion order", () => {
    const a = digestSnapshot({
      ...baseBody,
      ruleOutcomes: { a: "info", b: "warning" } as Record<string, "info" | "warning">,
    });
    const b = digestSnapshot({
      ...baseBody,
      ruleOutcomes: { b: "warning", a: "info" } as Record<string, "info" | "warning">,
    });
    expect(a).toBe(b);
  });
});
