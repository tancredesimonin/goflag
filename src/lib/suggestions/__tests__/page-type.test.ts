import { describe, expect, it } from "vitest";

import { detectPageType } from "../page-type";
import { pageFromHtml } from "@/lib/rules/test-utils";

describe("detectPageType", () => {
  it("flags `/` as a homepage", () => {
    const page = pageFromHtml("<html><head><title>Home</title></head><body></body></html>", {
      url: "https://example.com/",
    });
    const hints = detectPageType(page);
    expect(hints.isHomepage).toBe(true);
    expect(hints.isArticle).toBe(false);
  });

  it("flags og:type=article and /blog/ paths as articles", () => {
    const page = pageFromHtml(
      `<html><head><meta property="og:type" content="article"><title>Post</title></head><body></body></html>`,
      { url: "https://example.com/blog/the-post" },
    );
    const hints = detectPageType(page);
    expect(hints.isArticle).toBe(true);
  });

  it("flags /faq paths and FAQ-titled pages as FAQ", () => {
    expect(
      detectPageType(
        pageFromHtml("<html><head><title>Help</title></head><body></body></html>", {
          url: "https://x.com/faq",
        }),
      ).isFaq,
    ).toBe(true);
    expect(
      detectPageType(
        pageFromHtml(
          "<html><head><title>Frequently Asked Questions</title></head><body></body></html>",
          { url: "https://x.com/help" },
        ),
      ).isFaq,
    ).toBe(true);
  });

  it("flags /about and /team paths as person profiles", () => {
    expect(
      detectPageType(
        pageFromHtml("<html><head></head><body></body></html>", {
          url: "https://x.com/about",
        }),
      ).isPerson,
    ).toBe(true);
  });

  it("recognises og:type=product as an app surface", () => {
    expect(
      detectPageType(
        pageFromHtml(
          `<html><head><meta property="og:type" content="product"></head><body></body></html>`,
          { url: "https://x.com/p/1" },
        ),
      ).isApp,
    ).toBe(true);
  });

  it("recognises a contact page via path", () => {
    expect(
      detectPageType(
        pageFromHtml("<html><head><title>Talk to us</title></head><body></body></html>", {
          url: "https://x.com/contact",
        }),
      ).isContact,
    ).toBe(true);
  });
});
