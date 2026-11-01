import { runInNewContext } from "node:vm";

import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { defineOg, OG_SIZE, type OgDefinition, type OgFontFace, type OgFonts } from "./card.js";

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

/** Enough of a file for its signature to be read: nothing here reaches a renderer. */
const bytes = (signature: string) =>
  Uint8Array.from([...signature, "x", "x"].map((char) => char.charCodeAt(0)));

const face = (name: string, data: OgFontFace["data"] = bytes("OTTO")): OgFontFace => ({
  name,
  data,
  weight: 400,
});

const withFonts = (fonts: Partial<OgFonts> = {}) =>
  defineOg({ ...DEFINITION, fonts: { body: "Body", load: () => [face("Body")], ...fonts } });

describe("fonts on the tree", () => {
  const titleStyle = (element: ReactElement) =>
    walk(element).find((node) => node.props.children === "Changelog")?.props.style as
      Record<string, unknown> | undefined;
  const wordmarkStyle = (element: ReactElement) =>
    walk(element).find((node) => node.props.children === "goflag")?.props.style as
      Record<string, unknown> | undefined;

  it("names no family at all on a site that declared none", () => {
    // The ambient face has to stay what it was: satori treats a family it cannot
    // find differently from no family, and a card today carries none.
    const card = og.card({ title: "Changelog", label: "docs", subtitle: "s" });

    expect(styles(card.element).some((style) => "fontFamily" in style)).toBe(false);
    expect(styles(og.icon(180).element).some((style) => "fontFamily" in style)).toBe(false);
  });

  it("sets the root in `body`, and the title and wordmark in it when nothing else is said", () => {
    const { element } = withFonts().card({ title: "Changelog" });

    expect(styles(element)[0]?.fontFamily).toBe("Body");
    expect(titleStyle(element)?.fontFamily).toBe("Body");
    expect(wordmarkStyle(element)?.fontFamily).toBe("Body");
  });

  it("sets the title and wordmark in `display`, and only those", () => {
    const { element } = withFonts({
      display: "Display",
      load: () => [face("Body"), face("Display")],
    }).card({ title: "Changelog" });

    expect(styles(element)[0]?.fontFamily).toBe("Body");
    expect(titleStyle(element)?.fontFamily).toBe("Display");
    expect(wordmarkStyle(element)?.fontFamily).toBe("Display");
    expect(styles(element).filter((style) => style.fontFamily === "Display")).toHaveLength(2);
  });

  it("sets an icon in `body`, for a mark with text in it", () => {
    expect(styles(withFonts().icon(180).element)[0]?.fontFamily).toBe("Body");
  });
});

describe("loadFonts", () => {
  it("answers undefined for a site that declared none", async () => {
    await expect(og.loadFonts()).resolves.toBeUndefined();
  });

  it("reads nothing until a card is drawn", () => {
    // Why `load` is a function: `og.tsx` is imported by every page that wants
    // the alt sentence, and those draw no card.
    const load = vi.fn(() => [face("Body")]);
    const lazy = withFonts({ load });

    lazy.card({ title: "Changelog" });
    lazy.icon(180);

    expect(load).not.toHaveBeenCalled();
  });

  it("reads once, however many routes ask at the same moment", async () => {
    const load = vi.fn(async () => [face("Body")]);
    const lazy = withFonts({ load });

    const [first, second] = await Promise.all([lazy.loadFonts(), lazy.loadFonts()]);
    await lazy.loadFonts();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("keeps a failure from being remembered, for a dev server that outlives it", async () => {
    const load = vi
      .fn<OgFonts["load"]>()
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce([face("Body")]);
    const lazy = withFonts({ load });

    await expect(lazy.loadFonts()).rejects.toThrow("ENOENT");
    await expect(lazy.loadFonts()).resolves.toHaveLength(1);
  });

  it("turns a loader that throws synchronously into a rejection", async () => {
    const lazy = withFonts({
      load: () => {
        throw new Error("ENOENT");
      },
    });

    await expect(lazy.loadFonts()).rejects.toThrow("ENOENT");
  });

  it.each([
    ["TrueType", "\0\x01\0\0"],
    ["OpenType", "OTTO"],
    ["Apple TrueType", "true"],
    ["WOFF", "wOFF"],
  ])("takes %s", async (_kind, signature) => {
    const lazy = withFonts({ load: () => [face("Body", bytes(signature))] });

    await expect(lazy.loadFonts()).resolves.toHaveLength(1);
  });

  it("reads the signature of a bare ArrayBuffer and of a view into a larger one", async () => {
    // A small `Buffer` is a window on a shared pool, so its signature is not at
    // offset zero of `.buffer`.
    const pool = new Uint8Array(16);
    pool.set(bytes("OTTO"), 8);

    for (const data of [bytes("OTTO").buffer as ArrayBuffer, pool.subarray(8, 14)]) {
      await expect(
        withFonts({ load: () => [face("Body", data)] }).loadFonts(),
      ).resolves.toHaveLength(1);
    }
  });

  it("takes an ArrayBuffer from another realm, where `instanceof` says no", async () => {
    const foreign = runInNewContext("new ArrayBuffer(6)") as ArrayBuffer;
    new Uint8Array(foreign).set(bytes("OTTO"));

    await expect(
      withFonts({ load: () => [face("Body", foreign)] }).loadFonts(),
    ).resolves.toHaveLength(1);
  });

  it("refuses WOFF2 and says what to do instead", async () => {
    const lazy = withFonts({ load: () => [face("Body", bytes("wOF2"))] });

    await expect(lazy.loadFonts()).rejects.toThrow(/"Body" is WOFF2.*Commit a TTF/);
  });

  it.each([
    ["an HTML error page", "<!do"],
    ["a Git LFS pointer", "vers"],
    ["an empty file", ""],
  ])("refuses %s, naming the face", async (_kind, signature) => {
    const data = signature === "" ? new Uint8Array(0) : bytes(signature);
    const lazy = withFonts({ load: () => [face("Body", data)] });

    await expect(lazy.loadFonts()).rejects.toThrow('"Body" is not a font file');
  });

  it("refuses an empty list", async () => {
    await expect(withFonts({ load: () => [] }).loadFonts()).rejects.toThrow("no face");
  });

  it("refuses a family no loaded face carries, which satori would swallow", async () => {
    await expect(withFonts({ body: "Bdoy" }).loadFonts()).rejects.toThrow(
      'no loaded face is named "Bdoy" (loaded: Body)',
    );
    await expect(withFonts({ display: "Display" }).loadFonts()).rejects.toThrow(
      'no loaded face is named "Display"',
    );
  });

  it("refuses at definition what can be known at definition", () => {
    expect(() => withFonts({ body: "" })).toThrow("names no family");
    expect(() => withFonts({ load: "fonts/a.ttf" as unknown as OgFonts["load"] })).toThrow(
      "must be a function",
    );
  });
});

describe("accentBar", () => {
  const barred = defineOg({ ...DEFINITION, accentBar: true });

  it("draws nothing unless asked", () => {
    expect(
      styles(og.card({ title: "Changelog" }).element).some(
        (style) => style.position === "absolute",
      ),
    ).toBe(false);
  });

  it("draws the accent, first, so the content stacks over it", () => {
    // Satori has no z-index: the order on the tree is the order on the card.
    const [, first] = styles(barred.card({ title: "Changelog" }).element);

    expect(first).toMatchObject({ position: "absolute", top: 0, height: 8 });
    expect(first?.background).toBe(TOKENS.accent);
  });
});

describe("content.footer", () => {
  it("replaces the definition's line on that card only", () => {
    const footer = "goflag.tech · Audit i18n";

    expect(texts(og.card({ title: "Changelog", footer }).element)).toContain(footer);
    expect(texts(og.card({ title: "Changelog", footer }).element)).not.toContain("goflag.tech");
    expect(texts(og.card({ title: "Changelog" }).element)).toContain("goflag.tech");
  });
});
