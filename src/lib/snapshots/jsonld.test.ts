import { describe, expect, it } from "vitest";

import type { JsonLdBlock } from "@/lib/core/types";
import { collectFields, projectJsonLd } from "./jsonld";

function block(data: unknown, index = 0, parseError?: string): JsonLdBlock {
  return {
    index,
    raw: typeof data === "string" ? data : JSON.stringify(data),
    data,
    parseError,
    types:
      data && typeof data === "object" && "@type" in (data as Record<string, unknown>)
        ? Array.isArray((data as { "@type": unknown })["@type"])
          ? ((data as { "@type": unknown[] })["@type"] as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : typeof (data as { "@type": unknown })["@type"] === "string"
            ? [(data as { "@type": string })["@type"]]
            : []
        : [],
  };
}

describe("collectFields", () => {
  it("returns sorted unique leaf paths", () => {
    expect(
      collectFields({ "@type": "Article", headline: "x", author: { name: "Y", url: "z" } }),
    ).toEqual(["author.name", "author.url", "headline"]);
  });

  it("collapses array elements to `[*]`", () => {
    expect(
      collectFields({
        "@type": "BreadcrumbList",
        itemListElement: [
          { position: 1, name: "Home" },
          { position: 2, name: "Blog" },
        ],
      }),
    ).toEqual(["itemListElement[*].name", "itemListElement[*].position"]);
  });

  it("excludes the top-level @type but keeps @context, @id and nested @type", () => {
    expect(
      collectFields({
        "@context": "https://schema.org",
        "@id": "x",
        "@type": "Article",
        author: { "@type": "Person", name: "A" },
      }),
    ).toEqual(["@context", "@id", "author.@type", "author.name"]);
  });

  it("emits the prefix for empty arrays", () => {
    expect(collectFields({ "@type": "X", tags: [] })).toEqual(["tags[*]"]);
  });

  it("emits the prefix for null leaves", () => {
    expect(collectFields({ "@type": "X", url: null })).toEqual(["url"]);
  });
});

describe("projectJsonLd", () => {
  it("ignores blocks with parseError", () => {
    expect(projectJsonLd([block("not-json", 0, "Unexpected token")])).toEqual([]);
  });

  it("ignores non-object data", () => {
    expect(projectJsonLd([block(null), block("string"), block(42)])).toEqual([]);
  });

  it("expands @graph to one entry per node", () => {
    const out = projectJsonLd([
      block({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Acme" },
          { "@type": "WebSite", url: "https://acme.test" },
        ],
      }),
    ]);
    expect(out).toEqual([
      { type: "Organization", fields: ["name"] },
      { type: "WebSite", fields: ["url"] },
    ]);
  });

  it("preserves document order across multiple blocks", () => {
    const out = projectJsonLd([
      block({ "@type": "Article", headline: "x" }, 0),
      block({ "@type": "BreadcrumbList", itemListElement: [{ position: 1 }] }, 1),
    ]);
    expect(out.map((e) => e.type)).toEqual(["Article", "BreadcrumbList"]);
  });

  it("emits one entry per type when @type is an array", () => {
    const out = projectJsonLd([block({ "@type": ["Article", "BlogPosting"], headline: "x" })]);
    expect(out.map((e) => e.type)).toEqual(["Article", "BlogPosting"]);
  });

  it("walks arrays of nodes at the top level", () => {
    const out = projectJsonLd([
      block([
        { "@type": "Organization", name: "A" },
        { "@type": "WebSite", url: "u" },
      ]),
    ]);
    expect(out.map((e) => e.type).sort()).toEqual(["Organization", "WebSite"]);
  });

  it("skips nodes without a @type", () => {
    const out = projectJsonLd([block({ name: "no-type" })]);
    expect(out).toEqual([]);
  });
});
