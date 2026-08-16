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

  it("survives a block nested deeper than the walker can recurse", () => {
    // 5000 levels is ~30 KB of page and parses cleanly — V8's JSON parser is
    // iterative, so the type walker is the only thing that breaks. It threw
    // out of the extraction pass, which cost the audit the entire page: the
    // crawl filed it as an unreachable `[network error]`.
    const depth = 5000;
    const nested = `{ "@type": "Article", ${'"a": {'.repeat(depth)}"x": 1${"}".repeat(depth)} }`;
    const blocks = parseJsonLdScripts([script(nested)]);
    expect(blocks[0]?.parseError).toBeUndefined();
    expect(blocks[0]?.types).toEqual(["Article"]);
  });

  it("stops collecting types past the depth cap", () => {
    const nest = (levels: number, leaf: string) =>
      `${'{ "a": '.repeat(levels)}${leaf}${" }".repeat(levels)}`;
    expect(extractTypes(JSON.parse(nest(50, `{ "@type": "Reachable" }`)))).toEqual(["Reachable"]);
    expect(extractTypes(JSON.parse(nest(5000, `{ "@type": "TooDeep" }`)))).toEqual([]);
  });

  it("survives deep nesting written as arrays rather than objects", () => {
    const nested = `${"[".repeat(5000)}{ "@type": "Deep" }${"]".repeat(5000)}`;
    expect(() => parseJsonLdScripts([script(nested)])).not.toThrow();
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
