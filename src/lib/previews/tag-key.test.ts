import { describe, expect, it } from "vitest";
import {
  HTML_LANG_KEY,
  TITLE_KEY,
  isSuppressed,
  jsonLdKey,
  linkKey,
  linkSuppressed,
  listTagKeys,
  metaKey,
  metaSuppressed,
  tagKeyFromOrigin,
} from "./tag-key";
import { tancredeFull } from "./fixtures";
import type { Page } from "@/lib/core/types";

describe("metaKey", () => {
  it("prefers property over name", () => {
    expect(
      metaKey({
        property: "og:title",
        name: "ignored",
        attributes: { property: "og:title", name: "ignored" },
      }),
    ).toBe("meta:property=og:title");
  });
  it("falls back to name", () => {
    expect(metaKey({ name: "description", attributes: { name: "description" } })).toBe(
      "meta:name=description",
    );
  });
  it("falls back to http-equiv and charset", () => {
    expect(metaKey({ httpEquiv: "X-UA-Compatible", attributes: {} })).toBe(
      "meta:http-equiv=x-ua-compatible",
    );
    expect(metaKey({ charset: "utf-8", attributes: { charset: "utf-8" } })).toBe("meta:charset");
  });
  it("returns undefined for empty meta tags", () => {
    expect(metaKey({ attributes: {} })).toBeUndefined();
  });
});

describe("linkKey", () => {
  it("ignores case in rel", () => {
    expect(linkKey({ rel: "Apple-Touch-Icon", attributes: { rel: "Apple-Touch-Icon" } })).toBe(
      "link:rel=apple-touch-icon",
    );
  });
  it("returns undefined when rel is empty", () => {
    expect(linkKey({ rel: "", attributes: {} })).toBeUndefined();
  });
});

describe("jsonLdKey", () => {
  it("includes the index", () => {
    expect(jsonLdKey({ type: "application/ld+json", attributes: {} }, 3)).toContain(":3");
  });
});

describe("tagKeyFromOrigin", () => {
  it("round-trips for every origin kind we care about", () => {
    expect(tagKeyFromOrigin({ kind: "title" })).toBe(TITLE_KEY);
    expect(tagKeyFromOrigin({ kind: "meta", property: "og:title" })).toBe("meta:property=og:title");
    expect(tagKeyFromOrigin({ kind: "meta", name: "description" })).toBe("meta:name=description");
    expect(tagKeyFromOrigin({ kind: "meta", httpEquiv: "X-UA-Compatible" })).toBe(
      "meta:http-equiv=x-ua-compatible",
    );
    expect(tagKeyFromOrigin({ kind: "meta" })).toBeUndefined();
    expect(tagKeyFromOrigin({ kind: "link", rel: "canonical" })).toBe("link:rel=canonical");
    expect(tagKeyFromOrigin({ kind: "html", attribute: "lang" })).toBe("html:lang");
    expect(tagKeyFromOrigin({ kind: "json-ld", path: "$", index: 2 })).toBe(
      "script:type=application/ld+json:2",
    );
    expect(tagKeyFromOrigin({ kind: "header", name: "x-foo" })).toBeUndefined();
    expect(tagKeyFromOrigin({ kind: "computed" })).toBeUndefined();
  });
});

describe("isSuppressed family helpers", () => {
  const removed = new Set(["meta:property=og:image", "meta:name=twitter:image"]);

  it("matches sibling og:image:* tags", () => {
    expect(isSuppressed("meta:property=og:image:width", removed)).toBe(true);
    expect(isSuppressed("meta:property=og:image:alt", removed)).toBe(true);
  });

  it("matches sibling twitter:image:* tags", () => {
    expect(isSuppressed("meta:name=twitter:image:alt", removed)).toBe(true);
  });

  it("does not match unrelated tags", () => {
    expect(isSuppressed("meta:property=og:title", removed)).toBe(false);
    expect(isSuppressed("title", removed)).toBe(false);
  });

  it("metaSuppressed and linkSuppressed reuse the same sibling rules", () => {
    expect(metaSuppressed({ property: "og:image:width", attributes: {} }, removed)).toBe(true);
    expect(metaSuppressed({ property: "og:title", attributes: {} }, removed)).toBe(false);
    expect(
      linkSuppressed({ rel: "canonical", attributes: {} }, new Set(["link:rel=canonical"])),
    ).toBe(true);
  });

  it("metaSuppressed and linkSuppressed return false when no key is derivable", () => {
    expect(metaSuppressed({ attributes: {} }, removed)).toBe(false);
    expect(linkSuppressed({ rel: "", attributes: {} }, removed)).toBe(false);
  });
});

describe("listTagKeys", () => {
  it("includes title, html lang, every meta, every link, and json-ld scripts in stable order", () => {
    const keys = listTagKeys(tancredeFull).map((k) => k.key);
    expect(keys[0]).toBe(TITLE_KEY);
    expect(keys).toContain(HTML_LANG_KEY);
    expect(keys).toContain("meta:property=og:image");
    expect(keys).toContain("link:rel=canonical");
    // No duplicates.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ignores meta tags that have no addressable identity", () => {
    const page: Page = {
      ...tancredeFull,
      raw: {
        ...tancredeFull.raw,
        metas: [{ attributes: {} }, { content: "noise", attributes: {} }],
      },
    };
    const keys = listTagKeys(page).map((k) => k.key);
    expect(keys.filter((k) => k.startsWith("meta:"))).toHaveLength(0);
  });
});
