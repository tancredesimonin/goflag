import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { defineOg, OG_SIZE, type OgDefinition } from "./card.js";

/**
 * The whole argument for a core that renders nothing (`docs/og-plan.md` D1):
 * this file asserts about a real card, in vitest, with no Next build anywhere
 * near it. A JSX tree is a bare `{ type, props }` object, so walking it is all
 * the "renderer" a test needs.
 */

const TOKENS = {
  bg: "#121416",
  fg: "#d8dbde",
  dim: "#7d8185",
  border: "#26292d",
  accent: "#00d492",
};

const DEFINITION: OgDefinition = {
  tokens: TOKENS,
  name: "goflag",
  footer: "goflag.tech",
  dots: ["#00d492", "#ffb900", "#ff6467"],
  fit: { steps: [{ upTo: 32, fontSize: 72 }], smallest: 44 },
};

const og = defineOg(DEFINITION);

type Node = { type: unknown; props: Record<string, unknown> };

function walk(node: ReactNode): Node[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || !("props" in node)) return [];

  const element = node as unknown as Node;

  return [element, ...walk(element.props.children as ReactNode)];
}

const styles = (element: ReactElement) =>
  walk(element).map((node) => (node.props.style ?? {}) as Record<string, unknown>);

const texts = (element: ReactElement) =>
  walk(element)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === "string");

describe("defineOg", () => {
  it("returns the size every unfurl expects, and says so twice the same way", () => {
    const card = og.card({ title: "Changelog" });

    expect(card.size).toEqual(OG_SIZE);
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
    expect(card.contentType).toBe("image/png");
  });

  it("carries the site's alt through untouched", () => {
    // The package composes no sentence of its own: `og:image:alt` exists to
    // close the gap between what a card shows and what its description claims,
    // and inventing the sentence here would re-open it somewhere new.
    const alt = "A goflag preview card reading “Changelog”";

    expect(og.card({ title: "Changelog", alt }).alt).toBe(alt);
  });

  it("sizes the title through `fitTitle`", () => {
    const large = styles(og.card({ title: "Changelog" }).element);
    const small = styles(og.card({ title: "x".repeat(200) }).element);

    expect(large.some((style) => style.fontSize === 72)).toBe(true);
    expect(small.some((style) => style.fontSize === 44)).toBe(true);
  });

  it("hard-codes no colour of its own — every one on the tree came from the site", () => {
    // The reason §6.1 makes the tokens the single artefact the package takes
    // from a site: a hex written into the template is a hex nothing can compare
    // against the theme, which is how four of goflag's greys were wrong.
    const declared = [...Object.values(TOKENS), ...(DEFINITION.dots ?? [])];
    const onTheTree = styles(og.card({ title: "Changelog", label: "docs" }).element)
      .flatMap((style) => Object.values(style))
      .filter((value): value is string => typeof value === "string" && value.includes("#"));

    expect(onTheTree.length).toBeGreaterThan(0);
    for (const value of onTheTree) {
      expect(
        declared.some((token) => value.includes(token)),
        value,
      ).toBe(true);
    }
  });

  it("shows the label only when there is one", () => {
    expect(texts(og.card({ title: "Changelog", label: "docs" }).element)).toEqual([
      "goflag",
      "docs",
      "Changelog",
      "goflag.tech",
    ]);
    expect(texts(og.card({ title: "Changelog" }).element)).toEqual([
      "goflag",
      "Changelog",
      "goflag.tech",
    ]);
  });

  it("cuts a subtitle the footer has no room for", () => {
    const long = "sentence ".repeat(40);
    const [subtitle] = texts(og.card({ title: "Changelog", subtitle: long }).element).filter(
      (text) => text.startsWith("sentence"),
    );

    expect(subtitle).toHaveLength(160);
    expect(subtitle?.endsWith("…")).toBe(true);
  });

  it("leaves a subtitle that fits exactly as it was written", () => {
    const subtitle = "Every release of the CLI, newest first.";

    expect(texts(og.card({ title: "Changelog", subtitle }).element)).toContain(subtitle);
  });

  it("falls back to `dim` for the subtitle, and takes a second level when given one", () => {
    const withFallback = styles(og.card({ title: "x", subtitle: "y" }).element);
    const second = defineOg({ ...DEFINITION, tokens: { ...TOKENS, subtitle: "#98a0ab" } });

    expect(withFallback.some((style) => style.color === TOKENS.dim)).toBe(true);
    expect(
      styles(second.card({ title: "x", subtitle: "y" }).element).some(
        (style) => style.color === "#98a0ab",
      ),
    ).toBe(true);
  });

  it("draws the dots in the order the site listed them", () => {
    const dots = styles(og.card({ title: "Changelog" }).element)
      .filter((style) => style.borderRadius === 7)
      .map((style) => style.background);

    expect(dots).toEqual(DEFINITION.dots);
  });

  it("draws no dots for a site that declared none", () => {
    const plain = defineOg({ ...DEFINITION, dots: undefined });

    expect(
      styles(plain.card({ title: "Changelog" }).element).filter(
        (style) => style.borderRadius === 7,
      ),
    ).toHaveLength(0);
  });
});

describe("icon", () => {
  const marked = defineOg({
    ...DEFINITION,
    mark: (side) => <svg width={side} height={side} />,
  });

  it("puts the mark on the card's own surface, square", () => {
    const icon = marked.icon(180);

    expect(icon.size).toEqual({ width: 180, height: 180 });
    expect(styles(icon.element)[0]?.background).toBe(TOKENS.bg);
  });

  it("draws the same mark large, which is what makes the set consistent", () => {
    // The measured defect this closes: apps/website's `apple-icon.tsx` redrew
    // the flag with `#12151a` and `#e8eaed`, neither of which is a colour the
    // card uses. One mark, one palette, two sizes.
    const onTheCard = walk(marked.card({ title: "x" }).element).find((node) => node.type === "svg");
    const onTheIcon = walk(marked.icon(180).element).find((node) => node.type === "svg");

    expect(onTheCard?.props.width).toBe(40);
    expect(onTheIcon?.props.width).toBe(Math.round(180 * 0.66));
  });

  it("takes a fixed mark as well, for a site that sizes its own", () => {
    const fixed = defineOg({ ...DEFINITION, mark: <svg width={48} height={48} /> });

    expect(walk(fixed.icon(180).element).find((node) => node.type === "svg")?.props.width).toBe(48);
  });
});
