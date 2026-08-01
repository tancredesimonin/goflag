import { describe, expect, it } from "vitest";
import { extractTypes, parseJsonLdScripts } from "./json-ld";
import type { RawScriptTag } from "../types";

function script(content: string, type = "application/ld+json"): RawScriptTag {
  return { type, content, attributes: { type } };
}

describe("parseJsonLdScripts", () => {
  it("returns an empty array when no ld+json scripts are present", () => {
    expect(parseJsonLdScripts([])).toEqual([]);
    expect(
      parseJsonLdScripts([{ type: "application/javascript", content: "x", attributes: {} }]),
    ).toEqual([]);
  });

  it("parses a single Article block and extracts its @type", () => {
    const blocks = parseJsonLdScripts([
      script(`{ "@context": "https://schema.org", "@type": "Article", "headline": "x" }`),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.types).toEqual(["Article"]);
    expect(blocks[0]?.parseError).toBeUndefined();
  });

  it("walks @graph and nested entities to collect every @type", () => {
    const blocks = parseJsonLdScripts([
      script(`{
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", "name": "x" },
          { "@type": "WebSite", "publisher": { "@type": "Person", "name": "y" } }
        ]
      }`),
    ]);
    const types = blocks[0]?.types.sort();
    expect(types).toEqual(["Organization", "Person", "WebSite"]);
  });

  it("handles top-level @type as an array", () => {
    expect(extractTypes({ "@type": ["Article", "BlogPosting"] })).toEqual([
      "Article",
      "BlogPosting",
    ]);
  });

  it("records parseError for malformed JSON without throwing", () => {
    const blocks = parseJsonLdScripts([script(`{ this is not valid json }`)]);
    expect(blocks[0]?.parseError).toBeDefined();
    expect(blocks[0]?.data).toBeNull();
    expect(blocks[0]?.types).toEqual([]);
  });

  it("records 'empty' for whitespace-only blocks", () => {
    const blocks = parseJsonLdScripts([script("   \n\t   ")]);
    expect(blocks[0]?.parseError).toBe("empty");
  });

  it("decodes common HTML entities before parsing", () => {
    const blocks = parseJsonLdScripts([
      script(
        `{ &quot;@type&quot;: &quot;Article&quot;, &quot;name&quot;: &quot;Tom &amp; Jerry&quot; }`,
      ),
    ]);
    expect(blocks[0]?.types).toEqual(["Article"]);
    expect((blocks[0]?.data as { name: string }).name).toBe("Tom & Jerry");
  });

  it("preserves document order in the index field", () => {
    const blocks = parseJsonLdScripts([
      script(`{ "@type": "A" }`),
      script(`{ "@type": "B" }`),
      script(`{ "@type": "C" }`),
    ]);
    expect(blocks.map((b) => b.index)).toEqual([0, 1, 2]);
  });
});
