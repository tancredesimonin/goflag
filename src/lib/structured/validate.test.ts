import { describe, expect, it } from "vitest";

import type { JsonLdBlock } from "@/lib/core/types";
import { validateAllJsonLd, validateJsonLdBlock } from "./validate";

function block(data: unknown, overrides: Partial<JsonLdBlock> = {}): JsonLdBlock {
  return {
    index: 0,
    raw: typeof data === "string" ? data : JSON.stringify(data),
    data,
    types:
      data && typeof data === "object" && "@type" in (data as Record<string, unknown>)
        ? [String((data as Record<string, unknown>)["@type"])]
        : [],
    ...overrides,
  };
}

describe("validateJsonLdBlock", () => {
  it("flags parse errors as a single error issue and stops walking", () => {
    const issues = validateJsonLdBlock({
      index: 0,
      raw: "{ not json",
      data: null,
      parseError: "Unexpected token n",
      types: [],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", code: "parse-error" });
  });

  it("ignores empty / null blocks (Phase 5 already flags them via raw inventory)", () => {
    expect(validateJsonLdBlock(block(null))).toEqual([]);
  });

  it("warns when @context is missing", () => {
    const issues = validateJsonLdBlock(
      block({ "@type": "Organization", name: "Acme", url: "https://acme.com/" }),
    );
    expect(issues.some((i) => i.code === "missing-context")).toBe(true);
  });

  it("flags missing required fields as errors", () => {
    const issues = validateJsonLdBlock(
      block({ "@context": "https://schema.org", "@type": "Article", headline: "Hi" }),
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("missing-required");
    const required = issues.filter((i) => i.code === "missing-required" && i.severity === "error");
    expect(required.map((i) => i.path).sort()).toEqual(["author", "datePublished"]);
  });

  it("flags missing recommended fields as warnings", () => {
    const issues = validateJsonLdBlock(
      block({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Acme",
        url: "https://acme.com/",
      }),
    );
    const recs = issues.filter((i) => i.severity === "warning" && i.code === "missing-required");
    expect(recs.map((i) => i.path).sort()).toEqual(["contactPoint", "logo", "sameAs"]);
  });

  it("rejects non-absolute URLs in `url` fields", () => {
    const issues = validateJsonLdBlock(
      block({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Acme",
        url: "/about",
      }),
    );
    expect(issues.some((i) => i.code === "expected-url" && i.path === "url")).toBe(true);
  });

  it("rejects malformed dates in `iso-date` fields", () => {
    const issues = validateJsonLdBlock(
      block({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Hi",
        author: { "@type": "Person", name: "Anon" },
        datePublished: "yesterday",
      }),
    );
    expect(issues.some((i) => i.code === "expected-iso-date")).toBe(true);
  });

  it("flags an empty required array", () => {
    const issues = validateJsonLdBlock(
      block({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [],
      }),
    );
    expect(issues.some((i) => i.code === "empty-array")).toBe(true);
  });

  it("walks @graph entities and reports their issues with prefixed paths", () => {
    const issues = validateJsonLdBlock(
      block({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Acme", url: "https://acme.com/" },
          { "@type": "Article", headline: "Hi" },
        ],
      }),
    );
    expect(
      issues.some((i) => i.path.startsWith("@graph[1].") && i.code === "missing-required"),
    ).toBe(true);
  });

  it("emits an info finding for unknown @types", () => {
    const issues = validateJsonLdBlock(
      block({ "@context": "https://schema.org", "@type": "MyCustomType" }),
    );
    expect(issues.some((i) => i.code === "unknown-type" && i.severity === "info")).toBe(true);
  });

  it("warns when an entity has no @type at all", () => {
    const issues = validateJsonLdBlock(
      block({ "@context": "https://schema.org", name: "no type here" }),
    );
    expect(issues.some((i) => i.code === "missing-type")).toBe(true);
  });

  it("treats BlogPosting and NewsArticle as Article aliases", () => {
    for (const type of ["BlogPosting", "NewsArticle"] as const) {
      const issues = validateJsonLdBlock(
        block({
          "@context": "https://schema.org",
          "@type": type,
          headline: "Hi",
          author: { "@type": "Person", name: "Anon" },
          datePublished: "2026-01-01",
        }),
      );
      expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    }
  });
});

describe("validateAllJsonLd", () => {
  it("aggregates and stably sorts issues across blocks", () => {
    const issues = validateAllJsonLd([
      block({ "@context": "https://schema.org", "@type": "Article" }, { index: 1 }),
      block({ "@context": "https://schema.org", "@type": "Organization" }, { index: 0 }),
    ]);
    const indices = issues.map((i) => i.blockIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
