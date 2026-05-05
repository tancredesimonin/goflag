import { describe, expect, it } from "vitest";

import { pageFromHtml } from "@/lib/rules/test-utils";
import type { Issue } from "@/lib/core/types";
import { buildSnapshot, collectRuleOutcomes } from "./project";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";

const FIXED_AT = "2026-05-05T19:00:00.000Z";

const HTML = `<!doctype html><html lang="en"><head>
  <title>Acme — Home</title>
  <meta name="description" content="A page that exists">
  <meta property="og:title" content="Acme">
  <meta property="og:image" content="https://cdn/og.png">
  <link rel="canonical" href="https://example.com/">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://example.com"}
  </script>
</head></html>`;

describe("collectRuleOutcomes", () => {
  it("collapses to a ruleId → severity map", () => {
    const issues: Issue[] = [
      { ruleId: "title.length", severity: "warning", message: "x" },
      { ruleId: "og.image.missing", severity: "error", message: "x" },
    ];
    expect(collectRuleOutcomes(issues)).toEqual({
      "title.length": "warning",
      "og.image.missing": "error",
    });
  });

  it("keeps the highest severity when the same rule appears twice", () => {
    const issues: Issue[] = [
      { ruleId: "x", severity: "info", message: "a" },
      { ruleId: "x", severity: "error", message: "b" },
      { ruleId: "x", severity: "warning", message: "c" },
    ];
    expect(collectRuleOutcomes(issues)).toEqual({ x: "error" });
  });

  it("handles an empty list", () => {
    expect(collectRuleOutcomes([])).toEqual({});
  });
});

describe("buildSnapshot", () => {
  it("produces a deterministic snapshot for fixed inputs", () => {
    const page = pageFromHtml(HTML, { url: "https://example.com/" });
    const a = buildSnapshot(page, { issues: [], capturedAt: FIXED_AT });
    const b = buildSnapshot(page, { issues: [], capturedAt: FIXED_AT });
    expect(a.digest).toBe(b.digest);
    expect(a.tags).toEqual(b.tags);
  });

  it("derives the route from the requested URL", () => {
    const page = pageFromHtml(HTML, { url: "https://example.com/blog/post-1/" });
    const snap = buildSnapshot(page, { issues: [], capturedAt: FIXED_AT });
    expect(snap.route).toBe("/blog/post-1");
    expect(snap.sampleUrl).toBe("https://example.com/blog/post-1/");
  });

  it("populates the snapshot with both tags and JSON-LD entries", () => {
    const page = pageFromHtml(HTML, { url: "https://example.com/" });
    const snap = buildSnapshot(page, { issues: [], capturedAt: FIXED_AT });
    expect(snap.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snap.tags.some((t) => t.key === "title" && t.value === "Acme — Home")).toBe(true);
    expect(snap.jsonLd).toEqual([{ type: "Organization", fields: ["@context", "name", "url"] }]);
  });

  it("applies normalize before computing the digest", () => {
    const page = pageFromHtml(HTML, { url: "https://example.com/" });
    const a = buildSnapshot(page, { issues: [], capturedAt: FIXED_AT });
    const b = buildSnapshot(page, {
      issues: [],
      capturedAt: FIXED_AT,
      normalize: [{ path: "title", strategy: "redact" }],
    });
    expect(a.digest).not.toBe(b.digest);
    expect(b.tags.find((t) => t.key === "title")).toEqual({
      key: "title",
      value: "<redacted>",
    });
  });

  it("reflects rule outcomes in the snapshot", () => {
    const page = pageFromHtml(HTML, { url: "https://example.com/" });
    const issues: Issue[] = [{ ruleId: "title.length", severity: "warning", message: "x" }];
    const snap = buildSnapshot(page, { issues, capturedAt: FIXED_AT });
    expect(snap.ruleOutcomes).toEqual({ "title.length": "warning" });
  });

  it("falls back to the current wall-clock time when capturedAt is omitted", () => {
    const page = pageFromHtml(HTML, { url: "https://example.com/" });
    const before = Date.now();
    const snap = buildSnapshot(page, { issues: [] });
    const after = Date.now();
    const ms = Date.parse(snap.capturedAt);
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });
});
